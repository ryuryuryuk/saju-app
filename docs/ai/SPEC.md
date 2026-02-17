# SPEC.md — 통합 분석 MVP Specification

> Last updated: 2026-02-15
> Status: Implementation in progress

---

## 1. Product Overview

**Name**: 통합 분석 (Integrated Human & Relationship Briefing)

**Goal**: A premium integrated analysis flow that combines Saju (사주), KakaoTalk relationship analysis, AI conversation log analysis, and face reading (관상) into a single, evidence-based report worth paying for.

**Key Principle**: Evidence → Interpretation → Action. Data-driven, not vague fortune-telling.

**Existing Features (KEEP AS-IS)**:
1. AI 사주 분석 (`/saju` + `/api/saju`)
2. 관계 분석 (`/relationship` + `/api/relationship`)
3. AI 대화 분석 (`/ai-chat` + `/api/ai-chat-analysis`)
4. 관상 분석 (`/face` + `/api/face-analysis`)

**New Feature**: 통합 분석 (`/integrated` + `/api/integrated`)

---

## 2. New Pages & Routes

| Route | Type | Description |
|-------|------|-------------|
| `/` (home) | Page update | Add full-width "통합 분석" card at bottom |
| `/integrated` | New page | Multi-step wizard for integrated analysis |
| `/api/integrated` | New API | Backend synthesis endpoint |

---

## 3. Wizard Flow (`/integrated`)

### Step 1: Saju Inputs (Required)
- Birth year, month, day, hour, minute
- Gender (남성/여성)
- Concern question (optional free text)

### Step 2: KakaoTalk Chat (Optional)
- Text paste area OR file upload (.txt)
- Relationship type selector (romantic/friend/family/colleague)
- Anonymization checkbox (default: on)

### Step 3: AI Conversation Log (Optional)
- Text paste area OR file upload (.txt/.json)

### Step 4: Face Image (Optional)
- Image upload (JPG/PNG, max 5MB)
- Consent checkbox + disclaimer required before upload

### Step 5: Generate & Display Report
- Loading animation with meaningful progress steps
- Premium structured report display
- "Clear All Data" button
- "Restart" button

---

## 4. API Contract: `POST /api/integrated`

**Content-Type**: `multipart/form-data`

### Request Fields
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| birthYear | string | Yes | Birth year |
| birthMonth | string | Yes | Birth month |
| birthDay | string | Yes | Birth day |
| birthHour | string | Yes | Birth hour (24h format) |
| birthMinute | string | No | Birth minute (default "0") |
| gender | string | Yes | "남성" or "여성" |
| question | string | No | User's concern question |
| kakaoText | string | No | KakaoTalk chat export text |
| relationshipType | string | No | romantic/friend/family/colleague |
| aiChatText | string | No | AI conversation log text |
| faceImage | File | No | Face photo (JPG/PNG, max 5MB) |
| faceConsent | string | No | "true" if user consented to face analysis |

### Response (success)
```json
{
  "success": true,
  "report": {
    "executiveSummary": {
      "diagnosis": "1-2 line relationship/personality diagnosis",
      "scores": {
        "balance": 75,
        "emotionalSafety": 60,
        "repairAbility": 80,
        "investment": 65,
        "attachmentLoop": 45,
        "futureAlignment": 70
      },
      "scoreExplanations": {
        "balance": "short explanation",
        "emotionalSafety": "short explanation",
        "repairAbility": "short explanation",
        "investment": "short explanation",
        "attachmentLoop": "short explanation",
        "futureAlignment": "short explanation"
      },
      "risks": ["risk1", "risk2", "risk3"],
      "opportunities": ["opp1", "opp2", "opp3"],
      "actions48h": ["action1", "action2", "action3"]
    },
    "deepDive": [
      {
        "claim": "claim text",
        "evidence": "quote or metric",
        "interpretation": "interpretation text",
        "action": "recommended action"
      }
    ],
    "actionPlan": {
      "hours48": ["action1", "action2"],
      "week1": ["action1", "action2"],
      "week4": ["action1", "action2"],
      "scripts": {
        "apology": "script text",
        "boundary": "script text",
        "request": "script text",
        "repair": "script text",
        "closure": "script text"
      }
    },
    "concernResponse": {
      "question": "user's original question",
      "scenarios": {
        "optimistic": { "conditions": "", "evidence": "", "actions": "" },
        "neutral": { "conditions": "", "evidence": "", "actions": "" },
        "pessimistic": { "conditions": "", "evidence": "", "actions": "" }
      }
    },
    "sajuSummary": "saju context summary",
    "dataSources": ["saju", "kakao", "aiChat", "face"],
    "disclaimer": "entertainment disclaimer"
  }
}
```

### Response (error)
```json
{
  "success": false,
  "error": "Error message"
}
```

---

## 5. Data Flow

```
[User fills wizard steps 1-4]
        │
        ▼
[POST /api/integrated (FormData)]
        │
        ├── Step A: Saju Calculation (REQUIRED)
        │   ├── External Saju API (beta-ybz6.onrender.com)
        │   ├── analyzeSajuStructure() from lib/saju-structure.js
        │   └── analyzeSajuYukchin() from lib/yukchin.js
        │
        ├── Step B: KakaoTalk Parse (if provided)
        │   ├── Parse messages (mobile/PC/new patterns)
        │   ├── Anonymize sender names
        │   └── Compute conversation stats
        │
        ├── Step C: AI Chat Parse (if provided)
        │   └── Extract user messages (JSON + text patterns)
        │
        ├── Step D: Face Image (if provided + consented)
        │   └── Convert to base64 for GPT-4o Vision
        │
        └── Step E: GPT Synthesis (all data → structured report)
            ├── System prompt enforcing JSON report schema
            ├── All collected data contexts
            ├── Face image via vision API (if provided)
            └── Returns structured JSON report
                    │
                    ▼
            [Premium Report displayed in UI]
```

---

## 6. Report Adaptation by Data Sources

| Data Provided | Report Focus |
|--------------|--------------|
| Saju only | Personality deep-dive, life timing, self-understanding |
| Saju + Kakao | Relationship dynamics + saju personality context |
| Saju + AI Chat | Thought patterns + personality alignment |
| Saju + Face | Personality + physiognomy cross-reference |
| All 4 sources | Full premium briefing with cross-validation |

When optional data is missing, the report still provides value from saju analysis alone but clearly indicates which sections are enhanced by additional data.

---

## 7. Data Policy & Safety

- All processing in-memory, no persistent storage of user data
- Face images: base64 in memory → GPT-4o → discarded
- Chat logs: sanitized → analyzed → discarded
- Anonymization on by default for KakaoTalk data
- "Clear All Data" button resets all client-side state
- Face analysis NEVER infers: race, ethnicity, religion, politics, health, sexual orientation
- Consent language displayed before each optional upload
- Disclaimer: entertainment/self-reflection purpose only

---

## 8. UI Design

- Full-width card on home page (gradient, visually premium)
- Step indicator showing progress (Step 1/4, 2/4, etc.)
- "Skip" buttons for optional steps (steps 2-4)
- Mobile-first responsive layout
- Loading animation with 5 meaningful progress steps
- Report sections with clear visual hierarchy
- Score metrics as colored progress bars
- Evidence with quote styling
- Scenario cards for concern response
- Script sections in expandable accordions
