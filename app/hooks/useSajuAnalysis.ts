'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  LoadingStep,
  SajuApiResponse,
  SajuApiSuccess,
  SajuConvertedTime,
  SajuFormData,
} from '@/app/types/saju';

export const LOADING_STEPS: LoadingStep[] = [
  {
    title: '사주 원국 계산 중',
    description: '생년월일시를 기준으로 천간과 지지를 정리하고 있어요.',
    startAtMs: 0,
  },
  {
    title: '고서 지식 검색 중',
    description: '유사한 구절을 찾아 해석 근거를 모으고 있어요.',
    startAtMs: 5000,
  },
  {
    title: 'AI 해석 작성 중',
    description: '당신의 질문에 맞게 결과를 문장으로 구성하고 있어요.',
    startAtMs: 10000,
  },
];

const parseTimeTo24Hour = (birthTime: string, meridiem: SajuFormData['meridiem']): SajuConvertedTime | null => {
  const match = /^(\d{2}):(\d{2})$/.exec(birthTime);
  if (!match) return null;

  const hour12 = Number(match[1]);
  const minute = Number(match[2]);

  if (Number.isNaN(hour12) || Number.isNaN(minute)) return null;
  if (hour12 < 0 || hour12 > 12 || minute < 0 || minute > 59) return null;

  let hour24 = hour12;
  if (meridiem === '오전') {
    if (hour12 === 12) hour24 = 0;
  } else {
    if (hour12 === 0) hour24 = 12;
    else if (hour12 < 12) hour24 += 12;
  }

  if (hour24 > 23) return null;

  return {
    birthHour: String(hour24),
    birthMinute: String(minute),
  };
};

const getLoadingStepIndex = (elapsedMs: number) => {
  let index = 0;

  for (let i = 0; i < LOADING_STEPS.length; i += 1) {
    if (elapsedMs >= LOADING_STEPS[i].startAtMs) {
      index = i;
    }
  }

  return index;
};

export function normalizeTimeTyping(value: string) {
  const cleaned = value.replace(/[^\d:]/g, '');
  const colonCount = (cleaned.match(/:/g) || []).length;

  if (colonCount > 0) {
    const [hourPart = '', minutePart = ''] = cleaned.split(':');
    return `${hourPart.replace(/\D/g, '').slice(0, 2)}:${minutePart.replace(/\D/g, '').slice(0, 2)}`;
  }

  return cleaned.replace(/\D/g, '').slice(0, 4);
}

export function normalizeTimeOnBlur(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';

  let hourText = '';
  let minuteText = '';

  const withColonMatch = /^(\d{1,2}):(\d{1,2})$/.exec(trimmed);
  if (withColonMatch) {
    hourText = withColonMatch[1];
    minuteText = withColonMatch[2];
  } else {
    const digits = trimmed.replace(/\D/g, '').slice(0, 4);
    if (!digits) return '';

    if (digits.length <= 2) {
      hourText = digits;
      minuteText = '00';
    } else if (digits.length === 3) {
      hourText = digits.slice(0, 1);
      minuteText = digits.slice(1, 3);
    } else {
      hourText = digits.slice(0, 2);
      minuteText = digits.slice(2, 4);
    }
  }

  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return trimmed;
  if (hour < 0 || hour > 12 || minute < 0 || minute > 59) return trimmed;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function useSajuAnalysis() {
  const SAJU_TIMEOUT_MS = 90_000;
  const [loading, setLoading] = useState(false);
  const [loadingStartedAt, setLoadingStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [result, setResult] = useState<SajuApiSuccess | null>(null);
  const [error, setError] = useState('');
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!loading) return undefined;

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 400);

    return () => window.clearInterval(timer);
  }, [loading]);

  const loadingStepIndex = useMemo(() => {
    if (!loading || loadingStartedAt === null) return 0;
    return getLoadingStepIndex(now - loadingStartedAt);
  }, [loading, loadingStartedAt, now]);

  const submitSaju = async (formData: SajuFormData) => {
    setLoading(true);
    setLoadingStartedAt(Date.now());
    setNow(Date.now());
    setError('');
    setTimedOut(false);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), SAJU_TIMEOUT_MS);

    try {
      const converted = parseTimeTo24Hour(formData.birthTime, formData.meridiem);
      if (!converted) {
        setError('시간은 오전/오후 선택 후 00:00 형식으로 입력해주세요. (예: 08:30)');
        return;
      }

      const response = await fetch('/api/saju', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          ...formData,
          ...converted,
        }),
      });

      const raw = await response.text();
      let data: SajuApiResponse | null = null;
      try {
        data = JSON.parse(raw) as SajuApiResponse;
      } catch {
        data = null;
      }

      if (!response.ok) {
        const serverMessage =
          data && 'success' in data && data.success === false && 'error' in data
            ? data.error
            : `서버 오류가 발생했습니다. (HTTP ${response.status})`;
        setError(serverMessage);
        return;
      }

      if (!data) {
        setError('서버 응답을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.');
        return;
      }

      if (data.success === true) {
        setResult(data);
      } else {
        const message = 'error' in data ? data.error : '알 수 없는 오류가 발생했습니다';
        setError(message);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setTimedOut(true);
        setError('분석 시간이 길어지고 있습니다. 1분 내외로 다시 시도해주세요.');
      } else {
        setError('네트워크 오류가 발생했습니다. 다시 시도해주세요.');
      }
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
      setLoadingStartedAt(null);
    }
  };

  const resetResult = () => {
    setResult(null);
    setError('');
    setTimedOut(false);
  };

  return {
    error,
    loading,
    loadingStepIndex,
    loadingSteps: LOADING_STEPS,
    result,
    timedOut,
    resetResult,
    setError,
    submitSaju,
  };
}
