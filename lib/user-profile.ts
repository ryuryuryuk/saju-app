import { supabase } from './supabase';

export interface UserProfile {
  id?: number;
  platform: 'telegram' | 'kakao';
  platform_user_id: string;
  display_name?: string;
  birth_year: number;
  birth_month: number;
  birth_day: number;
  birth_hour: number;
  birth_minute: number;
  gender: '남성' | '여성';
  referral_code?: string;
  free_unlocks?: number;
  referred_by?: string;
  created_at?: string;
  updated_at?: string;
}

export async function getProfile(
  platform: string,
  platformUserId: string,
): Promise<UserProfile | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('platform', platform)
    .eq('platform_user_id', platformUserId)
    .single();

  if (error || !data) return null;
  return data as UserProfile;
}

export async function upsertProfile(
  profile: Omit<UserProfile, 'id' | 'created_at' | 'updated_at'>,
): Promise<UserProfile | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('user_profiles')
    .upsert(
      { ...profile, updated_at: new Date().toISOString() },
      { onConflict: 'platform,platform_user_id' },
    )
    .select()
    .single();

  if (error) {
    console.error('[user-profile] upsert error:', error);
    return null;
  }
  return data as UserProfile;
}

export async function deleteProfile(
  platform: string,
  platformUserId: string,
): Promise<boolean> {
  if (!supabase) return false;

  const { error } = await supabase
    .from('user_profiles')
    .delete()
    .eq('platform', platform)
    .eq('platform_user_id', platformUserId);

  return !error;
}

/**
 * 특정 플랫폼의 모든 프로필을 반환한다.
 * 매일 운세 발송 대상 조회에 사용.
 */
export async function getAllProfiles(
  platform: 'telegram' | 'kakao',
): Promise<UserProfile[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('platform', platform);

  if (error || !data) return [];
  return data as UserProfile[];
}

/**
 * 최근 N일 이내 대화 기록이 있고 is_active = true인 사용자만 반환한다.
 */
export async function getActiveProfiles(
  platform: 'telegram' | 'kakao',
  days: number = 7,
): Promise<UserProfile[]> {
  if (!supabase) return [];

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // 최근 N일 내 대화한 사용자 ID 조회
  const { data: activeIds, error: histErr } = await supabase
    .from('conversation_history')
    .select('platform_user_id')
    .eq('platform', platform)
    .gte('created_at', since);

  if (histErr || !activeIds || activeIds.length === 0) return [];

  const uniqueIds = [...new Set(activeIds.map((r) => r.platform_user_id))];

  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('platform', platform)
    .eq('is_active', true)
    .in('platform_user_id', uniqueIds);

  if (error || !data) return [];
  return data as UserProfile[];
}

/**
 * 유료 구독 상태를 확인한다.
 */
export async function isPremiumUser(
  platform: string,
  platformUserId: string,
): Promise<boolean> {
  if (!supabase) return false;

  const { data, error } = await supabase
    .from('user_profiles')
    .select('is_premium, premium_expires_at')
    .eq('platform', platform)
    .eq('platform_user_id', platformUserId)
    .single();

  if (error || !data) return false;
  if (!data.is_premium) return false;

  // 만료일이 설정되어 있으면 확인
  if (data.premium_expires_at) {
    return new Date(data.premium_expires_at) > new Date();
  }

  return true;
}

/**
 * 봇 차단 등으로 사용자를 비활성화한다.
 */
export async function deactivateUser(
  platform: string,
  platformUserId: string,
): Promise<void> {
  if (!supabase) return;

  const { error } = await supabase
    .from('user_profiles')
    .update({ is_active: false })
    .eq('platform', platform)
    .eq('platform_user_id', platformUserId);

  if (error) {
    console.error('[user-profile] deactivate error:', error.message);
  }
}

// DB-backed conversation history

const MAX_HISTORY_ROWS = 10;

export async function getDbHistory(
  platform: string,
  platformUserId: string,
): Promise<{ role: string; content: string }[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('conversation_history')
    .select('role, content')
    .eq('platform', platform)
    .eq('platform_user_id', platformUserId)
    .order('created_at', { ascending: true })
    .limit(MAX_HISTORY_ROWS);

  if (error || !data) return [];
  return data;
}

