# Gemini Reflection Journal

A **privacy-first, AI-powered journaling application** built with **Google Firebase Authentication**, **Cloud Firestore**, the **Gemini API** via a hardened Express proxy, and deployed on **Google Cloud Run**.

This project goes beyond a starter lab - it is a production-grade, full-stack system with a 31-assertion automated quality gate, strict RBAC, an admin telemetry dashboard, multi-turn AI conversations, structured mood analytics, and a containerized Cloud Run deployment pipeline.

---

## Custom Features (Beyond Starter Lab)

### 1. Multi-Turn Conversational Reflection AI
Each journal entry has its own persistent, multi-turn conversation with Gemini. Dialogue history is stored in Firestore under the user's isolated `/users/{uid}/interactions/` path and reloaded on every session. The model receives the full conversation context on each turn - not just the last message.

### 2. 4-Tier Gemini Model Fallback Ladder
The backend automatically falls back across model tiers if the primary model is unavailable or rate-limited:

```
gemini-3.6-flash -> gemini-3.1-flash-lite -> gemini-flash-latest -> gemini-3.7-flash
```

Users experience zero downtime even during model degradation events.

### 3. Cognitive Reframing Studio
4 specialized AI lenses available per journal entry, each backed by a distinct system prompt:

- **Cognitive Reframe** - challenges assumptions and reframes negative thought patterns
- **Micro Action Steps** - extracts the smallest possible next actions from reflections
- **Philosophical Wisdom** - applies Stoic, Existentialist, and Eastern frameworks
- **Divergent Possibilities** - generates unexpected alternatives and creative angles

### 4. Structured AI Synthesis (Auto-Summarization)
On demand, Gemini distills the full dialogue into:

- A 3-6 word entry title
- An executive summary paragraph
- 3 core insight bullets
- An interactive, Firestore-persisted action checklist (checkboxes sync live)
- A primary mood tag with valence/intensity scores

### 5. Structured Mood Analytics with Privacy Isolation
A dedicated `/api/analytics/mood` endpoint aggregates anonymized mood signals across configurable time windows (7d / 30d / 90d / all):

- 7-category mood schema: `joyful`, `grateful`, `reflective`, `anxious`, `sad`, `angry`, `neutral`
- Deterministic average mood score and intensity computation
- Admin-only access - raw journal content is **never** included in analytics responses

### 6. Admin Telemetry Dashboard
A protected admin view (**Admin** button in the navbar) gives admins:

- Aggregate user counts, entry counts, and mood distribution
- User directory management (read-only metadata, no raw journal access)
- System configuration status
- Strict RBAC: requires `admin === true` Firebase custom claim or `ADMIN_UIDS` env var match

### 7. Hardened Express Backend Proxy
All Gemini API calls go through a server-side Express proxy (`server.ts`), ensuring:

- `GEMINI_API_KEY` never reaches the browser
- 10 MB JSON body limit guards against payload flooding
- Null-safe destructuring on every request body - malformed payloads never crash the server
- All `/api/*` routes return JSON only; no HTML error pages leak

### 8. Automated 31-Assertion Quality Gate (`npm run verify`)
A CI-grade quality gate that must pass (exit code 0) before any build or deployment:

| Suite | Assertions | What it covers |
|:---|:---|:---|
| `test:rules` | 7 | Static Firestore rules structural verification |
| `test:rbac` | 11 | Token auth, RBAC, forged JWT, client bundle isolation |
| `test:mood` | 13 | Mood analytics schema, bounds, aggregation, privacy |
| `audit:deps` | - | Zero high/critical npm vulnerabilities |
| `scan:secrets` | - | No hardcoded secrets in source files |

### 9. Containerized Cloud Run Deployment

- **Multi-stage Dockerfile**: builder stage compiles Vite frontend + esbuild server; runner stage contains only production artifacts
- **`GEMINI_API_KEY` from Secret Manager** - never baked into the image
- **`process.env.PORT`** respected - Cloud Run dynamic port injection works correctly
- **`GET /health`** and **`GET /api/health`** return `{"status":"ok"}` for uptime probes
- **Automated `deploy.sh`** script handles API enablement, Secret Manager setup, and deployment in one command

