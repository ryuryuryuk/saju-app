import { supabase } from './supabase';

export interface PushLogEntry {
  user_id: string;
  category: string;
  message_text: string;
  status: 'success' | 'failed' | 'retried';
}

export async function logPush(entry: PushLogEntry): Promise<number | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('daily_push_log')
    .insert({
      user_id: entry.user_id,
      category: entry.category,
      message_text: entry.message_text,
      status: entry.status,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[push-logger] insert error:', error.message);
    return null;
  }
  return data?.id ?? null;
}

export async function markOpened(logId: number): Promise<void> {
  if (!supabase) return;

  const { error } = await supabase
    .from('daily_push_log')
    .update({ is_opened: true })
    .eq('id', logId);

  if (error) {
    console.error('[push-logger] markOpened error:', error.message);
  }
}

export async function markPremiumConverted(logId: number): Promise<void> {
  if (!supabase) return;

  const { error } = await supabase
    .from('daily_push_log')
    .update({ converted_to_premium: true })
    .eq('id', logId);

  if (error) {
    console.error('[push-logger] markPremiumConverted error:', error.message);
  }
}

/**
 * 특정 사용자의 가장 최근 발송 로그 ID를 반환한다.
 * 버튼 클릭 시 어떤 로그를 업데이트할지 찾기 위해 사용.
 */
export async function getLatestLogId(userId: string): Promise<number | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('daily_push_log')
    .select('id')
    .eq('user_id', userId)
    .order('sent_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data.id;
}
