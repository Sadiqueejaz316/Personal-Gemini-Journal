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
import {
  JournalEntry,
  UserProfile,
  ChatMessage,
  AdminTelemetry,
  UserDirectoryItem,
  MoodAnalytics,
  EntryAnalysis,
  MoodAnalyticsResponse,
} from '../types';


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
    // 1. Check verified Firebase Auth ID Token custom claim (claims.admin === true)
    const tokenResult = await user.getIdTokenResult(true);
    if (tokenResult.claims && tokenResult.claims.admin === true) {
      return { isAdmin: true, role: 'admin' };
    }

    // 2. Query backend verification route (supports optional server-side bootstrap ADMIN_UIDS)
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
      'x-user-role': 'admin',
      'x-admin-uid': user.uid,
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
/**
 * Fetch Admin User Directory (Strictly metadata, zero journal text)
 * Prioritizes authoritative server state and synchronizes with Firestore.
 */
export async function fetchAdminUserDirectory(user: User): Promise<UserDirectoryItem[]> {
  const usersMap = new Map<string, UserDirectoryItem>();

  // Ensure current admin is mapped first
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

  // 1. Fetch authoritative server user directory
  try {
    const token = await user.getIdToken();
    const response = await fetch('/api/admin/users', {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-user-role': 'admin',
        'x-admin-uid': user.uid,
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.users)) {
        data.users.forEach((u: UserDirectoryItem) => {
          usersMap.set(u.uid, u);
        });
      }
    }
  } catch (err) {
    console.warn('[Admin] Server user directory route notice:', err);
  }

  // 2. Supplement with any additional Firestore /users documents
  try {
    const usersCol = collection(db, 'users');
    const snapshot = await getDocs(usersCol);
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      // Only add if not already present or if updating details
      const existing = usersMap.get(docSnap.id);
      if (!existing) {
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
      }
    });
  } catch (clientErr) {
    console.warn('[Admin] Firestore getDocs notice:', clientErr);
  }

  // 3. Fallback to default community authors if directory is completely empty
  if (usersMap.size <= 1) {
    for (const seedItem of DEFAULT_SEED_USERS) {
      if (!usersMap.has(seedItem.uid)) {
        usersMap.set(seedItem.uid, seedItem);
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
      await adminCreateUser(user, {
        displayName: seedItem.displayName,
        email: seedItem.email || `${seedItem.uid}@mindful.org`,
        role: seedItem.role,
        entryCount: seedItem.entryCount,
      });
    } catch (err) {
      console.warn('Error seeding user:', err);
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
  const token = await adminUser.getIdToken();
  const response = await fetch('/api/admin/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-user-role': 'admin',
      'x-admin-uid': adminUser.uid,
    },
    body: JSON.stringify(newUser),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to create author profile (HTTP ${response.status})`);
  }

  const data = await response.json();
  const item: UserDirectoryItem = data.user;

  // Also sync to Firestore for client document availability
  try {
    const userRef = doc(db, 'users', item.uid);
    await setDoc(userRef, cleanPayloadForFirestore(item), { merge: true });
  } catch (fsErr) {
    console.warn('[Admin] Firestore profile write note:', fsErr);
  }

  return item;
}

/**
 * Admin Action: Update User Role in Directory (Make Admin / Demote to User)
 */
export async function adminUpdateUserRole(
  adminUser: User,
  targetUid: string,
  newRole: 'admin' | 'user'
): Promise<void> {
  const token = await adminUser.getIdToken();
  const response = await fetch(`/api/admin/users/${encodeURIComponent(targetUid)}/role`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-user-role': 'admin',
      'x-admin-uid': adminUser.uid,
    },
    body: JSON.stringify({ role: newRole }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to update author role (HTTP ${response.status})`);
  }

  // Also sync to Firestore for client document availability
  try {
    const userRef = doc(db, 'users', targetUid);
    await setDoc(userRef, { role: newRole, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (fsErr) {
    console.warn('[Admin] Firestore role write note:', fsErr);
  }
}

/**
 * Admin Action: Remove / Archive User Profile from Directory
 */
export async function adminDeleteUser(adminUser: User, targetUid: string): Promise<void> {
  const token = await adminUser.getIdToken();
  const response = await fetch(`/api/admin/users/${encodeURIComponent(targetUid)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-user-role': 'admin',
      'x-admin-uid': adminUser.uid,
    },
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to delete author profile (HTTP ${response.status})`);
  }

  // Also sync delete to Firestore
  try {
    const userRef = doc(db, 'users', targetUid);
    await deleteDoc(userRef);
  } catch (fsErr) {
    console.warn('[Admin] Firestore delete note:', fsErr);
  }
}

/**
 * Fetch Aggregated Platform Mood Analytics
 */
export async function fetchAdminMoodAnalytics(user: User): Promise<MoodAnalytics> {
  const token = await user.getIdToken();
  const response = await fetch('/api/admin/moods', {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-user-role': 'admin',
      'x-admin-uid': user.uid,
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

/**
 * Trigger Server-side Structured Entry Analysis using Gemini
 * Analyzes the entry, extracts sentiment, emotions, topics, tags, and updates Firestore document
 */
export async function triggerEntryAnalysis(
  entryId: string,
  title: string,
  content: string
): Promise<EntryAnalysis | null> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('User must be authenticated to analyze entry.');

  const token = await currentUser.getIdToken();
  const response = await fetch('/api/entries/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ entryId, title, content }),
  });

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const rawText = await response.text().catch(() => '');
    throw new Error(`Server returned non-JSON response (${response.status}): ${rawText.slice(0, 120)}`);
  }

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || `Analysis failed with status ${response.status}`);
  }

  return result.analysis || null;
}

/**
 * Fetch Private User Mood Analytics
 * Aggregates only the authenticated user's private reflections
 */
export async function fetchUserMoodAnalytics(
  range: '7d' | '30d' | '90d' | 'all' = '7d',
  clientEntries?: JournalEntry[]
): Promise<MoodAnalyticsResponse> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('User must be authenticated to view mood analytics.');

  const token = await currentUser.getIdToken();

  // If client entries are provided, send via POST to leverage server deterministic aggregation
  if (Array.isArray(clientEntries) && clientEntries.length > 0) {
    try {
      const response = await fetch('/api/analytics/mood', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ range, entries: clientEntries }),
      });

      const contentType = response.headers.get('content-type') || '';
      if (response.ok && contentType.includes('application/json')) {
        return await response.json();
      }
    } catch (postErr) {
      console.warn('[Analytics] POST analytics computation failed, falling back to GET:', postErr);
    }
  }

  const response = await fetch(`/api/analytics/mood?range=${range}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const rawText = await response.text().catch(() => '');
    throw new Error(`Server returned non-JSON response (${response.status}): ${rawText.slice(0, 120)}`);
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Failed to fetch mood analytics with status ${response.status}`);
  }

  return data;
}


