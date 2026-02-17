'use client';

import { useRef, useState } from 'react';
import BackLink from '@/app/components/BackLink';
import LoadingTimeline from '@/app/components/LoadingTimeline';

interface FaceResult {
  summary: string;
  features: {
    eyes: string;
    nose: string;
    mouth: string;
    overall: string;
  };
  energy: string;
  personality: string[];
  disclaimer: string;
}

const LOADING_STEPS = [
  { title: '이미지 처리', description: '사진을 안전하게 처리합니다', startAtMs: 0 },
  { title: '인상 분석', description: 'AI가 관상학 관점에서 인상을 읽습니다', startAtMs: 2000 },
  { title: '리포트 생성', description: '종합 리포트를 작성합니다', startAtMs: 7000 },
];

export default function FacePage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [result, setResult] = useState<FaceResult | null>(null);
  const [error, setError] = useState('');
  const [timedOut, setTimedOut] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];
    const validExts = ['jpg', 'jpeg', 'png', 'heic', 'heif'];
    const ext = selected.name.split('.').pop()?.toLowerCase() ?? '';

    if (!validTypes.includes(selected.type) && !validExts.includes(ext)) {
      setError('JPG, PNG, HEIC 이미지만 업로드할 수 있습니다.');
      return;
    }

    if (selected.size > 5 * 1024 * 1024) {
      setError('파일 크기는 5MB 이하여야 합니다.');
      return;
    }

    setFile(selected);
    setError('');
    setTimedOut(false);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(selected);
  };

  const handleSubmit = async () => {
    if (!file) {
      setError('사진을 업로드해 주세요.');
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

    const timer1 = setTimeout(() => setLoadingStep(1), 2000);
    const timer2 = setTimeout(() => setLoadingStep(2), 7000);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 30_000);

    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('consent', 'true');

      const res = await fetch('/api/face-analysis', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
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

        <header className="relative mb-8 overflow-hidden rounded-3xl border border-amber-200/70 bg-white/80 p-6 text-center shadow-[0_16px_40px_rgba(41,37,36,0.12)] md:mb-10 md:p-8">
          <span className="hero-orb -right-8 -top-7 h-32 w-32 bg-amber-300" aria-hidden="true" />
          <span className="hero-orb -left-8 bottom-1 h-24 w-24 bg-orange-300" aria-hidden="true" />
          <p className="text-sm font-semibold tracking-[0.2em] text-amber-700">FACE READING</p>
          <h1 className="mt-3 text-4xl font-bold text-stone-900 md:text-5xl">관상 분석</h1>
          <p className="mt-3 text-stone-700">얼굴 사진으로 보는 인상 리딩</p>
        </header>

        {!result ? (
          <div className="surface-card fade-slide-up p-6 md:p-8">
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-stone-700">
              <p className="mb-1 font-medium text-amber-800">안내사항</p>
              <p>
                관상 분석은 전통적 관상학에 기반한 엔터테인먼트 서비스입니다. 과학적 근거가 없으며,
                인종·종교·건강 등 민감한 속성을 추론하지 않습니다. 업로드된 사진은 분석 직후 즉시 삭제됩니다.
              </p>
            </div>

            <div className="mb-5">
              <label className="mb-2 block text-sm font-medium text-stone-700">얼굴 사진</label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="focus-ring flex min-h-[200px] cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 transition hover:border-orange-400 hover:bg-orange-50/40"
                role="button"
                tabIndex={0}
                aria-label="사진 업로드"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
              >
                {preview ? (
                  <img
                    src={preview}
                    alt="업로드된 사진 미리보기"
                    className="max-h-[300px] rounded-lg object-contain"
                  />
                ) : (
                  <div className="p-6 text-center">
                    <p className="mb-2 text-3xl" aria-hidden="true">📷</p>
                    <p className="text-sm text-stone-500">클릭하여 사진을 업로드하세요</p>
                    <p className="mt-1 text-xs text-stone-400">JPG, PNG, HEIC · 최대 5MB</p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/heic,image/heif"
                onChange={handleFileChange}
                className="hidden"
                aria-label="사진 파일 선택"
              />
            </div>

            <div className="mb-6 rounded-xl bg-orange-50 p-4">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="face-consent"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-1 h-5 w-5 rounded border-stone-300 text-orange-600 focus:ring-orange-500"
                  aria-label="사진 분석 동의"
                />
                <label htmlFor="face-consent" className="text-sm text-stone-700">
                  업로드된 사진은 분석 목적으로만 사용되며, 서버에 저장되지 않고 분석 직후 즉시 삭제됩니다.
                  결과는 엔터테인먼트 목적이며, 어떠한 차별적 판단의 근거로 사용될 수 없습니다. 동의합니다.
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
                    aria-label="관상 분석 재시도"
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
                disabled={!file || !consent}
                className="cta-button focus-ring tap-target w-full py-3 text-lg disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="관상 분석 시작"
              >
                관상 분석 시작
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="surface-card fade-slide-up p-6 md:p-8">
              <h2 className="mb-4 text-2xl font-bold text-stone-900">인상 리딩</h2>
              <p className="leading-relaxed text-stone-700">{result.summary}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {Object.entries(result.features).map(([key, value], index) => {
                const labels: Record<string, string> = {
                  eyes: '눈',
                  nose: '코',
                  mouth: '입',
                  overall: '전체 인상',
                };
                return (
                  <div
                    key={key}
                    className={[
                      'rounded-2xl border border-stone-200 bg-white/90 p-4 fade-slide-up',
                      index === 1 ? 'stagger-1' : '',
                      index === 2 ? 'stagger-2' : '',
                      index >= 3 ? 'stagger-3' : '',
                    ].join(' ')}
                  >
                    <p className="text-sm font-medium text-orange-700">{labels[key] ?? key}</p>
                    <p className="mt-2 text-sm text-stone-700">{value}</p>
                  </div>
                );
              })}
            </div>

            <div className="surface-card fade-slide-up stagger-1 p-6 md:p-8">
              <h3 className="mb-3 text-lg font-bold text-stone-900">기운 &amp; 에너지</h3>
              <p className="leading-relaxed text-stone-700">{result.energy}</p>
            </div>

            <div className="surface-card fade-slide-up stagger-2 p-6 md:p-8">
              <h3 className="mb-3 text-lg font-bold text-stone-900">성격 키워드</h3>
              <div className="flex flex-wrap gap-2">
                {result.personality.map((tag, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-amber-100 px-4 py-1.5 text-sm font-medium text-amber-800"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="fade-slide-up stagger-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-stone-600">
              {result.disclaimer}
            </div>

            <button
              onClick={() => {
                setResult(null);
                setFile(null);
                setPreview(null);
                setConsent(false);
                setError('');
              }}
              className="focus-ring tap-target w-full rounded-xl border border-stone-300 bg-white py-3 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
              aria-label="관상 분석 다시 시작"
            >
              ← 다시 분석하기
            </button>
          </div>
        )}

        <footer className="mt-8 text-center text-xs text-stone-500 md:mt-10">
          사진은 서버에 저장되지 않습니다. 엔터테인먼트 목적의 서비스입니다.
        </footer>
      </main>
    </div>
  );
}
