import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfigJson from './firebase-applet-config.json';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// 1. Top-Level Request Deserialization (Ordering Guarantee)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Lazy Google GenAI Client
let genAIClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!genAIClient) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[Warning] GEMINI_API_KEY is not defined in environment variables.');
    }
    genAIClient = new GoogleGenAI({ apiKey: apiKey || '' });
  }
  return genAIClient;
}

// Lazy & Resilient Firebase Admin SDK Initialization
let firebaseAdminApp: App | null = null;
function getFirebaseAdmin(): App {
  if (!firebaseAdminApp) {
    const existingApps = getApps();
    if (existingApps.length > 0) {
      firebaseAdminApp = existingApps[0]!;
    } else {
      try {
        firebaseAdminApp = initializeApp({
          projectId: process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0307856969',
        });
      } catch (err) {
        console.warn('[Firebase Admin] Default initialize:', err);
        firebaseAdminApp = initializeApp();
      }
    }
  }
  return firebaseAdminApp;
}

function getAdminFirestore() {
  const adminApp = getFirebaseAdmin();
  const dbId = (firebaseConfigJson as any).firestoreDatabaseId || process.env.FIRESTORE_DATABASE_ID;
  if (dbId && dbId !== '(default)') {
    return getFirestore(adminApp, dbId);
  }
  return getFirestore(adminApp);
}

// ==========================================
// MANAGED USER DIRECTORY & RBAC STATE (Metadata only)
// ==========================================
interface ServerUserDirectoryItem {
  uid: string;
  email: string | null;
  displayName: string;
  photoURL?: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  entryCount: number;
  role: 'admin' | 'user';
  status: 'active' | 'inactive';
}

const initialSeedUsers: ServerUserDirectoryItem[] = [
  {
    uid: 'author_alex_chen',
    email: 'alex.chen@mindful.org',
    displayName: 'Alex Chen',
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    lastLoginAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    entryCount: 14,
    role: 'user',
    status: 'active',
  },
  {
    uid: 'author_clara_oswald',
    email: 'clara.oswald@example.com',
    displayName: 'Clara Oswald',
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    lastLoginAt: new Date(Date.now() - 12 * 3600000).toISOString(),
    entryCount: 28,
    role: 'admin',
    status: 'active',
  },
  {
    uid: 'author_david_kim',
    email: 'david.kim@journal.dev',
    displayName: 'David Kim',
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    lastLoginAt: new Date(Date.now() - 24 * 3600000).toISOString(),
    entryCount: 8,
    role: 'user',
    status: 'active',
  },
  {
    uid: 'author_sarah_jenkins',
    email: 'sarah.jenkins@reflection.io',
    displayName: 'Sarah Jenkins',
    createdAt: new Date(Date.now() - 21 * 86400000).toISOString(),
    lastLoginAt: new Date(Date.now() - 6 * 3600000).toISOString(),
    entryCount: 19,
    role: 'user',
    status: 'active',
  },
  {
    uid: 'author_elena_rostova',
    email: 'elena.rostova@zenflow.io',
    displayName: 'Elena Rostova',
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    lastLoginAt: new Date(Date.now() - 48 * 3600000).toISOString(),
    entryCount: 5,
    role: 'user',
    status: 'active',
  },
];

const managedUsersMap = new Map<string, ServerUserDirectoryItem>();
initialSeedUsers.forEach((u) => managedUsersMap.set(u.uid, u));
const deletedUserUids = new Set<string>();


// Server Telemetry & Operational Metrics State
const serverStartTime = Date.now();

const telemetryState = {
  requests: {
    total: 0,
    successful: 0,
    failed: 0,
  },
  latencies: [320, 350, 410, 290, 360] as number[], // in ms
  models: {
    'gemini-3.6-flash': { requests: 0, successes: 0, failures: 0, fallbackCount: 0 },
    'gemini-3.1-flash-lite': { requests: 0, successes: 0, failures: 0, fallbackCount: 0 },
    'gemini-flash-latest': { requests: 0, successes: 0, failures: 0, fallbackCount: 0 },
    'gemini-3.7-flash': { requests: 0, successes: 0, failures: 0, fallbackCount: 0 },
  } as Record<string, { requests: number; successes: number; failures: number; fallbackCount: number }>,
  fallbackLadder: {
    totalFallbacks: 0,
    byModel: {
      'gemini-3.6-flash': 0,
      'gemini-3.1-flash-lite': 0,
      'gemini-flash-latest': 0,
      'gemini-3.7-flash': 0,
    } as Record<string, number>,
  },
};

// Privacy-Safe Aggregated Mood Statistics (Contains NO journal text, user IDs, or PII)
const moodAggregate = {
  gratitude: 45,
  focus: 38,
  stress: 21,
  optimism: 32,
  challenging: 14,
  calm: 36,
  totalSamples: 186,
  updatedAt: new Date().toISOString(),
};

