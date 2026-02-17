import LoadingTimeline from '@/app/components/LoadingTimeline';
import { normalizeTimeOnBlur, normalizeTimeTyping } from '@/app/hooks/useSajuAnalysis';
import type { LoadingStep, SajuFormData } from '@/app/types/saju';

interface SajuFormProps {
  formData: SajuFormData;
  loading: boolean;
  loadingStepIndex: number;
  loadingSteps: LoadingStep[];
  error: string;
  timedOut: boolean;
  onChange: (next: SajuFormData) => void;
  onSubmit: () => Promise<void>;
  onRetry: () => Promise<void>;
}

export default function SajuForm({
  formData,
  loading,
  loadingStepIndex,
  loadingSteps,
  error,
  timedOut,
  onChange,
  onSubmit,
  onRetry,
}: SajuFormProps) {
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        await onSubmit();
      }}
      className="surface-card fade-slide-up p-6 md:p-8"
    >
      <div className="mb-7">
        <label className="mb-3 block text-base font-semibold text-stone-800">생년월일시</label>
        <div className="grid grid-cols-3 gap-3">
          <input
            type="number"
            placeholder="년"
            aria-label="출생 연도"
            value={formData.birthYear}
            onChange={(event) => onChange({ ...formData, birthYear: event.target.value })}
            className="focus-ring tap-target rounded-xl border border-stone-300 px-3 py-3 text-center text-stone-900 outline-none transition focus:border-orange-500"
            min="1900"
            max="2026"
            required
          />
          <input
            type="number"
            placeholder="월"
            aria-label="출생 월"
            value={formData.birthMonth}
            onChange={(event) => onChange({ ...formData, birthMonth: event.target.value })}
            className="focus-ring tap-target rounded-xl border border-stone-300 px-3 py-3 text-center text-stone-900 outline-none transition focus:border-orange-500"
            min="1"
            max="12"
            required
          />
          <input
            type="number"
            placeholder="일"
            aria-label="출생 일"
            value={formData.birthDay}
            onChange={(event) => onChange({ ...formData, birthDay: event.target.value })}
            className="focus-ring tap-target rounded-xl border border-stone-300 px-3 py-3 text-center text-stone-900 outline-none transition focus:border-orange-500"
            min="1"
            max="31"
            required
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <select
            aria-label="오전 또는 오후 선택"
            value={formData.meridiem}
            onChange={(event) =>
              onChange({ ...formData, meridiem: event.target.value as '오전' | '오후' })
            }
            className="focus-ring tap-target rounded-xl border border-stone-300 px-3 py-3 text-center text-stone-900 outline-none transition focus:border-orange-500"
            required
          >
            <option value="오전">오전</option>
            <option value="오후">오후</option>
          </select>
          <input
            type="text"
            placeholder="00:00"
            aria-label="출생 시간"
            value={formData.birthTime}
            onChange={(event) =>
              onChange({ ...formData, birthTime: normalizeTimeTyping(event.target.value) })
            }
            onBlur={(event) =>
              onChange({ ...formData, birthTime: normalizeTimeOnBlur(event.target.value) })
            }
            className="focus-ring tap-target rounded-xl border border-stone-300 px-3 py-3 text-center text-stone-900 outline-none transition focus:border-orange-500"
            inputMode="numeric"
            maxLength={5}
            required
          />
        </div>
        <p className="mt-2 text-xs text-stone-500">예: 오전 08:30, 오후 11:45 (00:00~12:59 입력)</p>
      </div>

      <div className="mb-7">
        <label className="mb-3 block text-base font-semibold text-stone-800">성별</label>
        <div className="flex gap-4">
          <label className="inline-flex cursor-pointer items-center gap-2 text-stone-700">
            <input
              type="radio"
              aria-label="여성 선택"
              value="여성"
              checked={formData.gender === '여성'}
              onChange={(event) =>
                onChange({ ...formData, gender: event.target.value as '여성' | '남성' })
              }
              className="h-4 w-4"
            />
            여성
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 text-stone-700">
            <input
              type="radio"
              aria-label="남성 선택"
              value="남성"
              checked={formData.gender === '남성'}
              onChange={(event) =>
                onChange({ ...formData, gender: event.target.value as '여성' | '남성' })
              }
              className="h-4 w-4"
            />
            남성
          </label>
        </div>
      </div>

      <div className="mb-6">
        <label className="mb-3 block text-base font-semibold text-stone-800">궁금한 점</label>
        <textarea
          aria-label="사주 관련 질문 입력"
          value={formData.question}
          onChange={(event) => onChange({ ...formData, question: event.target.value })}
          onInput={(event) => {
            const target = event.currentTarget;
            target.style.height = 'auto';
            target.style.height = `${target.scrollHeight}px`;
          }}
          placeholder="예: 올해 연애운이 어떤가요?"
          className="focus-ring min-h-[128px] w-full resize-none rounded-xl border border-stone-300 p-4 text-stone-900 outline-none transition focus:border-orange-500 md:min-h-[132px]"
          rows={4}
          required
        />
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          <p>{error}</p>
          {timedOut && (
            <button
              type="button"
              onClick={onRetry}
              aria-label="사주 분석 다시 시도"
              className="focus-ring tap-target mt-2 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50"
            >
              재시도
            </button>
          )}
        </div>
      )}

      <button
        type="submit"
        aria-label="사주 리포트 확인하기"
        disabled={loading}
        className="cta-button focus-ring tap-target w-full px-4 py-3 text-base disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? '사주를 분석하고 있어요...' : '사주 리포트 확인하기'}
      </button>

      {loading && (
        <div className="mt-5">
          <LoadingTimeline steps={loadingSteps} currentStepIndex={loadingStepIndex} />
        </div>
      )}
    </form>
  );
}
