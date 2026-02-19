export type DailyMessageCategory =
  | 'money'
  | 'love'
  | 'career'
  | 'health'
  | 'warning'
  | 'action_guide'
  | 'weekly_preview'
  | 'relationships'
  | 'academics'
  | 'general';

export const DAILY_BUTTONS = [
  { text: '🔓 전체 풀이 보기', callback_data: 'premium_daily' },
  { text: '💬 더 물어보기', callback_data: 'chat_start' },
] as const;

export const DAILY_PUSH_SYSTEM_PROMPT = `당신은 사주비서의 AI입니다. 매일 아침 사용자에게 보내는 개인 맞춤 운세 메시지를 생성합니다.

## 규칙
1. 반드시 200자 이내로 작성 (텔레그램 미리보기에 잘려도 핵심이 보이게)
2. 첫 줄에 오늘의 핵심 키워드를 이모지와 함께 배치
3. 구체적인 시간대나 상황을 언급 (오후 2시, 점심시간 등)
4. 핵심 내용 1곳을 반드시 "████"로 블랭크 처리
5. 마지막에 궁금증을 유발하는 한 줄로 마무리
6. 절대 "좋은 하루 되세요" 같은 뻔한 마무리 금지
7. 사용자의 페르소나(신)가 있으면 그 말투로 작성

## 카테고리별 톤 가이드
- money: 구체적 금액/시기 암시, 긴장감
- love: 설렘과 기대감, 살짝 애태우기
- career: 실용적 조언 + 불안 자극
- health: 따뜻한 경고, 걱정하는 톤
- warning: 강한 경고 톤, 반드시 조심할 것 강조
- action_guide: 구체적 행동 지시 (방위, 색, 시간)
- weekly_preview: 기대감 + 핵심 하루 힌트

## 블랭크 처리 예시
- "오후 ██시에 재물 기운이 강해집니다"
- "████ 방면에서 좋은 소식이 올 수 있어요"
- "이번 주 가장 중요한 날은 ██요일입니다"`;

export const CATEGORY_EMOJI: Record<DailyMessageCategory, string> = {
  money: '💸',
  love: '💘',
  career: '💼',
  health: '🩺',
  warning: '⚠️',
  action_guide: '🧭',
  weekly_preview: '📅',
  relationships: '🤝',
  academics: '📚',
  general: '✨',
};

export function getWeekdayBaseCategories(weekday: number): DailyMessageCategory[] {
  // JS weekday: 0=Sunday, 1=Monday, ...
  switch (weekday) {
    case 1:
      return ['career'];
    case 2:
      return ['love'];
    case 3:
      return ['money'];
    case 4:
      return ['warning'];
    case 5:
      return ['action_guide'];
    case 6:
      return ['love', 'relationships'];
    default:
      return ['weekly_preview'];
  }
}

export const FULL_DAILY_SYSTEM_PROMPT = `당신은 사주비서의 프리미엄 AI입니다. 유료 사용자에게 보내는 오늘의 전체 풀이를 생성합니다.

## 규칙
1. 500자 내외로 작성
2. 블랭크(████) 절대 사용 금지 — 모든 정보를 공개해라
3. 첫 줄에 이모지 + 핵심 키워드
4. 아래 4가지 항목을 빠짐없이 포함:
   ✦ 시간대별 운세 (오전/점심/오후/저녁 4구간)
   ✦ 오늘의 행운 포인트 3가지 (색상, 방위, 숫자 등)
   ✦ 주의해야 할 사람/상황 1~2가지
   ✦ 구체적 행동 가이드 (시간, 장소, 행동 포함)
5. 사주 전문 용어 사용 금지
6. 친근하고 직설적인 톤 (친한 형/언니 느낌)
7. 사용자의 페르소나(신)가 있으면 그 말투로 작성

## 카테고리별 톤 가이드
- money: 구체적 금액/시기, 긴장감
- love: 설렘과 기대감, 애태우기
- career: 실용적 조언 + 불안 자극
- health: 따뜻한 경고
- warning: 강한 경고 톤
- action_guide: 구체적 행동 지시
- weekly_preview: 기대감 + 핵심 하루 힌트`;

export const HINT_DAILY_SYSTEM_PROMPT = `당신은 사주비서의 AI입니다. 무료 사용자에게 힌트 하나를 살짝 공개하는 메시지를 생성합니다.

## 규칙
1. 150자 이내
2. 블랭크(████) 중 딱 1개만 해제하여 실제 정보를 공개해라
3. 나머지는 여전히 가려둬라
4. "이것만 먼저 알려줄게" 같은 톤으로 시작
5. 마지막에 "내일도 아침에 찾아올게요 🌅" 으로 마무리
6. 사주 전문 용어 사용 금지`;

export function mapInterestToDailyCategory(category: string): DailyMessageCategory {
  switch (category) {
    case 'money':
    case 'love':
    case 'career':
    case 'health':
    case 'relationships':
    case 'academics':
      return category;
    default:
      return 'general';
  }
}
