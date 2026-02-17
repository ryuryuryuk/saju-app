# CONTEXT.md — 프로젝트 컨텍스트 & 아키텍처

> 모든 AI 에이전트는 작업 시작 전 이 파일을 반드시 읽어야 합니다.
> 마지막 업데이트: 2026-02-15

---

## 1. 프로젝트 정의

| 항목 | 내용 |
|------|------|
| 이름 | AI 사주 분석 (saju-app) |
| 목적 | 사용자의 생년월일시를 입력받아 사주팔자를 분석하고 AI가 해석을 제공하는 웹 서비스 |
| 대상 | 한국어 사용자, 모바일 우선 |
| 톤 | 친근한 반말, 공감적, 따뜻한 조언 |

---

## 2. 기술 스택

```
프론트엔드:  Next.js 16 + React 19 + TypeScript + Tailwind CSS 4
백엔드:      Next.js App Router API Routes
AI 해석:     Anthropic Claude API (claude-sonnet-4-20250514)
임베딩:      OpenAI text-embedding-3-small
DB:          Supabase (PostgreSQL + pgvector)
사주 계산:   외부 API (beta-ybz6.onrender.com)
배포:        미정 (Vercel 예정)
```

---

## 3. 아키텍처 다이어그램

```
[사용자 브라우저]
       │
       ▼
[Next.js 프론트엔드]  ←── app/page.tsx, app/components/**
       │
       │ POST /api/saju
       ▼
[Next.js API Route]   ←── app/api/saju/route.js
       │
       ├──→ [외부 사주 API]        ── 사주팔자 계산
       ├──→ [OpenAI Embeddings]    ── 질문 벡터화
       ├──→ [Supabase pgvector]    ── 고서 유사 청크 검색 (RAG)
       └──→ [Claude API]           ── 사주 해석 생성
                                        │
                                        ▼
                                  [사용자에게 결과 표시]
```

---

## 4. 디렉토리 구조 & 소유권

```
saju-app/
├── app/
│   ├── api/
│   │   └── saju/
│   │       └── route.js           [BE] 사주 분석 API
│   ├── components/                [FE] UI 컴포넌트 (신규 생성)
│   ├── globals.css                [FE] 글로벌 스타일
│   ├── layout.tsx                 [FE] 루트 레이아웃
│   └── page.tsx                   [공유] 메인 페이지
├── data/                          [BE] 고서 원문
│   ├── 궁통보감.txt
│   ├── 자평진전.txt
│   └── 적천수.txt
├── docs/
│   └── ai/                        [공유] AI 에이전트 협업 문서
│       ├── CONTEXT.md             ← 이 파일
│       ├── WORKFLOW.md            협업 프로토콜
│       ├── TASKS.md               작업 추적 보드
│       └── HANDOFF.md             에이전트 간 메시지
├── lib/                           [BE] 유틸리티
│   ├── supabase.js                Supabase 클라이언트
│   └── embeddings.js              OpenAI 임베딩
├── public/                        [FE] 정적 자원
├── scripts/                       [BE] 데이터 파이프라인
│   ├── ingest.mjs                 데이터 인제스트
│   └── migrate.mjs                DB 마이그레이션
├── CLAUDE.md                      [공유] 에이전트 지침 (루트)
├── package.json                   [공유] 의존성
└── tsconfig.json                  [공유] TypeScript 설정
```

소유권 범례: `[BE]` = Claude Code, `[FE]` = Codex, `[공유]` = 수정 전 상의

---

## 5. API 계약 (Contract)

### `POST /api/saju`

**Request:**
```json
{
  "birthYear": "1995",
  "birthMonth": "3",
  "birthDay": "15",
  "birthHour": "14",
  "gender": "여성",
  "question": "올해 연애운이 어떤가요?"
}
```

**Response (성공):**
```json
{
  "success": true,
  "result": "AI 해석 텍스트...",
  "sajuInfo": {
    "fullString": "을해년 기묘월 갑진일 임인시",
    "gapja": "을해",
    "gapjaName": "산속의 돼지",
    "element": "목(木)"
  },
  "usage": {
    "inputTokens": 500,
    "outputTokens": 300
  }
}
```

**Response (실패):**
```json
{
  "success": false,
  "error": "에러 메시지"
}
```

> API 계약 변경 시: 이 섹션을 먼저 업데이트 → HANDOFF.md에 통보 → 상대 에이전트가 확인

---

## 6. 현재 상태

| 구성요소 | 상태 | 비고 |
|----------|------|------|
| AI 사주 분석 | ✅ 완료 | `/saju` + `/api/saju` |
| 관계 분석 | ✅ 완료 | `/relationship` + `/api/relationship` |
| AI 대화 분석 | ✅ 완료 | `/ai-chat` + `/api/ai-chat-analysis` |
| 관상 분석 | ✅ 완료 | `/face` + `/api/face-analysis` |
| **통합 분석** | ✅ 구현 완료 | `/integrated` + `/api/integrated` — 5단계 위자드 + 프리미엄 리포트 |
| Supabase 연동 | ✅ 완료 | 벡터 검색 함수 설정됨 |
| 데이터 인제스트 | ✅ 완료 | 3권 고서 텍스트 준비됨 |
| 개발 서버 | ✅ 해결됨 | `--hostname 127.0.0.1` 적용 |
| UI/UX 디자인 | ✅ 완료 | Tailwind + 애니메이션 + 반응형 |
| 배포 | 🔲 미시작 | Vercel 예정 |

---

## 6.5. 통합 분석 아키텍처

```
[사용자 5단계 위자드]
       │
       ▼
[POST /api/integrated (FormData)]
       │
       ├── 사주 계산 (필수)
       │   ├── 외부 사주 API
       │   ├── analyzeSajuStructure()
       │   └── analyzeSajuYukchin()
       │
       ├── 카카오톡 파싱 (선택)
       │   └── 메시지 파싱 + 통계
       │
       ├── AI 대화 추출 (선택)
       │   └── 사용자 메시지 추출
       │
       ├── 관상 이미지 (선택)
       │   └── GPT-4o Vision 분석
       │
       └── GPT 종합 합성
           └── 구조화된 JSON 리포트
```

---

## 7. 알려진 이슈

| # | 이슈 | 심각도 | 담당 |
|---|------|--------|------|
| 1 | ~~dev 서버 시작 안 됨~~ | ✅ 해결됨 | BE |
| 2 | GPT JSON 파싱 실패 가능 | 🟡 중간 | BE (regex fallback 구현됨) |
| 3 | 전체 데이터 제공 시 GPT 호출 60초 소요 | 🟡 중간 | BE (90초 타임아웃) |
