import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
const PORT = 3000;

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
 * Iterates through the fallback ladder to guarantee AI availability.
 */
async function generateContentWithFallback(params: {
  contents: any;
  config?: any;
}): Promise<FallbackResult> {
  const ai = getGenAI();
  let lastError: any = null;

  for (const model of MODEL_FALLBACK_LADDER) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config: params.config,
      });

      const text = response.text || '';
      if (text) {
        return { text, modelUsed: model };
      }
    } catch (err: any) {
      console.warn(`[Gemini Fallback] Model ${model} encountered an issue: ${err?.message || err}. Attempting next ladder model...`);
      lastError = err;
    }
  }

  throw new Error(`All Gemini fallback models exhausted. Last error: ${lastError?.message || 'Unknown error'}`);
}

// ==========================================
// API ROUTES
// ==========================================

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    aiConfigured: Boolean(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY),
  });
});

// Multi-turn Conversational Reflection with Gemini
app.post('/api/gemini/chat', async (req, res) => {
  try {
    // 3. Defensive Payload Ingestion (Null-Safe Destructuring)
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const contextText = typeof body.contextText === 'string' ? body.contextText : '';
    const mood = typeof body.mood === 'string' ? body.mood : 'reflective';

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

    let parsedData = {};
    try {
      const cleanJson = result.text.replace(/```json\n?|\n?```/g, '').trim();
      parsedData = JSON.parse(cleanJson);
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

startServer();
