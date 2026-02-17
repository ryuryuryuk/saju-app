'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import BackLink from '@/app/components/BackLink';
import LoadingTimeline from '@/app/components/LoadingTimeline';
import type { LoadingStep } from '@/app/types/saju';

/* ─────────────────────── Types ─────────────────────── */

interface ScoreMap {
  balance: number;
  emotionalSafety: number;
  repairAbility: number;
  investment: number;
  attachmentLoop: number;
  futureAlignment: number;
}

interface ExecutiveSummary {
  diagnosis: string;
  scores: ScoreMap;
  scoreExplanations: Record<keyof ScoreMap, string>;
  risks: string[];
  opportunities: string[];
  actions48h: string[];
}

interface DeepDiveItem {
  claim: string;
  evidence: string;
  interpretation: string;
  action: string;
}

interface ScenarioDetail {
  conditions: string;
  evidence: string;
  actions: string;
}

interface ConcernResponse {
  question: string;
  scenarios: {
    optimistic: ScenarioDetail;
    neutral: ScenarioDetail;
    pessimistic: ScenarioDetail;
  };
}

interface ActionPlan {
  hours48: string[];
  week1: string[];
  week4: string[];
  scripts: {
    apology: string;
    boundary: string;
    request: string;
    repair: string;
    closure: string;
  };
}

interface ReportResult {
  executiveSummary: ExecutiveSummary;
  deepDive: DeepDiveItem[];
  actionPlan: ActionPlan;
  concernResponse: ConcernResponse;
  sajuSummary: string;
  dataSources: string[];
  disclaimer: string;
}

type Gender = '남성' | '여성';

/* ─────────────────── Score helpers ─────────────────── */

const SCORE_LABELS: Record<keyof ScoreMap, string> = {
  balance: '균형',
  emotionalSafety: '정서적 안전',
  repairAbility: '회복력',
  investment: '투자도',
  attachmentLoop: '애착 패턴',
  futureAlignment: '미래 정렬',
};

const scoreColor = (v: number): string => {
  if (v >= 80) return '#059669'; // emerald-600
  if (v >= 60) return '#d97706'; // amber-600
  if (v >= 40) return '#ea580c'; // orange-600
  return '#e11d48'; // rose-600
};

const scoreColorBg = (v: number): string => {
  if (v >= 80) return '#d1fae5'; // emerald-100
  if (v >= 60) return '#fef3c7'; // amber-100
  if (v >= 40) return '#ffedd5'; // orange-100
  return '#ffe4e6'; // rose-100
};

/* ─────────────────── Script labels ─────────────────── */

const SCRIPT_LABELS: Record<keyof ActionPlan['scripts'], string> = {
  apology: '사과 스크립트',
  boundary: '경계 설정 스크립트',
  request: '요청 스크립트',
  repair: '관계 회복 스크립트',
  closure: '마무리 스크립트',
};

/* ─────────────── Loading timeline steps ─────────────── */

const LOADING_STEPS: LoadingStep[] = [
  { title: '사주 계산 중', description: '생년월일시 기반 사주팔자를 계산합니다', startAtMs: 0 },
  { title: '대화 패턴 분석', description: '제공된 데이터를 분석합니다', startAtMs: 3000 },
  { title: '종합 인사이트 생성', description: 'AI가 모든 데이터를 통합합니다', startAtMs: 8000 },
  { title: '프리미엄 리포트 작성', description: '맞춤형 브리핑을 작성합니다', startAtMs: 15000 },
  { title: '최종 검토', description: '리포트를 검수합니다', startAtMs: 22000 },
];

/* ─────────────── Year/month/day ranges ─────────────── */

const YEARS = Array.from({ length: 71 }, (_, i) => 1940 + i); // 1940-2010
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

/* ═══════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════ */

