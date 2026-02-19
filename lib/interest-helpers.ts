import { supabase } from './supabase';
import { classifyMessage } from './interest-analyzer';
import type { InterestCategory } from './interest-analyzer';

const RECENT_WINDOW_DAYS = 7;
const DECAY_FACTOR = 0.7;

export interface UserInterest {
  category: InterestCategory;
  score: number;
  ask_count: number;
  weighted_count: number;
  last_asked: string | null;
}

/**
 * 사용자 메시지를 분석하고 관심사 점수를 업데이트한다.
 * 텔레그램 웹훅에서 메시지마다 호출.
 */
export async function trackInterest(
  platform: string,
  platformUserId: string,
  messageText: string,
): Promise<void> {
  if (!supabase) return;

  const categories = classifyMessage(messageText);
  const now = new Date().toISOString();

  for (const category of categories) {
    // Upsert: 해당 카테고리 row가 없으면 생성, 있으면 카운트 증가
    const { data: existing } = await supabase
      .from('user_interests')
      .select('ask_count, weighted_count')
      .eq('platform', platform)
      .eq('platform_user_id', platformUserId)
      .eq('category', category)
      .single();

    if (existing) {
      // 기존 row 업데이트: ask_count +1, weighted_count +2 (최근 7일 가중치)
      await supabase
        .from('user_interests')
        .update({
          ask_count: existing.ask_count + 1,
          weighted_count: existing.weighted_count + 2, // 최근 질문이므로 가중치 2배
          last_asked: now,
          updated_at: now,
        })
        .eq('platform', platform)
        .eq('platform_user_id', platformUserId)
        .eq('category', category);
    } else {
      // 새 row 생성
      await supabase.from('user_interests').insert({
        platform,
        platform_user_id: platformUserId,
        category,
        score: 0,
        ask_count: 1,
        weighted_count: 2, // 첫 질문도 최근이므로 가중치 2배
        last_asked: now,
        updated_at: now,
      });
    }
  }

  // 전체 점수 재계산
  await recalculateScores(platform, platformUserId);
}

/**
 * 사용자의 모든 카테고리 점수를 재계산한다.
 * score = (해당 카테고리 weighted_count / 전체 weighted_count 합) * 100
 */
async function recalculateScores(
  platform: string,
  platformUserId: string,
): Promise<void> {
  if (!supabase) return;

  const { data: rows } = await supabase
    .from('user_interests')
    .select('category, weighted_count')
    .eq('platform', platform)
    .eq('platform_user_id', platformUserId);

  if (!rows || rows.length === 0) return;

  const totalWeighted = rows.reduce((sum, r) => sum + (r.weighted_count || 0), 0);
  if (totalWeighted === 0) return;

  for (const row of rows) {
    const score = Math.round(((row.weighted_count || 0) / totalWeighted) * 100);
    await supabase
      .from('user_interests')
      .update({ score, updated_at: new Date().toISOString() })
      .eq('platform', platform)
      .eq('platform_user_id', platformUserId)
      .eq('category', row.category);
  }
}

/**
 * 사용자 top N 관심 카테고리를 반환한다.
 */
export async function getUserTopInterests(
  platform: string,
  platformUserId: string,
  limit = 3,
): Promise<{ category: InterestCategory; score: number }[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('user_interests')
    .select('category, score')
    .eq('platform', platform)
    .eq('platform_user_id', platformUserId)
    .gt('score', 0)
    .order('score', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data.map((r) => ({
    category: r.category as InterestCategory,
    score: r.score as number,
  }));
}

/**
 * 7일 넘은 질문의 가중치를 decay시킨다.
 * 매일 자정에 Cron 또는 API 호출로 실행.
 */
export async function decayOldWeights(): Promise<number> {
  if (!supabase) return 0;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RECENT_WINDOW_DAYS);

  // 7일 이상 된 last_asked를 가진 row의 weighted_count를 decay
  const { data: oldRows } = await supabase
    .from('user_interests')
    .select('id, platform, platform_user_id, weighted_count, last_asked')
    .lt('last_asked', cutoff.toISOString())
    .gt('weighted_count', 0);

  if (!oldRows || oldRows.length === 0) return 0;

  let updated = 0;
  const usersToRecalc = new Set<string>();

  for (const row of oldRows) {
    const decayed = Math.max(0, row.weighted_count * DECAY_FACTOR);
    await supabase
      .from('user_interests')
      .update({
        weighted_count: Math.round(decayed * 100) / 100,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    usersToRecalc.add(`${row.platform}:${row.platform_user_id}`);
    updated++;
  }

  // decay된 사용자들의 점수 재계산
  for (const key of usersToRecalc) {
    const [platform, platformUserId] = key.split(':');
    await recalculateScores(platform, platformUserId);
  }

  return updated;
}

/**
 * 사용자의 모든 관심사 데이터를 반환한다.
 */
export async function getAllInterests(
  platform: string,
  platformUserId: string,
): Promise<UserInterest[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('user_interests')
    .select('category, score, ask_count, weighted_count, last_asked')
    .eq('platform', platform)
    .eq('platform_user_id', platformUserId)
    .order('score', { ascending: false });

  if (error || !data) return [];
  return data as UserInterest[];
}
