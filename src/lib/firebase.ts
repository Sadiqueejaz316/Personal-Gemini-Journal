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
  increment,
  updateDoc,
  getDocFromServer,
  Firestore,
} from 'firebase/firestore';
import firebaseConfigJson from '../../firebase-applet-config.json';
import { JournalEntry, UserProfile, ChatMessage, AdminTelemetry, UserDirectoryItem, MoodAnalytics } from '../types';


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

// Connection test for Firestore validation
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('[Firebase] Client is offline or database initializing.');
    }
  }
}
testConnection();

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
      return 'Invalid email or password. If you have not created an account yet, please switch to Create Account or sign in with Google.';
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
 * Maintains entryCount on the user profile document safely
 */
export async function saveJournalEntry(entry: JournalEntry, isNew: boolean = false): Promise<void> {
  if (!entry.userId || !entry.id) {
    throw new Error('Missing userId or entryId for Firestore persistence');
  }

  const docRef = doc(db, 'users', entry.userId, 'entries', entry.id);
  const payload = cleanPayloadForFirestore({
    ...entry,
    updatedAt: new Date().toISOString(),
  });

  await setDoc(docRef, payload, { merge: true });

  if (isNew) {
    try {
      const userRef = doc(db, 'users', entry.userId);
      await setDoc(userRef, { entryCount: increment(1) }, { merge: true });
    } catch (countErr) {
      console.warn('Could not increment user profile entryCount:', countErr);
    }
  }
}

/**
 * Delete a journal entry
 */
export async function deleteJournalEntry(userId: string, entryId: string): Promise<void> {
  if (!userId || !entryId) return;
  const docRef = doc(db, 'users', userId, 'entries', entryId);
  await deleteDoc(docRef);

  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, { entryCount: increment(-1) }, { merge: true });
  } catch (countErr) {
    console.warn('Could not decrement user profile entryCount:', countErr);
  }
}

/**
 * Authoritatively check if authenticated user possesses admin privileges
 * Checks both Firebase Auth ID Token custom claims and backend /api/admin/verify endpoint
 */
export async function checkAdminStatus(user: User): Promise<{ isAdmin: boolean; role: 'user' | 'admin' }> {
  if (!user) return { isAdmin: false, role: 'user' };

  try {
    const adminEmails = [
      'mohammad.ejaz3114@gmail.com',
      ...(((import.meta as any).env?.VITE_ADMIN_EMAILS || '') as string).split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean),
    ];
    if (user.email && adminEmails.includes(user.email.toLowerCase())) {
      return { isAdmin: true, role: 'admin' };
    }

    // 1. Check token result custom claims
    const tokenResult = await user.getIdTokenResult(true);
    if (tokenResult.claims && tokenResult.claims.admin === true) {
      return { isAdmin: true, role: 'admin' };
    }

    // 2. Query backend verification route (supports bootstrap ADMIN_UIDS)
    const token = await user.getIdToken();
    const response = await fetch('/api/admin/verify', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (data.isAdmin === true) {
        return { isAdmin: true, role: 'admin' };
      }
    }
  } catch (err) {
    console.warn('[RBAC] Admin verification status check returned non-admin or error:', err);
  }

  return { isAdmin: false, role: 'user' };
}

/**
 * Fetch Admin Telemetry metrics
 */
export async function fetchAdminTelemetry(user: User): Promise<AdminTelemetry> {
  const token = await user.getIdToken();
  const response = await fetch('/api/admin/telemetry', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('401: Authentication expired or invalid.');
    if (response.status === 403) throw new Error('403: Forbidden - Admin role required.');
    throw new Error(`Failed to fetch admin telemetry: HTTP ${response.status}`);
  }

  return response.json();
}

export const DEFAULT_SEED_USERS: UserDirectoryItem[] = [
  {
    uid: 'author_alex_chen',
    email: 'alex.chen@mindful.org',
    displayName: 'Alex Chen',
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    lastLoginAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    entryCount: 14,
    role: 'user',
    status: 'active',
  },
  {
    uid: 'author_clara_oswald',
    email: 'clara.oswald@example.com',
    displayName: 'Clara Oswald',
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    lastLoginAt: new Date(Date.now() - 12 * 3600000).toISOString(),
    entryCount: 28,
    role: 'admin',
    status: 'active',
  },
  {
    uid: 'author_david_kim',
    email: 'david.kim@journal.dev',
    displayName: 'David Kim',
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    lastLoginAt: new Date(Date.now() - 24 * 3600000).toISOString(),
    entryCount: 8,
    role: 'user',
    status: 'active',
  },
  {
    uid: 'author_sarah_jenkins',
    email: 'sarah.jenkins@reflection.io',
    displayName: 'Sarah Jenkins',
    createdAt: new Date(Date.now() - 21 * 86400000).toISOString(),
    lastLoginAt: new Date(Date.now() - 6 * 3600000).toISOString(),
    entryCount: 19,
    role: 'user',
    status: 'active',
  },
  {
    uid: 'author_elena_rostova',
    email: 'elena.rostova@zenflow.io',
    displayName: 'Elena Rostova',
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    lastLoginAt: new Date(Date.now() - 48 * 3600000).toISOString(),
    entryCount: 5,
    role: 'user',
    status: 'active',
  },
];

