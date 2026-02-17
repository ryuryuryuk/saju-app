import type { StemElements, BranchElements } from '@/app/types/saju';

interface OhaengChartProps {
  stemElements: StemElements;
  branchElements: BranchElements;
  dayMasterElement: string;
}

const OHAENG_CONFIG: Record<string, { label: string; hanja: string; color: string; bg: string; border: string; emoji: string }> = {
  목: { label: '목', hanja: '木', color: 'text-green-700', bg: 'bg-green-500', border: 'border-green-300', emoji: '🌳' },
  화: { label: '화', hanja: '火', color: 'text-red-700', bg: 'bg-red-500', border: 'border-red-300', emoji: '🔥' },
  토: { label: '토', hanja: '土', color: 'text-yellow-700', bg: 'bg-yellow-500', border: 'border-yellow-300', emoji: '🪨' },
  금: { label: '금', hanja: '金', color: 'text-stone-600', bg: 'bg-stone-400', border: 'border-stone-300', emoji: '🪙' },
  수: { label: '수', hanja: '水', color: 'text-blue-700', bg: 'bg-blue-500', border: 'border-blue-300', emoji: '💧' },
};

const OHAENG_ORDER = ['목', '화', '토', '금', '수'];

function countOhaeng(stemElements: StemElements, branchElements: BranchElements) {
  const counts: Record<string, number> = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  const pillars = ['year', 'month', 'day', 'hour'] as const;

  for (const p of pillars) {
    const stemEl = stemElements[p].element;
    if (stemEl in counts) counts[stemEl]++;

    const branchEl = branchElements[p].element;
    if (branchEl in counts) counts[branchEl]++;
  }

  return counts;
}

export default function OhaengChart({ stemElements, branchElements, dayMasterElement }: OhaengChartProps) {
  const counts = countOhaeng(stemElements, branchElements);
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const maxCount = Math.max(...Object.values(counts), 1);

  return (
    <article className="fade-slide-up stagger-2 rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-wide text-stone-700">오행 분포도</h3>
        <span className="text-xs text-stone-500">총 {total}자</span>
      </div>

      <div className="mt-4 space-y-3">
        {OHAENG_ORDER.map((key) => {
          const config = OHAENG_CONFIG[key];
          const count = counts[key];
          const pct = Math.round((count / total) * 100);
          const barWidth = Math.round((count / maxCount) * 100);
          const isDayMaster = key === dayMasterElement;

          return (
            <div key={key} className="flex items-center gap-3">
              <div className="flex w-16 items-center gap-1.5 shrink-0">
                <span className="text-lg">{config.emoji}</span>
                <span className={`text-sm font-bold ${config.color}`}>
                  {config.label}
                  <span className="ml-0.5 text-xs font-normal opacity-70">{config.hanja}</span>
                </span>
              </div>
              <div className="flex-1">
                <div className="h-6 w-full overflow-hidden rounded-full bg-stone-100">
                  <div
                    className={`h-full rounded-full ${config.bg} transition-all duration-700 ease-out flex items-center justify-end pr-2`}
                    style={{ width: `${Math.max(barWidth, 8)}%` }}
                  >
                    {count > 0 && (
                      <span className="text-xs font-bold text-white drop-shadow-sm">{count}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="w-12 text-right shrink-0">
                <span className="text-sm font-medium text-stone-600">{pct}%</span>
              </div>
              {isDayMaster && (
                <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
                  일간
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl bg-stone-50 p-3">
        <p className="text-xs text-stone-500 leading-relaxed">
          {getBalanceComment(counts, dayMasterElement)}
        </p>
      </div>
    </article>
  );
}

function getBalanceComment(counts: Record<string, number>, dayMasterElement: string): string {
  const sorted = OHAENG_ORDER.map((k) => ({ key: k, count: counts[k] })).sort((a, b) => b.count - a.count);
  const strongest = sorted[0];
  const weakest = sorted[sorted.length - 1];
  const dayMasterCount = counts[dayMasterElement] ?? 0;

  const parts: string[] = [];

  if (strongest.count >= 4) {
    parts.push(`${OHAENG_CONFIG[strongest.key].label}(${OHAENG_CONFIG[strongest.key].hanja})의 기운이 강하게 나타납니다.`);
  } else if (strongest.count >= 3) {
    parts.push(`${OHAENG_CONFIG[strongest.key].label}(${OHAENG_CONFIG[strongest.key].hanja}) 기운이 두드러집니다.`);
  }

  if (weakest.count === 0) {
    parts.push(`${OHAENG_CONFIG[weakest.key].label}(${OHAENG_CONFIG[weakest.key].hanja}) 기운이 없어 보완이 필요합니다.`);
  }

  if (dayMasterCount <= 1) {
    parts.push(`일간 ${OHAENG_CONFIG[dayMasterElement]?.label ?? dayMasterElement} 기운이 약한 편으로, 생(生)해주는 오행의 도움이 중요합니다.`);
  } else if (dayMasterCount >= 4) {
    parts.push(`일간 ${OHAENG_CONFIG[dayMasterElement]?.label ?? dayMasterElement} 기운이 매우 강해 자기 주장이 뚜렷한 편입니다.`);
  }

  const allSame = Object.values(counts).every((c) => c >= 1 && c <= 2);
  if (allSame) {
    parts.push('오행이 고르게 분포하여 균형 잡힌 사주입니다.');
  }

  return parts.length > 0 ? parts.join(' ') : '오행 분포를 통해 기운의 흐름을 확인하세요.';
}
