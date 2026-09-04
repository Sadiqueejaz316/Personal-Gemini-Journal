import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  auth,
  signInWithGoogle,
  signInWithEmailPassword,
  signUpWithEmailPassword,
  sendResetPasswordEmail,
  formatAuthErrorMessage,
  signOutUser,
  subscribeToUserEntries,
  saveJournalEntry,
  checkAdminStatus,
} from './lib/firebase';
import { UserProfile, JournalEntry, AppView, UserRole } from './types';
import { Navbar } from './components/Navbar';
import { AuthLanding } from './components/AuthLanding';
import { Dashboard } from './components/Dashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { ThreatModelModal } from './components/ThreatModelModal';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [rawAuthUser, setRawAuthUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentView, setCurrentView] = useState<AppView>('journal');
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isProcessingAuth, setIsProcessingAuth] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Firestore Entries
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
      setRawAuthUser(user);
      if (user) {
        // Authoritatively check admin status
        const adminCheck = await checkAdminStatus(user);
        setIsAdmin(adminCheck.isAdmin);

        const profile: UserProfile = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || user.email?.split('@')[0] || 'Mindful Author',
          photoURL: user.photoURL,
          role: adminCheck.isAdmin ? 'admin' : 'user',
        };
        setCurrentUser(profile);
      } else {
        setCurrentUser(null);
        setIsAdmin(false);
        setCurrentView('journal');
        setEntries([]);
        setActiveEntryId(null);
      }
      setIsAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Ensure non-admin users cannot remain on admin view
  useEffect(() => {
    if (currentView === 'admin' && !isAdmin) {
      setCurrentView('journal');
    }
  }, [currentView, isAdmin]);

  // Subscribe to Firestore user-isolated entries
  useEffect(() => {
    if (!currentUser?.uid) return;

    const unsubscribe = subscribeToUserEntries(
      currentUser.uid,
      (fetchedEntries) => {
        setEntries(fetchedEntries);
        // If no active entry selected, select the first one
        if (fetchedEntries.length > 0) {
          setActiveEntryId((prev) => {
            if (prev && fetchedEntries.some((e) => e.id === prev)) {
              return prev;
            }
            return fetchedEntries[0].id;
          });
        }
      },
      (err) => {
        console.error('Failed to subscribe to user entries:', err);
      }
    );

    return () => unsubscribe();
  }, [currentUser?.uid]);

  // Handle Google Sign-in
  const handleGoogleSignIn = async () => {
    try {
      setIsProcessingAuth(true);
      setAuthError(null);
      await signInWithGoogle();
    } catch (err: any) {
      console.error('Google Sign-in failed:', err);
      setAuthError(formatAuthErrorMessage(err));
    } finally {
      setIsProcessingAuth(false);
    }
  };

  // Handle Email & Password Sign-in
  const handleEmailSignIn = async (email: string, pass: string) => {
    try {
      setIsProcessingAuth(true);
      setAuthError(null);
      await signInWithEmailPassword(email, pass);
    } catch (err: any) {
      console.error('Email Sign-in failed:', err);
      setAuthError(formatAuthErrorMessage(err));
    } finally {
      setIsProcessingAuth(false);
    }
  };

  // Handle Email & Password Sign-up
  const handleEmailSignUp = async (email: string, pass: string, displayName?: string) => {
    try {
      setIsProcessingAuth(true);
      setAuthError(null);
      await signUpWithEmailPassword(email, pass, displayName);
    } catch (err: any) {
      console.error('Email Sign-up failed:', err);
      setAuthError(formatAuthErrorMessage(err));
    } finally {
      setIsProcessingAuth(false);
    }
  };

  // Handle Password Reset Request
  const handleResetPassword = async (email: string) => {
    try {
      setIsProcessingAuth(true);
      setAuthError(null);
      await sendResetPasswordEmail(email);
    } catch (err: any) {
      console.error('Password reset email failed:', err);
      setAuthError(formatAuthErrorMessage(err));
      throw err;
    } finally {
      setIsProcessingAuth(false);
    }
  };

  // Handle Sign-out
  const handleSignOut = async () => {
    try {
      await signOutUser();
    } catch (err: any) {
      console.error('Sign-out failed:', err);
    }
  };

  // Create new reflection entry
  const handleCreateNewEntry = async () => {
    if (!currentUser) return;

    const newId = 'entry-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const newEntry: JournalEntry = {
      id: newId,
      userId: currentUser.uid,
      title: 'New Reflection',
      content: '',
      messages: [],
      mood: 'reflective',
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await saveJournalEntry(newEntry, true);
      setActiveEntryId(newId);
      if (currentView === 'admin') {
        setCurrentView('journal');
      }
    } catch (err: any) {
      console.error('Failed to create new reflection in Firestore:', err);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center text-stone-300 space-y-4">
        <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-mono tracking-wider text-stone-400">
          Initializing Secure Session &amp; Firebase Auth...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 font-sans selection:bg-amber-500/30 selection:text-amber-200">
      
      {/* Top Navigation */}
      <Navbar
        user={currentUser}
        currentView={currentView}
        isAdmin={isAdmin}
        onToggleAdminView={() => setCurrentView((prev) => (prev === 'admin' ? 'journal' : 'admin'))}
        onSignOut={handleSignOut}
        onNewEntry={handleCreateNewEntry}
        onOpenSecurityModal={() => setIsSecurityModalOpen(true)}
      />

      {/* Main Content Area */}
      {!currentUser ? (
        <AuthLanding
          onSignInWithGoogle={handleGoogleSignIn}
          onSignInWithEmail={handleEmailSignIn}
          onSignUpWithEmail={handleEmailSignUp}
          onResetPassword={handleResetPassword}
          isLoading={isProcessingAuth}
          errorMessage={authError}
          onClearError={() => setAuthError(null)}
        />
      ) : currentView === 'admin' && isAdmin && rawAuthUser ? (
        <AdminDashboard
          authUser={rawAuthUser}
          onBackToJournal={() => setCurrentView('journal')}
        />
      ) : (
        <Dashboard
          user={currentUser}
          entries={entries}
          activeEntryId={activeEntryId}
          onSelectEntry={(id) => setActiveEntryId(id)}
          onNewEntry={handleCreateNewEntry}
        />
      )}

      {/* Threat Model & Audit Modal */}
      <ThreatModelModal
        isOpen={isSecurityModalOpen}
        onClose={() => setIsSecurityModalOpen(false)}
      />

    </div>
  );
}

