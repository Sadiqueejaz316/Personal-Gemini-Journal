import React from 'react';
import { Sparkles, Shield, Lock, Database, ArrowRight, BrainCircuit, CheckCircle2, FileText, MessagesSquare } from 'lucide-react';

interface AuthLandingProps {
  onSignIn: () => void;
  isLoading: boolean;
  errorMessage?: string | null;
}

export const AuthLanding: React.FC<AuthLandingProps> = ({
  onSignIn,
  isLoading,
  errorMessage,
}) => {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-stone-950 text-stone-100 flex flex-col justify-center px-4 sm:px-6 lg:px-8 py-12">
      <div className="max-w-4xl mx-auto w-full space-y-12">
        
        {/* Main Hero Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            AI-Augmented Mindful Journaling
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-stone-100 font-serif max-w-2xl mx-auto">
            Deep Reflections, Guided by <span className="text-amber-400">Gemini 3.6 Flash</span>
          </h1>
          <p className="text-stone-400 text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
            A secure, private sanctuary to write daily thoughts, converse with an empathetic AI reflection partner, and capture structured takeaways saved in Cloud Firestore.
          </p>
        </div>

        {/* Primary Auth Action Card */}
        <div className="max-w-md mx-auto bg-stone-900 border border-stone-800 rounded-2xl p-8 shadow-xl text-center space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-stone-100">Welcome to your Private Sanctuary</h2>
            <p className="text-xs text-stone-400">
              Sign in with your Google account to access your user-isolated Firestore journal.
            </p>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-lg bg-red-950/60 border border-red-800/80 text-red-200 text-xs text-left">
              <span className="font-semibold block">Authentication Notice:</span>
              {errorMessage}
            </div>
          )}

          <button
            id="google-signin-button"
            onClick={onSignIn}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl bg-white hover:bg-stone-100 text-stone-900 font-medium text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed group cursor-pointer"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-stone-900 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.94H1.24v3.15C3.26 21.4 7.33 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.26c-.25-.72-.38-1.49-.38-2.26s.13-1.54.38-2.26V6.59H1.24C.45 8.16 0 9.94 0 12s.45 3.84 1.24 5.41l4.04-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.6 1.24 6.59l4.04 3.15c.95-2.84 3.6-4.94 6.72-4.94z"
                />
              </svg>
            )}
            <span className="font-semibold">Sign in with Google</span>
          </button>

          <div className="pt-2 flex items-center justify-center gap-4 text-[11px] text-stone-500">
            <span className="flex items-center gap-1">
              <Lock className="w-3 h-3 text-emerald-500" /> Owner-Bound Firestore
            </span>
            <span>&bull;</span>
            <span className="flex items-center gap-1">
              <Shield className="w-3 h-3 text-blue-500" /> Federated OAuth
            </span>
          </div>
        </div>

        {/* Security & Tech Pillar Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
          <div className="bg-stone-900/60 border border-stone-800/80 rounded-xl p-5 space-y-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Database className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-stone-200 text-sm">Owner-Bound Firestore Isolation</h3>
            <p className="text-xs text-stone-400 leading-relaxed">
              Every journal entry and conversation turn is strictly quarantined at <code className="text-amber-300 font-mono">/users/{'{userId}'}/entries</code>. Cross-user access is blocked at the database engine level by security rules.
            </p>
          </div>

          <div className="bg-stone-900/60 border border-stone-800/80 rounded-xl p-5 space-y-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-stone-200 text-sm">Resilient Gemini 3.6 Flash Engine</h3>
            <p className="text-xs text-stone-400 leading-relaxed">
              Powered by a high-availability fallback ladder (Flash 3.6 &rarr; Flash Lite 3.1 &rarr; Dynamic Flash &rarr; Flash 3.7) to ensure uninterrupted multi-turn dialogue, cognitive reframing, and structured summaries.
            </p>
          </div>

          <div className="bg-stone-900/60 border border-stone-800/80 rounded-xl p-5 space-y-3">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Shield className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-stone-200 text-sm">Zero-Credential Storage</h3>
            <p className="text-xs text-stone-400 leading-relaxed">
              No passwords or sensitive tokens are stored in the application database. Direct Google OAuth handles identity verification securely.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};
