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
