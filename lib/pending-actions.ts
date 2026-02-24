/**
 * Supabase 기반 대기 상태 관리.
 * 서버리스 환경에서 in-memory Map을 대체한다.
 * 사용 사례: 궁합 대기 (상대방 프로필 입력 대기), 추천 코드 대기 등.
 */

import { supabase } from './supabase';

export interface PendingAction {
  id?: number;
  platform: string;
  platform_user_id: string;
  action_type: string;
  payload: Record<string, unknown>;
  created_at?: string;
  expires_at: string;
}

/**
 * 대기 상태 설정. 기존 같은 타입의 대기가 있으면 덮어쓴다.
 */
export async function setPendingAction(
  platform: string,
  userId: string,
  actionType: string,
  payload: Record<string, unknown>,
  ttlMinutes: number = 10,
): Promise<void> {
  if (!supabase) return;

  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

  // 기존 대기 삭제
  await supabase
    .from('pending_actions')
    .delete()
    .eq('platform', platform)
    .eq('platform_user_id', userId)
    .eq('action_type', actionType);

  // 새 대기 삽입
  const { error } = await supabase.from('pending_actions').insert({
    platform,
    platform_user_id: userId,
    action_type: actionType,
    payload,
    expires_at: expiresAt,
  });

  if (error) {
    console.error('[pending-actions] insert error:', error.message);
  }
}

/**
 * 대기 상태 조회. 만료된 것은 반환하지 않는다.
 */
export async function getPendingAction(
  platform: string,
  userId: string,
  actionType: string,
): Promise<PendingAction | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('pending_actions')
    .select('*')
    .eq('platform', platform)
    .eq('platform_user_id', userId)
    .eq('action_type', actionType)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data as PendingAction;
}

/**
 * 대기 상태 삭제.
 */
export async function deletePendingAction(
  platform: string,
  userId: string,
  actionType: string,
): Promise<void> {
  if (!supabase) return;

  await supabase
    .from('pending_actions')
    .delete()
    .eq('platform', platform)
    .eq('platform_user_id', userId)
    .eq('action_type', actionType);
}

/**
 * 만료된 대기 상태 정리. 주기적으로 호출 권장.
 */
export async function cleanExpiredActions(): Promise<number> {
  if (!supabase) return 0;

  const { data, error } = await supabase
    .from('pending_actions')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('id');

  if (error) {
    console.error('[pending-actions] cleanup error:', error.message);
    return 0;
  }

  return data?.length ?? 0;
}
