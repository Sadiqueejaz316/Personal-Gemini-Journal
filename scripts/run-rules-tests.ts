/**
 * scripts/run-rules-tests.ts
 *
 * Static structural assertions for firestore.rules.
 * Verifies the ownership invariant without requiring the Firebase Emulator.
 *
 * Invariant:
 *   /users/{uid}/entries/{entryId}   → only the authenticated owner may access
 *   /users/{uid}/interactions/{id}   → only the authenticated owner may access
 *   Admin custom claims must NOT automatically grant access to private journal entries.
 *
 * NOTE: Full emulator-based rules tests (using @firebase/rules-unit-testing + Java)
 *       are documented in .agents/skills/project_tdd_workflow/SKILL.md as a future
 *       hardening step and require Java + firebase-tools emulators to be installed.
 */

import fs from 'fs';
import path from 'path';

interface RulesTestResult {
  testNumber: number;
  name: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL';
  details?: string;
}

const results: RulesTestResult[] = [];
const rulesPath = path.join(process.cwd(), 'firestore.rules');

function readRules(): string {
  if (!fs.existsSync(rulesPath)) {
    throw new Error(`firestore.rules not found at: ${rulesPath}`);
  }
  return fs.readFileSync(rulesPath, 'utf-8');
}

function runTests() {
  console.log('====================================================');
  console.log('🔐 FIRESTORE RULES STATIC STRUCTURAL ASSERTION SUITE');
  console.log('====================================================\n');

  const rules = readRules();

  // -----------------------------------------------------------------------
  // Test 1: rules_version = '2' is declared (required for wildcard recursion)
  // -----------------------------------------------------------------------
  {
    const passed = rules.includes("rules_version = '2'");
    results.push({
      testNumber: 1,
      name: "rules_version = '2' Declared",
      expected: "rules_version = '2'",
      actual: passed ? "rules_version = '2' present" : 'MISSING rules_version declaration',
      status: passed ? 'PASS' : 'FAIL',
    });
  }

  // -----------------------------------------------------------------------
  // Test 2: /entries/{entryId} is protected by isOwner(userId) with NO isAdmin bypass
  // -----------------------------------------------------------------------
  {
    const entriesMatch = rules.match(/match \/entries\/\{entryId\} \{([^}]+)\}/);
    const entriesBody = entriesMatch ? entriesMatch[1] : '';
    const hasOwnerCheck = entriesBody.includes('isOwner(userId)');
    const hasNoAdminBypass = !entriesBody.includes('isAdmin');
    const passed = hasOwnerCheck && hasNoAdminBypass;

    results.push({
      testNumber: 2,
      name: '/entries owner-only isolation (no admin bypass)',
      expected: 'allow read, write: if isOwner(userId) — admin bypass absent',
      actual: passed
        ? 'isOwner(userId) enforced; isAdmin() absent from entries rule'
        : `FAIL: ownerCheck=${hasOwnerCheck} noAdminBypass=${hasNoAdminBypass}`,
      status: passed ? 'PASS' : 'FAIL',
      details: 'Admin custom claims must never grant access to /entries. Privacy invariant.',
    });
  }

  // -----------------------------------------------------------------------
  // Test 3: /interactions/{interactionId} is protected by isOwner(userId) with NO isAdmin bypass
  // -----------------------------------------------------------------------
  {
    const interactionsMatch = rules.match(/match \/interactions\/\{interactionId\} \{([^}]+)\}/);
    const interactionsBody = interactionsMatch ? interactionsMatch[1] : '';
    const hasOwnerCheck = interactionsBody.includes('isOwner(userId)');
    const hasNoAdminBypass = !interactionsBody.includes('isAdmin');
    const passed = hasOwnerCheck && hasNoAdminBypass;

    results.push({
      testNumber: 3,
      name: '/interactions owner-only isolation (no admin bypass)',
      expected: 'allow read, write: if isOwner(userId) — admin bypass absent',
      actual: passed
        ? 'isOwner(userId) enforced; isAdmin() absent from interactions rule'
        : `FAIL: ownerCheck=${hasOwnerCheck} noAdminBypass=${hasNoAdminBypass}`,
      status: passed ? 'PASS' : 'FAIL',
      details: 'Admin custom claims must never grant access to /interactions. Privacy invariant.',
    });
  }

  // -----------------------------------------------------------------------
  // Test 4: isOwner() helper verifies request.auth.uid == userId (cryptographic identity)
  // -----------------------------------------------------------------------
  {
    const helperMatch = rules.match(/function isOwner\([^)]*\)[^{]*\{([^}]+)\}/);
    const helperBody = helperMatch ? helperMatch[1] : '';
    const hasUidCheck = helperBody.includes('request.auth.uid == userId');
    const hasAuthNullCheck = helperBody.includes('request.auth != null');
    const passed = hasUidCheck && hasAuthNullCheck;

    results.push({
      testNumber: 4,
      name: 'isOwner() uses request.auth.uid comparison (not email)',
      expected: 'request.auth != null && request.auth.uid == userId',
      actual: passed
        ? 'Cryptographic UID comparison enforced in isOwner()'
        : `FAIL: uidCheck=${hasUidCheck} authNullCheck=${hasAuthNullCheck}`,
      status: passed ? 'PASS' : 'FAIL',
      details: 'Auth identity must be cryptographic UID, not mutable fields like email.',
    });
  }

  // -----------------------------------------------------------------------
  // Test 5: /users/{userId} create rule blocks self-promotion to admin
  // -----------------------------------------------------------------------
  {
    const hasAntiEscalation = rules.includes("request.resource.data.role != 'admin'");
    const hasNoPublicWrite = !rules.includes('allow write: if true');
    const passed = hasAntiEscalation && hasNoPublicWrite;

    results.push({
      testNumber: 5,
      name: 'Firestore prevents role self-escalation to admin',
      expected: "create rule contains: request.resource.data.role != 'admin'",
      actual: passed
        ? 'Anti-escalation rule present; no allow write: if true'
        : `FAIL: antiEscalation=${hasAntiEscalation} noPublicWrite=${hasNoPublicWrite}`,
      status: passed ? 'PASS' : 'FAIL',
      details: 'Users must not be able to write role == "admin" to their own document.',
    });
  }

  // -----------------------------------------------------------------------
  // Test 6: /analytics/{docId} restricts writes to admin only (not any user)
  // -----------------------------------------------------------------------
  {
    const analyticsMatch = rules.match(/match \/analytics\/\{docId\} \{([^}]+)\}/);
    const analyticsBody = analyticsMatch ? analyticsMatch[1] : '';
    const writeRestrictedToAdmin = analyticsBody.includes('isAdmin') && analyticsBody.includes('allow write');
    const readAllowsAuth = analyticsBody.includes('request.auth != null') && analyticsBody.includes('allow read');
    const passed = writeRestrictedToAdmin && readAllowsAuth;

    results.push({
      testNumber: 6,
      name: '/analytics write restricted to admin; read requires auth',
      expected: 'write: isAdmin(); read: request.auth != null',
      actual: passed
        ? 'Analytics write restricted to admin; authenticated read enforced'
        : `FAIL: adminWrite=${writeRestrictedToAdmin} authRead=${readAllowsAuth}`,
      status: passed ? 'PASS' : 'FAIL',
      details: 'Aggregated mood analytics are writable only by admin; readable by any authenticated user.',
    });
  }

  // -----------------------------------------------------------------------
  // Test 7: No wildcard allow read, write: if true (open rules) anywhere in the file
  // -----------------------------------------------------------------------
  {
    const hasOpenRule = rules.includes('allow read, write: if true') || rules.includes('allow write: if true');
    const passed = !hasOpenRule;

    results.push({
      testNumber: 7,
      name: 'No open "allow write: if true" rules present',
      expected: 'Zero permissive open rules',
      actual: passed ? 'No open write rules found' : 'CRITICAL: "allow write: if true" detected!',
      status: passed ? 'PASS' : 'FAIL',
      details: 'Open rules would allow any authenticated (or unauthenticated) user to write data.',
    });
  }

  // -----------------------------------------------------------------------
  // Print Summary
  // -----------------------------------------------------------------------
  console.log('--------------------------------------------------------------------------------------');
  console.log('| # | Test Scenario                                 | Expected                       | Status |');
  console.log('--------------------------------------------------------------------------------------');
  for (const r of results) {
    const num = r.testNumber.toString().padEnd(2);
    const name = r.name.padEnd(46).slice(0, 46);
    const exp = r.expected.padEnd(30).slice(0, 30);
    const st = r.status === 'PASS' ? '✅ PASS' : '❌ FAIL';
    console.log(`| ${num} | ${name} | ${exp} | ${st} |`);
  }
  console.log('--------------------------------------------------------------------------------------\n');

  const failedCount = results.filter((r) => r.status === 'FAIL').length;
  if (failedCount === 0) {
    console.log('🎉 ALL 7/7 FIRESTORE RULES STRUCTURAL TESTS PASSED!\n');
  } else {
    console.error(`⚠️ ${failedCount} Firestore rules test(s) failed!`);
    process.exit(1);
  }
}

runTests();
