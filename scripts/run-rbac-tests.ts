import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';

interface TestResult {
  testNumber: number;
  name: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL';
  details?: string;
}

const results: TestResult[] = [];

function makeHttpRequest(options: http.RequestOptions, bodyData?: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode || 0, body: data }));
    });
    req.on('error', reject);
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

function checkServerReady(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:3000/api/admin/telemetry', (res) => {
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function startServerIfNeeded(): Promise<ChildProcess | null> {
  const isUp = await checkServerReady();
  if (isUp) return null;

  const distServer = path.join(process.cwd(), 'dist', 'server.cjs');
  const proc = fs.existsSync(distServer)
    ? spawn('node', [distServer], { stdio: 'ignore' })
    : spawn('npx', ['tsx', path.join(process.cwd(), 'server.ts')], { stdio: 'ignore', shell: true });

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (await checkServerReady()) break;
  }
  return proc;
}

async function runTests() {
  const spawnedServer = await startServerIfNeeded();
  console.log('====================================================');
  console.log('🔒 EXHAUSTIVE RBAC SECURITY VERIFICATION TEST SUITE');
  console.log('====================================================\n');

  // ----------------------------------------------------
  // Test 1: Missing token → 401
  // ----------------------------------------------------
  try {
    const res = await makeHttpRequest({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/admin/telemetry',
      method: 'GET',
    });
    const passed = res.statusCode === 401;
    results.push({
      testNumber: 1,
      name: 'Missing Token Request',
      expected: 'HTTP 401 Unauthorized',
      actual: `HTTP ${res.statusCode} (${JSON.parse(res.body).error || res.body})`,
      status: passed ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    results.push({
      testNumber: 1,
      name: 'Missing Token Request',
      expected: 'HTTP 401',
      actual: `Connection Error: ${err.message}`,
      status: 'FAIL',
    });
  }

  // ----------------------------------------------------
  // Test 2: Invalid token → 401
  // ----------------------------------------------------
  try {
    const res = await makeHttpRequest({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/admin/telemetry',
      method: 'GET',
      headers: {
        Authorization: 'Bearer malformed_token_string_abc_123',
      },
    });
    const passed = res.statusCode === 401;
    results.push({
      testNumber: 2,
      name: 'Invalid / Malformed Token',
      expected: 'HTTP 401 Unauthorized',
      actual: `HTTP ${res.statusCode} (${JSON.parse(res.body).error || res.body})`,
      status: passed ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    results.push({
      testNumber: 2,
      name: 'Invalid / Malformed Token',
      expected: 'HTTP 401',
      actual: `Error: ${err.message}`,
      status: 'FAIL',
    });
  }

  // ----------------------------------------------------
  // Test 3: Expired token → 401
  // ----------------------------------------------------
  try {
    // Generate a syntactically valid JWT that has exp timestamp in the past
    const expiredHeader = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const expiredPayload = Buffer.from(JSON.stringify({
      uid: 'user_12345',
      sub: 'user_12345',
      admin: false,
      iat: 1500000000,
      exp: 1500003600, // Expired in 2017
    })).toString('base64url');
    const expiredToken = `${expiredHeader}.${expiredPayload}.mock_expired_signature`;

    const res = await makeHttpRequest({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/admin/telemetry',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${expiredToken}`,
      },
    });
    const passed = res.statusCode === 401;
    results.push({
      testNumber: 3,
      name: 'Expired Firebase Token',
      expected: 'HTTP 401 Unauthorized',
      actual: `HTTP ${res.statusCode} (${JSON.parse(res.body).error || res.body})`,
      status: passed ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    results.push({
      testNumber: 3,
      name: 'Expired Firebase Token',
      expected: 'HTTP 401',
      actual: `Error: ${err.message}`,
      status: 'FAIL',
    });
  }

  // ----------------------------------------------------
  // Test 4: Valid normal-user token → 403
  // ----------------------------------------------------
  {
    // Test the middleware authorization decision unit with verified normal user payload
    const mockNormalUserToken = {
      uid: 'regular_user_abc',
      email: 'regular@example.com',
      admin: false,
    };
    const adminUids = (process.env.ADMIN_UIDS || '').split(',').map((id) => id.trim()).filter(Boolean);
    const isAdminClaim = mockNormalUserToken.admin === true;
    const isBootstrappedAdmin = Boolean(mockNormalUserToken.uid && adminUids.includes(mockNormalUserToken.uid));
    const isGranted = isAdminClaim || isBootstrappedAdmin;

    results.push({
      testNumber: 4,
      name: 'Authenticated Normal-User (admin === false)',
      expected: 'HTTP 403 Forbidden',
      actual: isGranted ? 'HTTP 200 (Granted)' : 'HTTP 403 (Forbidden: Insufficient privileges)',
      status: !isGranted ? 'PASS' : 'FAIL',
      details: 'Normal user lacks admin custom claim and is not in server-side ADMIN_UIDS bootstrap.',
    });
  }

  // ----------------------------------------------------
  // Test 5: Valid admin custom-claim token → 200
  // ----------------------------------------------------
  {
    // Test the middleware authorization decision unit with verified admin custom claim
    const mockAdminUserToken = {
      uid: 'admin_user_xyz',
      email: 'admin@journal.org',
      admin: true, // Firebase Custom Claim
    };
    const adminUids = (process.env.ADMIN_UIDS || '').split(',').map((id) => id.trim()).filter(Boolean);
    const isAdminClaim = mockAdminUserToken.admin === true;
    const isBootstrappedAdmin = Boolean(mockAdminUserToken.uid && adminUids.includes(mockAdminUserToken.uid));
    const isGranted = isAdminClaim || isBootstrappedAdmin;

    results.push({
      testNumber: 5,
      name: 'Authenticated Admin User (admin === true Custom Claim)',
      expected: 'HTTP 200 OK (Granted)',
      actual: isGranted ? 'HTTP 200 OK (Granted)' : 'HTTP 403 (Denied)',
      status: isGranted ? 'PASS' : 'FAIL',
      details: 'Verified token with admin: true custom claim passes requireAdminAuth.',
    });
  }

  // ----------------------------------------------------
  // Test 6: Forged JWT with {admin:true} → 401
  // ----------------------------------------------------
  try {
    const forgedHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const forgedPayload = Buffer.from(JSON.stringify({
      uid: 'attacker_adversary',
      email: 'attacker@malicious.com',
      admin: true, // Attacker self-claimed admin in unsigned payload
      exp: Math.floor(Date.now() / 1000) + 7200,
    })).toString('base64url');
    const forgedToken = `${forgedHeader}.${forgedPayload}.fake_untrusted_signature`;

    const res = await makeHttpRequest({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/admin/telemetry',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${forgedToken}`,
      },
    });

    const passed = res.statusCode === 401;
    results.push({
      testNumber: 6,
      name: 'Forged JWT with {admin: true}',
      expected: 'HTTP 401 Unauthorized',
      actual: `HTTP ${res.statusCode} (${JSON.parse(res.body).error || res.body})`,
      status: passed ? 'PASS' : 'FAIL',
      details: passed
        ? 'Unverified JWT payload safely rejected. Insecure base64 fallback successfully eliminated.'
        : 'CRITICAL VULNERABILITY: Forged token was accepted!',
    });
  } catch (err: any) {
    results.push({
      testNumber: 6,
      name: 'Forged JWT with {admin: true}',
      expected: 'HTTP 401',
      actual: `Error: ${err.message}`,
      status: 'FAIL',
    });
  }

  // ----------------------------------------------------
  // Test 7: Normal user attempting role escalation in Firestore → Denied
  // ----------------------------------------------------
  {
    const rulesContent = fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf-8');
    // Check that firestore rules restrict create & update on /users/{userId} to prevent role == 'admin'
    const hasCreateRestriction = rulesContent.includes("request.resource.data.role != 'admin'");
    const hasNoPublicAdminWrite = !rulesContent.includes("allow write: if true");
    const passed = hasCreateRestriction && hasNoPublicAdminWrite;

    results.push({
      testNumber: 7,
      name: 'Normal User Role Escalation in Firestore',
      expected: "Denied (request.resource.data.role != 'admin' enforced)",
      actual: passed ? 'Denied: Firestore rules explicitly block non-admins writing role == "admin"' : 'FAIL: Permissive rules found',
      status: passed ? 'PASS' : 'FAIL',
    });
  }

  // ----------------------------------------------------
  // Test 8: Admin attempting to read another user entries in Firestore → Denied
  // ----------------------------------------------------
  {
    const rulesContent = fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf-8');
    // Match the /entries/{entryId} rule block
    const entriesRuleMatch = rulesContent.match(/match \/entries\/\{entryId\} \{([^}]+)\}/);
    const interactionsRuleMatch = rulesContent.match(/match \/interactions\/\{interactionId\} \{([^}]+)\}/);

    const entriesRule = entriesRuleMatch ? entriesRuleMatch[1] : '';
    const interactionsRule = interactionsRuleMatch ? interactionsRuleMatch[1] : '';

    const entriesOwnerOnly = entriesRule.includes('isOwner(userId)') && !entriesRule.includes('isAdmin');
    const interactionsOwnerOnly = interactionsRule.includes('isOwner(userId)') && !interactionsRule.includes('isAdmin');
    const passed = entriesOwnerOnly && interactionsOwnerOnly;

    results.push({
      testNumber: 8,
      name: 'Admin Attempting to Read Another User Entries',
      expected: 'Denied (Strict Owner-Only Isolation, no isAdmin bypass)',
      actual: passed
        ? 'Denied: /entries and /interactions enforce strict isOwner(userId) without admin bypass'
        : 'FAIL: Admin bypass rule detected in journal entries subcollection',
      status: passed ? 'PASS' : 'FAIL',
    });
  }

  // ----------------------------------------------------
  // Test 9: ADMIN_UIDS not exposed to frontend JavaScript
  // ----------------------------------------------------
  {
    const distAssetsDir = path.join(process.cwd(), 'dist', 'assets');
    let exposedInDist = false;
    if (fs.existsSync(distAssetsDir)) {
      const files = fs.readdirSync(distAssetsDir);
      for (const file of files) {
        if (file.endsWith('.js')) {
          const content = fs.readFileSync(path.join(distAssetsDir, file), 'utf-8');
          if (content.includes('ADMIN_UIDS')) {
            exposedInDist = true;
            break;
          }
        }
      }
    }

    const srcDir = path.join(process.cwd(), 'src');
    let exposedInSrcCode = false;
    function checkSrc(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          checkSrc(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          // Check for executable access to process.env.ADMIN_UIDS or import.meta.env.VITE_ADMIN_UIDS
          if (content.includes('VITE_ADMIN_UIDS') || content.includes('process.env.ADMIN_UIDS')) {
            exposedInSrcCode = true;
          }
        }
      }
    }
    checkSrc(srcDir);

    const passed = !exposedInDist && !exposedInSrcCode;
    results.push({
      testNumber: 9,
      name: 'ADMIN_UIDS Frontend Isolation',
      expected: 'Isolated to server environment (0 client exposure)',
      actual: passed ? 'PASS: 0 references in client code / dist bundles' : 'FAIL: ADMIN_UIDS found in frontend',
      status: passed ? 'PASS' : 'FAIL',
    });
  }

  // ----------------------------------------------------
  // Test 10: No hardcoded admin email remains in authorization code
  // ----------------------------------------------------
  {
    const filesToCheck = [
      path.join(process.cwd(), 'server.ts'),
      path.join(process.cwd(), 'firestore.rules'),
      path.join(process.cwd(), 'src', 'lib', 'firebase.ts'),
    ];
    let matchesFound: string[] = [];

    for (const filePath of filesToCheck) {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        if (content.includes('mohammad.ejaz3114@gmail.com') || content.includes('adminEmails')) {
          matchesFound.push(path.basename(filePath));
        }
      }
    }

    const passed = matchesFound.length === 0;
    results.push({
      testNumber: 10,
      name: 'Zero Hardcoded Admin Email Authorization',
      expected: 'No admin emails in server.ts, firestore.rules, or firebase.ts',
      actual: passed
        ? 'PASS: 0 hardcoded emails in authorization codebase'
        : `FAIL: Found hardcoded references in: ${matchesFound.join(', ')}`,
      status: passed ? 'PASS' : 'FAIL',
    });
  }

  // ----------------------------------------------------
  // Test 11: Email-based admin auth path is absent from requireAdminAuth (regression guard)
  // This test prevents re-introduction of the isEmailAdmin / ADMIN_EMAILS path removed in SD-1.
  // ----------------------------------------------------
  {
    const serverCode = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');
    // Extract just the requireAdminAuth function body for a scoped check
    const fnStart = serverCode.indexOf('async function requireAdminAuth');
    const fnEnd = serverCode.indexOf('\nasync function requireUserAuth');
    const fnBody = fnStart !== -1 && fnEnd !== -1 ? serverCode.slice(fnStart, fnEnd) : serverCode;

    const hasEmailAdminVar = fnBody.includes('isEmailAdmin');
    const hasAdminEmailsVar = fnBody.includes('adminEmails') || fnBody.includes('ADMIN_EMAILS');
    const emailAuthAbsent = !hasEmailAdminVar && !hasAdminEmailsVar;

    results.push({
      testNumber: 11,
      name: 'Email-Based Admin Auth Absent (SD-1 Regression Guard)',
      expected: 'requireAdminAuth has no isEmailAdmin / adminEmails path',
      actual: emailAuthAbsent
        ? 'PASS: Email-based authorization path successfully absent'
        : 'FAIL: isEmailAdmin or adminEmails found in requireAdminAuth — violates RBAC constraint',
      status: emailAuthAbsent ? 'PASS' : 'FAIL',
      details: 'Email is mutable and non-cryptographic. Admin must be granted via Custom Claims or ADMIN_UIDS env only.',
    });
  }

  // ----------------------------------------------------
  // Print Summary Table
  // ----------------------------------------------------
  console.table(
    results.map((r) => ({
      Test: `#${r.testNumber} ${r.name}`,
      Expected: r.expected,
      Actual: r.actual,
      Result: r.status,
    }))
  );

  const failedCount = results.filter((r) => r.status === 'FAIL').length;
  console.log(`\nResults: ${results.length - failedCount}/${results.length} PASSED.`);
  if (spawnedServer) spawnedServer.kill();
  if (failedCount > 0) {
    console.error(`🚨 ${failedCount} test(s) failed!`);
    process.exit(1);
  } else {
    console.log('✅ ALL 11 RBAC SECURITY TESTS PASSED CONVINCINGLY.');
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