export default function IntegratedPage() {
  /* ── wizard step ── */
  const [currentStep, setCurrentStep] = useState(0);
  const TOTAL_STEPS = 5;

  /* ── step 1: saju inputs ── */
  const [birthYear, setBirthYear] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [birthHour, setBirthHour] = useState('');
  const [birthMinute, setBirthMinute] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [question, setQuestion] = useState('');

  /* ── step 2: kakao chat ── */
  const [kakaoText, setKakaoText] = useState('');
  const [relationshipType, setRelationshipType] = useState('연인');
  const [anonymize, setAnonymize] = useState(true);

  /* ── step 3: AI chat ── */
  const [aiChatText, setAiChatText] = useState('');

  /* ── step 4: face ── */
  const [faceImage, setFaceImage] = useState<File | null>(null);
  const [facePreview, setFacePreview] = useState<string | null>(null);
  const [faceConsent, setFaceConsent] = useState(false);

  /* ── step 5: result ── */
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [error, setError] = useState('');

  /* ── scripts collapsible ── */
  const [scriptsOpen, setScriptsOpen] = useState(false);

  /* ── refs ── */
  const loadingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── cleanup face preview URL on unmount ── */
  useEffect(() => {
    return () => {
      if (facePreview) URL.revokeObjectURL(facePreview);
    };
  }, [facePreview]);

  /* ─────────────── helpers ─────────────── */

  const canProceedStep1 =
    birthYear !== '' &&
    birthMonth !== '' &&
    birthDay !== '' &&
    birthHour !== '' &&
    birthMinute !== '' &&
    gender !== '';

  const canProceedStep4 = !faceImage || faceConsent;

  const goNext = () => setCurrentStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  const goBack = () => setCurrentStep((s) => Math.max(s - 1, 0));

  const handleFileRead = (
    file: File,
    setter: (v: string) => void,
  ) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === 'string') setter(text);
    };
    reader.readAsText(file);
  };

  const handleFaceUpload = (file: File) => {
    if (facePreview) URL.revokeObjectURL(facePreview);
    setFaceImage(file);
    setFacePreview(URL.createObjectURL(file));
  };

  const clearAll = () => {
    setCurrentStep(0);
    setBirthYear('');
    setBirthMonth('');
    setBirthDay('');
    setBirthHour('');
    setBirthMinute('');
    setGender('');
    setQuestion('');
    setKakaoText('');
    setRelationshipType('연인');
    setAnonymize(true);
    setAiChatText('');
    if (facePreview) URL.revokeObjectURL(facePreview);
    setFaceImage(null);
    setFacePreview(null);
    setFaceConsent(false);
    setLoading(false);
    setLoadingStep(0);
    setResult(null);
    setError('');
    setScriptsOpen(false);
    if (loadingTimerRef.current) clearInterval(loadingTimerRef.current);
  };

  /* ─────────────── generate report ─────────────── */

  const generateReport = useCallback(async () => {
    setLoading(true);
    setError('');
    setLoadingStep(0);

    // Advance loading step based on timing
    const start = Date.now();
    loadingTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      for (let i = LOADING_STEPS.length - 1; i >= 0; i--) {
        if (elapsed >= LOADING_STEPS[i].startAtMs) {
          setLoadingStep(i);
          break;
        }
      }
    }, 500);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    try {
      const formData = new FormData();
      formData.append('birthYear', birthYear);
      formData.append('birthMonth', birthMonth);
      formData.append('birthDay', birthDay);
      formData.append('birthHour', birthHour);
      formData.append('birthMinute', birthMinute);
      formData.append('gender', gender);
      formData.append('question', question);

      if (kakaoText) {
        formData.append('kakaoText', kakaoText);
        formData.append('relationshipType', relationshipType);
      }
      if (aiChatText) {
        formData.append('aiChatText', aiChatText);
      }
      if (faceImage) {
        formData.append('faceImage', faceImage);
        formData.append('faceConsent', 'true');
      }

      const res = await fetch('/api/integrated', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? `서버 오류 (${res.status})`);
      }

      const data = await res.json();
      setResult(data);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('요청 시간이 초과되었습니다. 다시 시도해 주세요.');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('알 수 없는 오류가 발생했습니다.');
      }
    } finally {
      clearTimeout(timeout);
      if (loadingTimerRef.current) clearInterval(loadingTimerRef.current);
      setLoading(false);
    }
  }, [
    birthYear, birthMonth, birthDay, birthHour, birthMinute,
    gender, question, kakaoText, relationshipType, aiChatText,
    faceImage,
  ]);

  /* ─────────────────── shared UI ─────────────────── */

  const selectClasses =
    'focus-ring w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm transition hover:border-violet-400';
  const textareaClasses =
    'focus-ring w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm transition hover:border-violet-400 resize-y';
  const labelClasses = 'block text-sm font-medium text-stone-700 mb-1';

  /* ─── step indicator ─── */
  const stepLabels = ['사주 정보', '카카오톡', 'AI 대화', '관상', '결과'];
  const StepIndicator = () => (
    <nav aria-label="진행 단계" className="mb-8 flex items-center justify-center gap-2">
      {stepLabels.map((label, i) => {
        const isCompleted = i < currentStep;
        const isCurrent = i === currentStep;
        return (
          <div key={label} className="flex items-center gap-2">
            {i > 0 && (
              <div
                className={`h-px w-6 sm:w-10 transition-colors ${
                  isCompleted ? 'bg-violet-500' : 'bg-stone-300'
                }`}
              />
            )}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  isCompleted
                    ? 'bg-violet-600 text-white'
                    : isCurrent
                      ? 'bg-violet-100 text-violet-700 ring-2 ring-violet-500'
                      : 'bg-stone-200 text-stone-500'
                }`}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {isCompleted ? (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`hidden text-[10px] sm:block ${
                  isCurrent ? 'font-semibold text-violet-700' : 'text-stone-500'
                }`}
              >
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </nav>
  );

  /* ─── navigation buttons ─── */
  const NavButtons = ({
    showSkip = false,
    nextDisabled = false,
    onNext,
  }: {
    showSkip?: boolean;
    nextDisabled?: boolean;
    onNext?: () => void;
  }) => (
    <div className="mt-8 flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={goBack}
        className="focus-ring tap-target inline-flex items-center gap-1 rounded-lg px-4 py-2.5 text-sm font-medium text-stone-600 transition hover:bg-stone-100"
        aria-label="이전 단계로"
      >
        <span aria-hidden="true">&larr;</span> 이전
      </button>
      <div className="flex gap-3">
        {showSkip && (
          <button
            type="button"
            onClick={goNext}
            className="focus-ring tap-target rounded-lg px-5 py-2.5 text-sm font-medium text-stone-500 transition hover:bg-stone-100"
          >
            건너뛰기
          </button>
        )}
        <button
          type="button"
          onClick={onNext ?? goNext}
          disabled={nextDisabled}
          className="cta-button tap-target inline-flex items-center gap-1 px-6 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            backgroundImage: 'linear-gradient(90deg, #7c3aed, #8b5cf6, #d97706, #7c3aed)',
          }}
        >
          다음 <span aria-hidden="true">&rarr;</span>
        </button>
      </div>
    </div>
  );

  /* ═══════════════════════════════════════════════════════
     STEP RENDERERS
     ═══════════════════════════════════════════════════════ */

  /* ── Step 1: Saju inputs ── */
  const renderStep1 = () => (
    <section aria-labelledby="step1-heading" className="fade-slide-up">
      <h2 id="step1-heading" className="mb-6 text-xl font-bold text-stone-900">
        사주 정보 입력
      </h2>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {/* Birth Year */}
        <div>
          <label htmlFor="birthYear" className={labelClasses}>출생 연도</label>
          <select
            id="birthYear"
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value)}
            className={selectClasses}
          >
            <option value="">선택</option>
            {YEARS.map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
        </div>

        {/* Birth Month */}
        <div>
          <label htmlFor="birthMonth" className={labelClasses}>월</label>
          <select
            id="birthMonth"
            value={birthMonth}
            onChange={(e) => setBirthMonth(e.target.value)}
            className={selectClasses}
          >
            <option value="">선택</option>
            {MONTHS.map((m) => (
              <option key={m} value={m}>{m}월</option>
            ))}
          </select>
        </div>

        {/* Birth Day */}
        <div>
          <label htmlFor="birthDay" className={labelClasses}>일</label>
          <select
            id="birthDay"
            value={birthDay}
            onChange={(e) => setBirthDay(e.target.value)}
            className={selectClasses}
          >
            <option value="">선택</option>
            {DAYS.map((d) => (
              <option key={d} value={d}>{d}일</option>
            ))}
          </select>
        </div>

        {/* Birth Hour */}
        <div>
          <label htmlFor="birthHour" className={labelClasses}>시</label>
          <select
            id="birthHour"
            value={birthHour}
            onChange={(e) => setBirthHour(e.target.value)}
            className={selectClasses}
          >
            <option value="">선택</option>
            {HOURS.map((h) => (
              <option key={h} value={h}>{h}시</option>
            ))}
          </select>
        </div>

        {/* Birth Minute */}
        <div>
          <label htmlFor="birthMinute" className={labelClasses}>분</label>
          <select
            id="birthMinute"
            value={birthMinute}
            onChange={(e) => setBirthMinute(e.target.value)}
            className={selectClasses}
          >
            <option value="">선택</option>
            {MINUTES.map((m) => (
              <option key={m} value={m}>{m}분</option>
            ))}
          </select>
        </div>

        {/* Gender */}
        <div>
          <span className={labelClasses}>성별</span>
          <div className="mt-1 flex gap-4">
            {(['남성', '여성'] as const).map((g) => (
              <label key={g} className="flex items-center gap-1.5 text-sm text-stone-700 cursor-pointer">
                <input
                  type="radio"
                  name="gender"
                  value={g}
                  checked={gender === g}
                  onChange={() => setGender(g)}
                  className="accent-violet-600"
                />
                {g}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Concern question */}
      <div className="mt-6">
        <label htmlFor="question" className={labelClasses}>
          궁금한 점 <span className="text-stone-400">(선택)</span>
        </label>
        <textarea
          id="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="예: 올해 연애운이 궁금해요"
          rows={3}
          className={textareaClasses}
        />
      </div>

      {/* Nav */}
      <div className="mt-8 flex items-center justify-between">
        <BackLink />
        <button
          type="button"
          onClick={goNext}
          disabled={!canProceedStep1}
          className="cta-button tap-target inline-flex items-center gap-1 px-6 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            backgroundImage: 'linear-gradient(90deg, #7c3aed, #8b5cf6, #d97706, #7c3aed)',
          }}
        >
          다음 <span aria-hidden="true">&rarr;</span>
        </button>
      </div>
    </section>
  );

  /* ── Step 2: Kakao chat ── */
  const renderStep2 = () => (
    <section aria-labelledby="step2-heading" className="fade-slide-up">
      <h2 id="step2-heading" className="mb-2 text-xl font-bold text-stone-900">
        카카오톡 대화 분석
      </h2>
      <p className="mb-6 text-sm text-stone-500">
        카카오톡 대화 내보내기 텍스트를 붙여넣거나 파일을 업로드하세요. 건너뛰기도 가능합니다.
      </p>

      <div className="space-y-4">
        <div>
          <label htmlFor="kakaoText" className={labelClasses}>대화 내용</label>
          <textarea
            id="kakaoText"
            value={kakaoText}
            onChange={(e) => setKakaoText(e.target.value)}
            placeholder="카카오톡 대화를 여기에 붙여넣으세요..."
            rows={14}
            className={textareaClasses}
          />
        </div>

        <div>
          <label htmlFor="kakaoFile" className="focus-ring inline-flex cursor-pointer items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:border-violet-400 hover:bg-violet-50">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5m0 0l5 5m-5-5v12" />
            </svg>
            .txt 파일 업로드
          </label>
          <input
            id="kakaoFile"
            type="file"
            accept=".txt"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileRead(file, setKakaoText);
            }}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="relationshipType" className={labelClasses}>관계 유형</label>
            <select
              id="relationshipType"
              value={relationshipType}
              onChange={(e) => setRelationshipType(e.target.value)}
              className={selectClasses}
            >
              <option value="연인">연인</option>
              <option value="친구">친구</option>
              <option value="가족">가족</option>
              <option value="직장동료">직장동료</option>
            </select>
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-stone-700 cursor-pointer">
              <input
                type="checkbox"
                checked={anonymize}
                onChange={(e) => setAnonymize(e.target.checked)}
                className="accent-violet-600"
              />
              이름 익명 처리
            </label>
          </div>
        </div>
      </div>

      <NavButtons showSkip />
    </section>
  );

  /* ── Step 3: AI chat ── */
  const renderStep3 = () => (
    <section aria-labelledby="step3-heading" className="fade-slide-up">
      <h2 id="step3-heading" className="mb-2 text-xl font-bold text-stone-900">
        AI 대화 기록
      </h2>
      <p className="mb-6 text-sm text-stone-500">
        ChatGPT, Claude 등의 AI와 나눈 대화 기록을 붙여넣거나 업로드하세요.
      </p>

      <div className="space-y-4">
        <div>
          <label htmlFor="aiChatText" className={labelClasses}>대화 기록</label>
          <textarea
            id="aiChatText"
            value={aiChatText}
            onChange={(e) => setAiChatText(e.target.value)}
            placeholder="AI 대화 로그를 여기에 붙여넣으세요..."
            rows={8}
            className={textareaClasses}
          />
        </div>

        <div>
          <label htmlFor="aiFile" className="focus-ring inline-flex cursor-pointer items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:border-violet-400 hover:bg-violet-50">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5m0 0l5 5m-5-5v12" />
            </svg>
            .txt / .json 파일 업로드
          </label>
          <input
            id="aiFile"
            type="file"
            accept=".txt,.json"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileRead(file, setAiChatText);
            }}
          />
        </div>
      </div>

      <NavButtons showSkip />
    </section>
  );

  /* ── Step 4: Face image ── */
  const renderStep4 = () => (
    <section aria-labelledby="step4-heading" className="fade-slide-up">
      <h2 id="step4-heading" className="mb-2 text-xl font-bold text-stone-900">
        관상 분석용 사진
      </h2>
      <p className="mb-6 text-sm text-stone-500">
        정면 얼굴 사진을 업로드하면 관상 분석을 함께 제공합니다.
      </p>

      {/* Drop zone / preview */}
      <div className="space-y-4">
        {facePreview ? (
          <div className="relative mx-auto w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={facePreview}
              alt="업로드된 얼굴 사진 미리보기"
              className="max-h-64 rounded-xl border border-stone-300 object-cover shadow-md"
            />
            <button
              type="button"
              onClick={() => {
                if (facePreview) URL.revokeObjectURL(facePreview);
                setFaceImage(null);
                setFacePreview(null);
                setFaceConsent(false);
              }}
              className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-stone-800 text-white shadow transition hover:bg-rose-600"
              aria-label="사진 삭제"
            >
              &times;
            </button>
          </div>
        ) : (
          <label
            htmlFor="faceFile"
            className="focus-ring flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-stone-300 bg-white/60 px-6 py-12 text-center transition hover:border-violet-400 hover:bg-violet-50/40"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file && file.type.startsWith('image/')) handleFaceUpload(file);
            }}
          >
            <svg className="h-10 w-10 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-sm font-medium text-stone-600">
              이미지를 드래그하거나 클릭하여 업로드
            </span>
            <span className="text-xs text-stone-400">JPG, PNG 지원</span>
          </label>
        )}
        <input
          id="faceFile"
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFaceUpload(file);
          }}
        />

        {/* Consent */}
        {faceImage && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={faceConsent}
                onChange={(e) => setFaceConsent(e.target.checked)}
                className="mt-0.5 accent-violet-600"
              />
              <span className="text-xs leading-relaxed text-stone-600">
                이 분석은 전통 관상학 관점의 엔터테인먼트 콘텐츠이며, 의학적 &middot; 과학적 진단이 아닙니다.
                인종, 종교, 정치성향, 성적지향, 건강 상태를 추정하지 않습니다.
                이미지는 분석 후 즉시 삭제됩니다.
              </span>
            </label>
          </div>
        )}
      </div>

      <NavButtons showSkip nextDisabled={!canProceedStep4} />
    </section>
  );

  /* ── Step 5: Generate & Results ── */
  const renderStep5 = () => {
    if (result) return renderReport();

    const dataSummary: { label: string; active: boolean }[] = [
      { label: '사주 정보', active: true },
      { label: '카카오톡 대화', active: !!kakaoText },
      { label: 'AI 대화 기록', active: !!aiChatText },
      { label: '관상 사진', active: !!faceImage },
    ];

    return (
      <section aria-labelledby="step5-heading" className="fade-slide-up">
        <h2 id="step5-heading" className="mb-6 text-xl font-bold text-stone-900">
          종합 분석 생성
        </h2>

        {!loading ? (
          <>
            {/* Data summary */}
            <div className="mb-6 rounded-xl border border-stone-200 bg-white/80 p-5">
              <h3 className="mb-3 text-sm font-semibold text-stone-700">분석에 사용될 데이터</h3>
              <div className="flex flex-wrap gap-2">
                {dataSummary.map((d) => (
                  <span
                    key={d.label}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                      d.active
                        ? 'bg-violet-100 text-violet-700'
                        : 'bg-stone-100 text-stone-400 line-through'
                    }`}
                  >
                    {d.active && (
                      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                    {d.label}
                  </span>
                ))}
              </div>
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700" role="alert">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={goBack}
                className="focus-ring tap-target inline-flex items-center gap-1 rounded-lg px-4 py-2.5 text-sm font-medium text-stone-600 transition hover:bg-stone-100"
                aria-label="이전 단계로"
              >
                <span aria-hidden="true">&larr;</span> 이전
              </button>
              <button
                type="button"
                onClick={generateReport}
                className="cta-button tap-target px-8 py-3 text-sm font-bold"
                style={{
                  backgroundImage: 'linear-gradient(90deg, #7c3aed, #8b5cf6, #d97706, #7c3aed)',
                }}
              >
                리포트 생성하기
              </button>
            </div>
          </>
        ) : (
          <LoadingTimeline steps={LOADING_STEPS} currentStepIndex={loadingStep} />
        )}
      </section>
    );
  };

  /* ═══════════════════════════════════════════════════════
     REPORT RENDERER
     ═══════════════════════════════════════════════════════ */

  const renderReport = () => {
    if (!result) return null;
    const { executiveSummary, deepDive, actionPlan, concernResponse, sajuSummary, dataSources, disclaimer } = result;

    return (
      <div className="fade-slide-up space-y-6">
        {/* ── Saju Summary ── */}
        {sajuSummary && (
          <div className="surface-card p-6">
            <h3 className="mb-3 text-lg font-bold text-violet-800">사주 요약</h3>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-700">{sajuSummary}</p>
          </div>
        )}

        {/* ── Executive Summary ── */}
        <div className="surface-card p-6">
          <h3 className="mb-4 text-lg font-bold text-violet-800">종합 진단</h3>
          <p className="mb-6 rounded-lg bg-violet-50 p-4 text-sm leading-relaxed text-stone-800">
            {executiveSummary.diagnosis}
          </p>

          {/* Score bars */}
          <div className="mb-6 space-y-3">
            {(Object.keys(executiveSummary.scores) as (keyof ScoreMap)[]).map((key) => {
              const value = executiveSummary.scores[key];
              const explanation = executiveSummary.scoreExplanations[key];
              return (
                <div key={key}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-stone-700">{SCORE_LABELS[key]}</span>
                    <span className="font-bold" style={{ color: scoreColor(value) }}>
                      {value}
                    </span>
                  </div>
                  <div
                    className="h-3 overflow-hidden rounded-full"
                    style={{ backgroundColor: scoreColorBg(value) }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${value}%`,
                        backgroundColor: scoreColor(value),
                      }}
                    />
                  </div>
                  {explanation && (
                    <p className="mt-0.5 text-[11px] text-stone-500">{explanation}</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Risks & Opportunities */}
          <div className="grid gap-4 sm:grid-cols-2">
            {executiveSummary.risks.length > 0 && (
              <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-4">
                <h4 className="mb-2 text-sm font-semibold text-rose-700">위험 요소</h4>
                <ul className="space-y-1 text-xs text-rose-800">
                  {executiveSummary.risks.map((r, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span aria-hidden="true" className="mt-0.5 shrink-0 text-rose-400">&#x25cf;</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {executiveSummary.opportunities.length > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
                <h4 className="mb-2 text-sm font-semibold text-emerald-700">기회 요소</h4>
                <ul className="space-y-1 text-xs text-emerald-800">
                  {executiveSummary.opportunities.map((o, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span aria-hidden="true" className="mt-0.5 shrink-0 text-emerald-400">&#x25cf;</span>
                      {o}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* 48h actions */}
          {executiveSummary.actions48h.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
              <h4 className="mb-2 text-sm font-semibold text-amber-700">48시간 내 실행 사항</h4>
              <ul className="space-y-1 text-xs text-amber-900">
                {executiveSummary.actions48h.map((a, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="mt-0.5 shrink-0 font-bold text-amber-500">{i + 1}.</span>
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ── Deep Dive ── */}
        {deepDive.length > 0 && (
          <div className="surface-card p-6">
            <h3 className="mb-4 text-lg font-bold text-violet-800">심층 분석</h3>
            <div className="space-y-5">
              {deepDive.map((item, i) => (
                <div key={i} className="rounded-xl border border-stone-200 bg-stone-50/50 p-4">
                  <p className="mb-2 text-sm font-bold text-stone-900">{item.claim}</p>
                  <blockquote className="mb-2 border-l-2 border-violet-300 pl-3 text-xs italic text-stone-600">
                    {item.evidence}
                  </blockquote>
                  <p className="mb-2 text-xs leading-relaxed text-stone-700">
                    <span className="font-semibold">해석: </span>{item.interpretation}
                  </p>
                  <p className="text-xs text-violet-700">
                    <span className="font-semibold">실행: </span>{item.action}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Action Plan ── */}
        <div className="surface-card p-6">
          <h3 className="mb-4 text-lg font-bold text-violet-800">실행 계획</h3>

          <div className="space-y-4">
            {[
              { label: '48시간 내', items: actionPlan.hours48, color: 'text-rose-700' },
              { label: '1주 내', items: actionPlan.week1, color: 'text-amber-700' },
              { label: '4주 내', items: actionPlan.week4, color: 'text-emerald-700' },
            ].map((period) => (
              period.items.length > 0 && (
                <div key={period.label}>
                  <h4 className={`mb-2 text-sm font-semibold ${period.color}`}>{period.label}</h4>
                  <ul className="space-y-1 pl-4 text-xs text-stone-700">
                    {period.items.map((item, i) => (
                      <li key={i} className="list-disc">{item}</li>
                    ))}
                  </ul>
                </div>
              )
            ))}
          </div>

          {/* Scripts (collapsible) */}
          <div className="mt-5 border-t border-stone-200 pt-4">
            <button
              type="button"
              onClick={() => setScriptsOpen(!scriptsOpen)}
              className="focus-ring flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-50"
              aria-expanded={scriptsOpen}
            >
              대화 스크립트
              <svg
                className={`h-4 w-4 transition-transform ${scriptsOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {scriptsOpen && (
              <div className="mt-3 space-y-3">
                {(Object.keys(actionPlan.scripts) as (keyof ActionPlan['scripts'])[]).map((key) => (
                  <div key={key} className="rounded-lg border border-violet-100 bg-violet-50/40 p-3">
                    <h5 className="mb-1 text-xs font-bold text-violet-700">{SCRIPT_LABELS[key]}</h5>
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-stone-700">
                      {actionPlan.scripts[key]}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Concern Response ── */}
        {concernResponse?.question && (
          <div className="surface-card p-6">
            <h3 className="mb-2 text-lg font-bold text-violet-800">고민 상담</h3>
            <p className="mb-4 text-sm italic text-stone-500">&ldquo;{concernResponse.question}&rdquo;</p>

            <div className="grid gap-4 sm:grid-cols-3">
              {([
                { key: 'optimistic' as const, label: '낙관적', borderColor: 'border-emerald-300', bgColor: 'bg-emerald-50/60', headColor: 'text-emerald-700' },
                { key: 'neutral' as const, label: '중립적', borderColor: 'border-amber-300', bgColor: 'bg-amber-50/60', headColor: 'text-amber-700' },
                { key: 'pessimistic' as const, label: '비관적', borderColor: 'border-rose-300', bgColor: 'bg-rose-50/60', headColor: 'text-rose-700' },
              ]).map(({ key, label, borderColor, bgColor, headColor }) => {
                const scenario = concernResponse.scenarios[key];
                return (
                  <div key={key} className={`rounded-xl border ${borderColor} ${bgColor} p-4`}>
                    <h4 className={`mb-2 text-sm font-bold ${headColor}`}>{label} 시나리오</h4>
                    <div className="space-y-2 text-xs text-stone-700">
                      <div>
                        <span className="font-semibold">조건: </span>
                        {scenario.conditions}
                      </div>
                      <div>
                        <span className="font-semibold">근거: </span>
                        {scenario.evidence}
                      </div>
                      <div>
                        <span className="font-semibold">행동: </span>
                        {scenario.actions}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Data Sources ── */}
        {dataSources.length > 0 && (
          <div className="surface-card p-6">
            <h3 className="mb-3 text-lg font-bold text-violet-800">분석 데이터 소스</h3>
            <div className="flex flex-wrap gap-2">
              {dataSources.map((src, i) => (
                <span
                  key={i}
                  className="inline-flex rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-700"
                >
                  {src}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Disclaimer ── */}
        {disclaimer && (
          <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-4">
            <p className="text-[11px] leading-relaxed text-stone-500">{disclaimer}</p>
          </div>
        )}

        {/* ── Actions ── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={clearAll}
            className="focus-ring tap-target rounded-lg border border-rose-200 bg-white px-6 py-2.5 text-sm font-medium text-rose-600 shadow-sm transition hover:bg-rose-50"
          >
            모든 데이터 삭제
          </button>
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setError('');
              setCurrentStep(0);
            }}
            className="focus-ring tap-target rounded-lg border border-stone-200 bg-white px-6 py-2.5 text-sm font-medium text-stone-600 shadow-sm transition hover:bg-stone-100"
          >
            처음으로 돌아가기
          </button>
        </div>
      </div>
    );
  };

  /* ═══════════════════════════════════════════════════════
     MAIN RENDER
     ═══════════════════════════════════════════════════════ */

  const stepRenderers = [renderStep1, renderStep2, renderStep3, renderStep4, renderStep5];

  return (
    <div className="app-bg relative min-h-screen overflow-hidden">
      {/* Decorative orbs */}
      <div className="hero-orb -left-20 -top-20 h-64 w-64 bg-violet-400" />
      <div className="hero-orb -right-16 top-40 h-48 w-48 bg-amber-400" />

      <main className="relative mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        {/* Step indicator (hide on results view) */}
        {!(currentStep === 4 && result) && <StepIndicator />}

        {/* Card */}
        <div className="surface-card p-6 sm:p-8">
          {stepRenderers[currentStep]()}
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-stone-400">
          AI 사주 &middot; 관계 &middot; 관상 종합 분석
        </p>
      </main>
    </div>
  );
}
