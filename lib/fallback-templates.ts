import type { DailyMessageCategory } from './daily_message_templates';
import { CATEGORY_EMOJI } from './daily_message_templates';

interface FallbackVars {
  user_name?: string;
  date?: string;
}

const TEMPLATES: Record<DailyMessageCategory, string[]> = {
  money: [
    '{emoji} 오늘 점심 전후, ████ 관련 결정이 돈 흐름을 바꿀 수 있어.\n{date} 타이밍을 먼저 잡는 사람이 누굴까?',
    '{emoji} 오늘 오후 ██시, 재물 기운이 잠깐 열려.\n████ 쪽으로 움직이면 신호가 보일 거야.',
    '{emoji} {user_name}님, 오늘 지갑 열기 전에 잠깐!\n████에서 의외의 기회가 보여. 확인해볼까?',
    '{emoji} 오늘 ██시 이후, 돈과 관련된 ████ 신호가 감지돼.\n이거 놓치면 아깝지 않을까?',
    '{emoji} {date} 재물운 핵심: ████ 방면.\n점심시간에 확인해봐. 늦으면 다음 기회는 멀어.',
  ],
  love: [
    '{emoji} 오늘 ██시쯤, 누군가의 말 한마디에 마음이 흔들릴 수 있어.\n████ 신호를 놓치지 마.',
    '{emoji} {user_name}님, 오늘 연애 기운이 살짝 열렸어.\n████ 쪽에서 의외의 인연 힌트가 보여.',
    '{emoji} 오늘 저녁 전에 ████ 관련 메시지가 올 수도.\n읽기 전에 심호흡 한 번 하고 봐.',
    '{emoji} {date} 감정이 요동칠 타이밍.\n████에서 오는 신호, 무시하면 후회할지도?',
    '{emoji} 오늘 인연 키워드는 ████.\n점심시간에 주변을 잘 살펴봐. 힌트가 숨어있어.',
  ],
  career: [
    '{emoji} {date} 커리어 흐름이 바뀌는 날.\n████ 관련 결정은 오후 ██시 전에 내려.',
    '{emoji} 오늘 직장에서 ████ 이슈가 터질 수 있어.\n미리 준비해두면 평가가 달라져.',
    '{emoji} {user_name}님, 오늘 상사/동료에게 ████ 어필 타이밍이야.\n점심 전에 움직여.',
    '{emoji} 오늘 업무 핵심 변수는 ████.\n██시 이전에 선수치면 흐름이 유리해져.',
    '{emoji} {date} 커리어에서 중요한 갈림길.\n████ 쪽 선택을 미루지 마. 타이밍이 핵심이야.',
  ],
  health: [
    '{emoji} {user_name}님, 오늘 ████ 부위가 좀 신경 쓰일 수 있어.\n██시 이전에 스트레칭 한 번 해줘.',
    '{emoji} 오늘 컨디션 관리 핵심: ████.\n점심 먹고 10분만 걸어봐. 오후가 달라져.',
    '{emoji} {date} 몸이 보내는 신호를 무시하지 마.\n████ 쪽이 좀 약해. 오늘은 무리하지 않는 게 좋아.',
    '{emoji} 오늘 ██시쯤 피로가 확 몰려올 수 있어.\n████로 미리 대비해두면 버틸 수 있어.',
    '{emoji} {user_name}님, 오늘 건강 키워드는 ████.\n저녁 전에 한 번 체크해봐.',
  ],
  warning: [
    '{emoji} 오늘 ██시 전후로 ████ 관련 주의보!\n평소와 다른 선택이 필요한 날이야.',
    '{emoji} {user_name}님, 오늘은 ████ 조심해.\n특히 오후에 충동적 결정은 위험해.',
    '{emoji} {date} 경고 신호: ████.\n점심시간에 한 번 멈추고 생각해봐.',
    '{emoji} 오늘 ████ 방면에서 예상 못한 변수가 올 수 있어.\n미리 대비하면 큰일은 없어.',
    '{emoji} {user_name}님, 오늘 특히 ████ 관련 약속이나 결정은 신중하게.\n██시 이후가 안전해.',
  ],
  action_guide: [
    '{emoji} 오늘의 행동 가이드: ████ 방향으로 움직여봐.\n██시에 실행하면 효과가 배로 올라.',
    '{emoji} {user_name}님, 오늘은 ████를 실천하는 날.\n작은 행동 하나가 흐름을 바꿔.',
    '{emoji} {date} 실천 키워드: ████.\n점심 전에 시작해야 타이밍이 맞아.',
    '{emoji} 오늘 ████ 색상의 아이템이 행운을 부를 수 있어.\n██시에 착용하면 기운이 올라가.',
    '{emoji} {user_name}님, 오늘은 ████ 방면으로 15분만 걸어봐.\n뜻밖의 영감이 떠오를 거야.',
  ],
  weekly_preview: [
    '{emoji} 이번 주 핵심 요일은 ██요일!\n████ 관련 큰 흐름이 바뀌는 주간이야.',
    '{emoji} {user_name}님, 이번 주는 ████에 집중해야 하는 주간.\n가장 중요한 날은 ██요일이야.',
    '{emoji} {date} 주간 프리뷰: ████ 기운이 강한 한 주.\n수요일 전에 결정하면 유리해.',
    '{emoji} 이번 주 반드시 챙겨야 할 것: ████.\n██요일에 기회가 열려. 놓치지 마.',
    '{emoji} 이번 주는 ████ 테마가 지배하는 주간.\n{user_name}님이 선수치면 흐름이 바뀌어.',
  ],
  relationships: [
    '{emoji} 오늘 주변 사람들과 ████ 관련 대화가 흐름을 바꿀 수 있어.\n██시에 연락해봐.',
    '{emoji} {user_name}님, 오늘 인간관계 키워드는 ████.\n점심시간에 누군가에게 먼저 말 걸어봐.',
    '{emoji} {date} 관계에서 중요한 신호가 올 수 있어.\n████ 쪽 사람에게 주목해.',
    '{emoji} 오늘 ████ 관련 사람과의 만남이 좋은 전환점이 될 수 있어.\n망설이지 마.',
    '{emoji} {user_name}님, 오늘은 ████ 사이의 거리를 좁힐 타이밍.\n저녁 전에 움직여.',
  ],
  academics: [
    '{emoji} 오늘 공부 집중력 피크: ██시~██시.\n████ 과목에 올인하면 효과가 좋아.',
    '{emoji} {user_name}님, 오늘 학업 키워드는 ████.\n점심 전에 핵심 부분을 정리해둬.',
    '{emoji} {date} 시험/공부 운이 열려 있어.\n████ 관련 내용을 ██시에 복습하면 기억에 잘 남아.',
    '{emoji} 오늘 ████ 분야에서 깨달음이 올 수 있어.\n오후 ██시에 집중해봐.',
    '{emoji} {user_name}님, 오늘 학습 효율 최대치는 ████ 환경에서.\n██시 이전에 시작하면 베스트.',
  ],
  general: [
    '{emoji} {date} 오늘의 핵심 변수는 ████.\n점심시간 전후로 흐름이 바뀌어. 눈 크게 뜨고 봐.',
    '{emoji} {user_name}님, 오늘 ████ 관련 직감이 정확할 수 있어.\n██시에 느낀 감정을 믿어봐.',
    '{emoji} 오늘 하루의 키워드: ████.\n아침에 세운 계획대로 가면 좋은 결과가 올 거야.',
    '{emoji} {date} ████ 방면에서 의외의 소식이 올 수 있어.\n열린 마음으로 받아들여봐.',
    '{emoji} {user_name}님, 오늘은 ████에 집중하는 날.\n저녁까지 하나만 확실히 해두면 내일이 편해져.',
  ],
};

function replaceVars(template: string, vars: FallbackVars, emoji: string): string {
  let text = template
    .replace(/\{emoji\}/g, emoji)
    .replace(/\{user_name\}/g, vars.user_name || '회원')
    .replace(/\{date\}/g, vars.date || '오늘');
  if (text.length > 200) text = text.slice(0, 200).trim();
  return text;
}

export function getRandomFallback(
  category: DailyMessageCategory,
  vars: FallbackVars = {},
): string {
  const pool = TEMPLATES[category] || TEMPLATES.general;
  const emoji = CATEGORY_EMOJI[category] || '✨';
  const idx = Math.floor(Math.random() * pool.length);
  return replaceVars(pool[idx], vars, emoji);
}
