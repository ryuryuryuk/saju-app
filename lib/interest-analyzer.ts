export type InterestCategory =
  | 'money'
  | 'love'
  | 'career'
  | 'health'
  | 'relationships'
  | 'academics'
  | 'general';

const KEYWORD_MAP: Record<Exclude<InterestCategory, 'general'>, string[]> = {
  money: [
    '돈', '재물', '금전', '투자', '주식', '부동산', '사업',
    '매출', '월급', '연봉', '로또', '재테크', '코인', '저축',
    '빚', '대출', '용돈', '수입', '지출', '재산',
  ],
  love: [
    '연애', '사랑', '결혼', '이별', '썸', '궁합', '짝사랑',
    '남친', '여친', '남자친구', '여자친구', '소개팅', '고백',
    '바람', '이혼', '재회', '데이트', '인연', '이성', '애인',
    '남편', '와이프', '아내', '배우자',
  ],
  career: [
    '직장', '이직', '퇴사', '승진', '면접', '취업', '창업',
    '회사', '상사', '동료', '업무', '프리랜서', '공무원',
    '알바', '커리어', '진로', '전직', '해고',
  ],
  health: [
    '건강', '아프', '병원', '수술', '다이어트', '운동',
    '스트레스', '우울', '불면', '피로', '멘탈', '체력',
    '질병', '치료', '약',
  ],
  relationships: [
    '관계', '가족', '부모', '친구', '형제', '시어머니',
    '시댁', '처가', '선배', '후배', '이웃',
    '갈등', '화해', '다툼', '싸움',
  ],
  academics: [
    '시험', '공부', '수능', '자격증', '합격', '학교',
    '대학', '편입', '유학', '토익', '학업', '성적', '과목',
    '대학원',
  ],
};

// "사업", "월급" 등 career와 money에 겹치는 키워드 → 양쪽 모두 매칭됨
// "동료" → career와 relationships 양쪽 → 양쪽 모두 매칭됨

export function classifyMessage(text: string): InterestCategory[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const matched: InterestCategory[] = [];

  for (const [category, keywords] of Object.entries(KEYWORD_MAP)) {
    for (const kw of keywords) {
      if (normalized.includes(kw)) {
        matched.push(category as InterestCategory);
        break; // 한 카테고리당 한 번만 매칭
      }
    }
  }

  return matched.length > 0 ? matched : ['general'];
}