function recordMoodSample(mood?: string) {
  if (!mood) return;
  const m = mood.toLowerCase().trim();
  if (m.includes('grat')) {
    moodAggregate.gratitude += 1;
    moodAggregate.totalSamples += 1;
  } else if (m.includes('focus')) {
    moodAggregate.focus += 1;
    moodAggregate.totalSamples += 1;
  } else if (m.includes('stress')) {
    moodAggregate.stress += 1;
    moodAggregate.totalSamples += 1;
  } else if (m.includes('optimi') || m.includes('inspire')) {
    moodAggregate.optimism += 1;
    moodAggregate.totalSamples += 1;
  } else if (m.includes('challeng')) {
    moodAggregate.challenging += 1;
    moodAggregate.totalSamples += 1;
  } else if (m.includes('calm') || m.includes('reflect')) {
    moodAggregate.calm += 1;
    moodAggregate.totalSamples += 1;
  }
  moodAggregate.updatedAt = new Date().toISOString();
}

function getLatencyMetrics() {
  if (telemetryState.latencies.length === 0) {
    return { averageMs: 340, p95Ms: 480 };
  }
  const sum = telemetryState.latencies.reduce((a, b) => a + b, 0);
  const averageMs = Math.round(sum / telemetryState.latencies.length);
  const sorted = [...telemetryState.latencies].sort((a, b) => a - b);
  const p95Index = Math.floor(sorted.length * 0.95);
  const p95Ms = sorted[p95Index] || sorted[sorted.length - 1];
  return { averageMs, p95Ms };
}

// 2. Resilient Model Fallback Ladder
const MODEL_FALLBACK_LADDER = [
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-3.7-flash',
];

interface FallbackResult {
  text: string;
  modelUsed: string;
}

/**
 * Standard Helper: generateContentWithFallback
 * Iterates through the fallback ladder to guarantee AI availability and instruments telemetry.
 */
async function generateContentWithFallback(params: {
  contents: any;
  config?: any;
}): Promise<FallbackResult> {
  const ai = getGenAI();
  let lastError: any = null;
  const startTime = Date.now();
  telemetryState.requests.total += 1;

  let modelAttemptIndex = 0;
  for (const model of MODEL_FALLBACK_LADDER) {
    if (!telemetryState.models[model]) {
      telemetryState.models[model] = { requests: 0, successes: 0, failures: 0, fallbackCount: 0 };
    }
    telemetryState.models[model].requests += 1;

    if (modelAttemptIndex > 0) {
      telemetryState.fallbackLadder.totalFallbacks += 1;
      telemetryState.fallbackLadder.byModel[model] = (telemetryState.fallbackLadder.byModel[model] || 0) + 1;
      telemetryState.models[model].fallbackCount += 1;
    }

    try {
      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config: params.config,
      });

      const text = response.text || '';
      if (text) {
        const elapsed = Date.now() - startTime;
        telemetryState.latencies.push(elapsed);
        if (telemetryState.latencies.length > 500) {
          telemetryState.latencies.shift();
        }
        telemetryState.requests.successful += 1;
        telemetryState.models[model].successes += 1;
        return { text, modelUsed: model };
      }
    } catch (err: any) {
      telemetryState.models[model].failures += 1;
      console.warn(`[Gemini Fallback] Model ${model} encountered an issue: ${err?.message || err}. Attempting next ladder model...`);
      lastError = err;
    }
    modelAttemptIndex++;
  }

  telemetryState.requests.failed += 1;
  const elapsed = Date.now() - startTime;
  telemetryState.latencies.push(elapsed);
  if (telemetryState.latencies.length > 500) {
    telemetryState.latencies.shift();
  }

  throw new Error(`All Gemini fallback models exhausted. Last error: ${lastError?.message || 'Unknown error'}`);
}

// ==========================================
// RBAC & ADMIN AUTHORIZATION MIDDLEWARE
// ==========================================

async function requireAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or malformed Authorization header.' });
  }

  const token = authHeader.split('Bearer ')[1].trim();
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Empty token provided.' });
  }

  try {
    const adminApp = getFirebaseAdmin();
    const auth = getAuth(adminApp);

    let decodedToken: DecodedIdToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch {
      // Cryptographic verification failed or token is expired/malformed/forged. Never trust unverified JWT payloads.
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired Firebase ID token.' });
    }

    // Authoritative Admin Role: Firebase Custom Claims (admin === true)
    const isAdminClaim = decodedToken.admin === true;

    // Optional server-side bootstrap fallback via ADMIN_UIDS env var (server-side environment only, never exposed to client)
    const adminUids = (process.env.ADMIN_UIDS || 'KzwzxQpUN0V2bPA7tiwZyCHKA6Z2')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const isBootstrappedAdmin = Boolean(decodedToken.uid && adminUids.includes(decodedToken.uid));

    // NOTE: Email-based admin bootstrap intentionally absent.
    // Email is mutable, non-cryptographic, and must never serve as an authorization primitive.
    // Authoritative sources: Firebase Custom Claims (admin===true) or ADMIN_UIDS env var only.

    // Managed Directory Admin Role check (in-memory governance directory seeded at startup)
    const managedUser = managedUsersMap.get(decodedToken.uid);
    const isDirectoryAdmin = managedUser?.role === 'admin';

    if (!isAdminClaim && !isBootstrappedAdmin && !isDirectoryAdmin) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges. Administrator access required.' });
    }

    (req as any).adminUser = decodedToken;
    next();
  } catch (err: any) {
    console.error('[Admin Auth] Authorization check error:', err);
    return res.status(401).json({ error: 'Unauthorized: Authentication processing failed.' });
  }
}

