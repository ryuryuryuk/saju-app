'use client';

import { useState } from 'react';
import SajuForm from '@/app/components/SajuForm';
import SajuResult from '@/app/components/SajuResult';
import { useSajuAnalysis } from '@/app/hooks/useSajuAnalysis';
import BackLink from '@/app/components/BackLink';
import type { SajuFormData } from '@/app/types/saju';

const INITIAL_FORM: SajuFormData = {
  birthYear: '',
  birthMonth: '',
  birthDay: '',
  birthTime: '',
  meridiem: '오전',
  gender: '여성',
  question: '',
};

export default function SajuPage() {
  const [formData, setFormData] = useState<SajuFormData>(INITIAL_FORM);
  const { error, loading, loadingStepIndex, loadingSteps, result, timedOut, resetResult, submitSaju } =
    useSajuAnalysis();

  return (
    <div className="app-bg min-h-screen px-4 py-8 md:px-8 md:py-12">
      <main className="mx-auto max-w-3xl">
        <BackLink />

        <header className="relative mb-8 overflow-hidden rounded-3xl border border-orange-200/70 bg-white/80 p-6 text-center shadow-[0_16px_40px_rgba(41,37,36,0.12)] md:mb-10 md:p-8">
          <span className="hero-orb -right-8 -top-7 h-32 w-32 bg-orange-300" aria-hidden="true" />
          <span className="hero-orb -left-8 bottom-1 h-24 w-24 bg-amber-300" aria-hidden="true" />
          <p className="text-sm font-semibold tracking-[0.2em] text-orange-700">AI SAJU STUDIO</p>
          <h1 className="mt-3 text-4xl font-bold text-stone-900 md:text-5xl">AI 사주 분석</h1>
          <p className="mt-3 text-stone-700">내 성향과 흐름을 읽어보는 사주 리포트</p>
        </header>

        {!result ? (
          <SajuForm
            formData={formData}
            loading={loading}
            loadingStepIndex={loadingStepIndex}
            loadingSteps={loadingSteps}
            error={error}
            timedOut={timedOut}
            onChange={setFormData}
            onSubmit={async () => submitSaju(formData)}
            onRetry={async () => submitSaju(formData)}
          />
        ) : (
          <SajuResult
            result={result}
            onReset={() => {
              resetResult();
              setFormData(INITIAL_FORM);
            }}
          />
        )}

        <footer className="mt-8 text-center text-xs text-stone-600 md:mt-10">
          엔터테인먼트 목적의 서비스입니다.
        </footer>
      </main>
    </div>
  );
}
