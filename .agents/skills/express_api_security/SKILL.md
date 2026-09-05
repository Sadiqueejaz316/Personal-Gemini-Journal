---
name: express-api-security
description: Security guidelines and OWASP LLM risk mitigations for the Gemini Reflection Journal Express backend proxy (server.ts), payload hygiene, and secret key isolation.
metadata:
  category: Security
---

# Express API Security & Backend Proxy Guidelines

## Overview

This skill establishes security, key protection, and payload hygiene standards for the **Gemini Reflection Journal** Express proxy backend ([`server.ts`](file:///d:/GDG_hackathone/gemini-reflection-journal2/server.ts)).

---

## 5-Zone Security Principles

### 1. Zero Client Key Exposure (Inter-System Communication)
- `GEMINI_API_KEY` MUST remain strictly on the server side (`process.env.GEMINI_API_KEY`).
- Never expose API keys, admin secrets, or internal service credentials in frontend client code (`src/`) or Vite environment variables (`VITE_...`).
- Secret keys are mounted dynamically in Cloud Run via GCP Secret Manager (`GEMINI_API_KEY=GEMINI_API_KEY:latest`).

### 2. Request Deserialization & Payload Limits (Input Surface Protection)
- Configure top-level JSON body parsing limits explicitly: `app.use(express.json({ limit: '10mb' }))`.
- Perform context slicing and payload hygiene on incoming requests before invoking Gemini API endpoints to prevent server buffer overflows (OWASP LLM02).

### 3. Strict System Prompt Isolation (Prompt Injection Defense)
- Isolate system instructions within backend configuration. Treat user input strictly as unstructured plain text parameters (OWASP LLM01).
- Prevent model instruction override attempts by sanitizing user-provided prompts.

### 4. Automated Multi-Tier Fallback Ladder (Resilience)
- Maintain resilient API fallback execution to prevent rate limit outages (OWASP LLM04):
  `gemini-3.6-flash` &rarr; `gemini-3.1-flash-lite` &rarr; `gemini-flash-latest` &rarr; `gemini-3.7-flash`.

### 5. Defensive Null-Safe Payload Hygiene
- Clean all Firestore payloads of `undefined` values before persistence to avoid runtime database exceptions.
- Wrap data destructuring in null-safe defaults.
