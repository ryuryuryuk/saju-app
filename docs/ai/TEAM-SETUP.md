# TEAM-SETUP.md — Claude Code 팀 + Codex 협업 가이드

> 두 AI 시스템을 병렬로 실행하여 백엔드와 프론트엔드를 동시 개발하는 방법

---

## 1. 준비 단계

### 1-1. 작업 정의 (TASKS.md 업데이트)

자기 전에 TASKS.md에 오늘의 목표를 명확히 작성:

```markdown
## 오늘의 목표 (2026-02-14)

### Claude Code 팀 (백엔드)
- [ ] BE-1: 개발 서버 실행 문제 해결
- [ ] BE-2: 60갑자 DB 완성
- [ ] BE-6: 프롬프트 최적화

### Codex (프론트엔드)
- [ ] FE-1: 컴포넌트 분리
- [ ] FE-3: 로딩 UX 개선
- [ ] FE-4: 결과 화면 디자인
```

### 1-2. 브랜치 생성

```bash
# 백엔드 팀 작업용
git checkout -b feat/be-night-work

# 프론트엔드 작업용 (별도 터미널/세션)
git checkout develop
git checkout -b feat/fe-night-work
```

---

## 2. Claude Code 팀 에이전트 시작

### 2-1. Claude Code 세션 시작

**프롬프트:**

```
다음 작업들을 팀으로 진행해줘. 백그라운드에서 실행하고,
각 작업 완료될 때마다 docs/ai/HANDOFF.md에 결과를 기록해줘.

**백엔드 작업 (병렬 실행):**

1. **개발 서버 문제 해결** (BE-1)
   - Next.js 16 + Node 24 호환성 이슈
   - localhost:3000 실행되도록 수정

2. **60갑자 DB 완성** (BE-2)
   - 현재 20개 → 60개 전체 데이터 입력
   - lib/gapja.ts 파일 수정

3. **프롬프트 최적화** (BE-6)
   - app/api/saju/route.ts의 시스템 프롬프트 개선
   - RAG 검색 결과 활용도 높이기

**작업 방식:**
- 팀 이름: saju-night-be
- 각 작업마다 별도 에이전트 할당
- 완료 시 TASKS.md 상태 업데이트 (🔵 → ✅)
- HANDOFF.md에 Codex에게 전달할 정보 기록
- feat/be-night-work 브랜치에 커밋

시작해줘!
```

### 2-2. Claude Code의 자동 동작

```typescript
// 1. 팀 생성
TeamCreate("saju-night-be")

// 2. 작업 분해 & 에이전트 파견
Task 1 (test-runner):      개발 서버 문제 진단 + 수정
Task 2 (general-purpose):  60갑자 데이터 생성 + DB 입력
Task 3 (codebase-researcher + architect): 프롬프트 분석 + 최적화

// 3. 병렬 실행 (백그라운드)
run_in_background: true

// 4. 완료 시 자동으로 HANDOFF.md 업데이트
```

---

## 3. Codex 세션 시작 (동시 실행)

### 3-1. Codex IDE (Cursor/VS Code) 열기

**프롬프트:**

```
다음 파일들을 읽고 프론트엔드 작업을 시작하세요:
1. docs/ai/CONTEXT.md — API 계약 확인
2. docs/ai/TASKS.md — 현재 할 작업
3. docs/ai/HANDOFF.md — 백엔드로부터 온 메시지

**오늘의 작업:**

FE-1: 컴포넌트 분리
- page.tsx를 SajuForm, SajuResult, LoadingSteps로 분리
- app/components/ 디렉토리에 생성

FE-3: 로딩 UX 개선
- 15초 대기 동안 단계별 애니메이션
- "사주 계산 중..." → "고서 검색 중..." → "AI 해석 중..."

FE-4: 결과 화면 디자인
- 사주 정보 카드 (천간/지지/오행)
- AI 해석 텍스트 (마크다운 렌더링)
- 동양풍 디자인 (Tailwind CSS 활용)

**브랜치:** feat/fe-night-work

**작업 완료 시:**
1. TASKS.md 상태 업데이트
2. HANDOFF.md에 백엔드에게 전달할 내용 기록
3. 커밋

시작!
```

