/**
 * In-memory conversation history store.
 *
 * ⚠️  Production 대체안:
 *   - Vercel KV (https://vercel.com/docs/storage/vercel-kv)
 *   - Upstash Redis (https://upstash.com/)
 *   - Supabase table: kakao_history (user_id TEXT, turns JSONB, updated_at TIMESTAMPTZ)
 *
 * Cold start 시 초기화됩니다. Vercel serverless 환경에서는 인스턴스가 여러 개일 수 있으므로
 * 프로덕션에서는 위의 외부 스토어로 교체하세요.
 */

import type { Turn } from './kakao-types';

const MAX_TURNS = 5; // user + assistant 각각 5턴 = 최대 10개 메시지

// 메모리 스토어: Map<userId, Turn[]>
const store = new Map<string, Turn[]>();

export function getHistory(userId: string): Turn[] {
  return store.get(userId) ?? [];
}

export function addTurn(
  userId: string,
  role: 'user' | 'assistant',
  content: string,
): void {
  const history = store.get(userId) ?? [];
  history.push({ role, content, timestamp: Date.now() });

  // 최근 MAX_TURNS * 2개만 유지 (user/assistant 쌍)
  if (history.length > MAX_TURNS * 2) {
    history.splice(0, history.length - MAX_TURNS * 2);
  }

  store.set(userId, history);
}
