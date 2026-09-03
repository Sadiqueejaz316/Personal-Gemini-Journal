import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, signInWithGoogle, signOutUser, subscribeToUserEntries, saveJournalEntry } from './lib/firebase';
import { UserProfile, JournalEntry } from './types';
import { Navbar } from './components/Navbar';
import { AuthLanding } from './components/AuthLanding';
import { Dashboard } from './components/Dashboard';
import { ThreatModelModal } from './components/ThreatModelModal';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Firestore Entries
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user: User | null) => {
      if (user) {
        const profile: UserProfile = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || 'Anonymous Explorer',
          photoURL: user.photoURL,
        };
        setCurrentUser(profile);
      } else {
        setCurrentUser(null);
        setEntries([]);
        setActiveEntryId(null);
      }
      setIsAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

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
  const handleSignIn = async () => {
    try {
      setIsSigningIn(true);
      setAuthError(null);
      await signInWithGoogle();
    } catch (err: any) {
      console.error('Google Sign-in failed:', err);
      setAuthError(err.message || 'Failed to sign in with Google. Please check your popup permissions.');
    } finally {
      setIsSigningIn(false);
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
      await saveJournalEntry(newEntry);
      setActiveEntryId(newId);
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
        onSignOut={handleSignOut}
        onNewEntry={handleCreateNewEntry}
        onOpenSecurityModal={() => setIsSecurityModalOpen(true)}
      />

      {/* Main Content Area */}
      {!currentUser ? (
        <AuthLanding
          onSignIn={handleSignIn}
          isLoading={isSigningIn}
          errorMessage={authError}
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