/**
 * Fetch Admin User Directory (Strictly metadata, zero journal text)
 * Automatically ensures sample users exist in Firestore so the directory is fully populated.
 */
export async function fetchAdminUserDirectory(user: User): Promise<UserDirectoryItem[]> {
  const usersMap = new Map<string, UserDirectoryItem>();

  // Ensure current user is mapped first
  const currentAdminItem: UserDirectoryItem = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || user.email?.split('@')[0] || 'Administrator',
    createdAt: user.metadata.creationTime || new Date().toISOString(),
    lastLoginAt: user.metadata.lastSignInTime || new Date().toISOString(),
    entryCount: 0,
    role: 'admin',
    status: 'active',
  };
  usersMap.set(user.uid, currentAdminItem);

  // 1. Fetch from Firestore /users collection
  try {
    const usersCol = collection(db, 'users');
    const snapshot = await getDocs(usersCol);
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      usersMap.set(docSnap.id, {
        uid: docSnap.id,
        email: data.email || null,
        displayName: data.displayName || (data.email ? data.email.split('@')[0] : 'Mindful Author'),
        createdAt: data.createdAt || data.lastLoginAt || new Date().toISOString(),
        lastLoginAt: data.lastLoginAt || null,
        entryCount: typeof data.entryCount === 'number' ? data.entryCount : 0,
        role: data.role === 'admin' ? 'admin' : 'user',
        status: data.status === 'inactive' ? 'inactive' : 'active',
      });
    });
  } catch (clientErr) {
    console.warn('[Admin] Firestore getDocs notice:', clientErr);
  }

  // 2. Also check backend API endpoint for any additional server-discovered accounts
  try {
    const token = await user.getIdToken();
    const response = await fetch('/api/admin/users', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.users)) {
        data.users.forEach((u: UserDirectoryItem) => {
          if (!usersMap.has(u.uid)) {
            usersMap.set(u.uid, u);
          }
        });
      }
    }
  } catch (err) {
    console.warn('[Admin] Server user directory route notice:', err);
  }

  // 3. If directory has only 1 user (or only current admin), auto-seed demo authors to Firestore
  if (usersMap.size <= 1) {
    for (const seedItem of DEFAULT_SEED_USERS) {
      if (!usersMap.has(seedItem.uid)) {
        usersMap.set(seedItem.uid, seedItem);
        // Persist seed item to Firestore asynchronously with defensive hygiene
        try {
          const userRef = doc(db, 'users', seedItem.uid);
          await setDoc(userRef, cleanPayloadForFirestore(seedItem), { merge: true });
        } catch (saveErr) {
          console.warn('[Admin] Auto-seed user notice:', saveErr);
        }
      }
    }
  }

  return Array.from(usersMap.values());
}

/**
 * Admin Action: Seed or Re-Seed Sample Community Users
 */
export async function seedAdminDirectory(user: User): Promise<UserDirectoryItem[]> {
  for (const seedItem of DEFAULT_SEED_USERS) {
    try {
      const userRef = doc(db, 'users', seedItem.uid);
      await setDoc(userRef, cleanPayloadForFirestore(seedItem), { merge: true });
    } catch (err) {
      console.warn('Error seeding user to Firestore:', err);
    }
  }
  return fetchAdminUserDirectory(user);
}

/**
 * Admin Action: Provision a New User Account Metadata in Directory
 */
export async function adminCreateUser(
  adminUser: User,
  newUser: {
    displayName: string;
    email: string;
    role: 'admin' | 'user';
    entryCount?: number;
  }
): Promise<UserDirectoryItem> {
  const generatedUid = `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const item: UserDirectoryItem = {
    uid: generatedUid,
    email: newUser.email.trim().toLowerCase(),
    displayName: newUser.displayName.trim(),
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
    entryCount: newUser.entryCount || 0,
    role: newUser.role,
    status: 'active',
  };

  const userRef = doc(db, 'users', generatedUid);
  await setDoc(userRef, cleanPayloadForFirestore(item));
  return item;
}

/**
 * Admin Action: Update User Role in Directory
 */
export async function adminUpdateUserRole(
  adminUser: User,
  targetUid: string,
  newRole: 'admin' | 'user'
): Promise<void> {
  const userRef = doc(db, 'users', targetUid);
  await updateDoc(userRef, { role: newRole });
}

/**
 * Admin Action: Remove / Archive User Profile from Directory
 */
export async function adminDeleteUser(adminUser: User, targetUid: string): Promise<void> {
  const userRef = doc(db, 'users', targetUid);
  await deleteDoc(userRef);
}

/**
 * Fetch Aggregated Platform Mood Analytics
 */
export async function fetchAdminMoodAnalytics(user: User): Promise<MoodAnalytics> {
  const token = await user.getIdToken();
  const response = await fetch('/api/admin/moods', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('401: Authentication expired or invalid.');
    if (response.status === 403) throw new Error('403: Forbidden - Admin role required.');
    throw new Error(`Failed to fetch mood analytics: HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.moods;
}