---

## Security Architecture

### RBAC Design

```
Firebase ID Token (verified server-side via Admin SDK)
        |
Custom Claim: decodedToken.admin === true   (set via scripts/set-admin.ts)
  OR
Server-side env: ADMIN_UIDS (comma-separated UIDs, never in client bundle)
        |
Admin access granted (telemetry, user directory, analytics write)
```

No email-based authorization. Email is mutable and non-cryptographic - it was intentionally removed and regression-tested.

### 5-Zone Threat Model

| Zone | Risk | OWASP | Mitigation |
|:---|:---|:---|:---|
| **1. Input Surfaces** | Prompt injection / payload overflow | LLM02 / A03 | 10MB body limit, null-safe destructuring, context slicing |
| **2. Planning and Reasoning** | System prompt override to extract keys | LLM01 | Server-side system role isolation; user text is plain input only |
| **3. Tool Execution** | Model degradation causing outage | LLM04 / A05 | 4-tier automatic fallback ladder |
| **4. Memory and State** | Cross-user Firestore data leakage | A01 | isOwner(userId) rules - admins cannot read journal entries |
| **5. Inter-System Comms** | API key exposure in browser | A02 | All Gemini calls proxied server-side; zero client-side key exposure |

### Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAdmin() {
      return request.auth != null && (
        request.auth.token.admin == true ||
        (exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin')
      );
    }

    function isOwner(userId) {
      return request.auth != null && request.auth.uid == userId;
    }

    match /users/{userId} {
      allow read: if isOwner(userId) || isAdmin();
      allow create: if isAdmin() || (isOwner(userId) && (!('role' in request.resource.data) || request.resource.data.role != 'admin'));
      allow update: if isAdmin() || (isOwner(userId) && (!('role' in request.resource.data) || request.resource.data.role == resource.data.role || request.resource.data.role != 'admin'));
      allow delete: if isOwner(userId) || isAdmin();

      // Journal Entries: STRICT OWNER ISOLATION - admins cannot read entries
      match /entries/{entryId} {
        allow read, write: if isOwner(userId);
      }

      // Chat Interactions: STRICT OWNER ISOLATION
      match /interactions/{interactionId} {
        allow read, write: if isOwner(userId);
      }
    }

    // Aggregated analytics - read for authenticated users, write for admins only
    match /analytics/{docId} {
      allow read: if request.auth != null;
      allow write: if isAdmin();
    }
  }
}
```

---

## Local Development Setup

### Prerequisites

- Node.js 20+
- A Google Gemini API key -> [Get one at aistudio.google.com](https://aistudio.google.com/app/apikey)
- A Firebase project with Authentication and Firestore enabled

### Step 1 - Clone and Install

```bash
git clone <your-repo-url>
cd gemini-reflection-journal2
npm install
```

### Step 2 - Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Required: powers all Gemini AI features
GEMINI_API_KEY="your-gemini-api-key-here"

# Optional: comma-separated Firebase UIDs that get admin access
# Find your UID: Firebase Console -> Authentication -> Users
ADMIN_UIDS="your-firebase-uid-here"

# Optional: explicitly set project ID (defaults to firebase-applet-config.json)
FIREBASE_PROJECT_ID=""
```

### Step 3 - Configure Firebase

Ensure `firebase-applet-config.json` exists with your Firebase Web SDK config:

```bash
cp firebase-applet-config.json.example firebase-applet-config.json
# Edit with your Firebase project values
```

### Step 4 - Add Your Domain to Firebase Auth

Sign-in only works from domains Firebase recognizes.

