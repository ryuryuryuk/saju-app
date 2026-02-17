import type { SajuApiSuccess } from '@/app/types/saju';
import OhaengChart from '@/app/components/OhaengChart';

interface SajuResultProps {
  result: SajuApiSuccess;
  onReset: () => void;
}

const strengthLabelMap: Record<string, string> = {
  강함: '강한 편 (추진력이 좋아요)',
  약함: '섬세한 편 (회복 루틴이 중요해요)',
};

function formatStrength(label: string) {
  return strengthLabelMap[label] ?? '균형형 (상황 적응력이 좋아요)';
}

function formatSeason(season: string) {
  return `${season} 기운`;
}

export default function SajuResult({ result, onReset }: SajuResultProps) {
  const { sajuInfo } = result;

  return (
    <section className="surface-card fade-slide-up p-6 md:p-8">
      <header className="border-b border-stone-200 pb-5">
        <p className="text-sm font-semibold tracking-wide text-orange-700">사주 리포트</p>
        <h2 className="mt-2 text-3xl font-bold text-stone-900">{sajuInfo.fullString}</h2>
        <p className="mt-2 text-stone-600">질문에 맞춘 해석과 핵심 기운을 정리했어요.</p>
      </header>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <article className="fade-slide-up rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold tracking-wide text-amber-700">일간</p>
          <p className="mt-1 text-xl font-bold text-stone-900">{sajuInfo.dayMaster.stem}</p>
          <p className="text-sm text-stone-600">{sajuInfo.dayMaster.element}</p>
        </article>
        <article className="fade-slide-up stagger-1 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-semibold tracking-wide text-emerald-700">강약</p>
          <p className="mt-1 text-xl font-bold text-stone-900">{formatStrength(sajuInfo.dayMaster.strength.label)}</p>
          <p className="text-sm text-stone-600">점수 {sajuInfo.dayMaster.strength.score}</p>
        </article>
        <article className="fade-slide-up stagger-2 rounded-2xl border border-sky-200 bg-sky-50 p-4">
          <p className="text-xs font-semibold tracking-wide text-sky-700">계절</p>
          <p className="mt-1 text-xl font-bold text-stone-900">{formatSeason(sajuInfo.monthSupport.season)}</p>
          <p className="text-sm text-stone-600">{sajuInfo.monthSupport.branch} / {sajuInfo.monthSupport.element}</p>
        </article>
      </div>

      <div className="mt-6">
        <OhaengChart
          stemElements={sajuInfo.stemElements}
          branchElements={sajuInfo.branchElements}
          dayMasterElement={sajuInfo.dayMaster.element}
        />
      </div>

      <article className="fade-slide-up stagger-1 mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-5">
        <h3 className="text-sm font-semibold tracking-wide text-stone-700">AI 해석</h3>
        <p className="mt-3 whitespace-pre-wrap leading-relaxed text-stone-800">{result.result}</p>
      </article>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <article className="fade-slide-up stagger-2 rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-sm font-semibold text-stone-700">천간 구성</p>
          <p className="mt-2 text-sm text-stone-600">
            년 {sajuInfo.stemElements.year.stem}/{sajuInfo.stemElements.year.element} · 월 {sajuInfo.stemElements.month.stem}/{sajuInfo.stemElements.month.element} · 일 {sajuInfo.stemElements.day.stem}/{sajuInfo.stemElements.day.element} · 시 {sajuInfo.stemElements.hour.stem}/{sajuInfo.stemElements.hour.element}
          </p>
        </article>
        <article className="fade-slide-up stagger-3 rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-sm font-semibold text-stone-700">지지 구성</p>
          <p className="mt-2 text-sm text-stone-600">
            년 {sajuInfo.branchElements.year.branch}/{sajuInfo.branchElements.year.element} · 월 {sajuInfo.branchElements.month.branch}/{sajuInfo.branchElements.month.element} · 일 {sajuInfo.branchElements.day.branch}/{sajuInfo.branchElements.day.element} · 시 {sajuInfo.branchElements.hour.branch}/{sajuInfo.branchElements.hour.element}
          </p>
        </article>
      </div>

      <button
        onClick={onReset}
        aria-label="사주 분석 다시 입력하기"
        className="focus-ring tap-target mt-7 w-full rounded-xl border border-stone-400 px-4 py-3 font-semibold text-stone-700 transition hover:bg-stone-100"
      >
        다시 입력하기
      </button>
    </section>
  );
}
