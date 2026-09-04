import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  signOut as fbSignOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  deleteDoc,
  serverTimestamp,
  Firestore,
} from 'firebase/firestore';
import firebaseConfigJson from '../../firebase-applet-config.json';
import { JournalEntry, UserProfile, ChatMessage } from '../types';

// Defensive configuration load
const firebaseConfig = {
  apiKey: firebaseConfigJson.apiKey,
  authDomain: firebaseConfigJson.authDomain,
  projectId: firebaseConfigJson.projectId,
  storageBucket: firebaseConfigJson.storageBucket,
  messagingSenderId: firebaseConfigJson.messagingSenderId,
  appId: firebaseConfigJson.appId,
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

// Initialize Firestore with specific database ID if present
export const db: Firestore = firebaseConfigJson.firestoreDatabaseId
  ? getFirestore(app, firebaseConfigJson.firestoreDatabaseId)
  : getFirestore(app);

/**
 * Strict Undefined-Stripping (Zero-Crash Payload Hygiene)
 * Recursively removes all `undefined` fields from an object so Firestore operations never crash.
 */
export function cleanPayloadForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return null as unknown as T;
  }
  if (Array.isArray(data)) {
    return data
      .filter((item) => item !== undefined)
      .map((item) => cleanPayloadForFirestore(item)) as unknown as T;
  }
  if (typeof data === 'object' && !(data instanceof Date)) {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (value !== undefined) {
        cleaned[key] = cleanPayloadForFirestore(value);
      }
    }
    return cleaned as T;
  }
  return data;
}

/**
 * Helper to translate Firebase Auth error codes into clear, actionable messages
 */
export function formatAuthErrorMessage(error: any): string {
  if (!error) return 'An unexpected authentication error occurred.';
  const code = error.code || '';
  
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Please sign in instead.';
    case 'auth/invalid-email':
      return 'The email address entered is not valid.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters long.';
    case 'auth/user-not-found':
      return 'No registered account found with this email. Please check your spelling or sign up.';
    case 'auth/wrong-password':
      return 'Incorrect password. Please verify your credentials or reset your password.';
    case 'auth/invalid-credential':
      return 'Invalid email or password. Please verify your credentials and try again.';
    case 'auth/user-disabled':
      return 'This user account has been disabled. Please contact support.';
    case 'auth/too-many-requests':
      return 'Access temporarily restricted due to multiple failed attempts. Please wait a moment or reset your password.';
    case 'auth/popup-closed-by-user':
      return 'Sign-in popup was closed before completing. Please try again.';
    case 'auth/popup-blocked':
      return 'Popup was blocked by your browser. Please allow popups for this site.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in provider is not enabled in Firebase Console.';
    default:
      return error.message || 'Authentication failed. Please try again.';
  }
}

/**
 * Sign in using Email & Password
 */
export async function signInWithEmailPassword(email: string, password: string): Promise<User> {
  const cleanEmail = email.trim().toLowerCase();
  const result = await signInWithEmailAndPassword(auth, cleanEmail, password);
  const user = result.user;

  // Update profile metadata in Firestore with defensive sanitization
  const userRef = doc(db, 'users', user.uid);
  const profilePayload: Partial<UserProfile> = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || user.email?.split('@')[0] || 'Mindful Author',
    photoURL: user.photoURL || '',
    lastLoginAt: new Date().toISOString(),
  };

  await setDoc(userRef, cleanPayloadForFirestore(profilePayload), { merge: true });
  return user;
}

/**
 * Sign up / Create Account using Email & Password
 */
export async function signUpWithEmailPassword(
  email: string,
  password: string,
  displayName?: string
): Promise<User> {
  const cleanEmail = email.trim().toLowerCase();
  const trimmedName = displayName?.trim() || cleanEmail.split('@')[0] || 'Mindful Author';

  const result = await createUserWithEmailAndPassword(auth, cleanEmail, password);
  const user = result.user;

  // Update auth profile displayName
  if (trimmedName) {
    try {
      await updateProfile(user, { displayName: trimmedName });
    } catch (profileErr) {
      console.warn('Could not update Firebase Auth profile display name:', profileErr);
    }
  }

  // Create user profile in Firestore
  const userRef = doc(db, 'users', user.uid);
  const profilePayload: Partial<UserProfile> = {
    uid: user.uid,
    email: user.email,
    displayName: trimmedName,
    photoURL: user.photoURL || '',
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  };

  await setDoc(userRef, cleanPayloadForFirestore(profilePayload), { merge: true });
  return user;
}

/**
 * Send password reset email
 */
export async function sendResetPasswordEmail(email: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  await sendPasswordResetEmail(auth, cleanEmail);
}

/**
 * Sign in using Google OAuth Popup
 */
export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user;

  // Persist / update user profile in Firestore
  const userRef = doc(db, 'users', user.uid);
  const profilePayload: Partial<UserProfile> = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || 'Anonymous Explorer',
    photoURL: user.photoURL || '',
    lastLoginAt: new Date().toISOString(),
  };

  await setDoc(userRef, cleanPayloadForFirestore(profilePayload), { merge: true });
  return user;
}

/**
 * Sign out current user
 */
export async function signOutUser(): Promise<void> {
  await fbSignOut(auth);
}

/**
 * Subscribe to real-time entries collection for the authenticated user
 * Path: /users/{userId}/entries/{entryId}
 */
export function subscribeToUserEntries(
  userId: string,
  onUpdate: (entries: JournalEntry[]) => void,
  onError?: (error: Error) => void
): () => void {
  if (!userId) return () => {};

  const entriesRef = collection(db, 'users', userId, 'entries');
  const q = query(entriesRef, orderBy('updatedAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const entries: JournalEntry[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as JournalEntry;
        entries.push({
          ...data,
          id: docSnap.id,
        });
      });
      onUpdate(entries);
    },
    (err) => {
      console.error('Firestore subscription error:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Save or update a journal entry
 */
export async function saveJournalEntry(entry: JournalEntry): Promise<void> {
  if (!entry.userId || !entry.id) {
    throw new Error('Missing userId or entryId for Firestore persistence');
  }

  const docRef = doc(db, 'users', entry.userId, 'entries', entry.id);
  const payload = cleanPayloadForFirestore({
    ...entry,
    updatedAt: new Date().toISOString(),
  });

  await setDoc(docRef, payload, { merge: true });
}

/**
 * Delete a journal entry
 */
export async function deleteJournalEntry(userId: string, entryId: string): Promise<void> {
  if (!userId || !entryId) return;
  const docRef = doc(db, 'users', userId, 'entries', entryId);
  await deleteDoc(docRef);
}
