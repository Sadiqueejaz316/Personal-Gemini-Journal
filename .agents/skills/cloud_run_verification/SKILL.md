---
name: cloud-run-verification
description: Deployment verification guidelines for Google Cloud Run, Secret Manager bindings, container port configuration, and mandatory campaign labeling for Gemini Reflection Journal.
metadata:
  category: DevOpsAndDeployment
---

# Cloud Run Deployment Verification Guidelines

## Overview

This skill provides step-by-step procedures for deploying, binding secrets, and verifying the **Gemini Reflection Journal** application on **Google Cloud Run**.

---

## Deployment & Verification Workflow

### 1. Enable Google Cloud APIs
Ensure required APIs are enabled for the target GCP project:
```bash
gcloud services enable \
  run.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com \
  generativelanguage.googleapis.com
```

### 2. Configure Secret Manager Access
Store API key securely and grant access to the Cloud Run compute service account:
```bash
# Create secret
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

# Grant IAM access to default compute service account
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 3. Deploy Service to Cloud Run
Deploy container specifying port 3000 and mounting Secret Manager key:
```bash
gcloud run deploy gemini-reflection-journal \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest" \
  --port 3000
```

### 4. Apply Mandatory Campaign Labeling
Update service labels for campaign verification:
```bash
gcloud run services update gemini-reflection-journal \
  --update-labels=dev-tutorial=cloud-run-ai-challenge \
  --region=us-central1
```

### 5. Health & Endpoint Verification
Verify active service status:
- Express backend endpoints (`/api/gemini/*`, `/api/admin/telemetry`) respond properly.
- Container binds cleanly to environment port `PORT=3000`.
- Health check returns HTTP 200 without exposing internal secrets.
