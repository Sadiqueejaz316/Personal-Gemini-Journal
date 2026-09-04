import React from 'react';
import { Sparkles, ShieldCheck, LogOut, Plus, BookOpen, Lock, Terminal, Shield } from 'lucide-react';
import { UserProfile, AppView } from '../types';

interface NavbarProps {
  user: UserProfile | null;
  currentView?: AppView;
  isAdmin?: boolean;
  onToggleAdminView?: () => void;
  onSignOut: () => void;
  onNewEntry: () => void;
  onOpenSecurityModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  currentView = 'journal',
  isAdmin = false,
  onToggleAdminView,
  onSignOut,
  onNewEntry,
  onOpenSecurityModal,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-stone-900/90 backdrop-blur-md border-b border-stone-800 text-stone-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Brand & Logo */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-700 flex items-center justify-center shadow-sm text-stone-950 font-bold">
            <Sparkles className="w-5 h-5 text-stone-950" />
          </div>
          <div>
            <span className="font-semibold text-stone-100 text-lg tracking-tight block leading-tight">
              Gemini Reflection Journal
            </span>
            <span className="text-xs text-stone-400 font-mono flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
              Firestore Isolated &bull; Gemini 3.6 Flash
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          
          {/* Admin Navigation Button (Only shown if verified admin) */}
          {user && isAdmin && onToggleAdminView && (
            <button
              id="admin-nav-btn"
              onClick={onToggleAdminView}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all border ${
                currentView === 'admin'
                  ? 'bg-amber-500 text-stone-950 border-amber-400 shadow-sm'
                  : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/40'
              }`}
              title={currentView === 'admin' ? 'Switch back to Journal' : 'Open Admin Telemetry Dashboard'}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>{currentView === 'admin' ? '📖 Journal Workspace' : '🛡️ Admin'}</span>
            </button>
          )}

          {user && currentView === 'journal' && (
            <button
              id="new-reflection-navbar-btn"
              onClick={onNewEntry}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-medium text-sm transition-colors shadow-sm"
              title="Start a new reflection"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Reflection</span>
            </button>
          )}

          {/* Security & Threat Model Trigger */}
          <button
            id="open-security-model-btn"
            onClick={onOpenSecurityModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-stone-100 text-xs font-mono transition-colors border border-stone-700"
            title="View Threat Model & Security Audit"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden md:inline">Security &amp; Threat Model</span>
          </button>

          {/* User Profile & Sign Out */}
          {user ? (
            <div className="flex items-center gap-2 pl-2 border-l border-stone-800">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User'}
                  className="w-8 h-8 rounded-full border border-amber-500/40 object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-stone-800 text-amber-400 font-semibold text-xs flex items-center justify-center border border-stone-700">
                  {user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
                </div>
              )}
              <div className="hidden lg:block text-left">
                <p className="text-xs font-medium text-stone-200 truncate max-w-[120px]">
                  {user.displayName || 'User'}
                </p>
                <p className="text-[10px] text-stone-400 truncate max-w-[120px]">
                  {user.email || 'Authenticated'}
                </p>
              </div>
              <button
                id="signout-button"
                onClick={onSignOut}
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-stone-800 transition-colors"
                title="Sign out of your account"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : null}
        </div>

      </div>
    </header>
  );
};

