/**
 * Toss Payments 결제 연동 모듈.
 * - 단건 결제 (1회 열람권)
 * - 정기 결제 (월간 구독)
 * - 크레딧 충전 (충전식)
 * - 결제 확인 + 웹훅 처리
 */

import { supabase } from './supabase';

// === 상수 ===

export const TOSS_CLIENT_KEY = process.env.TOSS_CLIENT_KEY ?? '';
export const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY ?? '';
const TOSS_API_URL = 'https://api.tosspayments.com/v1';

// === 가격 정책 (경쟁사 분석 기반) ===

export const PRICING = {
  // 단건 결제
  SINGLE_READING: { amount: 1900, name: '1회 열람권', credits: 1 },
  THREE_READINGS: { amount: 4900, name: '3회 열람권 패키지', credits: 3 },
  
  // 크레딧 충전
  CREDIT_10: { amount: 9900, name: '크레딧 10개', credits: 10 },
  CREDIT_30: { amount: 24900, name: '크레딧 30개 (17% 할인)', credits: 30 },
  CREDIT_100: { amount: 69900, name: '크레딧 100개 (30% 할인)', credits: 100 },
  
  // 구독
  MONTHLY_BASIC: { amount: 9900, name: '월간 베이직', dailyCredits: 1, premiumCredits: 3 },
  MONTHLY_PREMIUM: { amount: 19900, name: '월간 프리미엄', dailyCredits: 3, premiumCredits: 10 },
  
  // 특별 상품
  YEARLY_FORTUNE: { amount: 12900, name: '2026년 신년운세 리포트', credits: 0 },
  COMPATIBILITY_DEEP: { amount: 3900, name: '궁합 프리미엄 분석', credits: 0 },
} as const;

export type ProductKey = keyof typeof PRICING;

// === 주문 상태 ===

export type OrderStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';

export interface Order {
  id?: number;
  order_id: string;  // Toss orderId
  platform: string;
  platform_user_id: string;
  product_key: ProductKey;
  amount: number;
  status: OrderStatus;
  payment_key?: string;
  toss_response?: Record<string, unknown>;
  created_at?: string;
  paid_at?: string;
}

// === 주문 생성 ===

export function generateOrderId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `SAJU_${timestamp}_${random}`.toUpperCase();
}

export async function createOrder(
  platform: string,
  userId: string,
  productKey: ProductKey,
): Promise<Order | null> {
  if (!supabase) return null;

  const product = PRICING[productKey];
  const orderId = generateOrderId();
  
  const order: Omit<Order, 'id' | 'created_at'> = {
    order_id: orderId,
    platform,
    platform_user_id: userId,
    product_key: productKey,
    amount: product.amount,
    status: 'pending',
  };

  const { data, error } = await supabase
    .from('orders')
    .insert(order)
    .select()
    .single();

  if (error) {
    console.error('[payment] createOrder error:', error.message);
    return null;
  }

  return data as Order;
}

// === Toss Payments 결제 확인 ===

