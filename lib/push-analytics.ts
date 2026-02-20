import { supabase } from './supabase';

export interface DailyPushStats {
  totalSent: number;
  totalOpened: number;
  totalConverted: number;
  openRate: number;
  conversionRate: number;
}

export interface CategoryPerformance {
  category: string;
  totalSent: number;
  totalOpened: number;
  totalConverted: number;
  openRate: number;
  conversionRate: number;
}

export interface WeekdayPerformance {
  weekday: number;
  weekdayName: string;
  totalSent: number;
  totalOpened: number;
  totalConverted: number;
  openRate: number;
  conversionRate: number;
}

export interface TopMessage {
  id: number;
  category: string;
  message_text: string;
  sent_at: string;
}

const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

function rate(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export async function getDailyPushStats(dateRange: {
  from: Date;
  to: Date;
}): Promise<DailyPushStats | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('daily_push_log')
    .select('is_opened, converted_to_premium')
    .eq('status', 'success')
    .gte('sent_at', dateRange.from.toISOString())
    .lte('sent_at', dateRange.to.toISOString());

  if (error) {
    console.error('[push-analytics] getDailyPushStats error:', error.message);
    return null;
  }

  const rows = data ?? [];
  const totalSent = rows.length;
  const totalOpened = rows.filter((r) => r.is_opened).length;
  const totalConverted = rows.filter((r) => r.converted_to_premium).length;

  return {
    totalSent,
    totalOpened,
    totalConverted,
    openRate: rate(totalOpened, totalSent),
    conversionRate: rate(totalConverted, totalSent),
  };
}

export async function getCategoryPerformance(): Promise<CategoryPerformance[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('daily_push_log')
    .select('category, is_opened, converted_to_premium')
    .eq('status', 'success');

  if (error) {
    console.error('[push-analytics] getCategoryPerformance error:', error.message);
    return [];
  }

  const rows = data ?? [];
  const groups = new Map<
    string,
    { sent: number; opened: number; converted: number }
  >();

  for (const row of rows) {
    const cat = row.category || 'general';
    const g = groups.get(cat) ?? { sent: 0, opened: 0, converted: 0 };
    g.sent++;
    if (row.is_opened) g.opened++;
    if (row.converted_to_premium) g.converted++;
    groups.set(cat, g);
  }

  return Array.from(groups.entries())
    .map(([category, g]) => ({
      category,
      totalSent: g.sent,
      totalOpened: g.opened,
      totalConverted: g.converted,
      openRate: rate(g.opened, g.sent),
      conversionRate: rate(g.converted, g.sent),
    }))
    .sort((a, b) => b.totalSent - a.totalSent);
}

function getSeoulWeekday(isoString: string): number {
  const date = new Date(isoString);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    weekday: 'short',
  }).formatToParts(date);
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return map[wd] ?? 0;
}

export async function getWeekdayPerformance(): Promise<WeekdayPerformance[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('daily_push_log')
    .select('sent_at, is_opened, converted_to_premium')
    .eq('status', 'success');

  if (error) {
    console.error('[push-analytics] getWeekdayPerformance error:', error.message);
    return [];
  }

  const rows = data ?? [];
  const groups = new Map<
    number,
    { sent: number; opened: number; converted: number }
  >();

  for (const row of rows) {
    const wd = getSeoulWeekday(row.sent_at);
    const g = groups.get(wd) ?? { sent: 0, opened: 0, converted: 0 };
    g.sent++;
    if (row.is_opened) g.opened++;
    if (row.converted_to_premium) g.converted++;
    groups.set(wd, g);
  }

  return Array.from(groups.entries())
    .map(([weekday, g]) => ({
      weekday,
      weekdayName: WEEKDAY_NAMES[weekday] ?? '?',
      totalSent: g.sent,
      totalOpened: g.opened,
      totalConverted: g.converted,
      openRate: rate(g.opened, g.sent),
      conversionRate: rate(g.converted, g.sent),
    }))
    .sort((a, b) => a.weekday - b.weekday);
}

export async function getBestPerformingMessages(
  topN: number = 10,
): Promise<TopMessage[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('daily_push_log')
    .select('id, category, message_text, sent_at')
    .eq('status', 'success')
    .eq('converted_to_premium', true)
    .order('sent_at', { ascending: false })
    .limit(topN);

  if (error) {
    console.error('[push-analytics] getBestPerformingMessages error:', error.message);
    return [];
  }

  return (data ?? []) as TopMessage[];
}

function formatStats(stats: DailyPushStats, label: string): string {
  return [
    `*${label}*`,
    `발송: ${stats.totalSent}건 | 열람: ${stats.totalOpened}건 (${stats.openRate}%)`,
    `프리미엄 전환: ${stats.totalConverted}건 (${stats.conversionRate}%)`,
  ].join('\n');
}

function getSeoulToday(): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const pick = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return new Date(`${pick('year')}-${pick('month')}-${pick('day')}T00:00:00+09:00`);
}

function getSeoulWeekStart(): Date {
  const today = getSeoulToday();
  const day = today.getDay();
  const diff = day === 0 ? 6 : day - 1; // Monday = start
  return new Date(today.getTime() - diff * 86400000);
}

export async function formatAdminStatsReport(): Promise<string> {
  const todayStart = getSeoulToday();
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  const weekStart = getSeoulWeekStart();

  const [todayStats, weekStats] = await Promise.all([
    getDailyPushStats({ from: todayStart, to: todayEnd }),
    getDailyPushStats({ from: weekStart, to: todayEnd }),
  ]);

  const lines: string[] = ['📊 *푸시 성과 리포트*', ''];

  if (todayStats) {
    lines.push(formatStats(todayStats, '오늘'));
  } else {
    lines.push('*오늘*\n데이터 조회 실패');
  }

  lines.push('');

  if (weekStats) {
    lines.push(formatStats(weekStats, '이번 주'));
  } else {
    lines.push('*이번 주*\n데이터 조회 실패');
  }

  return lines.join('\n');
}

export async function formatAdminBestReport(topN: number = 10): Promise<string> {
  const messages = await getBestPerformingMessages(topN);

  if (messages.length === 0) {
    return '🏆 *전환 메시지 TOP*\n\n아직 전환된 메시지가 없습니다.';
  }

  const lines: string[] = [`🏆 *전환 메시지 TOP ${topN}*`, ''];

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const preview = (m.message_text || '').slice(0, 50).replace(/\n/g, ' ');
    const date = new Date(m.sent_at).toLocaleDateString('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: 'short',
      day: 'numeric',
    });
    lines.push(`${i + 1}. [${m.category}] ${preview}… (${date})`);
  }

  return lines.join('\n');
}