---

## 4. 협업 동기화 메커니즘

### 4-1. 공유 파일 시스템

```
docs/ai/
├── TASKS.md         ← 양쪽 모두 읽고 쓰기
├── HANDOFF.md       ← 메시지 보드 (비동기 소통)
└── CONTEXT.md       ← API 계약 (변경 시 우선 업데이트)
```

### 4-2. 자동 동기화 흐름

```
[Claude Code 팀]
  작업 완료 → TASKS.md 업데이트 (✅)
           → HANDOFF.md에 메시지 추가
           → Codex에게 알림 (파일 변경 감지)

[Codex]
  HANDOFF.md 읽기 → 백엔드 변경사항 확인
                  → 필요시 자기 작업 조정
                  → 완료 시 HANDOFF.md에 답장
```

### 4-3. 충돌 방지

| 상황 | 해결책 |
|------|--------|
| 같은 파일 수정 | 브랜치 분리 (feat/be-*, feat/fe-*) |
| API 계약 변경 | CONTEXT.md 먼저 업데이트, HANDOFF.md에 알림 |
| package.json 충돌 | 의존성 추가 시 HANDOFF.md 기록 → 아침에 통합 |
| page.tsx 충돌 | SH-1 작업 우선 (API 호출 커스텀 훅 분리) |

---

## 5. 아침에 확인 & 통합

### 5-1. 작업 결과 확인

```bash
# Claude Code 팀 결과
git diff develop..feat/be-night-work

# Codex 결과
git diff develop..feat/fe-night-work

# HANDOFF.md 읽기
cat docs/ai/HANDOFF.md
```

### 5-2. 통합 & 테스트

```bash
# develop으로 머지
git checkout develop
git merge feat/be-night-work --no-ff -m "[BE] 야간 작업 통합"
git merge feat/fe-night-work --no-ff -m "[FE] 야간 작업 통합"

# 충돌 해결 (있다면)
# 테스트
npm run dev
npm run lint
npx tsc --noEmit
```

---

## 6. 고급 패턴

### 6-1. Watch 모드 (선택사항)

Codex가 백엔드 변경사항을 실시간 감지:

```bash
# 별도 터미널
watch -n 10 'cat docs/ai/HANDOFF.md | grep "BE → FE" | tail -5'
```

### 6-2. API Contract First 패턴

백엔드 API 변경 시:

```typescript
// 1. CONTEXT.md 먼저 업데이트
interface SajuRequest { /* 새 필드 추가 */ }

// 2. HANDOFF.md에 알림
## BE → FE: API 계약 변경
- birthMinute 필드 추가 (선택)
- 기존 코드는 호환됨

// 3. 백엔드 구현
// 4. Codex가 자기 타이밍에 반영
```

### 6-3. 긴급 차단 (Blocker)

한쪽이 블로커 발생 시:

```markdown
## BE → FE: 🚨 블로커 발생

**문제:** API 응답 형식이 변경됨
**영향:** FE-4 작업 중단 필요
**대응:** CONTEXT.md 5번 섹션 참고, 새 타입 정의 사용

**우선순위:** P0
**예상 해결:** 1시간 내
```

---

## 7. 실전 팁

### ✅ DO

1. **명확한 작업 분리**: 백엔드는 lib/api/scripts, 프론트엔드는 app/components
2. **브랜치 분리**: feat/be-*, feat/fe-*
3. **공유 파일 우선 업데이트**: CONTEXT.md, TASKS.md, HANDOFF.md
4. **작은 커밋**: 각 에이전트가 논리적 단위로 커밋
5. **명시적 메시지**: HANDOFF.md에 "무엇을, 왜, 어떻게" 기록

### ❌ DON'T

