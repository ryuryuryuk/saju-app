# CLAUDE.md — AI 사주 분석 앱

> 이 파일은 **Claude Code**와 **Codex** 두 AI 에이전트가 읽는 루트 지침서입니다.
> 세부 협업 문서는 `docs/ai/` 디렉토리에 있습니다.

---

## 필수 읽기 문서 (세션 시작 시)

| 순서 | 파일 | 내용 |
|------|------|------|
| 1 | `docs/ai/CONTEXT.md` | 프로젝트 개요, 기술 스택, 아키텍처, API 계약, 현재 상태 |
| 2 | `docs/ai/WORKFLOW.md` | R/R, 브랜치 전략, 커밋 컨벤션, 작업 사이클, 충돌 방지 규칙 |
| 3 | `docs/ai/TASKS.md` | 작업 추적 보드 — 무엇을 해야 하는지 |
| 4 | `docs/ai/HANDOFF.md` | 에이전트 간 메시지 — 상대가 남긴 메시지 확인 |

---

## 핵심 규칙 (요약)

1. **자기 영역만 수정** — BE 파일은 Claude Code, FE 파일은 Codex
2. **공유 파일 수정 전** → `docs/ai/HANDOFF.md`에 먼저 기록
3. **API 계약 변경 시** → `docs/ai/CONTEXT.md` 섹션 5를 먼저 업데이트
4. **작업 시작/완료 시** → `docs/ai/TASKS.md` 상태 업데이트
5. **커밋 메시지** → `[BE]`, `[FE]`, `[SHARED]` 접두사 사용

---

## R/R 요약

| Claude Code (백엔드) | Codex (프론트엔드) |
|----------------------|-------------------|
| `app/api/**` | `app/page.tsx`, `app/layout.tsx` |
| `lib/**` | `app/components/**` |
| `scripts/**` | `app/globals.css` |
| `data/**` | `public/**` |
| `.env.local`, `next.config.*` | Tailwind 설정 |

공유: `app/page.tsx`(API 호출부), `package.json`, `tsconfig.json`, `docs/ai/*`

---

## 기술 스택

- **프레임워크**: Next.js 16 + React 19 + TypeScript
- **스타일**: Tailwind CSS 4
- **AI**: Anthropic Claude API (해석) + OpenAI API (임베딩)
- **DB**: Supabase (PostgreSQL + pgvector)
- **사주 계산**: 외부 API (`beta-ybz6.onrender.com`)
- **지식베이스**: 궁통보감, 자평진전, 적천수 (RAG)
