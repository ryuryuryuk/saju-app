import type { LoadingStep } from '@/app/types/saju';

interface LoadingTimelineProps {
  steps: LoadingStep[];
  currentStepIndex: number;
}

export default function LoadingTimeline({ steps, currentStepIndex }: LoadingTimelineProps) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5" role="status" aria-live="polite">
      <p className="text-sm font-semibold tracking-wide text-amber-700">진행 상황</p>
      <div className="mt-4 space-y-3">
        {steps.map((step, index) => {
          const isActive = index === currentStepIndex;
          const isDone = index < currentStepIndex;

          return (
            <div key={step.title} className="flex items-start gap-3">
              <span
                className={[
                  'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold transition',
                  isDone
                    ? 'bg-emerald-600 text-white'
                    : isActive
                    ? 'bg-orange-500 text-white animate-pulse'
                    : 'bg-stone-300 text-stone-700',
                ].join(' ')}
              >
                {isDone ? '✓' : index + 1}
              </span>
              <div>
                <p className={isActive ? 'font-semibold text-stone-900' : 'font-medium text-stone-700'}>{step.title}</p>
                <p className="text-sm text-stone-600">{step.description}</p>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-stone-500">평균 10~15초 정도 소요됩니다.</p>
    </div>
  );
}