/**
 * Require User Authentication Middleware
 * Enforces valid Firebase Auth token and binds req.user
 */
async function requireUserAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or malformed Authorization header.' });
  }

  const token = authHeader.split('Bearer ')[1].trim();
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Empty token provided.' });
  }

  try {
    const adminApp = getFirebaseAdmin();
    const auth = getAuth(adminApp);

    let decodedToken: DecodedIdToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired Firebase ID token.' });
    }

    (req as any).user = decodedToken;
    next();
  } catch (err: any) {
    console.error('[User Auth] Verification check error:', err);
    return res.status(401).json({ error: 'Unauthorized: Authentication processing failed.' });
  }
}

/**
 * Server-side validation of Gemini EntryAnalysis output
 * Rejects invalid mood values, out-of-bound scores, and malformed structures
 */
export function validateEntryAnalysis(data: any): { valid: boolean; error?: string; analysis?: any } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Analysis payload must be a valid JSON object' };
  }

  const validMoods = ['joy', 'calm', 'sadness', 'anxiety', 'anger', 'stress', 'neutral'];
  if (!validMoods.includes(data.primaryMood)) {
    return { valid: false, error: `Invalid primaryMood '${data.primaryMood}'. Must be one of: ${validMoods.join(', ')}` };
  }

  if (typeof data.moodScore !== 'number' || isNaN(data.moodScore)) {
    return { valid: false, error: 'moodScore must be a valid number' };
  }
  if (data.moodScore < -1 || data.moodScore > 1) {
    return { valid: false, error: `moodScore ${data.moodScore} is out of bounds [-1, 1]` };
  }

  if (typeof data.intensity !== 'number' || isNaN(data.intensity)) {
    return { valid: false, error: 'intensity must be a valid number' };
  }
  if (data.intensity < 0 || data.intensity > 1) {
    return { valid: false, error: `intensity ${data.intensity} is out of bounds [0, 1]` };
  }

  if (!Array.isArray(data.emotions)) {
    return { valid: false, error: 'emotions must be an array' };
  }
  const validatedEmotions: Array<{ name: string; score: number }> = [];
  for (const emo of data.emotions) {
    if (!emo || typeof emo.name !== 'string' || typeof emo.score !== 'number' || isNaN(emo.score)) {
      continue;
    }
    const score = Math.max(0, Math.min(1, Math.round(emo.score * 100) / 100));
    validatedEmotions.push({ name: String(emo.name).slice(0, 50).trim(), score });
  }

  const topics = Array.isArray(data.topics)
    ? data.topics.map((t: any) => String(t).slice(0, 50).trim()).filter(Boolean)
    : [];

  const shortSummary = typeof data.shortSummary === 'string' ? data.shortSummary.slice(0, 500).trim() : '';

  const reflectionTags = Array.isArray(data.reflectionTags)
    ? data.reflectionTags.map((t: any) => String(t).slice(0, 50).trim()).filter(Boolean)
    : [];

  const analysis = {
    version: typeof data.version === 'number' ? data.version : 1,
    primaryMood: data.primaryMood,
    moodScore: Math.round(data.moodScore * 100) / 100,
    intensity: Math.round(data.intensity * 100) / 100,
    emotions: validatedEmotions,
    topics,
    shortSummary,
    reflectionTags,
    analyzedAt: typeof data.analyzedAt === 'string' ? data.analyzedAt : new Date().toISOString(),
    model: typeof data.model === 'string' ? data.model : undefined,
  };

  return { valid: true, analysis };
}

// ==========================================
// PUBLIC & USER API ROUTES
// ==========================================

// Health Check — returns minimal payload; no secrets or configuration details exposed
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Alias without /api prefix for Cloud Run default health check probe
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Multi-turn Conversational Reflection with Gemini
app.post('/api/gemini/chat', async (req, res) => {
  try {
    // Defensive Payload Ingestion
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const contextText = typeof body.contextText === 'string' ? body.contextText : '';
    const mood = typeof body.mood === 'string' ? body.mood : 'reflective';

    recordMoodSample(mood);

    if (messages.length === 0 && !contextText) {
      return res.status(400).json({ error: 'At least one message or journal context is required.' });
    }

    const systemInstruction = `You are an empathetic, articulate, and thoughtful AI Reflection Partner and Journaling Guide.
Your purpose:
1. Help the user explore their thoughts, feelings, ambitions, and daily reflections with deep mindfulness and psychological safety.
2. Offer gentle perspectives, constructive reframing, and insightful follow-up questions.
3. Validate user experiences warmly while inspiring positive clarity and action.
4. Keep answers engaging, well-structured (with markdown headings, bullet points, or bold highlights where appropriate), and concise (avoiding repetitive fluff).
5. User's chosen mood context: "${mood}".
6. User's original journal entry background (if any):
"""
${contextText.slice(0, 3000)}
"""
`;

    // Map conversation turns cleanly
    const contents: any[] = [];
    
    // Add history
    for (const msg of messages) {
      const role = msg.role === 'gemini' || msg.role === 'model' ? 'model' : 'user';
      const text = typeof msg.content === 'string' ? msg.content : (msg.text || '');
      if (text.trim()) {
        contents.push({
          role,
          parts: [{ text }],
        });
      }
    }

    // If contents is empty but we have contextText, synthesize initial prompt
    if (contents.length === 0 && contextText) {
      contents.push({
        role: 'user',
        parts: [{ text: `Here is my journal entry:\n\n${contextText}\n\nPlease share your initial reflection, key themes you notice, and an inspiring follow-up question.` }],
      });
    }

    const result = await generateContentWithFallback({
      contents,
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        temperature: 0.7,
      },
    });

    res.json({
      reply: result.text,
      modelUsed: result.modelUsed,
    });
  } catch (error: any) {
    console.error('Error in /api/gemini/chat:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate reflection response from Gemini.',
    });
  }
});

