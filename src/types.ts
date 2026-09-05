export type UserRole = 'user' | 'admin';
export type AppView = 'journal' | 'admin';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role?: UserRole;
  entryCount?: number;
  createdAt?: string;
  lastLoginAt?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'gemini';
  content: string;
  timestamp: string; // ISO string
  modelUsed?: string;
}

export interface AISummary {
  title?: string;
  summary?: string;
  keyTakeaways?: string[];
  sentimentMood?: string;
  suggestedActionItems?: string[];
  reflectionQuestions?: string[];
  generatedAt?: string;
}

export type PrimaryMood =
  | 'joy'
  | 'calm'
  | 'sadness'
  | 'anxiety'
  | 'anger'
  | 'stress'
  | 'neutral';

export interface EmotionScore {
  name: string;
  score: number; // 0 to 1
}

export interface EntryAnalysis {
  version: number;
  primaryMood: PrimaryMood;
  moodScore: number; // -1 to +1
  intensity: number; // 0 to 1
  emotions: EmotionScore[];
  topics: string[];
  shortSummary: string;
  reflectionTags: string[];
  analyzedAt: string;
  model?: string;
}

export interface JournalEntry {
  id: string;
  userId: string;
  title: string;
  content: string;
  messages: ChatMessage[];
  summary?: AISummary;
  analysis?: EntryAnalysis;
  analysisStatus?: 'pending' | 'completed' | 'failed';
  analysisError?: string;
  mood?: 'reflective' | 'inspired' | 'grateful' | 'challenging' | 'curious' | 'calm';
  tags?: string[];
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export interface GeminiChatPayload {
  messages: Array<{
    role: 'user' | 'model';
    parts: Array<{ text: string }>;
  }>;
  systemInstruction?: string;
  contextText?: string;
  mood?: string;
}

export interface GeminiSummarizePayload {
  content: string;
  messages?: ChatMessage[];
}

export interface GeminiBrainstormPayload {
  content: string;
  focusArea?: 'reframe' | 'action_items' | 'philosophical' | 'creative';
}

export interface AdminTelemetry {
  status: 'healthy' | 'degraded' | 'unavailable';
  uptimeSeconds: number;
  requests: {
    total: number;
    successful: number;
    failed: number;
  };
  latency: {
    averageMs: number;
    p95Ms?: number;
  };
  models: Array<{
    model: string;
    requests: number;
    successes: number;
    failures: number;
    fallbackCount: number;
  }>;
  fallbackLadder: {
    totalFallbacks: number;
    byModel: Record<string, number>;
  };
}

export interface UserDirectoryItem {
  uid: string;
  email: string | null;
  displayName: string | null;
  createdAt?: string;
  lastLoginAt?: string;
  entryCount: number;
  role: UserRole;
  status: 'active' | 'inactive';
}

export interface MoodAnalytics {
  gratitude: number;
  focus: number;
  stress: number;
  optimism: number;
  challenging: number;
  calm: number;
  totalSamples: number;
  updatedAt: string;
}

export interface MoodTimelinePoint {
  date: string; // YYYY-MM-DD
  moodScore: number;
  primaryMood: PrimaryMood;
  intensity: number;
  entryCount: number;
}

export interface EmotionCount {
  name: string;
  score: number;
  count: number;
}

export interface TopicCount {
  topic: string;
  count: number;
}

export interface MoodAnalyticsResponse {
  period: '7d' | '30d' | '90d' | 'all';
  entryCount: number;
  analyzedCount: number;
  averageMoodScore: number;
  averageIntensity: number;
  moodDistribution: Record<PrimaryMood, number>;
  topEmotions: EmotionCount[];
  topTopics: TopicCount[];
  timeline: MoodTimelinePoint[];
  journalingFrequency: {
    entriesPerWeek: number;
    currentStreakDays: number;
    totalDaysInPeriod: number;
  };
  latestMood?: {
    primaryMood: PrimaryMood;
    moodScore: number;
    intensity: number;
    analyzedAt: string;
  } | null;
}


