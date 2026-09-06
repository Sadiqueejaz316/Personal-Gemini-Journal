---
name: cloud-run-verification
description: Deployment verification guidelines for Google Cloud Run, Secret Manager bindings, container port configuration, and mandatory campaign labeling for Gemini Reflection Journal.
metadata:
  category: DevOpsAndDeployment
---

# Cloud Run Deployment & Verification — Gemini Reflection Journal

## Overview

This skill documents the validated, step-by-step procedure for building, deploying, and verifying the **Gemini Reflection Journal** on **Google Cloud Run**.

Architecture: React (Vite) + Express proxy (esbuild) served as a single Node.js container.
Production entrypoint: `node dist/server.cjs`
Port: `process.env.PORT` (Cloud Run injects this; defaults to `3000`)

---

## Prerequisites

- Docker Desktop installed and running
- Google Cloud SDK (`gcloud`) authenticated: `gcloud auth login`
- Target GCP project set: `gcloud config set project YOUR_PROJECT_ID`
- Firebase Admin credentials: use Application Default Credentials (ADC) via Cloud Run service identity - **no JSON key file needed or should be created**

---

## Full Deployment Pipeline

### Step 1 - Quality Gate (always run first)

```bash
npm run verify
```

Expected: exit code 0. All 31 checks must pass before building or deploying.

---

### Step 2 - Build Docker Image

```bash
docker build -t gemini-reflection-journal:local .
```

Multi-stage build: `builder` stage installs all deps and runs `npm run build` (Vite + esbuild).
`runner` stage copies only `dist/`, production `node_modules/`, `firebase-applet-config.json`.
No secrets are baked into the image.

---

### Step 3 - Local Container Smoke Test

```bash
docker run --rm -p 3000:3000 -e NODE_ENV=production gemini-reflection-journal:local
```

In a second terminal, verify:

```bash
curl http://localhost:3000/health
# Expected: {"status":"ok"} HTTP 200

curl http://localhost:3000/api/health
# Expected: {"status":"ok"} HTTP 200

curl -I http://localhost:3000/
# Expected: HTTP 200 (serves index.html)
```

Verify PORT env var is respected:

```bash
docker run --rm -p 8080:8080 -e NODE_ENV=production -e PORT=8080 gemini-reflection-journal:local
curl http://localhost:8080/health
# Expected: {"status":"ok"} HTTP 200
```

Stop the container before proceeding.

---

### Step 4 - Enable Required Google Cloud APIs

```bash
gcloud services enable run.googleapis.com secretmanager.googleapis.com firestore.googleapis.com generativelanguage.googleapis.com artifactregistry.googleapis.com
```

---

### Step 5 - Configure Secret Manager

```bash
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"
echo -n "YOUR_ACTUAL_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")
gcloud secrets add-iam-policy-binding GEMINI_API_KEY --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" --role="roles/secretmanager.secretAccessor"
```

---

### Step 6 - Push to Artifact Registry

```bash
PROJECT_ID=$(gcloud config get-value project)
REGION=us-central1

gcloud artifacts repositories create gemini-reflection-journal --repository-format=docker --location=$REGION

docker tag gemini-reflection-journal:local $REGION-docker.pkg.dev/$PROJECT_ID/gemini-reflection-journal/app:latest
gcloud auth configure-docker $REGION-docker.pkg.dev
docker push $REGION-docker.pkg.dev/$PROJECT_ID/gemini-reflection-journal/app:latest
```

---

### Step 7 - Deploy to Cloud Run

```bash
PROJECT_ID=$(gcloud config get-value project)
REGION=us-central1

gcloud run deploy gemini-reflection-journal --image=$REGION-docker.pkg.dev/$PROJECT_ID/gemini-reflection-journal/app:latest --region=$REGION --allow-unauthenticated --port=3000 --set-env-vars="NODE_ENV=production,ADMIN_UIDS=YOUR_FIREBASE_ADMIN_UID" --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest"
```

Firebase Admin SDK uses Application Default Credentials automatically via the Cloud Run service account identity.
No GOOGLE_APPLICATION_CREDENTIALS env var or JSON key file is needed.

---

### Step 8 - Apply Mandatory Campaign Labeling

```bash
gcloud run services update gemini-reflection-journal --update-labels=dev-tutorial=cloud-run-ai-challenge --region=us-central1
```

---

### Step 9 - Post-Deployment Verification

```bash
SERVICE_URL=$(gcloud run services describe gemini-reflection-journal --region=us-central1 --format="value(status.url)")

curl $SERVICE_URL/health
# Expected: {"status":"ok"} HTTP 200

curl $SERVICE_URL/api/health
# Expected: {"status":"ok"} HTTP 200

curl -I $SERVICE_URL/
# Expected: HTTP 200 Content-Type: text/html

curl $SERVICE_URL/api/admin/telemetry
# Expected: HTTP 401 Unauthorized

curl -X POST $SERVICE_URL/api/gemini/chat -H "Content-Type: application/json" -d "{}"
# Expected: HTTP 401 Unauthorized
```

---

## Secret Inventory

| Variable | How to provide | Notes |
|:---|:---|:---|
| GEMINI_API_KEY | --set-secrets (Secret Manager) | Server-side only. Never use VITE_GEMINI_API_KEY. |
| ADMIN_UIDS | --set-env-vars or Secret Manager | Comma-separated Firebase UIDs for bootstrap admin. |
| NODE_ENV | --set-env-vars="NODE_ENV=production" | Required for static file serving mode. |
| FIREBASE_PROJECT_ID | Optional --set-env-vars | Defaults to value in firebase-applet-config.json. |

---

## Firebase Admin Credentials

The app uses Application Default Credentials (ADC):

  Cloud Run service identity
        v
  GCP metadata server (automatic)
        v
  Firebase Admin SDK (initializeApp({ projectId }))

Do NOT create or commit a service account JSON key file.
Grant the default Compute Engine service account roles/datastore.user in IAM if Firestore access is denied.

---

## Key Invariants

- PORT is read from process.env.PORT (Cloud Run injects this; server does not hardcode it)
- GET /health and GET /api/health return {"status":"ok"} with no secrets or internal state exposed
- GEMINI_API_KEY is server-side only and is never in VITE_* variables or frontend bundles
- npm run verify must pass (exit 0) before every build or deployment