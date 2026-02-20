import { supabase } from './supabase';

export type ABVariant = 'A' | 'B';

export interface ABTestEntry {
  test_name: string;
  variant: ABVariant;
  user_id: string;
  category: string;
  tone_description: string;
  message_text: string;
}

export interface ABTestResult {
  variant: ABVariant;
  totalSent: number;
  totalOpened: number;
  totalConverted: number;
  openRate: number;
  conversionRate: number;
}

interface VariantToneConfig {
  A: string;
  B: string;
}

const VARIANT_TONES: Record<string, VariantToneConfig> = {
  warning: {
    A: '부드럽고 걱정하는 톤으로, 조심스럽게 경고해줘',
    B: '강하고 긴급한 톤으로, 단호하게 경고해줘',
  },
  career: {
    A: '따뜻한 격려와 응원 톤으로 작성해줘',
    B: '냉정한 현실 직시 톤으로 작성해줘',
  },
  money: {
    A: '희망적이고 긍정적인 톤으로 작성해줘',
    B: '긴장감 있고 위기감 주는 톤으로 작성해줘',
  },
  love: {
    A: '설레는 로맨틱 톤으로 작성해줘',
    B: '현실적이고 직설적인 톤으로 작성해줘',
  },
};

const DEFAULT_TONES: VariantToneConfig = {
  A: '따뜻하고 공감적인 톤으로 작성해줘',
  B: '직설적이고 날카로운 톤으로 작성해줘',
};

// djb2 hash — deterministic, good distribution for short strings
function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0x7fffffff;
  }
  return hash;
}

export function getVariantForUser(userId: string, testName: string): ABVariant {
  return djb2(`${userId}:${testName}`) % 2 === 0 ? 'A' : 'B';
}

export function getActiveTestName(): string {
  const now = new Date();
  const year = now.getFullYear();
  // ISO week number
  const jan4 = new Date(year, 0, 4);
  const daysSinceJan4 = Math.floor(
    (now.getTime() - jan4.getTime()) / 86400000,
  );
  const week = Math.ceil((daysSinceJan4 + jan4.getDay() + 1) / 7);
  return `tone_test_${year}_${String(week).padStart(2, '0')}`;
}

export function getVariantTone(category: string, variant: ABVariant): string {
  const primary = category.split(' + ')[0] || 'general';
  const config = VARIANT_TONES[primary] ?? DEFAULT_TONES;
  return config[variant];
}

export async function logABTest(entry: ABTestEntry): Promise<number | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('ab_tests')
    .insert({
      test_name: entry.test_name,
      variant: entry.variant,
      user_id: entry.user_id,
      category: entry.category,
      tone_description: entry.tone_description,
      message_text: entry.message_text,
      opened: false,
      converted: false,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[ab-test] logABTest error:', error.message);
    return null;
  }
  return data?.id ?? null;
}

export async function markABTestOpened(logId: number): Promise<void> {
  if (!supabase) return;

  const { error } = await supabase
    .from('ab_tests')
    .update({ opened: true })
    .eq('id', logId);

  if (error) {
    console.error('[ab-test] markABTestOpened error:', error.message);
  }
}

export async function markABTestConverted(logId: number): Promise<void> {
  if (!supabase) return;

  const { error } = await supabase
    .from('ab_tests')
    .update({ converted: true })
    .eq('id', logId);

  if (error) {
    console.error('[ab-test] markABTestConverted error:', error.message);
  }
}

export async function getLatestABTestId(
  userId: string,
): Promise<number | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('ab_tests')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data.id;
}

function ratePercent(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export async function getABTestResults(
  testName: string,
): Promise<ABTestResult[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('ab_tests')
    .select('variant, opened, converted')
    .eq('test_name', testName);

  if (error) {
    console.error('[ab-test] getABTestResults error:', error.message);
    return [];
  }

  const rows = data ?? [];
  const groups = new Map<
    ABVariant,
    { sent: number; opened: number; converted: number }
  >();

  for (const row of rows) {
    const v = row.variant as ABVariant;
    const g = groups.get(v) ?? { sent: 0, opened: 0, converted: 0 };
    g.sent++;
    if (row.opened) g.opened++;
    if (row.converted) g.converted++;
    groups.set(v, g);
  }

  return (['A', 'B'] as ABVariant[]).map((variant) => {
    const g = groups.get(variant) ?? { sent: 0, opened: 0, converted: 0 };
    return {
      variant,
      totalSent: g.sent,
      totalOpened: g.opened,
      totalConverted: g.converted,
      openRate: ratePercent(g.opened, g.sent),
      conversionRate: ratePercent(g.converted, g.sent),
    };
  });
}

function getPreviousWeekTestName(): string {
  const now = new Date();
  const lastWeek = new Date(now.getTime() - 7 * 86400000);
  const year = lastWeek.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const daysSinceJan4 = Math.floor(
    (lastWeek.getTime() - jan4.getTime()) / 86400000,
  );
  const week = Math.ceil((daysSinceJan4 + jan4.getDay() + 1) / 7);
  return `tone_test_${year}_${String(week).padStart(2, '0')}`;
}

export async function getWeeklyABSummary(): Promise<string> {
  const testName = getPreviousWeekTestName();
  const results = await getABTestResults(testName);

  if (results.every((r) => r.totalSent === 0)) {
    const currentName = getActiveTestName();
    const currentResults = await getABTestResults(currentName);

    if (currentResults.every((r) => r.totalSent === 0)) {
      return '🧪 *A/B 테스트 결과*\n\n아직 테스트 데이터가 없습니다.';
    }

    return formatABReport(currentName, currentResults, '진행 중');
  }

  return formatABReport(testName, results, '완료');
}

function formatABReport(
  testName: string,
  results: ABTestResult[],
  status: string,
): string {
  const lines: string[] = [`🧪 *A/B 테스트 결과* (${status})`, `테스트: ${testName}`, ''];

  for (const r of results) {
    lines.push(
      `*Variant ${r.variant}*`,
      `발송: ${r.totalSent}건 | 열람: ${r.totalOpened}건 (${r.openRate}%)`,
      `전환: ${r.totalConverted}건 (${r.conversionRate}%)`,
      '',
    );
  }

  const [a, b] = results;
  if (a && b && a.totalSent > 0 && b.totalSent > 0 && status === '완료') {
    if (a.conversionRate !== b.conversionRate) {
      const winner = a.conversionRate > b.conversionRate ? 'A' : 'B';
      lines.push(`🏆 *승자: Variant ${winner}* (전환율 기준)`);
    } else if (a.openRate !== b.openRate) {
      const winner = a.openRate > b.openRate ? 'A' : 'B';
      lines.push(`🏆 *승자: Variant ${winner}* (열람율 기준)`);
    } else {
      lines.push('🤝 무승부 — 차이 없음');
    }
  }

  return lines.join('\n');
}