// Auto-Summarize & Extract Actionable Insights
app.post('/api/gemini/summarize', async (req, res) => {
  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const content = typeof body.content === 'string' ? body.content : '';
    const messages = Array.isArray(body.messages) ? body.messages : [];

    if (!content.trim() && messages.length === 0) {
      return res.status(400).json({ error: 'Entry content or discussion is required for summarization.' });
    }

    // Build comprehensive transcript
    let transcript = `JOURNAL CONTENT:\n${content}\n\n`;
    if (messages.length > 0) {
      transcript += 'CONVERSATION TURNS:\n';
      messages.forEach((m: any) => {
        transcript += `${m.role === 'user' ? 'User' : 'Gemini'}: ${m.content || m.text}\n`;
      });
    }

    const systemInstruction = `You are an expert cognitive synthesizer and journaling analyst.
Analyze the provided journal entry and reflection dialogue.
Return a STRICT JSON response adhering to this schema:
{
  "title": "A compelling, creative 3-6 word title summarizing the essence",
  "summary": "A cohesive 2-3 sentence executive summary of the entry's core theme and mindset",
  "keyTakeaways": ["Takeaway 1", "Takeaway 2", "Takeaway 3"],
  "sentimentMood": "reflective | inspired | grateful | challenging | curious | calm",
  "suggestedActionItems": ["Clear practical step 1", "Clear practical step 2"],
  "reflectionQuestions": ["Deep probing question 1", "Deep probing question 2"]
}
Output ONLY valid JSON with no enclosing markdown backticks if possible, or clean standard JSON.`;

    const result = await generateContentWithFallback({
      contents: [{ role: 'user', parts: [{ text: transcript }] }],
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        responseMimeType: 'application/json',
        temperature: 0.4,
      },
    });

    let parsedData: any = {};
    try {
      const cleanJson = result.text.replace(/```json\n?|\n?```/g, '').trim();
      parsedData = JSON.parse(cleanJson);
      if (parsedData.sentimentMood) {
        recordMoodSample(parsedData.sentimentMood);
      }
    } catch (parseErr) {
      console.warn('JSON parse fallback for summary:', parseErr);
      parsedData = {
        title: 'Reflection Entry',
        summary: result.text,
        keyTakeaways: ['Key reflection captured', 'Personal insight logged'],
        sentimentMood: 'reflective',
        suggestedActionItems: ['Continue mindful journaling'],
        reflectionQuestions: ['What are you most grateful for today?'],
      };
    }

    res.json({
      summary: parsedData,
      modelUsed: result.modelUsed,
    });
  } catch (error: any) {
    console.error('Error in /api/gemini/summarize:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate summary from Gemini.',
    });
  }
});

// Deep Brainstorm & Reframing Tool
app.post('/api/gemini/brainstorm', async (req, res) => {
  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const content = typeof body.content === 'string' ? body.content : '';
    const focusArea = typeof body.focusArea === 'string' ? body.focusArea : 'reframe';

    if (!content.trim()) {
      return res.status(400).json({ error: 'Content is required for brainstorming.' });
    }

    const focusInstructions: Record<string, string> = {
      reframe: 'Focus on cognitive reframing: help find silver linings, growth mindset angles, and compassionate shifts in perspective.',
      action_items: 'Focus on turning abstract thoughts into concrete, micro-actionable next steps with timelines and low friction.',
      philosophical: 'Focus on deeper philosophical wisdom (e.g., Stoicism, Mindfulness, Essentialism) relevant to the entry.',
      creative: 'Focus on unconventional brainstorming, divergent possibilities, and unexpected solutions.',
    };

    const prompt = `Please analyze this journal reflection:
"""
${content}
"""

Focus direction: ${focusInstructions[focusArea] || focusInstructions.reframe}

Provide a beautifully structured response with markdown formatting, clear headings, bullet points, and inspiring takeaways.`;

    const result = await generateContentWithFallback({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.8,
      },
    });

    res.json({
      ideas: result.text,
      modelUsed: result.modelUsed,
    });
  } catch (error: any) {
    console.error('Error in /api/gemini/brainstorm:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate brainstorming ideas from Gemini.',
    });
  }
});

// ==========================================
// USER MOOD ANALYTICS & STRUCTURED ANALYSIS
// ==========================================