export async function confirmPayment(
  paymentKey: string,
  orderId: string,
  amount: number,
): Promise<{ success: boolean; error?: string; data?: Record<string, unknown> }> {
  if (!TOSS_SECRET_KEY) {
    return { success: false, error: 'Toss secret key not configured' };
  }

  try {
    const response = await fetch(`${TOSS_API_URL}/payments/confirm`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${TOSS_SECRET_KEY}:`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.message || 'Payment confirmation failed' };
    }

    // DB 업데이트
    if (supabase) {
      await supabase
        .from('orders')
        .update({
          status: 'paid',
          payment_key: paymentKey,
          toss_response: data,
          paid_at: new Date().toISOString(),
        })
        .eq('order_id', orderId);
    }

    return { success: true, data };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[payment] confirmPayment error:', msg);
    return { success: false, error: msg };
  }
}

// === 크레딧 관리 ===

export async function getUserCredits(
  platform: string,
  userId: string,
): Promise<number> {
  if (!supabase) return 0;

  const { data } = await supabase
    .from('user_profiles')
    .select('credits')
    .eq('platform', platform)
    .eq('platform_user_id', userId)
    .single();

  return data?.credits ?? 0;
}

export async function addCredits(
  platform: string,
  userId: string,
  amount: number,
  reason: string,
): Promise<boolean> {
  if (!supabase) return false;

  // Log the transaction
  await supabase.from('credit_transactions').insert({
    platform,
    platform_user_id: userId,
    amount,
    reason,
    created_at: new Date().toISOString(),
  });

  // Increment credits
  const { error } = await supabase.rpc('increment_credits', {
    p_platform: platform,
    p_user_id: userId,
    p_amount: amount,
  });

  if (error) {
    console.error('[payment] addCredits error:', error.message);
    return false;
  }

  return true;
}

export async function useCredit(
  platform: string,
  userId: string,
  reason: string,
): Promise<boolean> {
  if (!supabase) return false;

  const credits = await getUserCredits(platform, userId);
  if (credits <= 0) return false;

  await supabase.from('credit_transactions').insert({
    platform,
    platform_user_id: userId,
    amount: -1,
    reason,
    created_at: new Date().toISOString(),
  });

  const { error } = await supabase.rpc('decrement_credits', {
    p_platform: platform,
    p_user_id: userId,
  });

  if (error) {
    console.error('[payment] useCredit error:', error.message);
    return false;
  }

  return true;
}

// === 구독 관리 ===

export type SubscriptionTier = 'none' | 'basic' | 'premium';

export interface Subscription {
  tier: SubscriptionTier;
  expires_at: string | null;
  billing_key?: string;
  auto_renew: boolean;
}

export async function getSubscription(
  platform: string,
  userId: string,
): Promise<Subscription> {
  if (!supabase) return { tier: 'none', expires_at: null, auto_renew: false };

  const { data } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('platform', platform)
    .eq('platform_user_id', userId)
    .single();

  if (!data) return { tier: 'none', expires_at: null, auto_renew: false };

  // Check if expired
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return { tier: 'none', expires_at: data.expires_at, auto_renew: data.auto_renew ?? false };
  }

  return {
    tier: data.tier ?? 'none',
    expires_at: data.expires_at,
    billing_key: data.billing_key,
    auto_renew: data.auto_renew ?? false,
  };
}

export async function activateSubscription(
  platform: string,
  userId: string,
  tier: SubscriptionTier,
  billingKey?: string,
): Promise<boolean> {
  if (!supabase) return false;

  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 1);

  const { error } = await supabase
    .from('subscriptions')
    .upsert({
      platform,
      platform_user_id: userId,
      tier,
      expires_at: expiresAt.toISOString(),
      billing_key: billingKey,
      auto_renew: !!billingKey,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'platform,platform_user_id' });

  if (error) {
    console.error('[payment] activateSubscription error:', error.message);
    return false;
  }

  // Also update user_profiles is_premium
  await supabase
    .from('user_profiles')
    .update({
      is_premium: true,
      premium_expires_at: expiresAt.toISOString(),
    })
    .eq('platform', platform)
    .eq('platform_user_id', userId);

  return true;
}

// === 결제 URL 생성 (KakaoTalk 웹뷰용) ===

export function buildPaymentUrl(orderId: string, productKey: ProductKey): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://saju-app.vercel.app';
  return `${baseUrl}/payment?orderId=${orderId}&product=${productKey}`;
}

// === 결제 후 혜택 지급 ===

export async function fulfillOrder(order: Order): Promise<boolean> {
  const product = PRICING[order.product_key];
  if (!product) return false;

  // 크레딧 상품
  if ('credits' in product && product.credits > 0) {
    return await addCredits(
      order.platform,
      order.platform_user_id,
      product.credits,
      `결제: ${product.name} (주문 ${order.order_id})`,
    );
  }

  // 구독 상품
  if ('dailyCredits' in product) {
    const tier = order.product_key === 'MONTHLY_PREMIUM' ? 'premium' : 'basic';
    return await activateSubscription(order.platform, order.platform_user_id, tier);
  }

  // 특별 상품 (신년운세, 궁합 등) - 접근 권한 부여
  if (supabase) {
    await supabase.from('purchased_products').insert({
      platform: order.platform,
      platform_user_id: order.platform_user_id,
      product_key: order.product_key,
      order_id: order.order_id,
      created_at: new Date().toISOString(),
    });
  }

  return true;
}

// === 일일 무료 사용 체크 ===

export async function getDailyFreeUsage(
  platform: string,
  userId: string,
): Promise<{ used: number; limit: number; remaining: number }> {
  if (!supabase) return { used: 0, limit: 3, remaining: 3 };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from('daily_usage')
    .select('count')
    .eq('platform', platform)
    .eq('platform_user_id', userId)
    .gte('date', todayStart.toISOString().split('T')[0])
    .single();

  const used = data?.count ?? 0;
  
  // Check subscription tier for limits
  const sub = await getSubscription(platform, userId);
  const limit = sub.tier === 'premium' ? 999 : sub.tier === 'basic' ? 10 : 3;

  return { used, limit, remaining: Math.max(0, limit - used) };
}

export async function incrementDailyUsage(
  platform: string,
  userId: string,
): Promise<void> {
  if (!supabase) return;

  const today = new Date().toISOString().split('T')[0];

  const { data: existing } = await supabase
    .from('daily_usage')
    .select('id, count')
    .eq('platform', platform)
    .eq('platform_user_id', userId)
    .eq('date', today)
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
      date: today,
      count: 1,
    });
  }
}

// === 결제 상태 메시지 ===

export function getPaymentStatusMessage(
  credits: number,
  subscription: Subscription,
  freeUsage: { used: number; limit: number; remaining: number },
): string {
  const lines: string[] = [];

  if (subscription.tier !== 'none') {
    const tierName = subscription.tier === 'premium' ? '프리미엄' : '베이직';
    const expiry = subscription.expires_at 
      ? new Date(subscription.expires_at).toLocaleDateString('ko-KR')
      : '무기한';
    lines.push(`구독: ${tierName} (${expiry}까지)`);
  }

  if (credits > 0) {
    lines.push(`크레딧: ${credits}개`);
  }

  lines.push(`오늘 무료 사용: ${freeUsage.used}/${freeUsage.limit}`);

  if (freeUsage.remaining <= 0 && credits <= 0 && subscription.tier === 'none') {
    lines.push('\n오늘 무료 횟수를 모두 사용했어요.');
    lines.push('크레딧 충전 또는 구독으로 계속 이용할 수 있어요!');
  }

  return lines.join('\n');
}
