import React from 'react';
import { X, ShieldAlert, CheckCircle2, Lock, Terminal, Database, Key, Server, Cpu } from 'lucide-react';

interface ThreatModelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ThreatModelModal: React.FC<ThreatModelModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl text-stone-200">
        
        {/* Modal Header */}
        <div className="p-6 border-b border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-stone-100">Security Architecture &amp; Threat Model Audit</h2>
              <p className="text-xs text-stone-400">
                5-Zone Threat Modeling, OWASP Mitigations, &amp; Verification Walkthrough
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          
          {/* 1. Threat Summary Table */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <Lock className="w-4 h-4" /> 1. Agentic Threat Summary Table (5 Threat Zones)
            </h3>
            <div className="overflow-x-auto rounded-xl border border-stone-800">
              <table className="w-full text-xs text-left text-stone-300">
                <thead className="bg-stone-950 text-stone-400 uppercase text-[10px] tracking-wider border-b border-stone-800">
                  <tr>
                    <th className="p-3">Threat Zone</th>
                    <th className="p-3">Identified Scenario / Risk</th>
                    <th className="p-3">OWASP Vector</th>
                    <th className="p-3">Countermeasure / Mitigation Implemented</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-800 bg-stone-900/70">
                  <tr>
                    <td className="p-3 font-semibold text-stone-200">1. Input Surfaces</td>
                    <td className="p-3">Malicious prompt injections &amp; massive payloads overflowing server buffers.</td>
                    <td className="p-3 font-mono text-amber-400">OWASP LLM02 / A03</td>
                    <td className="p-3">10MB JSON size guard, defensive null-safe destructuring, and context slicing prior to Gemini invocation.</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-stone-200">2. Planning &amp; Reasoning</td>
                    <td className="p-3">System prompt override attempts to extract internal instructions or secrets.</td>
                    <td className="p-3 font-mono text-amber-400">OWASP LLM01</td>
                    <td className="p-3">Strict system role isolation in server-side `@google/genai` config; user content is treated strictly as plain input.</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-stone-200">3. Tool Execution</td>
                    <td className="p-3">API exhaustion or model degradation causing application outage.</td>
                    <td className="p-3 font-mono text-amber-400">OWASP LLM04 / A05</td>
                    <td className="p-3">Automated 4-tier Fallback Ladder (Flash 3.6 &rarr; Flash Lite 3.1 &rarr; Dynamic Flash &rarr; Flash 3.7).</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-stone-200">4. Memory &amp; State</td>
                    <td className="p-3">Cross-user data leakage or unauthorized document tampering in Firestore.</td>
                    <td className="p-3 font-mono text-amber-400">OWASP A01</td>
                    <td className="p-3">Owner-bound Firestore Security Rules enforcing <code className="text-emerald-400 font-mono">request.auth.uid == userId</code> on all paths. Zero insecure defaults.</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-stone-200">5. Inter-System Communication</td>
                    <td className="p-3">Exposure of GEMINI_API_KEY in browser network tabs.</td>
                    <td className="p-3 font-mono text-amber-400">OWASP A02</td>
                    <td className="p-3">Full-stack Express proxy (/api/gemini/*). Secret keys remain strictly on the server; zero client exposure.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 2. Firestore Rule Verification */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
              <Database className="w-4 h-4" /> 2. Active Firestore Security Rules
            </h3>
            <pre className="p-4 rounded-xl bg-stone-950 border border-stone-800 text-[11px] font-mono text-emerald-400 overflow-x-auto">
{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      match /entries/{entryId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
      
      match /interactions/{interactionId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }

      match /{allSubpaths=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}`}
            </pre>
          </div>

          {/* 3. Comprehensive Verification Walkthrough Test Cases */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-blue-400 flex items-center gap-2">
              <Terminal className="w-4 h-4" /> 3. Functional Stability &amp; Verification Walkthrough
            </h3>
            <div className="space-y-2 text-xs text-stone-300">
              <div className="p-3 rounded-lg bg-stone-950/70 border border-stone-800 space-y-1">
                <span className="font-semibold text-stone-100 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Test Case 1: Email/Password Sign-Up &amp; Sign-In
                </span>
                <p className="text-stone-400">Navigate to &ldquo;Create Account&rdquo; &rarr; Enter name, valid email, and 6+ char password &rarr; Submit &rarr; Verify session initialized &amp; user doc created at <code className="text-amber-300 font-mono">/users/{'{uid}'}</code> &rarr; Sign out &rarr; Re-authenticate using &ldquo;Sign In&rdquo; tab with credentials &rarr; Verify instant dashboard access.</p>
              </div>

              <div className="p-3 rounded-lg bg-stone-950/70 border border-stone-800 space-y-1">
                <span className="font-semibold text-stone-100 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Test Case 2: Password Reset Recovery Flow
                </span>
                <p className="text-stone-400">On Sign In tab &rarr; Click &ldquo;Forgot password?&rdquo; &rarr; Enter email address &rarr; Click &ldquo;Send Recovery Email&rdquo; &rarr; Confirm success confirmation banner is displayed with zero crashes.</p>
              </div>

              <div className="p-3 rounded-lg bg-stone-950/70 border border-stone-800 space-y-1">
                <span className="font-semibold text-stone-100 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Test Case 3: Google Federated OAuth Authentication
                </span>
                <p className="text-stone-400">Click &ldquo;Sign in with Google&rdquo; &rarr; Complete OAuth popup &rarr; Confirm profile reflects authenticated UID in Firestore at <code className="text-amber-300 font-mono">/users/{'{uid}'}</code>.</p>
              </div>

              <div className="p-3 rounded-lg bg-stone-950/70 border border-stone-800 space-y-1">
                <span className="font-semibold text-stone-100 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Test Case 2: Multi-Turn Reflection Dialogue with Gemini
                </span>
                <p className="text-stone-400">Write an entry in the reflection studio &rarr; Send prompt to Gemini &rarr; Verify model returns formatted response via fallback ladder &rarr; Message turns persist into Firestore.</p>
              </div>

              <div className="p-3 rounded-lg bg-stone-950/70 border border-stone-800 space-y-1">
                <span className="font-semibold text-stone-100 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Test Case 3: Auto-Summarization &amp; Action Extraction
                </span>
                <p className="text-stone-400">Click &ldquo;Auto-Summarize &amp; Insights&rdquo; &rarr; Verify Gemini synthesizes a title, summary, key takeaways, sentiment mood, and action items checklist &rarr; Confirm summary is written to Firestore entry doc.</p>
              </div>

              <div className="p-3 rounded-lg bg-stone-950/70 border border-stone-800 space-y-1">
                <span className="font-semibold text-stone-100 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Test Case 4: Cognitive Brainstorming &amp; Reframing
                </span>
                <p className="text-stone-400">Open &ldquo;Brainstorm &amp; Reframe&rdquo; &rarr; Select focus area (e.g. Cognitive Reframe or Action Items) &rarr; Verify structured guidance is rendered.</p>
              </div>

              <div className="p-3 rounded-lg bg-stone-950/70 border border-stone-800 space-y-1">
                <span className="font-semibold text-stone-100 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Test Case 5: Entry History Retrieval &amp; Cross-User Isolation
                </span>
                <p className="text-stone-400">Create multiple entries &rarr; Filter and search via sidebar &rarr; Switch between entries &rarr; Verify only documents belonging to the authenticated UID are accessible.</p>
              </div>
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-stone-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium transition-colors"
          >
            Close Audit
          </button>
        </div>

      </div>
    </div>
  );
};
