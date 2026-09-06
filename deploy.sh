#!/usr/bin/env bash
set -e

echo "=== Gemini Reflection Journal - Cloud Shell Deploy Script ==="

# 1. Check Project ID
PROJECT_ID=$(gcloud config get-value project 2>/dev/null || true)
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "(unset)" ]; then
  echo "Error: GCP project is not set. Run 'gcloud config set project YOUR_PROJECT_ID' first."
  exit 1
fi
echo "Active GCP Project: $PROJECT_ID"

REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-gemini-reflection-journal}"
echo "Target Region: $REGION"
echo "Service Name: $SERVICE_NAME"

# 2. Enable Required APIs
echo "Enabling Google Cloud APIs..."
gcloud services enable \
  run.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com \
  generativelanguage.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com

# 3. Check Secret Manager for GEMINI_API_KEY
if ! gcloud secrets describe GEMINI_API_KEY >/dev/null 2>&1; then
  echo "WARNING: Secret 'GEMINI_API_KEY' not found in Secret Manager."
  read -p "Enter your Gemini API Key (or press Enter to skip if already set): " INPUT_KEY
  if [ -n "$INPUT_KEY" ]; then
    echo -n "$INPUT_KEY" | gcloud secrets create GEMINI_API_KEY --replication-policy="automatic" --data-file=-
    PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
    gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
      --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
      --role="roles/secretmanager.secretAccessor"
  else
    echo "Please create secret GEMINI_API_KEY before running the app."
  fi
fi

# 4. Build & Deploy to Cloud Run
echo "Deploying service to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --port 3000 \
  --set-env-vars="NODE_ENV=production" \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest" \
  --update-labels="dev-tutorial=cloud-run-ai-challenge"

# 5. Post-Deployment Health Check
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format="value(status.url)")
echo "Service deployed successfully!"
echo "Service URL: $SERVICE_URL"

echo "Verifying Health Endpoint..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$SERVICE_URL/health" || true)
if [ "$HTTP_STATUS" = "200" ]; then
  echo "SUCCESS: Health check returned 200 OK!"
else
  echo "WARNING: Health check returned HTTP $HTTP_STATUS"
fi

echo "=== Deployment Complete ==="
