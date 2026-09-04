/**
 * Admin Provisioning Script for Gemini Reflection Journal
 * 
 * Usage:
 *   npx tsx scripts/set-admin.ts <FIREBASE_UID> [--remove]
 * 
 * Examples:
 *   # Grant admin privileges to a user
 *   npx tsx scripts/set-admin.ts my_firebase_uid_123
 * 
 *   # Revoke admin privileges from a user
 *   npx tsx scripts/set-admin.ts my_firebase_uid_123 --remove
 * 
 * SECURITY NOTE:
 * This script runs strictly in a trusted server environment using Firebase Admin SDK.
 * Never expose service account credentials or this script to client-side bundles.
 */

import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import firebaseConfigJson from '../firebase-applet-config.json';

dotenv.config();

// Initialize Firebase Admin SDK
let adminApp: App;
if (!getApps().length) {
  try {
    adminApp = initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0307856969',
    });
  } catch (err) {
    console.error('Failed to initialize Firebase Admin SDK:', err);
    process.exit(1);
  }
} else {
  adminApp = getApps()[0]!;
}

function getAdminFirestore(): ReturnType<typeof getFirestore> {
  const dbId = (firebaseConfigJson as any).firestoreDatabaseId || process.env.FIRESTORE_DATABASE_ID;
  if (dbId && dbId !== '(default)') {
    return getFirestore(adminApp, dbId);
  }
  return getFirestore(adminApp);
}

async function main() {
  const args = process.argv.slice(2);
  const targetUid = args[0];
  const isRemove = args.includes('--remove');

  if (!targetUid || targetUid.startsWith('--')) {
    console.error(`
❌ Error: Target Firebase UID is required.

Usage:
  npx tsx scripts/set-admin.ts <FIREBASE_UID> [--remove]

Examples:
  npx tsx scripts/set-admin.ts qW3rTyU12345678
  npx tsx scripts/set-admin.ts qW3rTyU12345678 --remove
`);
    process.exit(1);
  }

  console.log(`\n🔒 [RBAC Provisioning] Processing UID: "${targetUid}"...`);

  try {
    const auth = getAuth(adminApp);
    const firestore = getAdminFirestore();

    // Verify user exists in Firebase Auth
    const userRecord = await auth.getUser(targetUid);
    console.log(`👤 Found user: ${userRecord.email || 'No email'} (UID: ${userRecord.uid})`);


    // Existing claims
    const existingClaims = userRecord.customClaims || {};

    if (isRemove) {
      // Remove admin custom claim
      const updatedClaims = { ...existingClaims };
      delete updatedClaims.admin;

      await auth.setCustomUserClaims(targetUid, updatedClaims);
      console.log('✅ Successfully removed { admin: true } custom claim.');

      // Update Firestore user document metadata
      try {
        await firestore.collection('users').doc(targetUid).set(
          { role: 'user', updatedAt: new Date().toISOString() },
          { merge: true }
        );
        console.log('✅ Updated Firestore /users/' + targetUid + ' profile role to "user".');
      } catch (fsErr) {
        console.warn('⚠️ Firestore profile update notice:', fsErr);
      }

      console.log(`\n🎉 Admin role successfully REVOKED for user: ${userRecord.email || targetUid}`);
    } else {
      // Set admin custom claim
      const updatedClaims = { ...existingClaims, admin: true };

      await auth.setCustomUserClaims(targetUid, updatedClaims);
      console.log('✅ Successfully assigned { admin: true } custom claim via Firebase Admin SDK.');

      // Update Firestore user document metadata
      try {
        await firestore.collection('users').doc(targetUid).set(
          { role: 'admin', updatedAt: new Date().toISOString() },
          { merge: true }
        );
        console.log('✅ Updated Firestore /users/' + targetUid + ' profile role to "admin".');
      } catch (fsErr) {
        console.warn('⚠️ Firestore profile update notice:', fsErr);
      }

      console.log(`\n🎉 Admin role successfully GRANTED to user: ${userRecord.email || targetUid}`);
      console.log('💡 Note: The user may need to re-authenticate or refresh their token (getIdToken(true)) to receive the new claim.');
    }

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Admin provisioning failed:', error.message || error);
    process.exit(1);
  }
}

main();
