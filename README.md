# Gemini Reflection Journal

A user-authenticated, privacy-first reflection and journaling application built with **Google Firebase Authentication**, **Cloud Firestore**, and the **Gemini 3.6 Flash API** via a resilient Express proxy.

---

## 🌟 Key Features

1. **Federated Identity & User Isolation**: Direct Google Sign-In via Firebase Auth. User interactions and documents are quarantined strictly to `/users/{userId}/...` path partitions.
2. **Resilient Gemini 3.6 Flash Ladder**: Multi-turn dialogue with automated model fallback (`gemini-3.6-flash` &rarr; `gemini-3.1-flash-lite` &rarr; `gemini-flash-latest` &rarr; `gemini-3.7-flash`).
3. **Structured AI Synthesis**: Distills journal entries and conversation turns into executive summaries, key takeaways, sentiment mood tags, and interactive actionable checklists.
4. **Cognitive Reframing Studio**: 4 specialized exploratory lenses (Cognitive Reframe, Micro Action Steps, Philosophical Wisdom, Divergent Possibilities).
5. **Real-time Firestore Synchronization**: Persistent multi-turn dialogue history with zero-crash undefined-stripping payload hygiene.

---

## 🔒 5-Zone Threat Summary Table

| Threat Zone | Identified Scenario / Risk | OWASP Vector | Countermeasure / Mitigation Implemented |
| :--- | :--- | :--- | :--- |
| **1. Input Surfaces** | Malicious prompt injections & massive payloads overflowing server buffers | OWASP LLM02 / A03 | 10MB JSON body limit, defensive null-safe destructuring, and context slicing before Gemini invocation. |
| **2. Planning & Reasoning** | System prompt override attempts to extract internal instructions or credentials | OWASP LLM01 | Strict system role isolation in server-side `@google/genai` config; user text is treated strictly as plain input. |
| **3. Tool Execution** | Model degradation or API rate limits causing user outage | OWASP LLM04 / A05 | Automated 4-tier Fallback Ladder (`gemini-3.6-flash` &rarr; `gemini-3.1-flash-lite` &rarr; `gemini-flash-latest` &rarr; `gemini-3.7-flash`). |
| **4. Memory & State** | Cross-user data leakage or unauthorized document tampering in Firestore | OWASP A01 | Owner-bound Firestore Security Rules enforcing `request.auth.uid == userId` on all paths. Zero insecure defaults. |
| **5. Inter-System Communication** | Exposure of `GEMINI_API_KEY` in browser network inspect tabs | OWASP A02 | Full-stack Express proxy (`/api/gemini/*`). Secret keys remain strictly on the server; zero browser exposure. |

---

## 🛡️ Cloud Firestore Security Rules

Deploy these rules to guarantee strict per-user data isolation:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Match any document in the user's isolated document tree
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      match /entries/{entryId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
      
      match /interactions/{interactionId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }

      match /{allSubpaths=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

---

## 🚀 Google Cloud Setup & Secret Manager Bindings

### 1. Prerequisites & API Enablement
Ensure you have the `gcloud` CLI installed and authenticated to your Google Cloud project:

```bash
# Set your active project ID
gcloud config set project YOUR_PROJECT_ID

# Enable required Google Cloud APIs
gcloud services enable \
  run.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com \
  generativelanguage.googleapis.com
```

### 2. Secret Manager Configuration
Securely store your Gemini API key:

```bash
# Create and populate the secret
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

# Grant the Cloud Run compute service account access to read the secret
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")

gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 🚢 Cloud Run Deployment Flow

### 1. Build and Deploy to Cloud Run

```bash
gcloud run deploy gemini-reflection-journal \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest" \
  --port 3000
```

### 2. Required Campaign Labeling
To register the service for automated challenge verification, apply the mandatory campaign label:

```bash
gcloud run services update gemini-reflection-journal \
  --update-labels=dev-tutorial=cloud-run-ai-challenge \
  --region=us-central1
```

---

## 🧪 Functional Verification & Walkthrough Test Cases

1. **Google OAuth Authentication**:
   - Navigate to the landing page and click **"Sign in with Google"**.
   - Complete Google OAuth consent.
   - Verify that your profile displays in the navigation bar and the user profile document is initialized in Firestore under `/users/{uid}`.

2. **Multi-Turn Reflection Dialogue with Gemini**:
   - Write a journal reflection in the scratchpad and send a message.
   - Verify Gemini 3.6 Flash streams a thoughtful, empathetic response formatted with Markdown headings and highlights.
   - Check that subsequent conversational turns maintain context and persist to Cloud Firestore.

3. **Auto-Summarization & Takeaway Extraction**:
   - Click **"Auto-Summarize"** in the reflection studio.
   - Verify Gemini parses the entire dialogue to generate a 3-6 word title, executive summary, 3 core insights, and an actionable checklist.
   - Check or uncheck action items to test live Firestore toggle persistence.

4. **Cognitive Reframing & Brainstorming**:
   - Switch to the **"Brainstorm & Reframe"** tab.
   - Choose a perspective lens (e.g., *🔄 Cognitive Reframe* or *⚡ Micro Action Steps*).
   - Click **"Generate Structured Perspectives"** and verify tailored guidance is provided.

5. **Cross-User Data Isolation Verification**:
   - Log in with Account A and create 2 entries.
   - Log out and log in with Account B.
   - Confirm Account B's history sidebar is completely isolated and cannot read or query Account A's documents.
