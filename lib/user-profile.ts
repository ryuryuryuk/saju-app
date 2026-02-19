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