1. Go to [Firebase Console -> Authentication -> Settings -> Authorized Domains](https://console.firebase.google.com/)
2. Click **Add Domain** and add `localhost`
3. For Cloud Run, also add your `*.run.app` URL after deployment

### Step 5 - Start the Development Server

```bash
npm run dev
```

Open **http://localhost:3000**. The Express server handles both the API (`/api/*`) and serves the React frontend via Vite HMR.

---

## Grant Admin Access

The admin dashboard is only visible to users recognized as admins.

### Option A - Env Var (Fast, dev-friendly)

Add your Firebase UID to `ADMIN_UIDS` in `.env`, then restart the server:

```bash
# Find your UID: open browser DevTools (F12) -> Console, then run:
# Object.keys(localStorage).filter(k=>k.startsWith('firebase:authUser')).map(k=>JSON.parse(localStorage[k]).uid)[0]

ADMIN_UIDS="your-uid-here"
```

Sign out and sign back in for the check to apply.

### Option B - Firebase Custom Claim (Production-grade, permanent)

```bash
npx tsx scripts/set-admin.ts YOUR_FIREBASE_UID
```

This writes `admin: true` directly into the Firebase Auth token. Works in any environment without relying on env vars. Sign out and back in to refresh the token.

To revoke admin access:

```bash
npx tsx scripts/set-admin.ts YOUR_FIREBASE_UID --remove
```

---

## Quality Gate

Run the full automated verification suite before building or deploying:

```bash
npm run verify
```

This runs in sequence:

```
tsc --noEmit            (TypeScript type check)
vite build + esbuild    (production bundle)
test:rules              (7 Firestore rules assertions)
test:rbac               (11 RBAC + token security assertions)
test:mood               (13 mood analytics + privacy assertions)
audit:deps              (npm audit --audit-level=high)
scan:secrets            (no credentials in source files)
```

Run individual suites:

```bash
npm run test:rules      # Firestore rules structure
npm run test:rbac       # RBAC & authentication
npm run test:mood       # Mood analytics & privacy
npm run scan:secrets    # Secret hygiene check
npm run audit:deps      # Dependency vulnerabilities
```

---

## Docker (Local Container Testing)

### Build

```bash
docker build -t gemini-reflection-journal:local .
```

### Smoke Test (no API key needed)

```bash
docker run --rm -p 3000:3000 -e NODE_ENV=production gemini-reflection-journal:local
```

Verify in another terminal:

```bash
curl http://localhost:3000/health      # -> {"status":"ok"} 200
curl http://localhost:3000/api/health  # -> {"status":"ok"} 200
curl -I http://localhost:3000/         # -> 200 text/html
```

### Run with Full AI Features

```bash
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e GEMINI_API_KEY="your-key" \
  -e ADMIN_UIDS="your-uid" \
  gemini-reflection-journal:local
```

---

## Cloud Run Deployment

### Automated (Recommended)

```bash
gcloud config set project YOUR_PROJECT_ID
bash deploy.sh
```

The script automatically:

1. Enables all required Cloud APIs
2. Creates `GEMINI_API_KEY` in Secret Manager (prompts if not yet created)
3. Deploys to Cloud Run (`europe-central2` by default; override with `REGION=us-central1 bash deploy.sh`)
4. Applies the mandatory campaign label `dev-tutorial=cloud-run-ai-challenge`
5. Runs a health check against the live URL

### Manual Step-by-Step

#### 1. Enable APIs

```bash
gcloud services enable run.googleapis.com secretmanager.googleapis.com \
  firestore.googleapis.com generativelanguage.googleapis.com \
  artifactregistry.googleapis.com cloudbuild.googleapis.com
```

#### 2. Store GEMINI_API_KEY in Secret Manager

```bash
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

#### 3. Deploy to Cloud Run

```bash
gcloud run deploy gemini-reflection-journal \
  --source . \
  --region europe-central2 \
  --allow-unauthenticated \
  --port 3000 \
  --set-env-vars="NODE_ENV=production,ADMIN_UIDS=YOUR_FIREBASE_UID" \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest"
```

#### 4. Apply Campaign Label

```bash
gcloud run services update gemini-reflection-journal \
  --update-labels=dev-tutorial=cloud-run-ai-challenge \
  --region=europe-central2
```

#### 5. Add Cloud Run URL to Firebase Auth

```bash
gcloud run services describe gemini-reflection-journal \
  --region=europe-central2 --format="value(status.url)"
```

Copy the hostname (without `https://`) and add it to **Firebase Console -> Authentication -> Settings -> Authorized Domains**.

#### 6. Verify Deployment

```bash
SERVICE_URL=$(gcloud run services describe gemini-reflection-journal \
  --region=europe-central2 --format="value(status.url)")

curl $SERVICE_URL/health                 # -> {"status":"ok"} 200
curl $SERVICE_URL/api/admin/telemetry    # -> 401 Unauthorized (correct)
curl -I $SERVICE_URL/                    # -> 200 text/html
```

### Firebase Admin Credentials on Cloud Run

The app uses **Application Default Credentials (ADC)** - no service account JSON key file is required. The Cloud Run service identity is automatically used by Firebase Admin SDK.

If Firestore access is denied, grant the default compute service account Firestore access:

```bash
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/datastore.user"
```

---

## Functional Verification Walkthrough

### 1. Google Sign-In
- Navigate to the app and click **"Sign in with Google"**
- Complete OAuth consent
- Verify your profile avatar appears in the navbar
- Confirm a user document is created in Firestore under `/users/{uid}`

### 2. Journal Entry and Multi-Turn AI
- Click **"+ New Reflection"** in the navbar
- Write a reflection in the text area and send a message
- Verify Gemini responds with Markdown-formatted, empathetic guidance
- Send a follow-up message - verify the AI maintains full conversation context
- Reload the page - confirm the full conversation history reloads from Firestore

### 3. Auto-Summarization
- After a few turns, click **"Auto-Summarize"**
- Verify Gemini generates: a short title, executive summary, 3 core insights, and an action checklist
- Check and uncheck action items - verify the state persists after page reload

### 4. Cognitive Reframing Studio
- Switch to the **"Brainstorm and Reframe"** tab
- Select a lens (e.g., **Cognitive Reframe**)
- Click **"Generate Structured Perspectives"**
- Verify the AI response is lens-specific and not generic

### 5. Mood Analytics (Admin only)
- Sign in as an admin user
- Click **Admin** in the navbar
- Navigate to the Mood Analytics section
- Verify aggregated mood scores appear without any raw journal content

### 6. Cross-User Data Isolation
- Sign in as User A and create 2 journal entries
- Sign out, then sign in as User B
- Verify User B's journal sidebar is completely empty
- Verify `GET /api/admin/telemetry` without a valid admin token returns HTTP 401

---

## Tech Stack

| Layer | Technology |
|:---|:---|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS v4 |
| AI | Google Gemini API via @google/genai (server-side only) |
| Backend | Express 4 + Node.js (TypeScript -> esbuild CJS bundle) |
| Auth | Firebase Authentication (Google Sign-In + Email/Password) |
| Database | Cloud Firestore (Enterprise edition, custom database ID) |
| Containerization | Docker (multi-stage, node:22-slim) |
| Deployment | Google Cloud Run + Secret Manager |
| Quality Gate | Custom 31-assertion test suite (tsx scripts, no external test framework) |

---

## Project Structure

```
src/
  components/
    AdminDashboard.tsx        Admin telemetry + user directory
    Dashboard.tsx             Main journal workspace + AI chat
    AuthLanding.tsx           Google + Email/Password sign-in UI
    MoodAnalyticsSection.tsx  Mood charts and analytics display
    Navbar.tsx                Navigation bar and admin toggle
    ThreatModelModal.tsx      In-app security audit display
  lib/
    firebase.ts               All Firebase SDK interactions
  App.tsx

scripts/
  run-rbac-tests.ts           11 RBAC security assertions
  run-mood-analytics-tests.ts 13 mood analytics and privacy assertions
  run-rules-tests.ts          7 Firestore rules assertions
  scan-secrets.ts             Secret pattern scanner
  set-admin.ts                Admin provisioning script

server.ts                     Express backend proxy (1,300+ lines)
firestore.rules               Firestore security rules
Dockerfile                    Multi-stage production container
deploy.sh                     One-command Cloud Run deploy script
.env.example                  Environment variable template
```
