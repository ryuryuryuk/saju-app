'use client';

import { useState } from 'react';
import BackLink from '@/app/components/BackLink';
import LoadingTimeline from '@/app/components/LoadingTimeline';

interface TopicItem {
  category: string;
  percentage: number;
}

interface AiChatResult {
  summary: string;
  topics: TopicItem[];
  patterns: string[];
  insights: string;
  recommendations: string[];
}

const PERIODS = [
  { value: 'all', label: '전체 기간' },
  { value: '3months', label: '최근 3개월' },
  { value: '1month', label: '최근 1개월' },
];

const LOADING_STEPS = [
  { title: '대화 패턴 추출', description: '사용자 메시지를 분류하고 패턴을 추출합니다', startAtMs: 0 },
  { title: '사고 패턴 분석', description: '관심사와 사고 흐름을 분석합니다', startAtMs: 3000 },
  { title: '인사이트 생성', description: 'AI가 종합 인사이트를 작성합니다', startAtMs: 7000 },
];

export default function AiChatPage() {
  const [text, setText] = useState('');
  const [period, setPeriod] = useState('all');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [result, setResult] = useState<AiChatResult | null>(null);
  const [error, setError] = useState('');
  const [timedOut, setTimedOut] = useState(false);

  const handleSubmit = async () => {
    if (!text.trim()) {
      setError('AI 대화 내용을 입력해 주세요.');
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
      const res = await fetch('/api/ai-chat-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ text, period }),
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

        <header className="relative mb-8 overflow-hidden rounded-3xl border border-orange-200/70 bg-white/80 p-6 text-center shadow-[0_16px_40px_rgba(41,37,36,0.12)] md:mb-10 md:p-8">
          <span className="hero-orb -right-8 -top-7 h-32 w-32 bg-orange-300" aria-hidden="true" />
          <span className="hero-orb -left-8 bottom-1 h-24 w-24 bg-amber-300" aria-hidden="true" />
          <p className="text-sm font-semibold tracking-[0.2em] text-orange-700">AI CHAT ANALYSIS</p>
          <h1 className="mt-3 text-4xl font-bold text-stone-900 md:text-5xl">AI 대화 분석</h1>
          <p className="mt-3 text-stone-700">ChatGPT · Claude 대화 기록으로 보는 내 사고 패턴</p>
        </header>

        {!result ? (
          <div className="surface-card fade-slide-up p-6 md:p-8">
            <div className="mb-5">
              <label htmlFor="period" className="mb-2 block text-sm font-medium text-stone-700">
                분석 기간
              </label>
              <select
                id="period"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="focus-ring tap-target w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-stone-900 focus:border-orange-500"
                aria-label="분석 기간 선택"
              >
                {PERIODS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-5">
              <label htmlFor="ai-chat-text" className="mb-2 block text-sm font-medium text-stone-700">
                AI 대화 내용
              </label>
              <textarea
                id="ai-chat-text"
                rows={8}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onInput={(e) => {
                  const target = e.currentTarget;
                  target.style.height = 'auto';
                  target.style.height = `${target.scrollHeight}px`;
                }}
                placeholder="ChatGPT/Claude 대화 내용을 붙여넣으세요. JSON 내보내기 또는 텍스트 복사 모두 지원합니다."
                className="focus-ring min-h-[140px] w-full resize-none rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 text-stone-900 placeholder:text-stone-400 focus:border-orange-500"
                aria-label="AI 대화 내용 입력"
              />
              <p className="mt-1 text-xs text-stone-500">
                ChatGPT: Settings &gt; Data Controls &gt; Export data / Claude: 대화 복사
              </p>
            </div>

            <div className="mb-6 rounded-xl bg-orange-50 p-4 text-sm text-stone-700">
              대화 내용은 분석 목적으로만 사용되며, 서버에 저장되지 않습니다.
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
                <p>{error}</p>
                {timedOut && (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    className="focus-ring tap-target mt-2 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                    aria-label="AI 대화 분석 재시도"
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
                disabled={!text.trim()}
                className="cta-button focus-ring tap-target w-full py-3 text-lg disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="AI 대화 분석 시작"
              >
                AI 대화 분석 시작
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="surface-card fade-slide-up p-6 md:p-8">
              <h2 className="mb-4 text-2xl font-bold text-stone-900">분석 요약</h2>
              <p className="leading-relaxed text-stone-700">{result.summary}</p>
            </div>

            <div className="surface-card fade-slide-up stagger-1 p-6 md:p-8">
              <h3 className="mb-4 text-lg font-bold text-stone-900">관심 주제 분포</h3>
              <div className="space-y-3">
                {result.topics.map((topic, i) => (
                  <div key={i}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-stone-700">{topic.category}</span>
                      <span className="text-orange-700">{topic.percentage}%</span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-stone-200">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-orange-700 to-amber-600 transition-all duration-700"
                        style={{ width: `${topic.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="surface-card fade-slide-up stagger-2 p-6 md:p-8">
              <h3 className="mb-3 text-lg font-bold text-stone-900">사고 패턴</h3>
              <ul className="space-y-2">
                {result.patterns.map((pattern, i) => (
                  <li key={i} className="flex items-start gap-2 text-stone-700">
                    <span className="mt-1 text-orange-500">◆</span>
                    <span>{pattern}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="surface-card fade-slide-up stagger-3 p-6 md:p-8">
              <h3 className="mb-3 text-lg font-bold text-stone-900">종합 인사이트</h3>
              <p className="leading-relaxed text-stone-700">{result.insights}</p>
            </div>

            <div className="surface-card fade-slide-up stagger-3 p-6 md:p-8">
              <h3 className="mb-3 text-lg font-bold text-stone-900">성장 제안</h3>
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
                setError('');
              }}
              className="focus-ring tap-target w-full rounded-xl border border-stone-300 bg-white py-3 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
              aria-label="AI 대화 분석 다시 시작"
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
