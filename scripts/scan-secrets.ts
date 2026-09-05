/**
 * scripts/scan-secrets.ts
 *
 * Grep-based secret pattern scanner for the Gemini Reflection Journal project.
 * Scans source files for patterns that indicate accidental secret exposure.
 *
 * Checked patterns:
 *  - Raw API key strings (AIza... Google API key format)
 *  - Hardcoded Firebase service account JSON blobs
 *  - VITE_GEMINI_API_KEY with a real value (not a placeholder)
 *  - GEMINI_API_KEY with inline value assignment
 *  - Private key PEM material in source
 *  - Hardcoded admin email used as authorization primitive
 *
 * NOTE: This is a deterministic, local grep scanner.
 * It does NOT require network access, external tools, or paid subscriptions.
 * For deeper scanning (git history, entropy-based detection), integrate tools like
 * trufflehog or gitleaks as a future hardening step.
 */

import fs from 'fs';
import path from 'path';

interface ScanResult {
  pattern: string;
  description: string;
  matches: Array<{ file: string; line: number; content: string }>;
  severity: 'CRITICAL' | 'HIGH' | 'WARN';
}

const SCAN_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.env', '.yaml', '.yml'];
const EXCLUDE_DIRS = ['node_modules', '.git', 'dist', '.agents'];
// firebase-applet-config.json and similar Firebase client config files contain
// the Firebase Web SDK "apiKey" which is an intentionally public project identifier,
// NOT a secret. Security is enforced by Firestore Rules + Auth, not key secrecy.
// See: https://firebase.google.com/docs/projects/api-keys
const EXCLUDE_FILES = [
  'scan-secrets.ts',             // Don't flag this scanner itself
  'firebase-applet-config.json', // Firebase Web SDK config — apiKey is public by design
  'firebase-config.json',        // Alternative config filename
  'firebaseConfig.ts',           // Client-side config module
];

const SECRET_PATTERNS: Array<{
  label: string;
  description: string;
  test: (line: string) => boolean;
  severity: 'CRITICAL' | 'HIGH' | 'WARN';
}> = [
  {
    label: 'Google API Key (AIza...)',
    description: 'Raw Google/Firebase API key embedded in source',
    test: (line) => /AIza[0-9A-Za-z\-_]{35}/.test(line),
    severity: 'CRITICAL',
  },
  {
    label: 'VITE_ prefixed secret key with real value',
    description: 'API key exposed via VITE_ prefix will appear in the browser bundle',
    test: (line) =>
      /VITE_GEMINI_API_KEY\s*=\s*["']?AIza/.test(line) ||
      /VITE_FIREBASE_API_KEY\s*=\s*["']?AIza/.test(line),
    severity: 'CRITICAL',
  },
  {
    label: 'Private key PEM material',
    description: 'RSA/EC private key material embedded in source file',
    test: (line) => line.includes('-----BEGIN PRIVATE KEY-----') || line.includes('-----BEGIN RSA PRIVATE KEY-----'),
    severity: 'CRITICAL',
  },
  {
    label: 'Firebase service account inline JSON',
    description: 'Service account credentials embedded as object literal',
    test: (line) =>
      line.includes('"type": "service_account"') ||
      line.includes('"private_key_id"') ||
      line.includes('"client_email"') && line.includes('gserviceaccount.com'),
    severity: 'HIGH',
  },
  {
    label: 'Hardcoded email used as admin authorization',
    description: 'Email address used as RBAC primitive. Violates project RBAC constraint.',
    test: (line) =>
      /ADMIN_EMAILS.*@/.test(line) &&
      !line.trim().startsWith('//') &&
      !line.trim().startsWith('*') &&
      !line.includes('process.env.ADMIN_EMAILS'),
    severity: 'HIGH',
  },
  {
    label: 'GEMINI_API_KEY hardcoded value (not env var reference)',
    description: 'API key value assigned directly instead of read from environment',
    test: (line) =>
      /GEMINI_API_KEY\s*[=:]\s*["']AIza/.test(line),
    severity: 'CRITICAL',
  },
];

function scanDirectory(dir: string): Array<{ file: string; lines: Array<{ num: number; text: string }> }> {
  const fileLines: Array<{ file: string; lines: Array<{ num: number; text: string }> }> = [];

  function walk(current: string) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (EXCLUDE_DIRS.includes(entry.name)) continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        if (EXCLUDE_FILES.includes(entry.name)) continue;
        const ext = path.extname(entry.name);
        if (!SCAN_EXTENSIONS.includes(ext)) continue;
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n').map((text, i) => ({ num: i + 1, text }));
          fileLines.push({ file: path.relative(process.cwd(), fullPath), lines });
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  walk(dir);
  return fileLines;
}

function runScan() {
  console.log('====================================================');
  console.log('🔍 SECRET PATTERN SCAN');
  console.log('====================================================\n');

  const projectRoot = process.cwd();
  const fileData = scanDirectory(projectRoot);

  const scanResults: ScanResult[] = SECRET_PATTERNS.map((p) => ({
    pattern: p.label,
    description: p.description,
    severity: p.severity,
    matches: [],
  }));

  for (const { file, lines } of fileData) {
    for (const { num, text } of lines) {
      for (let i = 0; i < SECRET_PATTERNS.length; i++) {
        if (SECRET_PATTERNS[i].test(text)) {
          const masked = text.trim().slice(0, 80).replace(/AIza[0-9A-Za-z\-_]{10,}/, 'AIza***REDACTED***');
          scanResults[i].matches.push({ file, line: num, content: masked });
        }
      }
    }
  }

  let criticalCount = 0;
  let highCount = 0;
  let warnCount = 0;

  for (const result of scanResults) {
    if (result.matches.length > 0) {
      const icon = result.severity === 'CRITICAL' ? '🔴' : result.severity === 'HIGH' ? '🟠' : '🟡';
      console.log(`${icon} [${result.severity}] ${result.pattern}`);
      console.log(`   ${result.description}`);
      for (const m of result.matches) {
        console.log(`   → ${m.file}:${m.line}: ${m.content}`);
      }
      console.log('');
      if (result.severity === 'CRITICAL') criticalCount += result.matches.length;
      else if (result.severity === 'HIGH') highCount += result.matches.length;
      else warnCount += result.matches.length;
    }
  }

  console.log('----------------------------------------------------');
  if (criticalCount === 0 && highCount === 0 && warnCount === 0) {
    console.log('✅ SECRET SCAN PASSED — No secret patterns detected in source files.\n');
  } else {
    console.log(`Summary: ${criticalCount} CRITICAL | ${highCount} HIGH | ${warnCount} WARN`);
    if (criticalCount > 0 || highCount > 0) {
      console.error(`\n🚨 SECRET SCAN FAILED — ${criticalCount + highCount} critical/high-severity secrets found!`);
      process.exit(1);
    } else {
      console.warn(`\n⚠️ ${warnCount} warning(s). Review before deploying.`);
    }
  }
}

runScan();
