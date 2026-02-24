/**
 * 카카오톡용 텍스트 포맷터.
 * Telegram 마크다운 → 플레인텍스트 변환, 프리미엄 티저, 1000자 분할.
 */

const KAKAO_MAX_SIMPLE_TEXT = 1000;

/**
 * Telegram 스타일 마크다운을 카카오 플레인텍스트로 변환.
 * - *bold* → 《bold》
 * - _italic_ → 그냥 텍스트
 * - ```code``` → 그냥 텍스트
 * - ### 헤더 → 제거
 */
export function telegramToPlainText(text: string): string {
  let result = text;

  // ### 마크다운 헤더 제거
  result = result.replace(/^#{1,6}\s*/gm, '');

  // ```code blocks``` → 그냥 텍스트
  result = result.replace(/```[\s\S]*?```/g, (match) =>
    match.replace(/```/g, ''),
  );

  // *bold* → 《bold》 (Telegram-style single asterisk)
  result = result.replace(/\*([^*]+)\*/g, '《$1》');

  // _italic_ → 그냥 텍스트
  result = result.replace(/_([^_]+)_/g, '$1');

  // 연속 빈 줄 정리 (3줄 이상 → 2줄)
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
}

/**
 * 질문 맥락에 따른 프리미엄 티저 텍스트 생성.
 */
export function buildPremiumTeaser(questionContext: string): string {
  const lower = questionContext.toLowerCase();

  if (/연애|사랑|그\s?사람|썸|결혼|이별|재회/.test(lower)) {
    return '... 근데 그 사람 마음은, 사실 이미 답이 나와 있거든.';
  }
  if (/돈|재물|투자|사업|주식|코인|부업/.test(lower)) {
    return '... 돈 들어오는 타이밍이 보이는데, 이건 알아야 해.';
  }
  if (/취업|이직|회사|직장|면접|합격/.test(lower)) {
    return '... 붙는 시기가 보여. 근데 조건이 하나 있어.';
  }
  if (/언제|시기|타이밍|시점/.test(lower)) {
    return '... 정확한 시기를 말해줄게. 이 타이밍을 놓치면 다음은 한참 뒤야.';
  }
  if (/어떻게|방법|뭘\s?해야|어쩌지/.test(lower)) {
    return '... 구체적으로 이렇게 하면 돼. 순서가 중요해.';
  }
  if (/궁합/.test(lower)) {
    return '... 솔직히 이 부분은 좀 민감한데, 알아야 후회 안 해.';
  }
  return '... 진짜 중요한 건 여기서부터인데.';
}

/**
 * [FREE]/[PREMIUM] 태그 파싱 + 카카오 포맷 변환.
 * @returns freeText (표시용), premiumText (원본, unlock 시 사용), hasPremium
 */
export function parseAndFormatFreemium(
  rawText: string,
  questionContext: string,
): {
  freeText: string;
  premiumText: string;
  hasPremium: boolean;
  displayText: string;
} {
  const freeMatch = rawText.match(/\[FREE\]([\s\S]*?)\[\/FREE\]/);
  const premiumMatch = rawText.match(/\[PREMIUM\]([\s\S]*?)\[\/PREMIUM\]/);

  if (!freeMatch && !premiumMatch) {
    // 태그 없음 → 전체를 free로
    const formatted = telegramToPlainText(rawText);
    return {
      freeText: formatted,
      premiumText: '',
      hasPremium: false,
      displayText: formatted,
    };
  }

  const freeRaw = (freeMatch?.[1] ?? '').trim();
  const premiumRaw = (premiumMatch?.[1] ?? '').trim();
  const freeText = telegramToPlainText(freeRaw);
  const premiumText = telegramToPlainText(premiumRaw);

  // 태그 앞에 있는 텍스트 (오행 차트 등)
  const beforeFree = rawText.split('[FREE]')[0]?.trim() ?? '';
  const beforeFormatted = beforeFree
    ? telegramToPlainText(beforeFree) + '\n\n'
    : '';

  const hasPremium = !!premiumText;
  const teaser = hasPremium ? `\n\n${buildPremiumTeaser(questionContext)}` : '';
  const displayText = `${beforeFormatted}${freeText}${teaser}`;

  return { freeText, premiumText, hasPremium, displayText };
}

/**
 * 태그를 모두 제거하고 플레인텍스트로 변환 (full unlock 시 사용).
 */
export function stripTagsAndFormat(rawText: string): string {
  const cleaned = rawText
    .replace(/\[FREE\]|\[\/FREE\]|\[PREMIUM\]|\[\/PREMIUM\]/g, '')
    .trim();
  return telegramToPlainText(cleaned);
}

/**
 * 카카오 simpleText 1000자 제한에 맞게 분할.
 * 최대 3개 output (카카오 제한).
 */
export function splitForKakao(
  text: string,
  maxLen: number = KAKAO_MAX_SIMPLE_TEXT,
): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0 && chunks.length < 3) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // 자연스러운 분할점 찾기: 줄바꿈 > 마침표 > 공백
    let splitAt = remaining.lastIndexOf('\n\n', maxLen);
    if (splitAt < maxLen * 0.3) {
      splitAt = remaining.lastIndexOf('\n', maxLen);
    }
    if (splitAt < maxLen * 0.3) {
      splitAt = remaining.lastIndexOf('. ', maxLen);
      if (splitAt > 0) splitAt += 1; // 마침표 포함
    }
    if (splitAt < maxLen * 0.3) {
      splitAt = remaining.lastIndexOf(' ', maxLen);
    }
    if (splitAt < maxLen * 0.3) {
      splitAt = maxLen;
    }

    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  // 3개를 초과하면 마지막 청크에 나머지를 붙여서 잘라냄
  if (remaining.length > 0 && chunks.length >= 3) {
    chunks[2] = (chunks[2] + '\n\n' + remaining).slice(0, maxLen);
  }

  return chunks;
}
