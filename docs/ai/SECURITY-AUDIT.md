# Security Audit Report — saju-app

**Audit Date:** 2026-02-14
**Scope:** Full codebase, branch `develop`
**Auditor:** Claude Opus 4.6 (automated static analysis)

---

## Summary

Overall risk: **MEDIUM** (after P0 fix applied)

The app has strong foundational practices (secrets in env vars, .gitignore covers `.env*`, no XSS vectors, proper upload validation, no permanent data storage). One BLOCKER was found and fixed during this audit.

---

## Findings

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | PASS | `.gitignore` covers `.env*` files | No action needed |
| 2 | PASS | No hardcoded API keys in source code | No action needed |
| 3 | ~~BLOCKER~~ | Debug endpoint exposes stack traces | **FIXED** — gated behind `NODE_ENV !== 'production'` |
| 4 | HIGH | No rate limiting on API routes | Documented for post-MVP |
| 5 | WARNING | Excessive `console.log` in saju route (user PII) | Documented for post-MVP |
| 6 | WARNING | `/api/saju` lacks input validation | Documented for post-MVP |
| 7 | WARNING | Error messages may leak internal details | Documented for post-MVP |
| 8 | PASS | No XSS vectors (`dangerouslySetInnerHTML` not used) | No action needed |
| 9 | PASS | Upload validation is proper (size, MIME, extension) | No action needed |
| 10 | PASS | CORS not misconfigured (same-origin default) | No action needed |
| 11 | PASS | User data not stored permanently | No action needed |
| 12 | WARNING | Supabase service key used without RLS context | Acceptable for current read-only use |
| 13 | WARNING | Prompt injection surface on text inputs | Mitigated by JSON-only output format |

---

## Fix Applied (BLOCKER #3)

**File:** `app/api/saju/debug/route.js`

Added production gate:
```javascript
if (process.env.NODE_ENV === 'production') {
  return Response.json({ error: 'Not available in production' }, { status: 404 });
}
```

---

## Post-MVP Recommendations (Priority Order)

1. **Add rate limiting** — per-IP, 10-20 req/min on all `/api/*` routes
2. **Validate `/api/saju` inputs** — type check birth fields, cap question length, apply `sanitizeText()`
3. **Sanitize error messages** — return generic messages to clients, log details server-side only
4. **Gate production logging** — wrap `console.log` in saju route behind `NODE_ENV === 'development'`
5. **Strengthen prompt injection defense** — add detection patterns to `sanitizeText()`
6. **Run `npm audit`** — check dependency tree for known CVEs
