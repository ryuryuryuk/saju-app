/**
 * Kakao 챗봇 서비스 레이어.
 *
 * 현재: stub 답변 (사용자 발화 요약)
 *
 * TODO — LLM/RAG로 교체하는 방법:
 *   1. import { analyzeSajuStructure } from './saju-structure';
 *   2. import { getEmbedding } from './embeddings';
 *   3. import OpenAI from 'openai';
 *   4. 아래 generateReply 함수 내부만 교체하면 됩니다.
 *      (인터페이스: (utterance, history) => Promise<string>)
 */

import type { Turn } from './kakao-types';

export async function generateReply(
  utterance: string,
  history: Turn[],
): Promise<string> {
  const priorUserTurns = history.filter((t) => t.role === 'user').length;

  if (!utterance.trim()) {
    return '안녕하세요! 사주, 관계, 관상 분석에 대해 질문해 주세요. 😊';
  }

  // --- stub: 여기를 실제 LLM/RAG 호출로 교체 ---
  const contextNote =
    priorUserTurns > 0 ? `\n(이전 대화 ${priorUserTurns}턴 반영 중)` : '';

  return (
    `"${utterance}" 라고 하셨군요.${contextNote}\n\n` +
    `AI 사주 분석 서비스 연동 준비 중입니다.\n` +
    `웹에서 직접 이용해 주세요: https://saju-app-rose.vercel.app`
  );
  // --- stub 끝 ---
}
