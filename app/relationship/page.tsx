'use client';

import { useState } from 'react';
import BackLink from '@/app/components/BackLink';
import LoadingTimeline from '@/app/components/LoadingTimeline';

interface RelationshipResult {
  summary: string;
  metrics: {
    totalMessages: number;
    period: string;
    initiationRate: { you: number; partner: number };
    responseTime: { you: string; partner: string };
    emotionalTone: { positive: number; neutral: number; negative: number };
  };
  insights: string[];
  recommendations: string[];
}

const ANALYSIS_TYPES = [
  { value: 'romantic', label: '연인' },
  { value: 'friend', label: '친구' },
  { value: 'family', label: '가족' },
  { value: 'colleague', label: '직장 동료' },
];

const LOADING_STEPS = [
  { title: '대화 패턴 분석', description: '메시지 빈도와 대화 흐름을 분석합니다', startAtMs: 0 },
  { title: '관계 역학 파악', description: '감정 톤과 상호작용 패턴을 파악합니다', startAtMs: 3000 },
  { title: '인사이트 생성', description: 'AI가 종합 인사이트를 작성합니다', startAtMs: 7000 },
];

export default function RelationshipPage() {
  const [text, setText] = useState('');
  const [analysisType, setAnalysisType] = useState('romantic');
  const [anonymize, setAnonymize] = useState(true);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [result, setResult] = useState<RelationshipResult | null>(null);
  const [error, setError] = useState('');
  const [timedOut, setTimedOut] = useState(false);

  const handleSubmit = async () => {
    if (!text.trim()) {
      setError('대화 내용을 붙여넣어 주세요.');
      return;
    }
    if (!consent) {
      setError('개인정보 처리 동의가 필요합니다.');
      return;
    }

    setError('');
    setTimedOut(false);
    setLoading(true);
    setLoadingStep(0);
    setResult(null);

    const timer1 = setTimeout(() => setLoadingStep(1), 3000);
    const timer2 = setTimeout(() => setLoadingStep(2), 7000);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch('/api/relationship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ text, analysisType, anonymize }),
      });

      const data = await res.json();
      if (!data.success) {
        setError(data.error || '분석 중 오류가 발생했습니다.');
      } else {
        setResult(data.result);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setTimedOut(true);
        setError('분석 요청이 30초를 초과했습니다. 잠시 후 다시 시도해주세요.');
      } else {
        setError('네트워크 오류가 발생했습니다. 다시 시도해주세요.');
      }
    } finally {
      window.clearTimeout(timeoutId);
      clearTimeout(timer1);
      clearTimeout(timer2);
      setLoading(false);
    }
  };

  return (
    <div className="app-bg min-h-screen px-4 py-8 md:px-8 md:py-12">
      <main className="mx-auto max-w-3xl">
        <BackLink />

        <header className="relative mb-8 overflow-hidden rounded-3xl border border-rose-200/70 bg-white/80 p-6 text-center shadow-[0_16px_40px_rgba(41,37,36,0.12)] md:mb-10 md:p-8">
          <span className="hero-orb -right-8 -top-7 h-32 w-32 bg-rose-300" aria-hidden="true" />
          <span className="hero-orb -left-8 bottom-1 h-24 w-24 bg-orange-300" aria-hidden="true" />
          <p className="text-sm font-semibold tracking-[0.2em] text-rose-700">RELATIONSHIP ANALYSIS</p>
          <h1 className="mt-3 text-4xl font-bold text-stone-900 md:text-5xl">관계 분석</h1>
          <p className="mt-3 text-stone-700">카카오톡 대화 내용으로 관계의 심리를 읽어드립니다</p>
        </header>

        {!result ? (
          <div className="surface-card fade-slide-up p-6 md:p-8">
            <div className="mb-5">
              <label htmlFor="analysis-type" className="mb-2 block text-sm font-medium text-stone-700">
                관계 유형
              </label>
              <select
                id="analysis-type"
                value={analysisType}
                onChange={(e) => setAnalysisType(e.target.value)}
                className="focus-ring tap-target w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-stone-900 focus:border-rose-500"
                aria-label="관계 유형 선택"
              >
                {ANALYSIS_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-5">
              <label htmlFor="chat-text" className="mb-2 block text-sm font-medium text-stone-700">
                카카오톡 대화 내용
              </label>
              <textarea
                id="chat-text"
                rows={8}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onInput={(e) => {
                  const target = e.currentTarget;
                  target.style.height = 'auto';
                  target.style.height = `${target.scrollHeight}px`;
                }}
                placeholder="카카오톡 대화 내보내기 텍스트를 붙여넣으세요..."
                className="focus-ring min-h-[140px] w-full resize-none rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 text-stone-900 placeholder:text-stone-400 focus:border-rose-500"
                aria-label="카카오톡 대화 입력"
              />
              <p className="mt-1 text-xs text-stone-500">
                카카오톡 &gt; 대화방 &gt; 설정 &gt; 대화 내보내기로 추출한 텍스트
              </p>
            </div>

            <div className="mb-5 flex items-center gap-3">
              <input
                type="checkbox"
                id="anonymize"
                checked={anonymize}
                onChange={(e) => setAnonymize(e.target.checked)}
                className="h-5 w-5 rounded border-stone-300 text-rose-600 focus:ring-rose-500"
                aria-label="이름 익명화 처리"
              />
              <label htmlFor="anonymize" className="text-sm text-stone-700">
                이름 익명화 처리 (권장)
              </label>
            </div>

            <div className="mb-6 rounded-xl bg-rose-50 p-4">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="consent"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-1 h-5 w-5 rounded border-stone-300 text-rose-600 focus:ring-rose-500"
                  aria-label="개인정보 처리 동의"
                />
                <label htmlFor="consent" className="text-sm text-stone-700">
                  대화 내용은 분석 목적으로만 사용되며, 서버에 저장되지 않고 분석 직후 즉시 삭제됩니다.
                  동의합니다.
                </label>
              </div>
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
                <p>{error}</p>
                {timedOut && (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    className="focus-ring tap-target mt-2 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                    aria-label="관계 분석 재시도"
                  >
                    재시도
                  </button>
                )}
              </div>
            )}

            {loading ? (
              <LoadingTimeline steps={LOADING_STEPS} currentStepIndex={loadingStep} />
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!text.trim() || !consent}
                className="cta-button focus-ring tap-target w-full py-3 text-lg disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="관계 분석 시작"
              >
                관계 분석 시작
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="surface-card fade-slide-up p-6 md:p-8">
              <h2 className="mb-4 text-2xl font-bold text-stone-900">분석 결과</h2>
              <p className="leading-relaxed text-stone-700">{result.summary}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="fade-slide-up rounded-2xl border border-stone-200 bg-white/90 p-4 text-center">
                <p className="text-2xl font-bold text-rose-700">{result.metrics.totalMessages}</p>
                <p className="mt-1 text-xs text-stone-500">총 메시지</p>
              </div>
              <div className="fade-slide-up stagger-1 rounded-2xl border border-stone-200 bg-white/90 p-4 text-center">
                <p className="text-2xl font-bold text-rose-700">
                  {Math.round(result.metrics.initiationRate.you * 100)}%
                </p>
                <p className="mt-1 text-xs text-stone-500">내 대화 시작률</p>
              </div>
              <div className="fade-slide-up stagger-2 rounded-2xl border border-stone-200 bg-white/90 p-4 text-center">
                <p className="text-2xl font-bold text-emerald-700">
                  {Math.round(result.metrics.emotionalTone.positive * 100)}%
                </p>
                <p className="mt-1 text-xs text-stone-500">긍정 톤</p>
              </div>
              <div className="fade-slide-up stagger-3 rounded-2xl border border-stone-200 bg-white/90 p-4 text-center">
                <p className="text-2xl font-bold text-amber-700">
                  {Math.round(result.metrics.emotionalTone.neutral * 100)}%
                </p>
                <p className="mt-1 text-xs text-stone-500">중립 톤</p>
              </div>
            </div>

            <div className="surface-card fade-slide-up stagger-1 p-6 md:p-8">
              <h3 className="mb-3 text-lg font-bold text-stone-900">인사이트</h3>
              <ul className="space-y-2">
                {result.insights.map((insight, i) => (
                  <li key={i} className="flex items-start gap-2 text-stone-700">
                    <span className="mt-1 text-rose-500">•</span>
                    <span>{insight}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="surface-card fade-slide-up stagger-2 p-6 md:p-8">
              <h3 className="mb-3 text-lg font-bold text-stone-900">추천 행동</h3>
              <ul className="space-y-2">
                {result.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-stone-700">
                    <span className="mt-1 text-amber-500">✦</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              onClick={() => {
                setResult(null);
                setText('');
                setConsent(false);
                setError('');
              }}
              className="focus-ring tap-target w-full rounded-xl border border-stone-300 bg-white py-3 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
              aria-label="관계 분석 다시 시작"
            >
              ← 다시 분석하기
            </button>
          </div>
        )}

        <footer className="mt-8 text-center text-xs text-stone-500 md:mt-10">
          대화 내용은 서버에 저장되지 않습니다. 엔터테인먼트 목적의 서비스입니다.
        </footer>
      </main>
    </div>
  );
}
