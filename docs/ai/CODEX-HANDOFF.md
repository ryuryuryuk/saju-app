# CODEX-HANDOFF.md — Codex 야간 작업 지시서

> 이 파일을 읽고 프론트엔드 작업을 시작하세요.
> 작성 시각: 2026-02-14

---

## Codex에게: 백엔드 작업 현황

Claude Code 팀이 다음 백엔드 API를 구현 중/완료:
- ✅ POST /api/saju (기존, 완료)
- 🔵 POST /api/relationship (카카오톡 대화 분석) — 구현 중
- 🔵 POST /api/ai-chat-analysis (AI 대화 분석) — 구현 중
- 🔵 POST /api/face-analysis (얼굴 관상 분석) — 구현 중

프론트엔드 페이지도 Claude Code가 구현 중이지만, Codex가 추가 개선할 부분:

---

## Codex 작업 목록 (우선순위순)

### P0: FE-2 — UI/UX 비주얼 고도화

현재 기본적인 레이아웃은 구현되어 있으나, "판매 가능한 수준"으로 끌어올려야 합니다.

**대상 파일:**
- app/page.tsx (메인 랜딩)
- app/saju/page.tsx
- app/relationship/page.tsx
- app/ai-chat/page.tsx
- app/face/page.tsx
- app/components/SajuForm.tsx
- app/components/SajuResult.tsx

**개선 포인트:**
1. 메인 랜딩의 4개 카드에 호버 애니메이션 추가 (scale, shadow transition)
2. 각 페이지 헤더에 장식적 요소 (그라데이션 원, 아이콘 배경)
3. 결과 카드에 마이크로 애니메이션 (페이드인, 슬라이드업)
4. CTA 버튼 호버 시 미세한 그라데이션 이동 효과
5. 모바일에서 터치 영역 48px 이상 확보

### P1: FE-5 — 반응형 최적화

- 320px ~ 1440px 전 범위 대응
- 메인 랜딩 카드: 모바일 1열, 태블릿+ 2열
- 결과 지표 카드: 모바일 2열, 데스크톱 4열
- textarea 높이 모바일에서 자동 조절

### P1: FE-6 — 접근성

- 모든 interactive 요소에 aria-label
- 키보드 네비게이션 (Tab, Enter)
- 색상 대비 WCAG AA 기준 충족
- 스크린리더 호환 heading hierarchy

### P2: FE-7 — 에러 UI

- alert() 대신 인라인 에러 메시지 (빨간색 텍스트)
- 네트워크 실패 시 재시도 버튼
- API 타임아웃 안내 (30초 초과 시)

### P2: 데모 페이지 (선택)

- /demo 페이지에 샘플 결과를 하드코딩으로 보여주기
- 구매 전 "이런 결과를 받을 수 있어요" 미리보기

---

## 디자인 시스템

**컬러:**
- Primary: orange-700 (#c2440c)
- Secondary: amber-600 (#d97706)
- Background: radial-gradient(circle_at_top, #fef3c7, #fed7aa 45%, #d6d3d1)
- Card: bg-white/95, border-stone-300
- Text: stone-900 (제목), stone-700 (본문), stone-500 (보조)

**카드 스타일:**
```css
rounded-3xl border border-stone-300 bg-white/95 p-6
shadow-[0_16px_40px_rgba(41,37,36,0.14)]
```

**CTA 버튼:**
```css
rounded-xl bg-gradient-to-r from-orange-700 via-amber-600 to-red-700
text-white font-semibold
```

---

## 작업 규칙

1. app/api/** 파일은 수정하지 마세요 (BE 영역)
2. 완료 시 docs/ai/HANDOFF.md에 기록
3. 커밋: `[FE] feat: ...` 형식
4. 브랜치: feat/fe-night-polish

---

## API 계약 (프론트엔드 연동용)

### POST /api/relationship
```json
Request: { "text": "대화내용", "analysisType": "romantic"|"friend"|"family"|"colleague", "anonymize": true }
Response: { "success": true, "result": { "summary": "...", "metrics": {...}, "insights": [...], "recommendations": [...] } }
```

### POST /api/ai-chat-analysis
```json
Request: { "text": "AI대화내용", "period": "all"|"1month"|"3months" }
Response: { "success": true, "result": { "summary": "...", "topics": [...], "patterns": [...], "insights": "...", "recommendations": [...] } }
```

### POST /api/face-analysis
```
Request: FormData { image: File, consent: "true" }
Response: { "success": true, "result": { "summary": "...", "features": {...}, "energy": "...", "personality": [...], "disclaimer": "..." } }
```
