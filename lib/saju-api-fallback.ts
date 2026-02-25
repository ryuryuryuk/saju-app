/**
 * 사주 API 호출 래퍼 with fallback, retry, and caching.
 * 외부 API(beta-ybz6.onrender.com)가 다운되었을 때를 대비한 안전장치.
 */

import { supabase } from './supabase';

const STEMS = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'];
const BRANCHES = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'];

const STEM_ALIASES: Record<string, string> = {
  갑: '갑', 을: '을', 병: '병', 정: '정', 무: '무', 기: '기', 경: '경', 신: '신', 임: '임', 계: '계',
  甲: '갑', 乙: '을', 丙: '병', 丁: '정', 戊: '무', 己: '기', 庚: '경', 辛: '신', 壬: '임', 癸: '계',
};

const BRANCH_ALIASES: Record<string, string> = {
  자: '자', 축: '축', 인: '인', 묘: '묘', 진: '진', 사: '사', 오: '오', 미: '미', 신: '신', 유: '유', 술: '술', 해: '해',
  子: '자', 丑: '축', 寅: '인', 卯: '묘', 辰: '진', 巳: '사', 午: '오', 未: '미', 申: '신', 酉: '유', 戌: '술', 亥: '해',
};

interface BirthProfile {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  gender: '남성' | '여성';
}

interface SajuPillars {
  year: string;
  month: string;
  day: string;
  hour: string;
  fullString: string;
}

function normalizePillar(rawValue: string): string {
  const cleaned = (rawValue ?? '').trim().replace(/\s+/g, '');
  if (!cleaned) return '';
  const chars = [...cleaned];
  let stem: string | null = null;
  let branch: string | null = null;
  for (const ch of chars) {
    if (!stem && STEM_ALIASES[ch]) { stem = STEM_ALIASES[ch]; continue; }
    if (stem && !branch && BRANCH_ALIASES[ch]) { branch = BRANCH_ALIASES[ch]; break; }
  }
  if (!stem || !branch) throw new Error(`천간/지지 파싱 실패: "${rawValue}"`);
  return `${stem}${branch}`;
}

// === Cache ===

async function getCachedPillars(cacheKey: string): Promise<SajuPillars | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from('saju_pillar_cache')
    .select('pillars')
    .eq('cache_key', cacheKey)
    .single();
  return data?.pillars ?? null;
}

async function cachePillars(cacheKey: string, pillars: SajuPillars): Promise<void> {
  if (!supabase) return;
  await supabase.from('saju_pillar_cache').upsert({
    cache_key: cacheKey,
    pillars,
    created_at: new Date().toISOString(),
  }, { onConflict: 'cache_key' }).catch(() => {});
}

// === Simplified local calculation (fallback) ===

function getYearPillar(year: number): string {
  const stemIdx = ((year - 4) % 10 + 10) % 10;
  const branchIdx = ((year - 4) % 12 + 12) % 12;
  return `${STEMS[stemIdx]}${BRANCHES[branchIdx]}`;
}

function getMonthPillar(year: number, month: number): string {
  const MONTH_STEM_OFFSETS: Record<string, number> = {
    '갑': 2, '기': 2, '을': 4, '경': 4, '병': 6, '신': 6,
    '정': 8, '임': 8, '무': 0, '계': 0,
  };
  const yearStem = STEMS[((year - 4) % 10 + 10) % 10];
  const lunarMonthIdx = ((month - 2 + 12) % 12);
  const monthStemIdx = (MONTH_STEM_OFFSETS[yearStem] + lunarMonthIdx) % 10;
  const monthBranchIdx = (lunarMonthIdx + 2) % 12;
  return `${STEMS[monthStemIdx]}${BRANCHES[monthBranchIdx]}`;
}

function getDayPillar(year: number, month: number, day: number): string {
  const referenceDate = new Date(Date.UTC(2026, 1, 23));
  const targetDate = new Date(Date.UTC(year, month - 1, day));
  const diffDays = Math.round((targetDate.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24));
  let stemIdx = (4 + diffDays) % 10;
  let branchIdx = (4 + diffDays) % 12;
  if (stemIdx < 0) stemIdx += 10;
  if (branchIdx < 0) branchIdx += 12;
  return `${STEMS[stemIdx]}${BRANCHES[branchIdx]}`;
}

function getHourPillar(dayStem: string, hour: number): string {
  const DAY_STEM_OFFSETS: Record<string, number> = {
    '갑': 0, '기': 0, '을': 2, '경': 2, '병': 4, '신': 4,
    '정': 6, '임': 6, '무': 8, '계': 8,
  };
  // 시진(時辰) mapping: 23-1→자(0), 1-3→축(1), ... 21-23→해(11)
  const shiIdx = Math.floor(((hour + 1) % 24) / 2);
  const stemIdx = ((DAY_STEM_OFFSETS[dayStem] ?? 0) + shiIdx) % 10;
  return `${STEMS[stemIdx]}${BRANCHES[shiIdx]}`;
}

function calculateLocalPillars(profile: BirthProfile): SajuPillars {
  const year = Number(profile.year);
  const month = Number(profile.month);
  const day = Number(profile.day);
  const hour = Number(profile.hour);

  const yearPillar = getYearPillar(year);
  const monthPillar = getMonthPillar(year, month);
  const dayPillar = getDayPillar(year, month, day);
  const hourPillar = getHourPillar(dayPillar[0], hour);

  return {
    year: yearPillar,
    month: monthPillar,
    day: dayPillar,
    hour: hourPillar,
    fullString: `${yearPillar}년 ${monthPillar}월 ${dayPillar}일 ${hourPillar}시`,
  };
}

// === Main: API call with retry + fallback + cache ===

const API_URL = 'https://beta-ybz6.onrender.com/api/saju';
const MAX_RETRIES = 2;
const TIMEOUT_MS = 8000;

export async function calculateSajuWithFallback(profile: BirthProfile): Promise<SajuPillars> {
  const cacheKey = `${profile.year}-${profile.month}-${profile.day}-${profile.hour}-${profile.minute}-${profile.gender}`;

  // 1. Cache check
  const cached = await getCachedPillars(cacheKey);
  if (cached) return cached;

  // 2. Try external API with retry
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const params = new URLSearchParams({
        y: profile.year,
        m: profile.month,
        d: profile.day,
        hh: profile.hour,
        mm: profile.minute,
        calendar: 'solar',
        gender: profile.gender === '여성' ? '여' : '남',
      });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(`${API_URL}?${params}`, {
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        if (attempt < MAX_RETRIES) continue;
        throw new Error(`API returned ${response.status}`);
      }

      const data = await response.json();
      const pillars: SajuPillars = {
        year: normalizePillar(data.pillars.year),
        month: normalizePillar(data.pillars.month),
        day: normalizePillar(data.pillars.day),
        hour: normalizePillar(data.pillars.hour),
        fullString: '',
      };
      pillars.fullString = `${pillars.year}년 ${pillars.month}월 ${pillars.day}일 ${pillars.hour}시`;

      // Cache the result
      cachePillars(cacheKey, pillars).catch(() => {});

      return pillars;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown';
      console.warn(`[saju-api] Attempt ${attempt + 1} failed: ${msg}`);
      
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); // backoff
        continue;
      }
    }
  }

  // 3. Fallback: local calculation
  console.warn('[saju-api] All API attempts failed, using local calculation');
  const localPillars = calculateLocalPillars(profile);
  
  // Cache the local result too
  cachePillars(cacheKey, localPillars).catch(() => {});

  return localPillars;
}
