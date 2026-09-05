---
name: project-tdd-workflow
description: Project-specific TDD guidelines for Gemini Reflection Journal, covering automated execution of RBAC security tests, mood analytics privacy tests, and code assertion rules.
metadata:
  category: TestingAndQuality
---

# Project-Specific TDD & Quality Gate Workflow

## Overview

This skill defines the Test-Driven Development (TDD) workflow, automated security testing standards, and quality assurance gates for the **Gemini Reflection Journal** codebase. All new features, API endpoints, security rules, or refactorings must strictly pass automated verification in the quality gate before being merged or deployed.

---

## Core Quality Gate & Test Suites

The hardened verification pipeline consists of 5 specialized automated check suites:

1. **Firestore Security Rules Static Assertions**: [`scripts/run-rules-tests.ts`](file:///d:/GDG_hackathone/gemini-reflection-journal2/scripts/run-rules-tests.ts) (`npm run test:rules`)
   - 7 static assertions verifying:
     - No hardcoded email checks in `firestore.rules` (SD-1b regression guard).
     - User isolation (`isOwner(userId)`) on `/entries` and `/interactions`.
     - Prevention of user role escalation (blocking non-admins writing `role == "admin"`).
     - Strict admin-only access on `/adminTelemetry` and `/config`.

2. **RBAC & Security Verification Suite**: [`scripts/run-rbac-tests.ts`](file:///d:/GDG_hackathone/gemini-reflection-journal2/scripts/run-rbac-tests.ts) (`npm run test:rbac`)
   - 11 assertions (HTTP integration + static code verification):
     - Unauthenticated request rejection (HTTP 401: missing, malformed, or expired tokens).
     - Non-admin access denial (HTTP 403) and admin access granting (HTTP 200 via custom claims / ADMIN_UIDS).
     - Forged JWT rejection (HTTP 401).
     - Zero `ADMIN_UIDS` in client bundles.
     - Zero hardcoded admin emails across `server.ts`, `firestore.rules`, and `firebase.ts`.
     - **SD-1 Regression Guard**: Absence of email-based authorization fallback (`isEmailAdmin` / `adminEmails`) in `requireAdminAuth`.

3. **Structured Mood Analytics & Privacy Suite**: [`scripts/run-mood-analytics-tests.ts`](file:///d:/GDG_hackathone/gemini-reflection-journal2/scripts/run-mood-analytics-tests.ts) (`npm run test:mood`)
   - 13 assertions (integration + pure unit validation):
     - `/api/entries/analyze` and `/api/analytics/mood` endpoint authentication (HTTP 401).
     - Strict 7-mood category schema enforcement.
     - Valence (`moodScore` [-1, 1]) and intensity ([0, 1]) range bounds and rejection of invalid/NaN payloads.
     - Deterministic aggregation logic (arithmetic mean, zero entries handling, single entry, date filtering).
     - Admin privacy isolation (raw journal content, user IDs, and short summaries never leak into telemetry).
     - Failure resilience (AI failures preserve raw journal entry text).

4. **Dependency Vulnerability Audit**: `npm run audit:deps`
   - Scans dependencies for high and critical vulnerabilities (`npm audit --audit-level=high`).

5. **Secret Pattern Scanner**: [`scripts/scan-secrets.ts`](file:///d:/GDG_hackathone/gemini-reflection-journal2/scripts/scan-secrets.ts) (`npm run scan:secrets`)
   - Scans source trees (`src/`, `server.ts`, `scripts/`) for hardcoded credentials, service account keys, private keys, and unauthorized API keys (excluding public client Web SDK config).

---

## Test Execution Commands

```bash
# Run individual test suites
npm run test:rules      # 7 static Firestore rules assertions
npm run test:rbac       # 11 RBAC & token security assertions
npm run test:mood       # 13 mood analytics & privacy assertions
npm run scan:secrets    # Static secret pattern scanner
npm run audit:deps      # Dependency audit (high/critical)

# Run all test suites
npm test

# Run complete quality gate (Lint + Build + Rules + RBAC + Mood + Audit + Secrets)
npm run verify
```

---

## Key Invariants & Architectural Rules

1. **Deterministic Test Execution**: `server.ts` includes an `isMain` execution guard allowing test scripts to import pure validation and computation helpers (`validateEntryAnalysis`, `computeDeterministicMoodAnalytics`) without triggering unwanted side-effects or port conflicts (`EADDRINUSE: 3000`).
2. **Zero Email Authorization**: Admin status is determined strictly by verified Firebase token claims (`decodedToken.admin === true`) or `ADMIN_UIDS` matching, never by email strings.
3. **Privacy First**: Raw journal text and user identifiers are never stored in or transmitted via administrative telemetry.
4. **Zero Test Swallowing**: Every test script must terminate with `process.exit(1)` upon any failure. Never mask failures or delete assertions to make tests pass.