1. **상대 파일 직접 수정**: R/R 위반 절대 금지
2. **말 없이 API 변경**: 반드시 CONTEXT.md + HANDOFF.md 기록
3. **develop에 직접 푸시**: 항상 브랜치 경유
4. **모호한 메시지**: "작업 완료" 대신 "60갑자 DB 60개 전체 완성, lib/gapja.ts 참고"
5. **동시 같은 파일**: HANDOFF.md로 순서 조율

---

## 8. 트러블슈팅

### Q1: Claude Code 팀이 멈췄어요

```bash
# 진행 상황 확인
ls ~/.claude/tasks/saju-night-be/
cat ~/.claude/tasks/saju-night-be/*.json

# 에이전트 상태
# (UI에 자동 표시됨)
```

### Q2: Codex가 오래된 정보로 작업했어요

```
Codex 세션 재시작 시:
"docs/ai/HANDOFF.md를 먼저 읽고, 백엔드의 최신 메시지를 확인한 후 작업을 계속하세요"
```

### Q3: Git 충돌이 많아요

```bash
# 공유 파일만 develop에서 가져오기
git checkout develop -- docs/ai/*.md
git add docs/ai/
git commit -m "[SHARED] 최신 협업 문서 동기화"
```

---

## 9. 예시 HANDOFF.md 메시지

### 백엔드 → 프론트엔드

```markdown
### [2026-02-14 03:00] BE → FE: 야간 작업 완료 보고

**완료된 작업:**
✅ BE-1: 개발 서버 문제 해결 → localhost:3000 정상 동작
✅ BE-2: 60갑자 DB 완성 → lib/gapja.ts (60개 전체)
✅ BE-6: 프롬프트 최적화 → 해석 품질 30% 향상

**프론트엔드에서 확인 필요:**
- API 응답 시간 단축: 15초 → 8초
- result.metadata.processingSteps 필드 추가 (로딩 단계 표시용)
  - 예시: ["사주 계산", "고서 검색 (3권)", "AI 해석 생성"]

**API 계약 변경:**
- CONTEXT.md 5-3 섹션 업데이트함
- 기존 코드 호환됨 (새 필드만 추가)

**다음 작업:**
- BE-7: 에러 핸들링 강화 (내일 진행 예정)

**커밋:** feat/be-night-work 브랜치
```

### 프론트엔드 → 백엔드

```markdown
### [2026-02-14 04:00] FE → BE: 컴포넌트 작업 완료

**완료된 작업:**
✅ FE-1: 컴포넌트 분리
  - app/components/SajuForm.tsx
  - app/components/SajuResult.tsx
  - app/components/LoadingSteps.tsx

✅ FE-3: 로딩 UX
  - metadata.processingSteps 활용하여 단계별 표시
  - 8초 대기도 충분히 자연스러움 👍

✅ FE-4: 결과 화면 디자인
  - 동양풍 그라데이션 배경
  - 사주 정보 카드 (Tailwind)
  - AI 해석 마크다운 렌더링

**백엔드 요청:**
- result.metadata에 confidence 점수 추가 가능?
  - UI에 "해석 신뢰도: 85%" 같은 거 표시하고 싶음

**이슈:**
- 없음 (순조로움)

**커밋:** feat/fe-night-work 브랜치
```

---

## 10. 체크리스트

### 자기 전

- [ ] TASKS.md에 오늘의 목표 작성
- [ ] CONTEXT.md 최신화 확인
- [ ] 브랜치 생성 (feat/be-*, feat/fe-*)
- [ ] Claude Code 팀 시작 프롬프트 실행
- [ ] Codex 세션 시작 프롬프트 실행

### 아침에

- [ ] HANDOFF.md 읽기
- [ ] TASKS.md 상태 확인
- [ ] Git diff 확인
- [ ] develop으로 머지
- [ ] 통합 테스트
- [ ] 다음 작업 계획

---

**핵심 원칙:** 각 에이전트는 독립적으로 작업하지만, 공유 파일로 상태를 동기화합니다.
