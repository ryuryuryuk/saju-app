# 사주비서 (Saju Secretary)

AI 기반 개인 맞춤 사주 분석 텔레그램 봇

**Telegram Bot**: [@SajuSecretaryBot](https://t.me/SajuSecretaryBot)

---

## 프로젝트 개요

사주비서는 동양 철학의 사주명리학(四柱命理學)과 현대 AI 기술을 결합한 개인 맞춤형 운세 서비스입니다. 사용자의 생년월일시를 기반으로 사주팔자를 분석하고, 고전 원전(궁통보감, 자평진전, 적천수)의 지혜를 RAG 시스템으로 활용하여 정확하고 깊이 있는 해석을 제공합니다.

### 핵심 가치
- **개인화**: 타고난 사주 원국 + 현재 년운/월운 결합 분석
- **정확성**: 60갑자 직접 계산으로 정확한 일진 제공
- **접근성**: 전문 용어를 쉽게 풀어서 설명
- **실용성**: 구체적 시기, 행동 가이드 제공

---

## 주요 기능

### 1. 첫 분석 (무료)
사용자 프로필 등록 시 자동으로 종합 사주 분석 제공:
- 오행 분포 시각화 차트
- 성향/사랑/인간관계/재물 카테고리별 분석
- 올해 년운 반영

```
📊 오행 분포
🌳 목 ████░░░░ 4
🔥 화 ██░░░░░░ 2
🏔️ 토 █░░░░░░░ 1
⚔️ 금 ██░░░░░░ 2
💧 수 █░░░░░░░ 1

🔮 회원님의 2026년 운의 흐름을 분석해봤어요!
...
```

### 2. 매일 아침 8시 개인화 푸시
서울 시간 기준 매일 아침 8시에 맞춤형 운세 메시지 발송:
- 오늘의 일진(日辰) 풀이
- 사용자 일간과 오늘 일진의 관계 분석 (비겁/식상/재성/관성/인성)
- 3대 키워드, 황금 시간대, 길방, 주의 인물
- 유료 전환 유도를 위한 블랭크 처리

```
📅 2월 23일 무진일

💼 오늘 무진일, 네 갑목에게는 재성 에너지야!
오늘의 키워드: *기회* *신중* *타이밍*

██시~██시 사이가 황금 시간대야.
████ 방향으로 움직이면 좋고...
```

### 3. 자유 질문 답변
사용자의 자연어 질문에 사주 기반으로 답변:
- 질문 의도/심리 분석
- 카테고리별 맞춤 사주 포인트 분석
  - 연애: 일지(배우자궁), 도화, 관성/재성
  - 재물: 재성, 식상, 겁재
  - 직장: 관성, 인성, 월주
- 꼬리질문 감지 및 반복 답변 방지
- FREE/PREMIUM 섹션 분리

### 4. 궁합 분석
두 사람의 사주를 비교 분석:
- 케미 차트 (감정/소통/끌림/안정/성장)
- 성향 요약
- 궁합 유형 분류
- 19금 프리미엄 콘텐츠

```
💕 궁합 분석 결과

📊 케미 차트
감정  ████████░░ 80%
소통  ██████░░░░ 60%
끌림  █████████░ 90%
안정  ███████░░░ 70%
성장  ████████░░ 80%

📋 성향 요약
• 나: 불꽃처럼 타오르는 열정파
• 상대: 바람처럼 자유로운 영혼
...
```

### 5. 일진 조회
60갑자 기반 정확한 일진 계산:
- 외부 API 의존 없이 직접 계산
- 향후 5일 일진 제공
- 사용자 질문에 정확한 일진 정보 주입

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| **프레임워크** | Next.js 15 + React 19 + TypeScript |
| **스타일** | Tailwind CSS 4 |
| **AI** | OpenAI GPT-4 (분석), OpenAI Embeddings (RAG) |
| **DB** | Supabase (PostgreSQL + pgvector) |
| **배포** | Vercel (Serverless) |
| **메시징** | Telegram Bot API |
| **사주 계산** | 60갑자 직접 계산 알고리즘 |

---

## 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                        Telegram Bot                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Next.js API Routes                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │ /api/telegram/  │  │ /api/cron/      │  │ /api/...    │  │
│  │ webhook         │  │ daily-message   │  │             │  │
│  └────────┬────────┘  └────────┬────────┘  └─────────────┘  │
└───────────┼─────────────────────┼───────────────────────────┘
            │                     │
            ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                      Service Layer                           │
│  ┌──────────────┐  ┌───────────────────┐  ┌──────────────┐  │
│  │kakao-service │  │daily_message_     │  │compatibility │  │
│  │(질문 답변)    │  │generator (푸시)   │  │(궁합 분석)    │  │
│  └──────┬───────┘  └─────────┬─────────┘  └──────┬───────┘  │
└─────────┼────────────────────┼───────────────────┼──────────┘
          │                    │                   │
          ▼                    ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│                      Core Libraries                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────┐ │
│  │saju-       │  │embeddings  │  │user-profile│  │telegram│ │
│  │structure   │  │(RAG)       │  │(Supabase)  │  │(Bot API│ │
│  └────────────┘  └────────────┘  └────────────┘  └────────┘ │
└─────────────────────────────────────────────────────────────┘
          │                    │
          ▼                    ▼
┌─────────────────────┐  ┌─────────────────────────────────────┐
│   Saju Calculation  │  │            Supabase                  │
│   (60갑자 직접계산)  │  │  ┌─────────┐  ┌─────────┐           │
│                     │  │  │profiles │  │saju_    │           │
│   - 일진 계산       │  │  │         │  │chunks   │           │
│   - 년운/월운       │  │  └─────────┘  │(RAG)    │           │
│   - 충/합/형        │  │               └─────────┘           │
└─────────────────────┘  └─────────────────────────────────────┘
```

---

## 핵심 알고리즘

### 60갑자 일진 계산
```typescript
// 기준일: 2026-02-23 = 무진일(戊辰)
function calculateDayPillar(year: number, month: number, day: number) {
  const referenceDate = new Date(Date.UTC(2026, 1, 23));
  const referenceStemIndex = 4;  // 무(戊)
  const referenceBranchIndex = 4; // 진(辰)

  const targetDate = new Date(Date.UTC(year, month - 1, day));
  const diffDays = Math.round((targetDate - referenceDate) / (1000 * 60 * 60 * 24));

  const stemIndex = ((referenceStemIndex + diffDays) % 10 + 10) % 10;
  const branchIndex = ((referenceBranchIndex + diffDays) % 12 + 12) % 12;

  return { stem: STEMS[stemIndex], branch: BRANCHES[branchIndex] };
}
```

### RAG 시스템
고전 원전 3종을 청크 단위로 임베딩하여 질문에 맞는 지식 검색:
- **궁통보감**: 월령/계절 기반 용신 판단
- **자평진전**: 격국론, 육친 관계
- **적천수**: 일간 강약, 통변 원리

---

## 프로젝트 구조

```
saju-app/
├── app/
│   ├── api/
│   │   ├── telegram/webhook/    # 텔레그램 웹훅 핸들러
│   │   └── cron/daily-message/  # 매일 8시 푸시 크론
│   └── ...
├── lib/
│   ├── kakao-service.ts         # 질문 답변 서비스
│   ├── daily_message_generator.ts # 일일 메시지 생성
│   ├── daily_message_sender.ts  # 메시지 발송
│   ├── compatibility.ts         # 궁합 분석
│   ├── saju-structure.ts        # 사주 구조 분석
│   ├── saju-luck.ts             # 년운/월운 분석
│   ├── yukchin.ts               # 육친 분석
│   ├── embeddings.ts            # RAG 임베딩
│   ├── telegram.ts              # 텔레그램 API
│   ├── user-profile.ts          # 사용자 프로필
│   └── interest-analyzer.ts     # 관심사 추적
├── data/
│   └── classics/                # 고전 원전 데이터
└── vercel.json                  # 크론 설정
```

---

## 환경변수

```env
# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC...

# Cron
CRON_SECRET=your-secret-here
```

---

## 로컬 개발

```bash
# 의존성 설치
npm install

# 환경변수 설정
cp .env.example .env.local

# 개발 서버 실행
npm run dev

# 텔레그램 웹훅 설정 (ngrok 등 필요)
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<YOUR_URL>/api/telegram/webhook"
```

---

## 배포

Vercel에 자동 배포 설정됨:
- `main` 브랜치 푸시 시 자동 배포
- 크론 작업 (매일 오전 8시 KST): `vercel.json`에 정의

---

## 향후 계획

- [ ] 토스페이먼츠 결제 연동
- [ ] 대운/세운 상세 분석
- [ ] 택일(擇日) 기능
- [ ] 카카오톡 채널 연동
- [ ] 음성 입력 지원

---

## 라이선스

MIT License

---

## 팀

**사주비서** - AI와 동양 철학의 만남

문의: [Telegram Bot](https://t.me/SajuSecretaryBot)