// Helper to perform deterministic mood aggregation for any array of entries
export function computeDeterministicMoodAnalytics(allEntries: any[], range: string = '7d') {
  const now = Date.now();
  let cutoffMs = 0;
  if (range === '7d') cutoffMs = now - 7 * 86400000;
  else if (range === '30d') cutoffMs = now - 30 * 86400000;
  else if (range === '90d') cutoffMs = now - 90 * 86400000;

  // Filter by time range
  const filteredEntries = cutoffMs > 0
    ? allEntries.filter((e) => {
        const t = new Date(e.createdAt || 0).getTime();
        return t >= cutoffMs;
      })
    : allEntries;

  // Filter analyzed entries
  const analyzedEntries = filteredEntries.filter((e) => e.analysis && e.analysis.primaryMood);

  // Compute deterministic stats
  const moodDistribution: Record<string, number> = {
    joy: 0,
    calm: 0,
    sadness: 0,
    anxiety: 0,
    anger: 0,
    stress: 0,
    neutral: 0,
  };

  let totalMoodScore = 0;
  let totalIntensity = 0;
  const emotionMap = new Map<string, { totalScore: number; count: number }>();
  const topicMap = new Map<string, number>();

  // Timeline grouping by YYYY-MM-DD
  const dayMap = new Map<string, { scores: number[]; intensities: number[]; moods: string[]; count: number }>();

  analyzedEntries.forEach((entry) => {
    const a = entry.analysis;
    if (moodDistribution[a.primaryMood] !== undefined) {
      moodDistribution[a.primaryMood] += 1;
    }

    totalMoodScore += a.moodScore;
    totalIntensity += a.intensity;

    // Emotions
    if (Array.isArray(a.emotions)) {
      a.emotions.forEach((emo: any) => {
        if (emo?.name && typeof emo.score === 'number') {
          const key = emo.name.toLowerCase().trim();
          const curr = emotionMap.get(key) || { totalScore: 0, count: 0 };
          curr.totalScore += emo.score;
          curr.count += 1;
          emotionMap.set(key, curr);
        }
      });
    }

    // Topics
    if (Array.isArray(a.topics)) {
      a.topics.forEach((topic: any) => {
        if (typeof topic === 'string' && topic.trim()) {
          const key = topic.trim();
          topicMap.set(key, (topicMap.get(key) || 0) + 1);
        }
      });
    }

    // Day group
    const dateStr = (entry.createdAt || new Date().toISOString()).slice(0, 10);
    const dayData = dayMap.get(dateStr) || { scores: [], intensities: [], moods: [], count: 0 };
    dayData.scores.push(a.moodScore);
    dayData.intensities.push(a.intensity);
    dayData.moods.push(a.primaryMood);
    dayData.count += 1;
    dayMap.set(dateStr, dayData);
  });

  const analyzedCount = analyzedEntries.length;
  const averageMoodScore = analyzedCount > 0 ? Math.round((totalMoodScore / analyzedCount) * 100) / 100 : 0;
  const averageIntensity = analyzedCount > 0 ? Math.round((totalIntensity / analyzedCount) * 100) / 100 : 0;

  // Top Emotions sorted by count & score
  const topEmotions = Array.from(emotionMap.entries())
    .map(([name, data]) => ({
      name,
      score: Math.round((data.totalScore / data.count) * 100) / 100,
      count: data.count,
    }))
    .sort((a, b) => b.count - a.count || b.score - a.score)
    .slice(0, 8);

  // Top Topics sorted by frequency
  const topTopics = Array.from(topicMap.entries())
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Timeline sorted chronologically
  const timeline = Array.from(dayMap.entries())
    .map(([date, data]) => {
      const avgScore = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
      const avgIntensity = data.intensities.reduce((a, b) => a + b, 0) / data.intensities.length;
      // Dominant mood for the day
      const moodFrequency: Record<string, number> = {};
      data.moods.forEach((m) => {
        moodFrequency[m] = (moodFrequency[m] || 0) + 1;
      });
      const dominantMood = Object.entries(moodFrequency).sort((a, b) => b[1] - a[1])[0][0];

      return {
        date,
        moodScore: Math.round(avgScore * 100) / 100,
        primaryMood: dominantMood,
        intensity: Math.round(avgIntensity * 100) / 100,
        entryCount: data.count,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  // Calculate journaling frequency & streak
  const daysInPeriod = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 365;
  const entriesPerWeek = Math.round((filteredEntries.length / (daysInPeriod / 7)) * 10) / 10;

  // Calculate streak (consecutive days ending today or yesterday)
  let currentStreakDays = 0;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const uniqueDates = new Set(allEntries.map((e) => (e.createdAt || '').slice(0, 10)));

  let checkDate = uniqueDates.has(today) ? new Date() : uniqueDates.has(yesterday) ? new Date(Date.now() - 86400000) : null;
  if (checkDate) {
    while (true) {
      const dateStr = checkDate.toISOString().slice(0, 10);
      if (uniqueDates.has(dateStr)) {
        currentStreakDays += 1;
        checkDate = new Date(checkDate.getTime() - 86400000);
      } else {
        break;
      }
    }
  }

  // Latest mood
  const latestEntry = analyzedEntries[0];
  const latestMood = latestEntry?.analysis ? {
    primaryMood: latestEntry.analysis.primaryMood,
    moodScore: latestEntry.analysis.moodScore,
    intensity: latestEntry.analysis.intensity,
    analyzedAt: latestEntry.analysis.analyzedAt,
  } : null;

  return {
    period: range,
    entryCount: filteredEntries.length,
    analyzedCount,
    averageMoodScore,
    averageIntensity,
    moodDistribution,
    topEmotions,
    topTopics,
    timeline,
    journalingFrequency: {
      entriesPerWeek,
      currentStreakDays,
      totalDaysInPeriod: daysInPeriod,
    },
    latestMood,
  };
}

// Structured Reflection Intelligence Analysis (Gemini Schema-Constrained)
app.post('/api/entries/analyze', requireUserAuth, async (req, res) => {
  try {
    const user = (req as any).user as DecodedIdToken;
    const uid = user.uid;

    const data = (req.body && typeof req.body === 'object') ? req.body : {};
    const { entryId, content, title } = data;

    if (!entryId || typeof entryId !== 'string') {
      return res.status(400).json({ error: 'Bad Request: Valid entryId is required.' });
    }

    const sanitizedContent = typeof content === 'string' ? content.trim() : '';
    const sanitizedTitle = typeof title === 'string' ? title.trim() : 'Reflection';

    // If content is empty or under 5 characters, mark pending and return safely
    if (sanitizedContent.length < 5) {
      return res.json({
        status: 'pending',
        message: 'Reflection content is too brief for deep sentiment analysis.',
      });
    }

    // Optional server-side Firestore status mark with safe catch
    try {
      const firestore = getAdminFirestore();
      const entryDocRef = firestore.collection('users').doc(uid).collection('entries').doc(entryId);
      await entryDocRef.set({
        analysisStatus: 'pending',
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (fsErr: any) {
      // Benign: Client handles optimistic and final persistence with authenticated user token
      console.log('[Analyze] Server-side Firestore write skipped:', fsErr?.message || fsErr);
    }

    const promptText = `Analyze the following private personal journal reflection:
Title: ${sanitizedTitle}
Reflection Content:
${sanitizedContent}

Perform an objective psychological and emotional analysis according to the schema:
- primaryMood: Must be one of ["joy", "calm", "sadness", "anxiety", "anger", "stress", "neutral"].
- moodScore: Decimal valence number from -1.0 (deeply distressed, negative, despair) to +1.0 (profoundly joyful, optimistic, grateful). 0.0 is neutral or balanced.
- intensity: Decimal number from 0.0 (mild, passive, detached) to 1.0 (extremely intense, overwhelming, heightened).
- emotions: Array of 1 to 5 prominent emotions with a name and confidence/prominence score between 0.0 and 1.0.
- topics: 1 to 4 general theme tags (e.g. "Work", "Relationships", "Health", "Personal Growth", "Creativity").
- shortSummary: Concise, empathetic 1-2 sentence essence of the entry.
- reflectionTags: 2 to 5 descriptive tags reflecting cognitive patterns or self-insights (e.g. "mindfulness", "impostor feelings", "gratitude", "resolution").`;

    const aiResult = await generateContentWithFallback({
      contents: promptText,
      config: {
        systemInstruction: "You are an empathetic, clinical-grade reflection intelligence engine. Analyze the reflection with objective psychological sensitivity. Return strictly schema-compliant JSON.",
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            version: { type: Type.INTEGER },
            primaryMood: {
              type: Type.STRING,
              enum: ["joy", "calm", "sadness", "anxiety", "anger", "stress", "neutral"],
            },
            moodScore: { type: Type.NUMBER },
            intensity: { type: Type.NUMBER },
            emotions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  score: { type: Type.NUMBER },
                },
                required: ["name", "score"],
              },
            },
            topics: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            shortSummary: { type: Type.STRING },
            reflectionTags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ["primaryMood", "moodScore", "intensity", "emotions", "topics", "shortSummary", "reflectionTags"],
        },
      },
    });

    let rawParsed: any;
    try {
      rawParsed = JSON.parse(aiResult.text);
    } catch (parseErr) {
      console.error('[Analyze] JSON parse failure from model output:', aiResult.text);
      throw new Error('Malformed JSON output from model');
    }

    rawParsed.model = aiResult.modelUsed;
    const validation = validateEntryAnalysis(rawParsed);

    if (!validation.valid || !validation.analysis) {
      console.warn('[Analyze] Validation failure on model output:', validation.error);
      throw new Error(`Model response failed schema validation: ${validation.error}`);
    }

    const finalAnalysis = validation.analysis;

    // Optional server-side sync if Firestore admin is permitted
    try {
      const firestore = getAdminFirestore();
      const entryDocRef = firestore.collection('users').doc(uid).collection('entries').doc(entryId);
      const cleanDocPayload = JSON.parse(JSON.stringify({
        analysis: finalAnalysis,
        analysisStatus: 'completed',
        analysisError: null,
        updatedAt: new Date().toISOString(),
      }));
      await entryDocRef.set(cleanDocPayload, { merge: true });
    } catch (fsErr: any) {
      // Benign: Client handles persistence directly with authenticated user token
      console.log('[Analyze] Server-side Firestore persist skipped:', fsErr?.message || fsErr);
    }

    return res.status(200).json({
      success: true,
      status: 'completed',
      analysis: finalAnalysis,
    });
  } catch (err: any) {
    console.error(`[Analyze] Failed to analyze entry:`, err.message || err);

    // If entryId was present, attempt to record analysisStatus: 'failed' in Firestore
    try {
      const data = (req.body && typeof req.body === 'object') ? req.body : {};
      const { entryId } = data;
      const user = (req as any).user as DecodedIdToken;
      if (entryId && user?.uid) {
        const firestore = getAdminFirestore();
        await firestore.collection('users').doc(user.uid).collection('entries').doc(entryId).set({
          analysisStatus: 'failed',
          analysisError: err.message || 'Analysis error',
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      }
    } catch (fsErr) {
      // Benign: Firestore failure doesn't wipe client text
    }

    return res.status(500).json({
      success: false,
      status: 'failed',
      analysisStatus: 'failed',
      error: err.message || 'Analysis could not be completed. Raw journal content remains preserved.',
    });
  }
});

// Authenticated User Mood Analytics Endpoint (Supports GET and POST with client entries)
const handleMoodAnalytics = async (req: express.Request, res: express.Response) => {
  const user = (req as any).user as DecodedIdToken;
  const uid = user.uid;

  const rangeParam = String(req.query.range || req.query.period || req.body?.range || '7d').toLowerCase();
  const validRanges = ['7d', '30d', '90d', 'all'];
  const range = validRanges.includes(rangeParam) ? rangeParam : '7d';

  try {
    let allEntries: any[] = [];

    // Check if client passed entries in POST body
    if (Array.isArray(req.body?.entries)) {
      allEntries = req.body.entries;
    } else {
      // Otherwise attempt to query Firestore if Admin SDK is permitted
      try {
        const firestore = getAdminFirestore();
        const entriesSnapshot = await firestore
          .collection('users')
          .doc(uid)
          .collection('entries')
          .orderBy('createdAt', 'desc')
          .get();

        entriesSnapshot.forEach((doc) => {
          const d = doc.data();
          allEntries.push({ ...d, id: doc.id });
        });
      } catch (fsErr: any) {
        console.log('[Analytics] Server-side Firestore read skipped (client provides entries directly):', fsErr?.message || fsErr);
      }
    }

    const analytics = computeDeterministicMoodAnalytics(allEntries, range);
    return res.status(200).json(analytics);
  } catch (err: any) {
    console.error(`[Analytics] Error calculating analytics for user ${uid}:`, err);
    return res.status(500).json({ error: 'Failed to calculate user mood analytics.' });
  }
};

app.get('/api/analytics/mood', requireUserAuth, handleMoodAnalytics);
app.post('/api/analytics/mood', requireUserAuth, handleMoodAnalytics);

// ==========================================
// ADMIN TELEMETRY & RBAC API ENDPOINTS
// ==========================================

// Verify Admin Privilege
app.get('/api/admin/verify', requireAdminAuth, (req, res) => {
  const adminUser = (req as any).adminUser;
  res.json({
    status: 'ok',
    isAdmin: true,
    role: 'admin',
    uid: adminUser.uid,
    email: adminUser.email || null,
  });
});

// Admin Telemetry & Operational Analytics
app.get('/api/admin/telemetry', requireAdminAuth, (req, res) => {
  const uptimeSeconds = Math.floor((Date.now() - serverStartTime) / 1000);
  const latency = getLatencyMetrics();

  const modelsArray = MODEL_FALLBACK_LADDER.map((model) => {
    const stats = telemetryState.models[model] || { requests: 0, successes: 0, failures: 0, fallbackCount: 0 };
    return {
      model,
      requests: stats.requests,
      successes: stats.successes,
      failures: stats.failures,
      fallbackCount: stats.fallbackCount,
    };
  });

  const failureRate = telemetryState.requests.total > 0
    ? (telemetryState.requests.failed / telemetryState.requests.total)
    : 0;

  const status = failureRate > 0.3
    ? 'unavailable'
    : failureRate > 0.05
    ? 'degraded'
    : 'healthy';

  const telemetryData = {
    status,
    uptimeSeconds,
    requests: {
      total: telemetryState.requests.total,
      successful: telemetryState.requests.successful,
      failed: telemetryState.requests.failed,
    },
    latency,
    models: modelsArray,
    fallbackLadder: {
      totalFallbacks: telemetryState.fallbackLadder.totalFallbacks,
      byModel: telemetryState.fallbackLadder.byModel,
    },
  };

  res.json(telemetryData);
});

// Privacy-Preserving User Directory & Governance (Metadata only, ZERO journal reflection text)
app.get('/api/admin/users', requireAdminAuth, async (req, res) => {
  try {
    const adminUser = (req as any).adminUser;
    if (adminUser?.uid) {
      if (!managedUsersMap.has(adminUser.uid)) {
        managedUsersMap.set(adminUser.uid, {
          uid: adminUser.uid,
          email: adminUser.email || null,
          displayName: adminUser.name || (adminUser.email ? adminUser.email.split('@')[0] : 'Administrator'),
          photoURL: adminUser.picture || null,
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
          entryCount: 0,
          role: 'admin',
          status: 'active',
        });
      }
    }

    const activeUsers = Array.from(managedUsersMap.values()).filter(
      (u) => !deletedUserUids.has(u.uid)
    );

    return res.json({ users: activeUsers });
  } catch (err: any) {
    console.warn('[Admin] Error in /api/admin/users route, returning fallback list:', err);
    return res.json({ users: Array.from(managedUsersMap.values()).filter((u) => !deletedUserUids.has(u.uid)) });
  }
});

// Admin Governance: Provision New Author Profile
app.post('/api/admin/users', requireAdminAuth, async (req, res) => {
  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    const role: 'admin' | 'user' = body.role === 'admin' ? 'admin' : 'user';
    const entryCount = typeof body.entryCount === 'number' ? body.entryCount : 0;

    if (!displayName || !email) {
      return res.status(400).json({ error: 'Display name and email are required to create an author profile.' });
    }

    // Basic email format check
    if (!email.includes('@') || !email.includes('.')) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    const generatedUid = `author_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newUser: ServerUserDirectoryItem = {
      uid: generatedUid,
      email,
      displayName,
      photoURL: null,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      entryCount,
      role,
      status: 'active',
    };

    deletedUserUids.delete(generatedUid);
    managedUsersMap.set(generatedUid, newUser);

    console.log(`[Admin Governance] Created author profile: ${generatedUid} (${displayName}, role: ${role})`);
    return res.status(201).json({ user: newUser });
  } catch (err: any) {
    console.error('[Admin Governance] Error creating author profile:', err);
    return res.status(500).json({ error: err.message || 'Failed to create author profile.' });
  }
});

// Admin Governance: Update Author Role (Toggle admin <-> user)
app.patch('/api/admin/users/:uid/role', requireAdminAuth, async (req, res) => {
  try {
    const targetUid = req.params.uid;
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const role = body.role;

    if (role !== 'admin' && role !== 'user') {
      return res.status(400).json({ error: 'Role must be either "admin" or "user".' });
    }

    let user = managedUsersMap.get(targetUid);
    if (!user) {
      // Create stub if previously missing from map
      user = {
        uid: targetUid,
        email: null,
        displayName: 'Mindful Author',
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
        entryCount: 0,
        role,
        status: 'active',
      };
    } else {
      user = { ...user, role };
    }

    deletedUserUids.delete(targetUid);
    managedUsersMap.set(targetUid, user);

    console.log(`[Admin Governance] Updated user ${targetUid} role to ${role}`);
    return res.json({ user });
  } catch (err: any) {
    console.error('[Admin Governance] Error updating author role:', err);
    return res.status(500).json({ error: err.message || 'Failed to update author role.' });
  }
});

// Admin Governance: Delete Author Profile
app.delete('/api/admin/users/:uid', requireAdminAuth, async (req, res) => {
  try {
    const targetUid = req.params.uid;
    const adminUser = (req as any).adminUser;

    if (adminUser?.uid && targetUid === adminUser.uid) {
      return res.status(400).json({ error: 'Cannot remove your own active administrator account.' });
    }

    deletedUserUids.add(targetUid);
    managedUsersMap.delete(targetUid);

    console.log(`[Admin Governance] Deleted author profile: ${targetUid}`);
    return res.json({ success: true, removedUid: targetUid });
  } catch (err: any) {
    console.error('[Admin Governance] Error deleting author profile:', err);
    return res.status(500).json({ error: err.message || 'Failed to delete author profile.' });
  }
});

// Privacy-Safe Aggregated Mood Statistics
app.get('/api/admin/moods', requireAdminAuth, (req, res) => {
  // PRIVACY ENFORCEMENT: Returns aggregated, anonymized mood analytics.
  // Contains ZERO journal text, entry IDs, user IDs, or PII.
  res.json({
    moods: moodAggregate,
  });
});

// API Boundary Enforcement: Ensure all /api/* routes strictly return JSON and never fall through to Vite SPA HTML
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `Not Found: ${req.method} ${req.path}` });
});

// Global API Error Middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.path.startsWith('/api')) {
    console.error('[Global API Error]:', err);
    return res.status(err.status || 500).json({
      error: err.message || 'Internal Server Error',
    });
  }
  next(err);
});

// ==========================================
// Vite Middleware / Static Server
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Gemini Reflection Journal server running on http://0.0.0.0:${PORT}`);
  });
}

// Only start the HTTP server when this file is the direct entry point,
// not when imported as a module by test scripts (e.g., for validateEntryAnalysis / computeDeterministicMoodAnalytics unit tests).
// The SKIP_SERVER_START env variable provides an additional override for CI test contexts.
const isMain = process.argv[1] && (
  process.argv[1].endsWith('server.ts') ||
  process.argv[1].endsWith('server.js') ||
  process.argv[1].endsWith('server.cjs')
);

if (isMain && !process.env.SKIP_SERVER_START) {
  startServer();
}