export async function addDbTurn(
  platform: string,
  platformUserId: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<void> {
  if (!supabase) return;

  await supabase.from('conversation_history').insert({
    platform,
    platform_user_id: platformUserId,
    role,
    content,
  });

  // Trim old rows beyond limit
  const { data: rows } = await supabase
    .from('conversation_history')
    .select('id')
    .eq('platform', platform)
    .eq('platform_user_id', platformUserId)
    .order('created_at', { ascending: true });

  if (rows && rows.length > MAX_HISTORY_ROWS) {
    const idsToDelete = rows.slice(0, rows.length - MAX_HISTORY_ROWS).map((r) => r.id);
    await supabase.from('conversation_history').delete().in('id', idsToDelete);
  }
}

// ===== 추천 시스템 (Referral System) =====

/**
 * 고유 추천 코드 생성 (6자리 영숫자)
 */
function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 혼동 방지: I,O,0,1 제외
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * 사용자의 추천 코드 조회 (없으면 생성)
 */
export async function getReferralCode(
  platform: string,
  platformUserId: string,
): Promise<string | null> {
  if (!supabase) return null;

  // 기존 코드 조회
  const { data } = await supabase
    .from('user_profiles')
    .select('referral_code')
    .eq('platform', platform)
    .eq('platform_user_id', platformUserId)
    .single();

  if (data?.referral_code) return data.referral_code;

  // 없으면 새로 생성
  let newCode = generateReferralCode();
  let attempts = 0;

  // 중복 체크 및 재생성
  while (attempts < 5) {
    const { data: existing } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('referral_code', newCode)
      .single();

    if (!existing) break;
    newCode = generateReferralCode();
    attempts++;
  }

  // 코드 저장
  const { error } = await supabase
    .from('user_profiles')
    .update({ referral_code: newCode })
    .eq('platform', platform)
    .eq('platform_user_id', platformUserId);

  if (error) {
    console.error('[referral] Failed to save referral code:', error.message);
    return null;
  }

  return newCode;
}

/**
 * 추천 코드로 추천인 조회
 */
export async function getUserByReferralCode(
  referralCode: string,
): Promise<{ platform: string; platform_user_id: string } | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('user_profiles')
    .select('platform, platform_user_id')
    .eq('referral_code', referralCode.toUpperCase())
    .single();

  if (error || !data) return null;
  return data;
}

/**
 * 추천인 등록 및 양쪽 보상 지급
 * - 신규 사용자의 referred_by 설정
 * - 추천인과 신규 사용자 모두에게 free_unlocks +1
 */
export async function processReferral(
  platform: string,
  newUserId: string,
  referralCode: string,
): Promise<{ success: boolean; referrerUserId?: string }> {
  if (!supabase) return { success: false };

  // 추천인 조회
  const referrer = await getUserByReferralCode(referralCode);
  if (!referrer) return { success: false };

  // 자기 자신 추천 방지
  if (referrer.platform === platform && referrer.platform_user_id === newUserId) {
    return { success: false };
  }

  // 이미 추천인이 등록되어 있는지 확인
  const { data: existingProfile } = await supabase
    .from('user_profiles')
    .select('referred_by')
    .eq('platform', platform)
    .eq('platform_user_id', newUserId)
    .single();

  if (existingProfile?.referred_by) {
    // 이미 추천인이 있으면 무시
    return { success: false };
  }

  // 신규 사용자에게 추천인 등록 + 무료 열람권 1회
  await supabase
    .from('user_profiles')
    .update({
      referred_by: referralCode,
      free_unlocks: supabase.rpc ? 1 : 1, // increment handled below
    })
    .eq('platform', platform)
    .eq('platform_user_id', newUserId);

  // 추천인에게 무료 열람권 1회 추가
  await supabase.rpc('increment_free_unlocks', {
    p_platform: referrer.platform,
    p_user_id: referrer.platform_user_id,
    p_amount: 1,
  });

  // 신규 사용자에게도 무료 열람권 1회 추가
  await supabase.rpc('increment_free_unlocks', {
    p_platform: platform,
    p_user_id: newUserId,
    p_amount: 1,
  });

  console.log(`[referral] Success: ${referrer.platform_user_id} -> ${newUserId}`);
  return { success: true, referrerUserId: referrer.platform_user_id };
}

/**
 * 무료 열람권 개수 조회
 */
export async function getFreeUnlocks(
  platform: string,
  platformUserId: string,
): Promise<number> {
  if (!supabase) return 0;

  const { data } = await supabase
    .from('user_profiles')
    .select('free_unlocks')
    .eq('platform', platform)
    .eq('platform_user_id', platformUserId)
    .single();

  return data?.free_unlocks ?? 0;
}

/**
 * 무료 열람권 사용 (1회 차감)
 * 성공하면 true, 열람권이 없으면 false
 */
export async function useFreeUnlock(
  platform: string,
  platformUserId: string,
): Promise<boolean> {
  if (!supabase) return false;

  const current = await getFreeUnlocks(platform, platformUserId);
  if (current <= 0) return false;

  const { error } = await supabase.rpc('decrement_free_unlocks', {
    p_platform: platform,
    p_user_id: platformUserId,
  });

  if (error) {
    console.error('[referral] Failed to use free unlock:', error.message);
    return false;
  }

  return true;
}

/**
 * 텔레그램 추천 링크 생성
 */
export function buildReferralLink(referralCode: string, botUsername: string = 'SajuSecretaryBot'): string {
  return `https://t.me/${botUsername}?start=ref_${referralCode}`;
}

/**
 * 카카오 추천 코드 안내 메시지 생성.
 * 카카오톡은 딥링크 파라미터가 제한적이므로 추천 코드를 텍스트로 공유한다.
 */
export function buildKakaoReferralMessage(referralCode: string): string {
  return (
    `나 AI 사주 분석 써보는데 진짜 잘 맞아!\n` +
    `카카오톡에서 "AI 사주" 채널 추가하고\n` +
    `"추천 코드 ${referralCode}" 라고 보내면\n` +
    `무료 열람권 1회 받을 수 있어!`
  );
}
