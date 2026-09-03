import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Sparkles,
  Send,
  Plus,
  Trash2,
  Search,
  BookOpen,
  BrainCircuit,
  Lightbulb,
  CheckSquare,
  Square,
  HelpCircle,
  Copy,
  Check,
  RotateCcw,
  Clock,
  CloudCheck,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Tag,
  Smile,
  Zap,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { JournalEntry, ChatMessage, UserProfile, AISummary } from '../types';
import { saveJournalEntry, deleteJournalEntry } from '../lib/firebase';

interface DashboardProps {
  user: UserProfile;
  entries: JournalEntry[];
  activeEntryId: string | null;
  onSelectEntry: (id: string) => void;
  onNewEntry: () => void;
}

const MOODS: Array<{ id: JournalEntry['mood']; label: string; color: string; bg: string }> = [
  { id: 'reflective', label: 'Reflective', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' },
  { id: 'inspired', label: 'Inspired', color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/30' },
  { id: 'grateful', label: 'Grateful', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  { id: 'challenging', label: 'Challenging', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/30' },
  { id: 'curious', label: 'Curious', color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/30' },
  { id: 'calm', label: 'Calm', color: 'text-teal-400', bg: 'bg-teal-500/10 border-teal-500/30' },
];

const REFLECTION_PROMPTS = [
  '🌱 What is the core lesson or breakthrough from today?',
  '💡 Help me reframe this uncertainty or challenge positively.',
  '🎯 What are 3 micro-actions I can take to move forward?',
  '🧘 Help me practice gratitude for what went surprisingly well.',
  '🧠 What blind spots or cognitive assumptions might I have here?',
];

export const Dashboard: React.FC<DashboardProps> = ({
  user,
  entries,
  activeEntryId,
  onSelectEntry,
  onNewEntry,
}) => {
  const activeEntry = entries.find((e) => e.id === activeEntryId) || entries[0] || null;

  // UI States
  const [activeTab, setActiveTab] = useState<'chat' | 'summary' | 'brainstorm'>('chat');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMoodFilter, setSelectedMoodFilter] = useState<string>('all');
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isBrainstorming, setIsBrainstorming] = useState(false);
  const [brainstormFocus, setBrainstormFocus] = useState<'reframe' | 'action_items' | 'philosophical' | 'creative'>('reframe');
  const [brainstormResult, setBrainstormResult] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isJournalExpanded, setIsJournalExpanded] = useState(true);

  // Auto scroll chat
  const chatBottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (activeTab === 'chat') {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeEntry?.messages, activeTab]);

  // Filtered entries
  const filteredEntries = entries.filter((e) => {
    const matchesSearch =
      (e.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.content || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.messages || []).some((m) => m.content.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesMood = selectedMoodFilter === 'all' || e.mood === selectedMoodFilter;
    return matchesSearch && matchesMood;
  });

  // Handle saving entry updates
  const handleUpdateActiveEntry = async (updatedFields: Partial<JournalEntry>) => {
    if (!activeEntry) return;
    try {
      setSaveStatus('saving');
      const updatedEntry: JournalEntry = {
        ...activeEntry,
        ...updatedFields,
        updatedAt: new Date().toISOString(),
      };
      await saveJournalEntry(updatedEntry);
      setSaveStatus('saved');
    } catch (err: any) {
      console.error('Save error:', err);
      setSaveStatus('error');
      setErrorMessage('Failed to save to Firestore. Please click Retry.');
    }
  };

  // Send message to Gemini
  const handleSendMessage = async (customPrompt?: string) => {
    const messageContent = customPrompt || inputText;
    if (!messageContent.trim() || !activeEntry || isSending) return;

    const userMessage: ChatMessage = {
      id: 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      role: 'user',
      content: messageContent.trim(),
      timestamp: new Date().toISOString(),
    };

    const newMessages = [...(activeEntry.messages || []), userMessage];
    setInputText('');
    setIsSending(true);
    setErrorMessage(null);

    // Optimistically update local entry and save to Firestore
    const updatedEntry: JournalEntry = {
      ...activeEntry,
      messages: newMessages,
      content: activeEntry.content || messageContent.trim(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await saveJournalEntry(updatedEntry);
    } catch (err) {
      console.warn('Optimistic save warning:', err);
    }

    try {
      // Call server proxy with fallback ladder
      const res = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          contextText: activeEntry.content || '',
          mood: activeEntry.mood || 'reflective',
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with status ${res.status}`);
      }

      const data = await res.json();
      const geminiMessage: ChatMessage = {
        id: 'msg-gemini-' + Date.now(),
        role: 'gemini',
        content: data.reply || 'Reflected on your thought.',
        timestamp: new Date().toISOString(),
        modelUsed: data.modelUsed,
      };

      const finalMessages = [...newMessages, geminiMessage];
      const finalEntry: JournalEntry = {
        ...updatedEntry,
        messages: finalMessages,
        updatedAt: new Date().toISOString(),
      };

      await saveJournalEntry(finalEntry);
      setSaveStatus('saved');
    } catch (err: any) {
      console.error('Gemini chat error:', err);
      setErrorMessage(err.message || 'Unable to get response from Gemini.');
      setSaveStatus('error');
    } finally {
      setIsSending(false);
    }
  };

  // Generate AI Summary & Action Items
  const handleGenerateSummary = async () => {
    if (!activeEntry || isSummarizing) return;
    setIsSummarizing(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/gemini/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: activeEntry.content || '',
          messages: activeEntry.messages || [],
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to synthesize summary.');
      }

      const data = await res.json();
      const summaryData: AISummary = {
        ...data.summary,
        generatedAt: new Date().toISOString(),
      };

      const updatedFields: Partial<JournalEntry> = {
        summary: summaryData,
      };

      if (summaryData.title && (!activeEntry.title || activeEntry.title === 'Untitled Reflection')) {
        updatedFields.title = summaryData.title;
      }
      if (summaryData.sentimentMood && MOODS.some((m) => m.id === summaryData.sentimentMood)) {
        updatedFields.mood = summaryData.sentimentMood as JournalEntry['mood'];
      }

      await handleUpdateActiveEntry(updatedFields);
      setActiveTab('summary');
    } catch (err: any) {
      console.error('Summary error:', err);
      setErrorMessage(err.message || 'Failed to generate summary.');
    } finally {
      setIsSummarizing(false);
    }
  };

  // Brainstorm Perspectives
  const handleBrainstorm = async () => {
    if (!activeEntry || isBrainstorming) return;
    setIsBrainstorming(true);
    setErrorMessage(null);

    try {
      const combinedText = `Title: ${activeEntry.title}\nContent: ${activeEntry.content}\nRecent dialogue:\n${(activeEntry.messages || [])
        .slice(-4)
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n')}`;

      const res = await fetch('/api/gemini/brainstorm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: combinedText,
          focusArea: brainstormFocus,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to brainstorm perspectives.');
      }

      const data = await res.json();
      setBrainstormResult(data.ideas || 'No brainstorm ideas generated.');
    } catch (err: any) {
      console.error('Brainstorm error:', err);
      setErrorMessage(err.message || 'Failed to generate brainstorm insights.');
    } finally {
      setIsBrainstorming(false);
    }
  };

  // Delete current entry
  const handleDeleteEntry = async (entryId: string) => {
    if (window.confirm('Are you sure you want to delete this reflection?')) {
      try {
        await deleteJournalEntry(user.uid, entryId);
      } catch (err) {
        console.error('Delete error:', err);
        setErrorMessage('Failed to delete entry from Firestore.');
      }
    }
  };

  // Toggle Action item checkbox
  const handleToggleActionItem = (actionIndex: number) => {
    if (!activeEntry?.summary?.suggestedActionItems) return;
    const actionItems = [...activeEntry.summary.suggestedActionItems];
    const current = actionItems[actionIndex];
    if (current.startsWith('[x] ')) {
      actionItems[actionIndex] = current.replace('[x] ', '');
    } else {
      actionItems[actionIndex] = '[x] ' + current;
    }

    handleUpdateActiveEntry({
      summary: {
        ...activeEntry.summary,
        suggestedActionItems: actionItems,
      },
    });
  };

  // Copy to clipboard helper
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      
      {/* Global Error Banner */}
      {errorMessage && (
        <div className="mb-4 p-3 rounded-xl bg-red-950/70 border border-red-800 text-red-200 text-xs flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="px-2 py-1 bg-red-900/60 hover:bg-red-800 rounded text-[11px] font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ========================================== */}
        {/* LEFT COLUMN: Sidebar & Reflection History */}
        {/* ========================================== */}
        <aside className="lg:col-span-4 space-y-4">
          
          {/* Header & New Reflection Action */}
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-amber-400" />
                <h2 className="font-semibold text-stone-100 text-sm">Reflection History</h2>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-stone-800 text-stone-400 font-mono">
                {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>

            <button
              id="sidebar-new-reflection-btn"
              onClick={onNewEntry}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-medium text-xs transition-colors shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Reflection</span>
            </button>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="search-reflections-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search entries or insights..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-stone-950 border border-stone-800 text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-500/50"
              />
            </div>

            {/* Mood Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] scrollbar-none">
              <button
                onClick={() => setSelectedMoodFilter('all')}
                className={`px-2 py-1 rounded-md transition-colors shrink-0 ${
                  selectedMoodFilter === 'all'
                    ? 'bg-amber-500 text-stone-950 font-medium'
                    : 'bg-stone-800/80 text-stone-400 hover:text-stone-200'
                }`}
              >
                All
              </button>
              {MOODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedMoodFilter(m.id || 'all')}
                  className={`px-2 py-1 rounded-md transition-colors shrink-0 ${
                    selectedMoodFilter === m.id
                      ? `${m.bg} ${m.color} font-medium border`
                      : 'bg-stone-800/80 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* History Scroll List */}
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-2 max-h-[calc(100vh-22rem)] overflow-y-auto space-y-1.5 shadow-sm">
            {filteredEntries.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <BookOpen className="w-8 h-8 text-stone-600 mx-auto" />
                <p className="text-xs text-stone-400 font-medium">No reflections found</p>
                <p className="text-[11px] text-stone-500">
                  {entries.length === 0 ? 'Click "Create New Reflection" to begin.' : 'Try adjusting your search query.'}
                </p>
              </div>
            ) : (
              filteredEntries.map((entry) => {
                const isActive = activeEntry?.id === entry.id;
                const moodConfig = MOODS.find((m) => m.id === entry.mood);
                const dateStr = new Date(entry.updatedAt || entry.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={entry.id}
                    onClick={() => onSelectEntry(entry.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer text-left group relative ${
                      isActive
                        ? 'bg-amber-500/10 border-amber-500/40 text-stone-100 shadow-sm'
                        : 'bg-stone-950/40 border-stone-800/60 hover:bg-stone-800/50 text-stone-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-medium text-xs text-stone-100 line-clamp-1 group-hover:text-amber-300 transition-colors">
                        {entry.title || 'Untitled Reflection'}
                      </h3>
                      {moodConfig && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${moodConfig.bg} ${moodConfig.color} font-medium shrink-0`}>
                          {moodConfig.label}
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-stone-400 line-clamp-2 mt-1 leading-relaxed">
                      {entry.summary?.summary || entry.content || (entry.messages && entry.messages[0]?.content) || 'Empty journal reflection...'}
                    </p>

                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-stone-800/60 text-[10px] text-stone-500">
                      <span className="flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3" />
                        {dateStr}
                      </span>
                      <span className="font-mono">
                        {entry.messages?.length || 0} turns
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* User Isolation Trust Footer Card */}
          <div className="bg-stone-900/60 border border-stone-800/80 rounded-xl p-3.5 text-xs text-stone-400 space-y-1.5 font-mono">
            <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-[11px]">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              Isolated Cloud Firestore
            </div>
            <p className="text-[10px] text-stone-500 leading-tight">
              Partition: <code className="text-amber-400">/users/{user.uid.slice(0, 10)}.../entries</code>
            </p>
          </div>

        </aside>

        {/* ========================================== */}
        {/* RIGHT COLUMN: Active Reflection Studio */}
        {/* ========================================== */}
        <main className="lg:col-span-8 space-y-4">
          {activeEntry ? (
            <div className="bg-stone-900 border border-stone-800 rounded-2xl shadow-xl flex flex-col min-h-[calc(100vh-10rem)]">
              
              {/* Studio Header & Metadata Controls */}
              <div className="p-5 border-b border-stone-800 space-y-4">
                
                {/* Title & Top Toolbar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1">
                    <input
                      id="entry-title-input"
                      type="text"
                      value={activeEntry.title || ''}
                      onChange={(e) => handleUpdateActiveEntry({ title: e.target.value })}
                      placeholder="Title this reflection..."
                      className="text-lg sm:text-xl font-bold font-serif text-stone-100 bg-transparent border-b border-transparent hover:border-stone-700 focus:border-amber-500/60 focus:outline-none w-full px-1 py-0.5 transition-colors"
                    />
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Cloud Save Badge */}
                    <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-stone-950 border border-stone-800 text-[10px] font-mono text-stone-400">
                      {saveStatus === 'saving' ? (
                        <>
                          <div className="w-2.5 h-2.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
                          <span>Syncing...</span>
                        </>
                      ) : saveStatus === 'error' ? (
                        <>
                          <AlertCircle className="w-3 h-3 text-red-400" />
                          <button
                            onClick={() => handleUpdateActiveEntry({})}
                            className="text-red-400 underline hover:text-red-300"
                          >
                            Retry Save
                          </button>
                        </>
                      ) : (
                        <>
                          <CloudCheck className="w-3 h-3 text-emerald-400" />
                          <span>Firestore Synced</span>
                        </>
                      )}
                    </div>

                    {/* Delete Entry */}
                    <button
                      id="delete-entry-btn"
                      onClick={() => handleDeleteEntry(activeEntry.id)}
                      className="p-1.5 rounded-lg text-stone-400 hover:text-red-400 hover:bg-stone-800 transition-colors"
                      title="Delete this reflection"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Mood Tag Selector & AI Quick Triggers */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-stone-800/60">
                  {/* Mood Badges */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-stone-400 font-mono mr-1 flex items-center gap-1">
                      <Smile className="w-3 h-3" /> Mood:
                    </span>
                    {MOODS.map((m) => {
                      const isSelected = activeEntry.mood === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => handleUpdateActiveEntry({ mood: m.id })}
                          className={`text-[11px] px-2.5 py-0.5 rounded-full border transition-all cursor-pointer ${
                            isSelected
                              ? `${m.bg} ${m.color} font-semibold ring-1 ring-amber-500/40`
                              : 'bg-stone-950/60 border-stone-800 text-stone-400 hover:text-stone-200'
                          }`}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* AI Quick Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      id="auto-summarize-btn"
                      onClick={handleGenerateSummary}
                      disabled={isSummarizing}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{isSummarizing ? 'Synthesizing...' : 'Auto-Summarize'}</span>
                    </button>
                  </div>
                </div>

                {/* Workspace Tabs Navigation */}
                <div className="flex items-center gap-1 bg-stone-950 p-1 rounded-xl border border-stone-800 text-xs">
                  <button
                    onClick={() => setActiveTab('chat')}
                    className={`flex-1 py-1.5 px-3 rounded-lg font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      activeTab === 'chat'
                        ? 'bg-stone-800 text-amber-400 shadow-sm'
                        : 'text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Reflection &amp; Dialogue</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('summary')}
                    className={`flex-1 py-1.5 px-3 rounded-lg font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      activeTab === 'summary'
                        ? 'bg-stone-800 text-amber-400 shadow-sm'
                        : 'text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    <BrainCircuit className="w-3.5 h-3.5" />
                    <span>AI Insights &amp; Takeaways</span>
                    {activeEntry.summary && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    )}
                  </button>

                  <button
                    onClick={() => setActiveTab('brainstorm')}
                    className={`flex-1 py-1.5 px-3 rounded-lg font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      activeTab === 'brainstorm'
                        ? 'bg-stone-800 text-amber-400 shadow-sm'
                        : 'text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    <Lightbulb className="w-3.5 h-3.5" />
                    <span>Brainstorm &amp; Reframe</span>
                  </button>
                </div>

              </div>

              {/* ========================================== */}
              {/* TAB 1: Multi-Turn Reflection & Dialogue */}
              {/* ========================================== */}
              {activeTab === 'chat' && (
                <div className="flex-1 flex flex-col justify-between p-5 space-y-4">
                  
                  {/* Collapsible Original Thought / Journal Scratchpad */}
                  <div className="bg-stone-950/80 border border-stone-800 rounded-xl overflow-hidden shadow-inner">
                    <button
                      onClick={() => setIsJournalExpanded(!isJournalExpanded)}
                      className="w-full px-4 py-2.5 bg-stone-900/60 flex items-center justify-between text-xs text-stone-300 hover:text-stone-100 transition-colors border-b border-stone-800/80 cursor-pointer"
                    >
                      <span className="font-semibold flex items-center gap-2">
                        <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                        Original Journal Thoughts &amp; Context
                      </span>
                      {isJournalExpanded ? (
                        <ChevronUp className="w-4 h-4 text-stone-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-stone-400" />
                      )}
                    </button>
                    {isJournalExpanded && (
                      <div className="p-3">
                        <textarea
                          id="journal-scratchpad-input"
                          value={activeEntry.content || ''}
                          onChange={(e) => handleUpdateActiveEntry({ content: e.target.value })}
                          placeholder="Write your raw thoughts, daily log, experiences, or reflections here..."
                          rows={3}
                          className="w-full bg-transparent text-xs sm:text-sm text-stone-200 placeholder-stone-500 focus:outline-none resize-y leading-relaxed font-sans"
                        />
                      </div>
                    )}
                  </div>

                  {/* Multi-turn Chat Stream */}
                  <div className="flex-1 overflow-y-auto max-h-[420px] space-y-4 pr-1">
                    {(!activeEntry.messages || activeEntry.messages.length === 0) ? (
                      <div className="p-8 text-center space-y-3 bg-stone-950/40 rounded-xl border border-stone-800/60">
                        <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <h4 className="text-sm font-semibold text-stone-200">Start Your Reflection Dialogue</h4>
                        <p className="text-xs text-stone-400 max-w-md mx-auto leading-relaxed">
                          Converse with Gemini to explore your insights, reframe emotional blocks, or brainstorm solutions. Click a starter below or type your thought.
                        </p>
                      </div>
                    ) : (
                      activeEntry.messages.map((msg) => {
                        const isUser = msg.role === 'user';
                        return (
                          <div
                            key={msg.id}
                            className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}
                          >
                            <div className="flex items-center gap-2 px-1">
                              <span className="text-[10px] font-mono text-stone-400">
                                {isUser ? 'You' : 'Gemini 3.6 Flash'}
                              </span>
                              {msg.modelUsed && (
                                <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-stone-800 text-stone-400">
                                  {msg.modelUsed}
                                </span>
                              )}
                              <span className="text-[9px] font-mono text-stone-500">
                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>

                            <div
                              className={`p-4 rounded-2xl max-w-[85%] text-xs sm:text-sm leading-relaxed shadow-sm relative group ${
                                isUser
                                  ? 'bg-amber-500 text-stone-950 font-medium rounded-tr-none'
                                  : 'bg-stone-950 border border-stone-800 text-stone-200 rounded-tl-none'
                              }`}
                            >
                              {isUser ? (
                                <p className="whitespace-pre-wrap">{msg.content}</p>
                              ) : (
                                <div className="prose prose-invert prose-xs max-w-none prose-p:leading-relaxed prose-headings:text-amber-400 prose-ul:my-2 prose-li:my-0.5">
                                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                                </div>
                              )}

                              {/* Copy Trigger */}
                              <button
                                onClick={() => handleCopy(msg.content, msg.id)}
                                className={`absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                                  isUser ? 'hover:bg-amber-600 text-stone-900' : 'hover:bg-stone-800 text-stone-400'
                                }`}
                                title="Copy text"
                              >
                                {copiedId === msg.id ? (
                                  <Check className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                    
                    {isSending && (
                      <div className="flex items-center gap-2 p-3 rounded-xl bg-stone-950 border border-stone-800 max-w-xs text-xs text-stone-400">
                        <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0"></div>
                        <span>Gemini is reflecting on your input...</span>
                      </div>
                    )}
                    <div ref={chatBottomRef} />
                  </div>

                  {/* Reflection Starter Inspiration Chips */}
                  <div className="space-y-1.5 pt-2">
                    <span className="text-[10px] font-mono text-stone-400 block">
                      💡 Inspiration Starters:
                    </span>
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                      {REFLECTION_PROMPTS.map((prompt, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSendMessage(prompt)}
                          disabled={isSending}
                          className="px-2.5 py-1 rounded-lg bg-stone-950 hover:bg-stone-800 border border-stone-800 text-stone-300 hover:text-stone-100 text-[11px] shrink-0 transition-colors cursor-pointer"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Dialogue Input Box */}
                  <div className="relative pt-2">
                    <div className="flex items-end gap-2 bg-stone-950 border border-stone-800 rounded-xl p-2 focus-within:border-amber-500/60 transition-colors shadow-inner">
                      <textarea
                        id="dialogue-prompt-input"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        placeholder="Type a reflection, ask for guidance, or share what's on your mind... (Enter to send)"
                        rows={2}
                        className="flex-1 bg-transparent text-xs sm:text-sm text-stone-100 placeholder-stone-500 focus:outline-none resize-none px-2 py-1 leading-relaxed"
                      />
                      <button
                        id="send-reflection-btn"
                        onClick={() => handleSendMessage()}
                        disabled={isSending || !inputText.trim()}
                        className="p-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:hover:bg-amber-500 text-stone-950 transition-colors shadow-sm cursor-pointer shrink-0"
                        title="Send to Gemini"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                </div>
              )}

              {/* ========================================== */}
              {/* TAB 2: AI Summary & Structured Takeaways */}
              {/* ========================================== */}
              {activeTab === 'summary' && (
                <div className="p-6 space-y-6 overflow-y-auto max-h-[600px]">
                  {!activeEntry.summary ? (
                    <div className="p-12 text-center space-y-4 bg-stone-950/60 rounded-2xl border border-stone-800">
                      <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
                        <BrainCircuit className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-base font-bold text-stone-100">No AI Summary Synthesized Yet</h3>
                        <p className="text-xs text-stone-400 max-w-sm mx-auto">
                          Gemini can distill your raw journal notes and reflection turns into executive takeaways and actionable next steps.
                        </p>
                      </div>
                      <button
                        id="synthesize-summary-btn"
                        onClick={handleGenerateSummary}
                        disabled={isSummarizing}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-medium text-xs transition-colors shadow-md cursor-pointer"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>{isSummarizing ? 'Synthesizing...' : 'Generate AI Summary & Insights'}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      
                      {/* Executive Summary Card */}
                      <div className="bg-stone-950 border border-stone-800 rounded-xl p-5 space-y-2 shadow-inner">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-mono text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" /> Executive Summary
                          </span>
                          {activeEntry.summary.generatedAt && (
                            <span className="text-[10px] font-mono text-stone-500">
                              Generated {new Date(activeEntry.summary.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                        <p className="text-xs sm:text-sm text-stone-200 leading-relaxed">
                          {activeEntry.summary.summary}
                        </p>
                      </div>

                      {/* Key Takeaways */}
                      {activeEntry.summary.keyTakeaways && activeEntry.summary.keyTakeaways.length > 0 && (
                        <div className="space-y-3">
                          <h4 className="text-xs font-semibold text-stone-300 uppercase tracking-wider flex items-center gap-2">
                            <Zap className="w-3.5 h-3.5 text-amber-400" /> Core Insights &amp; Takeaways
                          </h4>
                          <div className="grid grid-cols-1 gap-2.5">
                            {activeEntry.summary.keyTakeaways.map((takeaway, idx) => (
                              <div
                                key={idx}
                                className="p-3.5 rounded-xl bg-stone-950/70 border border-stone-800 text-xs text-stone-200 flex items-start gap-2.5"
                              >
                                <span className="w-5 h-5 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center text-[10px] font-mono shrink-0">
                                  {idx + 1}
                                </span>
                                <span className="leading-relaxed">{takeaway}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Suggested Action Items (Interactive Checklist) */}
                      {activeEntry.summary.suggestedActionItems && activeEntry.summary.suggestedActionItems.length > 0 && (
                        <div className="space-y-3">
                          <h4 className="text-xs font-semibold text-stone-300 uppercase tracking-wider flex items-center gap-2">
                            <CheckSquare className="w-3.5 h-3.5 text-emerald-400" /> Actionable Next Steps
                          </h4>
                          <div className="space-y-2">
                            {activeEntry.summary.suggestedActionItems.map((item, idx) => {
                              const isChecked = item.startsWith('[x] ');
                              const label = isChecked ? item.replace('[x] ', '') : item;
                              return (
                                <div
                                  key={idx}
                                  onClick={() => handleToggleActionItem(idx)}
                                  className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${
                                    isChecked
                                      ? 'bg-emerald-950/20 border-emerald-800/40 text-stone-400 line-through'
                                      : 'bg-stone-950/80 border-stone-800 text-stone-200 hover:border-stone-700'
                                  }`}
                                >
                                  {isChecked ? (
                                    <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                                  ) : (
                                    <Square className="w-4 h-4 text-stone-500 shrink-0" />
                                  )}
                                  <span className="text-xs leading-relaxed">{label}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Deep Probing Reflection Questions */}
                      {activeEntry.summary.reflectionQuestions && activeEntry.summary.reflectionQuestions.length > 0 && (
                        <div className="space-y-3">
                          <h4 className="text-xs font-semibold text-stone-300 uppercase tracking-wider flex items-center gap-2">
                            <HelpCircle className="w-3.5 h-3.5 text-sky-400" /> Follow-Up Reflection Inquiries
                          </h4>
                          <div className="space-y-2">
                            {activeEntry.summary.reflectionQuestions.map((q, idx) => (
                              <div
                                key={idx}
                                className="p-3.5 rounded-xl bg-stone-950/80 border border-stone-800 text-xs text-stone-300 flex items-center justify-between gap-3"
                              >
                                <span className="italic leading-relaxed">&ldquo;{q}&rdquo;</span>
                                <button
                                  onClick={() => {
                                    setActiveTab('chat');
                                    handleSendMessage(`Regarding the question: "${q}" - here is my thought: `);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-[11px] font-medium shrink-0 flex items-center gap-1 transition-colors"
                                >
                                  <span>Answer in Chat</span>
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Re-generate trigger */}
                      <div className="pt-2 flex justify-end">
                        <button
                          onClick={handleGenerateSummary}
                          disabled={isSummarizing}
                          className="text-xs text-stone-400 hover:text-amber-400 flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Re-synthesize AI Summary</span>
                        </button>
                      </div>

                    </div>
                  )}
                </div>
              )}

              {/* ========================================== */}
              {/* TAB 3: Brainstorm & Cognitive Reframing */}
              {/* ========================================== */}
              {activeTab === 'brainstorm' && (
                <div className="p-6 space-y-6 overflow-y-auto max-h-[600px]">
                  
                  {/* Focus Area Controls */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-stone-300 uppercase tracking-wider flex items-center gap-2">
                      <Lightbulb className="w-3.5 h-3.5 text-amber-400" /> Select Exploration Direction
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        {
                          id: 'reframe',
                          title: '🔄 Cognitive Reframe',
                          desc: 'Find growth opportunities, silver linings, and self-compassion.',
                        },
                        {
                          id: 'action_items',
                          title: '⚡ Micro Action Steps',
                          desc: 'Break abstract ideas into low-friction daily habits.',
                        },
                        {
                          id: 'philosophical',
                          title: '🏛️ Philosophical Wisdom',
                          desc: 'Analyze through Stoicism, Mindfulness, and Essentialism.',
                        },
                        {
                          id: 'creative',
                          title: '🚀 Divergent Possibilities',
                          desc: 'Unconventional angles, lateral thinking, and novel paths.',
                        },
                      ].map((item) => (
                        <div
                          key={item.id}
                          onClick={() => setBrainstormFocus(item.id as any)}
                          className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                            brainstormFocus === item.id
                              ? 'bg-amber-500/10 border-amber-500/50 text-stone-100 shadow-sm'
                              : 'bg-stone-950/60 border-stone-800 text-stone-400 hover:border-stone-700'
                          }`}
                        >
                          <h4 className="font-semibold text-xs text-stone-100">{item.title}</h4>
                          <p className="text-[11px] text-stone-400 mt-1">{item.desc}</p>
                        </div>
                      ))}
                    </div>

                    <button
                      id="run-brainstorm-btn"
                      onClick={handleBrainstorm}
                      disabled={isBrainstorming}
                      className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-medium text-xs transition-colors shadow-md disabled:opacity-50 cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>{isBrainstorming ? 'Brainstorming with Gemini...' : 'Generate Structured Perspectives'}</span>
                    </button>
                  </div>

                  {/* Brainstorm Result Rendering */}
                  {brainstormResult && (
                    <div className="bg-stone-950 border border-stone-800 rounded-xl p-5 space-y-3 shadow-inner">
                      <div className="flex items-center justify-between border-b border-stone-800/80 pb-2">
                        <span className="text-[11px] font-mono text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Lightbulb className="w-3.5 h-3.5" /> Generated Perspectives
                        </span>
                        <button
                          onClick={() => handleCopy(brainstormResult, 'brainstorm')}
                          className="text-xs text-stone-400 hover:text-stone-200 flex items-center gap-1"
                        >
                          {copiedId === 'brainstorm' ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>{copiedId === 'brainstorm' ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>

                      <div className="prose prose-invert prose-xs max-w-none text-stone-200 prose-headings:text-amber-400 prose-ul:my-2">
                        <ReactMarkdown>{brainstormResult}</ReactMarkdown>
                      </div>
                    </div>
                  )}

                </div>
              )}

            </div>
          ) : (
            <div className="bg-stone-900 border border-stone-800 rounded-2xl p-12 text-center space-y-4">
              <BookOpen className="w-12 h-12 text-stone-600 mx-auto" />
              <h3 className="text-base font-bold text-stone-100">No Reflection Selected</h3>
              <p className="text-xs text-stone-400 max-w-sm mx-auto">
                Select an entry from the history sidebar or create a fresh reflection to start conversing with Gemini.
              </p>
              <button
                onClick={onNewEntry}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-stone-950 font-medium text-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Create New Reflection</span>
              </button>
            </div>
          )}
        </main>

      </div>
    </div>
  );
};
