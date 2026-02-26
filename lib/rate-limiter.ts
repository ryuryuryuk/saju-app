/**
 * Rate limiter for saju chatbot API endpoints.
 * Serverless-compatible using Supabase as the backing store.
 * 
 * Limits:
 * - Free users: 3 saju questions/day, 1 daily fortune/day
 * - Basic subscribers: 10 questions/day
 * - Premium subscribers: unlimited
 * - Anti-spam: max 1 request per 3 seconds per user
 */

import { supabase } from './supabase';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfter?: number; // seconds
  message?: string;
}

// === Anti-spam: per-user request throttle ===

const recentRequests = new Map<string, number>(); // userId -> lastRequestTimestamp
const SPAM_COOLDOWN_MS = 3000; // 3 seconds between requests

export function checkSpamThrottle(userId: string): RateLimitResult {
  const now = Date.now();
  const last = recentRequests.get(userId);
  
  if (last && (now - last) < SPAM_COOLDOWN_MS) {
    const retryAfter = Math.ceil((SPAM_COOLDOWN_MS - (now - last)) / 1000);
    return {
      allowed: false,
      remaining: 0,
      limit: 1,
      retryAfter,
      message: '너무 빠르게 요청하고 있어요. 잠시 후 다시 시도해주세요.',
    };
  }

  recentRequests.set(userId, now);
  
  // Cleanup old entries (prevent memory leak)
  if (recentRequests.size > 1000) {
    const cutoff = now - SPAM_COOLDOWN_MS * 2;
    for (const [key, ts] of recentRequests.entries()) {
      if (ts < cutoff) recentRequests.delete(key);
    }
  }

  return { allowed: true, remaining: 1, limit: 1 };
}

// === Daily usage limiter ===

export type UserTier = 'free' | 'basic' | 'premium';

const TIER_LIMITS: Record<UserTier, number> = {
  free: 3,
  basic: 10,
  premium: 9999,
};

export async function checkDailyLimit(
  platform: string,
  userId: string,
  tier: UserTier = 'free',
): Promise<RateLimitResult> {
  const limit = TIER_LIMITS[tier];
  
  if (!supabase) {
    return { allowed: true, remaining: limit, limit };
  }

  // Get today's date in KST
  const now = new Date();
  const kstDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  const { data } = await supabase
    .from('daily_usage')
    .select('count')
    .eq('platform', platform)
    .eq('platform_user_id', userId)
    .eq('date', kstDate)
    .single();

  const used = data?.count ?? 0;
  const remaining = Math.max(0, limit - used);

  if (remaining <= 0) {
    return {
      allowed: false,
      remaining: 0,
      limit,
      message: tier === 'free'
        ? `오늘 무료 사용 횟수(${limit}회)를 모두 사용했어요.\n\n` +
          '💎 크레딧 충전으로 더 많은 분석을 받아보세요!\n' +
          '💎 구독하면 하루 10회까지 이용 가능해요!'
        : `오늘 사용 횟수(${limit}회)를 모두 사용했어요.\n프리미엄으로 업그레이드하면 무제한이에요!`,
    };
  }

  return { allowed: true, remaining, limit };
}

export async function incrementDailyUsage(
  platform: string,
  userId: string,
): Promise<void> {
  if (!supabase) return;

  const kstDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  // Atomic upsert: avoids race condition with concurrent requests
  try {
    await supabase.rpc('increment_daily_usage', {
      p_platform: platform,
      p_user_id: userId,
      p_date: kstDate,
    });
  } catch {
    // Fallback: non-atomic insert/update if RPC not available
    const { data: existing } = await supabase
      .from('daily_usage')
      .select('id, count')
      .eq('platform', platform)
      .eq('platform_user_id', userId)
      .eq('date', kstDate)
      .single();

    if (existing) {
      await supabase
        .from('daily_usage')
        .update({ count: existing.count + 1 })
        .eq('id', existing.id);
    } else {
      await supabase.from('daily_usage').insert({
        platform,
        platform_user_id: userId,
        date: kstDate,
        count: 1,
      });
    }
  }
}

// === Determine user tier ===

export async function getUserTier(
  platform: string,
  userId: string,
): Promise<UserTier> {
  if (!supabase) return 'free';

  const { data } = await supabase
    .from('user_profiles')
    .select('is_premium, premium_expires_at, credits')
    .eq('platform', platform)
    .eq('platform_user_id', userId)
    .single();

  if (!data) return 'free';

  if (data.is_premium) {
    if (data.premium_expires_at && new Date(data.premium_expires_at) > new Date()) {
      return 'premium';
    }
  }

  // Check subscription table
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('tier, expires_at')
    .eq('platform', platform)
    .eq('platform_user_id', userId)
    .single();

  if (sub?.tier === 'premium' && sub.expires_at && new Date(sub.expires_at) > new Date()) {
    return 'premium';
  }
  if (sub?.tier === 'basic' && sub.expires_at && new Date(sub.expires_at) > new Date()) {
    return 'basic';
  }

  // Has credits? Treat as basic
  if (data.credits && data.credits > 0) {
    return 'basic';
  }

  return 'free';
}

// === Combined check ===

export async function checkRateLimit(
  platform: string,
  userId: string,
): Promise<RateLimitResult> {
  // 1. Spam throttle
  const spamCheck = checkSpamThrottle(userId);
  if (!spamCheck.allowed) return spamCheck;

  // 2. Get tier
  const tier = await getUserTier(platform, userId);

  // 3. Daily limit
  return await checkDailyLimit(platform, userId, tier);
}
