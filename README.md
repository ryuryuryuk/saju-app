# AI 사주 스튜디오

AI 기반 사주·관계·관상 분석 서비스 (Next.js + Vercel)

배포 URL: https://saju-app-rose.vercel.app

---

## 카카오톡 챗봇 연동 (OpenBuilder Skill)

### 엔드포인트

```
POST https://saju-app-rose.vercel.app/api/kakao/skill
```

인증: `x-skill-secret` 헤더 또는 `?secret=` 쿼리 파라미터

---

### 1단계 — Vercel 환경변수 설정

Vercel 대시보드 → 프로젝트 → **Settings → Environment Variables**

| 키 | 값 |
|---|---|
| `KAKAO_SKILL_SECRET` | 임의의 강력한 문자열 (예: `openssl rand -hex 32` 출력값) |

---

### 2단계 — 카카오 오픈빌더 스킬 생성

1. [카카오 오픈빌더](https://chatbot.kakao.com) 접속
2. 챗봇 선택 → **스킬** → **스킬 추가**
3. 설정:
   - **스킬 이름**: `사주 AI 답변`
   - **URL**: `https://saju-app-rose.vercel.app/api/kakao/skill`
   - **헤더 추가**: `x-skill-secret: {KAKAO_SKILL_SECRET 값}`
4. **저장 및 배포**

---

### 3단계 — 폴백 블록에 스킬 연결

1. 오픈빌더 → **시나리오** → **폴백 블록** 선택
2. **봇 응답** → **스킬 데이터 사용** 선택
3. 생성한 스킬(`사주 AI 답변`) 연결
4. **저장 → 배포**

---

### 4단계 — 오픈빌더에서 테스트

오픈빌더 우측 **채널 테스트** 패널에서 메시지를 입력하면 스킬 응답을 확인할 수 있습니다.

---

## curl 테스트 커맨드

### 정상 요청

```bash
curl -X POST https://saju-app-rose.vercel.app/api/kakao/skill \
  -H "Content-Type: application/json" \
  -H "x-skill-secret: YOUR_SECRET_HERE" \
  -d '{
    "version": "2.0",
    "userRequest": {
      "utterance": "나 사주 봐줘",
      "user": {
        "id": "test-user-001",
        "type": "botUserKey"
      }
    }
  }'
```

### 예상 응답

```json
{
  "version": "2.0",
  "template": {
    "outputs": [
      {
        "simpleText": {
          "text": "\"나 사주 봐줘\" 라고 하셨군요.\n\nAI 사주 분석 서비스 연동 준비 중입니다.\n웹에서 직접 이용해 주세요: https://saju-app-rose.vercel.app"
        }
      }
    ]
  }
}
```

### secret 없이 요청 (401 확인)

```bash
curl -X POST https://saju-app-rose.vercel.app/api/kakao/skill \
  -H "Content-Type: application/json" \
  -d '{"version":"2.0","userRequest":{"utterance":"test","user":{"id":"u1","type":"botUserKey"}}}'
```

예상 응답: `{"error":"Unauthorized"}` (HTTP 401)

---

## 아키텍처

```
app/api/kakao/skill/route.ts   ← 엔드포인트 (인증·타임아웃·에러 처리)
lib/kakao-types.ts             ← 카카오 요청/응답 타입
lib/kakao-response.ts          ← 응답 포맷 헬퍼
lib/kakao-history.ts           ← 대화 히스토리 (in-memory, 최근 5턴)
lib/kakao-service.ts           ← LLM/RAG 서비스 레이어 (현재 stub)
```

### LLM 연동 방법

`lib/kakao-service.ts`의 `generateReply` 함수 내부만 교체하면 됩니다:

```typescript
// 현재: stub
return `"${utterance}" 라고 하셨군요...`;

// 교체: 실제 OpenAI 호출
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const res = await client.chat.completions.create({ ... });
return res.choices[0].message.content ?? '';
```

### 대화 히스토리 프로덕션 대체안

현재 in-memory Map은 Vercel cold start 시 초기화됩니다.
프로덕션에서는 `lib/kakao-history.ts`를 아래 중 하나로 교체:

- **Vercel KV** (`@vercel/kv`): `kv.lrange(userId, 0, 9)`
- **Upstash Redis** (`@upstash/redis`): `redis.lrange(userId, 0, 9)`
- **Supabase** (이미 연결됨): `kakao_history` 테이블 추가

---

## 환경변수

`.env.example` 참고. 로컬 개발 시 `.env.local`에 복사하여 사용.
