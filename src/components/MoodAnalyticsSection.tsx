import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  TrendingUp,
  Activity,
  Calendar,
  Flame,
  Award,
  RefreshCw,
  Lock,
  Tag,
  Smile,
  ShieldCheck,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { MoodAnalyticsResponse, PrimaryMood, JournalEntry } from '../types';
import { fetchUserMoodAnalytics } from '../lib/firebase';

interface MoodAnalyticsSectionProps {
  onSelectEntry?: (id: string) => void;
  entries?: JournalEntry[];
}

const MOOD_THEMES: Record<PrimaryMood, { label: string; color: string; bg: string; border: string; dotColor: string }> = {
  joy: { label: 'Joy', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', dotColor: '#f59e0b' },
  calm: { label: 'Calm', color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/30', dotColor: '#14b8a6' },
  sadness: { label: 'Sadness', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', dotColor: '#3b82f6' },
  anxiety: { label: 'Anxiety', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', dotColor: '#f97316' },
  anger: { label: 'Anger', color: 'text-rose-500', bg: 'bg-rose-500/10', border: 'border-rose-500/30', dotColor: '#f43f5e' },
  stress: { label: 'Stress', color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/30', dotColor: '#fb7185' },
  neutral: { label: 'Neutral', color: 'text-stone-400', bg: 'bg-stone-500/10', border: 'border-stone-500/30', dotColor: '#a8a29e' },
};

function getScoreDescription(score: number): { label: string; color: string } {
  if (score >= 0.6) return { label: 'Profoundly Positive & Energized', color: 'text-emerald-400' };
  if (score >= 0.2) return { label: 'Mildly Uplifted & Optimistic', color: 'text-teal-400' };
  if (score > -0.2) return { label: 'Centered & Balanced', color: 'text-stone-300' };
  if (score > -0.6) return { label: 'Slightly Stressed or Vulnerable', color: 'text-amber-400' };
  return { label: 'Challenged or Overwhelmed', color: 'text-rose-400' };
}

export const MoodAnalyticsSection: React.FC<MoodAnalyticsSectionProps> = ({ entries }) => {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d' | 'all'>('7d');
  const [analytics, setAnalytics] = useState<MoodAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchUserMoodAnalytics(period, entries);
      setAnalytics(data);
    } catch (err: any) {
      console.error('Failed to load mood analytics:', err);
      setError(err.message || 'Unable to load analytics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [period, entries]);

  if (loading && !analytics) {
    return (
      <div className="p-12 text-center space-y-4">
        <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-xs font-mono text-stone-400">Computing deterministic emotional metrics...</p>
      </div>
    );
  }

  if (error && !analytics) {
    return (
      <div className="p-8 text-center space-y-3 bg-stone-950/60 rounded-xl border border-red-500/30">
        <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
        <p className="text-sm font-semibold text-stone-200">Unable to load analytics</p>
        <p className="text-xs text-stone-400 max-w-md mx-auto">{error}</p>
        <button
          onClick={loadAnalytics}
          className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-mono transition-colors inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  if (!analytics || analytics.entryCount === 0) {
    return (
      <div className="p-10 text-center space-y-3 bg-stone-950/40 rounded-2xl border border-stone-800">
        <Sparkles className="w-8 h-8 text-amber-500/60 mx-auto" />
        <h4 className="text-sm font-semibold text-stone-200">No Journal Reflections Found in Period</h4>
        <p className="text-xs text-stone-400 max-w-md mx-auto leading-relaxed">
          Create or update your personal reflections to generate structured mood analytics, emotional trends, and thematic topics.
        </p>
      </div>
    );
  }

  const scoreInfo = getScoreDescription(analytics.averageMoodScore);
  const totalAnalyzed = analytics.analyzedCount;

  return (
    <div className="space-y-6">
      
      {/* Period Selector & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-stone-800">
        <div>
          <h3 className="text-base font-semibold text-stone-100 flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-400" />
            <span>Private Mood Intelligence</span>
          </h3>
          <p className="text-xs text-stone-400">
            Psychological valence and emotional trajectory extracted across your personal reflections.
          </p>
        </div>

        {/* Time Range Filter */}
        <div className="flex items-center gap-1 bg-stone-950 p-1 rounded-lg border border-stone-800 text-xs font-mono self-start sm:self-auto">
          {(['7d', '30d', '90d', 'all'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                period === p
                  ? 'bg-amber-500 text-stone-950 font-bold'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              {p.toUpperCase()}
            </button>
          ))}
          <button
            onClick={loadAnalytics}
            title="Refresh analytics"
            className="p-1 text-stone-400 hover:text-stone-200 ml-1 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary Score Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        
        {/* Valence Score */}
        <div className="bg-stone-950/60 border border-stone-800/80 rounded-xl p-3.5 space-y-1">
          <div className="text-[11px] font-mono text-stone-400 flex items-center justify-between">
            <span>Average Valence</span>
            <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-stone-100">
              {analytics.averageMoodScore > 0 ? `+${analytics.averageMoodScore}` : analytics.averageMoodScore}
            </span>
            <span className="text-[10px] font-mono text-stone-500">[-1.0 to +1.0]</span>
          </div>
          <p className={`text-[11px] font-medium ${scoreInfo.color}`}>
            {scoreInfo.label}
          </p>
        </div>

        {/* Emotional Intensity */}
        <div className="bg-stone-950/60 border border-stone-800/80 rounded-xl p-3.5 space-y-1">
          <div className="text-[11px] font-mono text-stone-400 flex items-center justify-between">
            <span>Average Intensity</span>
            <Flame className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-stone-100">
              {Math.round(analytics.averageIntensity * 100)}%
            </span>
            <span className="text-[10px] font-mono text-stone-500">[0 to 100%]</span>
          </div>
          <p className="text-[11px] text-stone-400">
            {analytics.averageIntensity > 0.7 ? 'High emotional arousal' : analytics.averageIntensity > 0.4 ? 'Moderate balance' : 'Subtle & reflective'}
          </p>
        </div>

        {/* Journaling Streak */}
        <div className="bg-stone-950/60 border border-stone-800/80 rounded-xl p-3.5 space-y-1">
          <div className="text-[11px] font-mono text-stone-400 flex items-center justify-between">
            <span>Reflective Streak</span>
            <Award className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-amber-400">
              {analytics.journalingFrequency.currentStreakDays}
            </span>
            <span className="text-xs text-stone-400">days consecutive</span>
          </div>
          <p className="text-[11px] text-stone-500 font-mono">
            {analytics.journalingFrequency.entriesPerWeek} entries/week avg
          </p>
        </div>

        {/* Analyzed Ratio */}
        <div className="bg-stone-950/60 border border-stone-800/80 rounded-xl p-3.5 space-y-1">
          <div className="text-[11px] font-mono text-stone-400 flex items-center justify-between">
            <span>Analyzed Entries</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-stone-100">
              {analytics.analyzedCount}
            </span>
            <span className="text-xs text-stone-400">of {analytics.entryCount} reflections</span>
          </div>
          <p className="text-[11px] text-stone-500 font-mono">
            {analytics.entryCount - analytics.analyzedCount > 0
              ? `${analytics.entryCount - analytics.analyzedCount} unanalyzed`
              : '100% indexed'}
          </p>
        </div>

      </div>

      {/* Mood Distribution Bar Chart */}
      <div className="bg-stone-950/60 border border-stone-800/80 rounded-xl p-4 space-y-3">
        <h4 className="text-xs font-semibold text-stone-200 uppercase tracking-wider font-mono flex items-center gap-2">
          <BarChart3 className="w-3.5 h-3.5 text-amber-400" />
          <span>Mood Distribution</span>
        </h4>

        {totalAnalyzed > 0 ? (
          <div className="space-y-2">
            {/* Proportional Stack Bar */}
            <div className="h-3 w-full bg-stone-900 rounded-full overflow-hidden flex">
              {(Object.keys(analytics.moodDistribution) as PrimaryMood[]).map((mood) => {
                const count = analytics.moodDistribution[mood] || 0;
                if (count === 0) return null;
                const percentage = (count / totalAnalyzed) * 100;
                const theme = MOOD_THEMES[mood] || MOOD_THEMES.neutral;
                return (
                  <div
                    key={mood}
                    style={{ width: `${percentage}%`, backgroundColor: theme.dotColor }}
                    className="h-full transition-all duration-300 relative group"
                    title={`${theme.label}: ${count} (${Math.round(percentage)}%)`}
                  />
                );
              })}
            </div>

            {/* Labels Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 pt-2">
              {(Object.keys(analytics.moodDistribution) as PrimaryMood[]).map((mood) => {
                const count = analytics.moodDistribution[mood] || 0;
                const percentage = totalAnalyzed > 0 ? Math.round((count / totalAnalyzed) * 100) : 0;
                const theme = MOOD_THEMES[mood] || MOOD_THEMES.neutral;
                return (
                  <div
                    key={mood}
                    className={`p-2 rounded-lg border ${theme.bg} ${theme.border} text-center space-y-0.5`}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.dotColor }} />
                      <span className={`text-xs font-medium ${theme.color}`}>{theme.label}</span>
                    </div>
                    <div className="text-sm font-bold font-mono text-stone-100">{count}</div>
                    <div className="text-[10px] text-stone-400 font-mono">{percentage}%</div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-xs text-stone-500 italic">No analyzed entries available to generate distribution.</p>
        )}
      </div>

      {/* Mood Timeline Trend (SVG Chart) */}
      {analytics.timeline.length > 0 && (
        <div className="bg-stone-950/60 border border-stone-800/80 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-stone-200 uppercase tracking-wider font-mono flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span>Valence Trajectory Over Time</span>
            </h4>
            <span className="text-[10px] font-mono text-stone-400">Higher = Positive &bull; Lower = Stress</span>
          </div>

          <div className="w-full overflow-x-auto pt-2 pb-1">
            <div className="min-w-[480px] h-44 relative flex items-end">
              {/* Zero baseline */}
              <div className="absolute top-1/2 left-0 right-0 border-b border-stone-700/60 border-dashed pointer-events-none z-0">
                <span className="absolute left-1 -top-3 text-[9px] font-mono text-stone-500">0.0 (Neutral)</span>
              </div>

              {/* Data Bars / Columns */}
              <div className="w-full flex items-center justify-between gap-2 h-full z-10 px-2">
                {analytics.timeline.map((point) => {
                  const theme = MOOD_THEMES[point.primaryMood] || MOOD_THEMES.neutral;
                  // Map moodScore (-1 to +1) to height percentage from baseline (center is 50%)
                  // Score of 1.0 -> 50% height upward; -1.0 -> 50% height downward
                  const normalizedHeight = Math.max(10, Math.min(48, Math.abs(point.moodScore) * 48));
                  const isPositive = point.moodScore >= 0;

                  return (
                    <div
                      key={point.date}
                      className="flex-1 flex flex-col items-center justify-center h-full relative group"
                    >
                      {/* Tooltip on Hover */}
                      <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-stone-900 border border-stone-700 text-stone-200 text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap pointer-events-none z-20 font-mono">
                        {point.date}: {point.moodScore > 0 ? `+${point.moodScore}` : point.moodScore} ({theme.label})
                      </div>

                      {/* Bar Container with baseline alignment */}
                      <div className="w-full h-full relative flex items-center justify-center">
                        <div
                          style={{
                            height: `${normalizedHeight}%`,
                            top: isPositive ? `${50 - normalizedHeight}%` : '50%',
                            backgroundColor: theme.dotColor,
                          }}
                          className={`w-3 sm:w-5 absolute rounded-sm opacity-80 group-hover:opacity-100 transition-all`}
                        />
                      </div>

                      {/* Date label at bottom */}
                      <span className="text-[9px] font-mono text-stone-400 mt-1 truncate max-w-[44px]">
                        {point.date.slice(5)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Prominent Emotions & Core Topics Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Prominent Emotions */}
        <div className="bg-stone-950/60 border border-stone-800/80 rounded-xl p-4 space-y-3">
          <h4 className="text-xs font-semibold text-stone-200 uppercase tracking-wider font-mono flex items-center gap-2">
            <Smile className="w-3.5 h-3.5 text-teal-400" />
            <span>Frequent Emotional States</span>
          </h4>

          {analytics.topEmotions.length === 0 ? (
            <p className="text-xs text-stone-500 italic">No emotions recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {analytics.topEmotions.map((emo) => (
                <div key={emo.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-stone-300 capitalize">{emo.name}</span>
                    <span className="font-mono text-[10px] text-stone-400">
                      avg intensity {Math.round(emo.score * 100)}% &bull; {emo.count} {emo.count === 1 ? 'time' : 'times'}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-stone-900 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${Math.round(emo.score * 100)}%` }}
                      className="h-full bg-teal-400 rounded-full"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reflection Topics */}
        <div className="bg-stone-950/60 border border-stone-800/80 rounded-xl p-4 space-y-3">
          <h4 className="text-xs font-semibold text-stone-200 uppercase tracking-wider font-mono flex items-center gap-2">
            <Tag className="w-3.5 h-3.5 text-amber-400" />
            <span>Top Thematic Categories</span>
          </h4>

          {analytics.topTopics.length === 0 ? (
            <p className="text-xs text-stone-500 italic">No recurring topics found in this period.</p>
          ) : (
            <div className="flex flex-wrap gap-2 pt-1">
              {analytics.topTopics.map((topic) => (
                <span
                  key={topic.topic}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-stone-900 border border-stone-800 text-stone-300 text-xs font-mono"
                >
                  <span>{topic.topic}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 font-bold">
                    {topic.count}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Owner-Bound Security & Privacy Verification */}
      <div className="bg-stone-950/40 border border-emerald-500/20 rounded-xl p-3.5 text-xs text-stone-400 space-y-1">
        <div className="flex items-center gap-2 text-emerald-400 font-mono font-medium text-[11px]">
          <ShieldCheck className="w-4 h-4" />
          <span>Strict Owner Isolation &amp; Admin Privacy Guarantee</span>
        </div>
        <p className="text-[11px] text-stone-400 leading-relaxed">
          Mood telemetry is calculated deterministically on the server exclusively within your personal partition.
          Administrators and system telemetry APIs do not have access to your raw reflection text, short summaries,
          individual emotional scores, or private tags.
        </p>
      </div>

    </div>
  );
};
