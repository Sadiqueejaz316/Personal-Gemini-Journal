import React, { useState } from 'react';
import {
  Sparkles,
  Shield,
  Lock,
  Database,
  BrainCircuit,
  Mail,
  KeyRound,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  HelpCircle,
} from 'lucide-react';

interface AuthLandingProps {
  onSignInWithGoogle: () => Promise<void>;
  onSignInWithEmail: (email: string, password: string) => Promise<void>;
  onSignUpWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  onResetPassword: (email: string) => Promise<void>;
  isLoading: boolean;
  errorMessage?: string | null;
  onClearError?: () => void;
}

type AuthMode = 'signin' | 'signup' | 'forgot';

export const AuthLanding: React.FC<AuthLandingProps> = ({
  onSignInWithGoogle,
  onSignInWithEmail,
  onSignUpWithEmail,
  onResetPassword,
  isLoading,
  errorMessage,
  onClearError,
}) => {
  const [mode, setMode] = useState<AuthMode>('signin');
  
  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  
  // UI Controls
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [localValidationWarning, setLocalValidationWarning] = useState<string | null>(null);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);

  const handleModeChange = (newMode: AuthMode) => {
    setMode(newMode);
    setLocalValidationWarning(null);
    setResetSuccessMessage(null);
    if (newMode === 'signup' && password && !confirmPassword) {
      setConfirmPassword(password);
    }
    if (onClearError) onClearError();
  };

  const handleQuickCreateAccount = async () => {
    if (!email.trim() || !password) {
      handleModeChange('signup');
      return;
    }
    if (password.length < 6) {
      setLocalValidationWarning('Password must be at least 6 characters.');
      handleModeChange('signup');
      return;
    }
    setLocalValidationWarning(null);
    if (onClearError) onClearError();
    await onSignUpWithEmail(email.trim(), password, displayName.trim());
  };

  const handleEmailAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalValidationWarning(null);
    setResetSuccessMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setLocalValidationWarning('Please enter your email address.');
      return;
    }

    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setLocalValidationWarning('Please provide a valid email format (e.g. name@example.com).');
      return;
    }

    if (mode === 'forgot') {
      try {
        await onResetPassword(trimmedEmail);
        setResetSuccessMessage(`Password reset link sent to ${trimmedEmail}. Please check your inbox.`);
      } catch {
        // error handled via prop
      }
      return;
    }

    if (!password) {
      setLocalValidationWarning('Please enter your password.');
      return;
    }

    if (password.length < 6) {
      setLocalValidationWarning('Password must contain at least 6 characters.');
      return;
    }

    if (mode === 'signup') {
      if (password !== confirmPassword) {
        setLocalValidationWarning('Passwords do not match. Please verify both fields.');
        return;
      }
      await onSignUpWithEmail(trimmedEmail, password, displayName.trim());
    } else {
      await onSignInWithEmail(trimmedEmail, password);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-stone-950 text-stone-100 flex flex-col justify-center px-4 sm:px-6 lg:px-8 py-10">
      <div className="max-w-4xl mx-auto w-full space-y-10">
        
        {/* Main Hero Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            AI-Augmented Mindful Journaling
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-stone-100 font-serif max-w-2xl mx-auto">
            Deep Reflections, Guided by <span className="text-amber-400">Gemini 3.6 Flash</span>
          </h1>
          <p className="text-stone-400 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
            A secure, private sanctuary to capture daily thoughts, engage in empathetic AI dialogue, and retain user-isolated reflections in Cloud Firestore.
          </p>
        </div>

        {/* Primary Auth Container Card */}
        <div className="max-w-md mx-auto w-full bg-stone-900 border border-stone-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
          
          {/* Top Auth Mode Tabs */}
          <div className="flex rounded-xl bg-stone-950/80 p-1 border border-stone-800">
            <button
              id="auth-tab-signin"
              type="button"
              onClick={() => handleModeChange('signin')}
              className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
                mode === 'signin'
                  ? 'bg-amber-500 text-stone-950 font-semibold shadow-sm'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              Sign In
            </button>
            <button
              id="auth-tab-signup"
              type="button"
              onClick={() => handleModeChange('signup')}
              className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
                mode === 'signup'
                  ? 'bg-amber-500 text-stone-950 font-semibold shadow-sm'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Form Context Header */}
          <div className="space-y-1 text-center">
            <h2 className="text-lg font-semibold text-stone-100">
              {mode === 'signin' && 'Sign in with Email or Google'}
              {mode === 'signup' && 'Create your Personal Journal'}
              {mode === 'forgot' && 'Reset your Account Password'}
            </h2>
            <p className="text-xs text-stone-400">
              {mode === 'signin' && 'Enter your credentials or use federated Google OAuth'}
              {mode === 'signup' && 'All entries will be isolated to your unique user identity'}
              {mode === 'forgot' && "We'll send a password recovery link to your registered email"}
            </p>
          </div>

          {/* Feedback & Error Notifications */}
          {errorMessage && (
            <div
              id="auth-error-banner"
              className="p-4 rounded-xl bg-red-950/80 border border-red-800 text-red-200 text-xs flex items-start gap-3"
            >
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-2 flex-1">
                <span className="font-semibold block text-red-300">Authentication Notice</span>
                <p className="leading-snug">{errorMessage}</p>
                {mode === 'signin' && (
                  <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    {email.trim() && password ? (
                      <button
                        type="button"
                        onClick={handleQuickCreateAccount}
                        disabled={isLoading}
                        className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <User className="w-3.5 h-3.5" />
                        <span>Create Account with entered details</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleModeChange('signup')}
                        className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 font-medium text-xs transition-colors"
                      >
                        Switch to Create Account
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onSignInWithGoogle}
                      disabled={isLoading}
                      className="px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-200 text-xs transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>Sign in with Google</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {localValidationWarning && (
            <div
              id="auth-validation-warning"
              className="p-3 rounded-xl bg-amber-950/60 border border-amber-800/80 text-amber-200 text-xs flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>{localValidationWarning}</span>
            </div>
          )}

          {resetSuccessMessage && (
            <div
              id="auth-reset-success-banner"
              className="p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-800/90 text-emerald-200 text-xs flex items-start gap-2.5"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block text-emerald-300">Reset Email Sent</span>
                <p className="leading-snug">{resetSuccessMessage}</p>
              </div>
            </div>
          )}

          {/* Email / Password Form */}
          <form onSubmit={handleEmailAuthSubmit} className="space-y-4 text-left">
            
            {/* Display Name (Sign Up only) */}
            {mode === 'signup' && (
              <div className="space-y-1.5">
                <label
                  htmlFor="auth-signup-name"
                  className="block text-xs font-medium text-stone-300"
                >
                  Display Name <span className="text-stone-500 font-normal">(Optional)</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-500">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    id="auth-signup-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => {
                      setDisplayName(e.target.value);
                      if (localValidationWarning) setLocalValidationWarning(null);
                      if (onClearError) onClearError();
                    }}
                    placeholder="e.g. Alex Rivera"
                    autoComplete="name"
                    disabled={isLoading}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-stone-950 border border-stone-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-stone-100 placeholder-stone-600 text-xs sm:text-sm transition-colors disabled:opacity-50"
                  />
                </div>
              </div>
            )}

            {/* Email Address */}
            <div className="space-y-1.5">
              <label
                htmlFor="auth-email-input"
                className="block text-xs font-medium text-stone-300"
              >
                Email Address <span className="text-amber-400">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-500">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="auth-email-input"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (localValidationWarning) setLocalValidationWarning(null);
                    if (onClearError) onClearError();
                  }}
                  placeholder="name@example.com"
                  autoComplete="email"
                  disabled={isLoading}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-stone-950 border border-stone-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-stone-100 placeholder-stone-600 text-xs sm:text-sm transition-colors disabled:opacity-50"
                />
              </div>
            </div>

            {/* Password (Sign In & Sign Up) */}
            {mode !== 'forgot' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="auth-password-input"
                    className="block text-xs font-medium text-stone-300"
                  >
                    Password <span className="text-amber-400">*</span>
                  </label>
                  {mode === 'signin' && (
                    <button
                      id="auth-forgot-password-toggle"
                      type="button"
                      onClick={() => handleModeChange('forgot')}
                      className="text-[11px] text-amber-400 hover:text-amber-300 transition-colors"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-500">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    id="auth-password-input"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (localValidationWarning) setLocalValidationWarning(null);
                      if (onClearError) onClearError();
                    }}
                    placeholder="••••••••"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    disabled={isLoading}
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-stone-950 border border-stone-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-stone-100 placeholder-stone-600 text-xs sm:text-sm transition-colors disabled:opacity-50"
                  />
                  <button
                    id="auth-password-visibility-btn"
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-stone-500 hover:text-stone-300 transition-colors"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {mode === 'signup' && (
                  <p className="text-[11px] text-stone-500">
                    Must be at least 6 characters long.
                  </p>
                )}
              </div>
            )}

            {/* Confirm Password (Sign Up only) */}
            {mode === 'signup' && (
              <div className="space-y-1.5">
                <label
                  htmlFor="auth-confirm-password-input"
                  className="block text-xs font-medium text-stone-300"
                >
                  Confirm Password <span className="text-amber-400">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-500">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    id="auth-confirm-password-input"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (localValidationWarning) setLocalValidationWarning(null);
                      if (onClearError) onClearError();
                    }}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    disabled={isLoading}
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-stone-950 border border-stone-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-stone-100 placeholder-stone-600 text-xs sm:text-sm transition-colors disabled:opacity-50"
                  />
                  <button
                    id="auth-confirm-password-visibility-btn"
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-stone-500 hover:text-stone-300 transition-colors"
                    title={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Primary Submit Button */}
            <button
              id={mode === 'signup' ? 'auth-signup-submit' : mode === 'forgot' ? 'auth-reset-submit' : 'auth-signin-submit'}
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-xs sm:text-sm transition-all shadow-md hover:shadow-amber-500/10 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-stone-950 border-t-transparent rounded-full animate-spin"></div>
              ) : mode === 'signin' ? (
                <>
                  <span>Sign In with Email</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : mode === 'signup' ? (
                <>
                  <span>Create Free Account</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  <span>Send Recovery Email</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Return to Sign In button when in Forgot Password mode */}
          {mode === 'forgot' && (
            <div className="text-center pt-1">
              <button
                id="auth-return-signin-btn"
                type="button"
                onClick={() => handleModeChange('signin')}
                className="text-xs text-stone-400 hover:text-stone-200 transition-colors"
              >
                &larr; Back to Sign In
              </button>
            </div>
          )}

          {/* Multi-Provider Divider */}
          <div className="relative flex items-center justify-center">
            <div className="border-t border-stone-800 w-full"></div>
            <span className="bg-stone-900 px-3 text-[11px] uppercase tracking-wider text-stone-500 font-medium">
              or continue with
            </span>
          </div>

          {/* Google OAuth Provider Button */}
          <button
            id="google-signin-button"
            type="button"
            onClick={onSignInWithGoogle}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 px-5 py-3 rounded-xl bg-stone-950 hover:bg-stone-800 border border-stone-700 text-stone-100 font-medium text-xs sm:text-sm transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-stone-400 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
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
            <span>Sign in with Google</span>
          </button>

          {/* Security & Isolation Badges */}
          <div className="pt-2 flex items-center justify-center gap-4 text-[11px] text-stone-500">
            <span className="flex items-center gap-1">
              <Lock className="w-3 h-3 text-emerald-500" /> Owner-Bound Firestore
            </span>
            <span>&bull;</span>
            <span className="flex items-center gap-1">
              <Shield className="w-3 h-3 text-blue-500" /> Firebase Auth Scrypt
            </span>
          </div>
        </div>

        {/* Security & Tech Pillar Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
          <div className="bg-stone-900/60 border border-stone-800/80 rounded-xl p-5 space-y-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Database className="w-4 h-4" />
            </div>
            <h3 className="font-semibold text-stone-200 text-sm">Owner-Bound Firestore Isolation</h3>
            <p className="text-xs text-stone-400 leading-relaxed">
              Every journal reflection and AI message is quarantined under <code className="text-amber-300 font-mono">/users/{'{userId}'}/entries</code>. Cross-account access is strictly rejected by security rules.
            </p>
          </div>

          <div className="bg-stone-900/60 border border-stone-800/80 rounded-xl p-5 space-y-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <BrainCircuit className="w-4 h-4" />
            </div>
            <h3 className="font-semibold text-stone-200 text-sm">Resilient Gemini 3.6 Flash Engine</h3>
            <p className="text-xs text-stone-400 leading-relaxed">
              Multi-tier fallback ladder ensures continuous operation across model availability windows (Flash 3.6 &rarr; Flash Lite 3.1 &rarr; Dynamic Flash &rarr; Flash 3.7).
            </p>
          </div>

          <div className="bg-stone-900/60 border border-stone-800/80 rounded-xl p-5 space-y-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Shield className="w-4 h-4" />
            </div>
            <h3 className="font-semibold text-stone-200 text-sm">Secure Authentication Providers</h3>
            <p className="text-xs text-stone-400 leading-relaxed">
              Supports both Email/Password (with secure scrypt hashing &amp; token rotation) and federated Google Sign-In with instant session verification.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};
