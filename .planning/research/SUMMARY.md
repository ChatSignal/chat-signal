# Project Research Summary

**Project:** Chat Signal Radar — Chrome Web Store Publication Readiness (v1.1)
**Domain:** Chrome extension CWS compliance and store submission
**Researched:** 2026-02-19
**Confidence:** HIGH

## Executive Summary

Chat Signal Radar is a complete, functional MV3 Chrome extension. The v1.1 milestone is not greenfield development — it is a compliance and publication sprint. The core stack (Rust/WASM, vanilla JS, DOMPurify, MV3) is frozen and correct. All research converges on the same conclusion: the extension's technical architecture is already in good shape, and what stands between the current codebase and a live CWS listing is documentation, dashboard form-filling, a small amount of UI work (disk space warning in the WebLLM consent modal), and store asset creation. No new runtime dependencies, no framework changes, no build pipeline changes.

The recommended approach is to sequence work by submission dependency: privacy policy and dashboard compliance fields must be in place before any submission attempt, manifest verification and permission justification must be written before upload, disk space warning is the only code change required, and screenshots/promotional images are the final step. None of these tasks are high-risk from a technical standpoint. The primary risk is not technical failure but process failure — incomplete dashboard fields, inaccurate privacy policy, or unverified incognito behavior leading to rejection cycles that each take 1-3 weeks to resolve.

The key risks are all avoidable with discipline: the CWS review system rejects on privacy policy completeness and permission disclosure long before it rejects on technical quality. The "Purple Lithium" rejection (User Data Policy — Disclosure) is the most common failure mode for compliant, well-built extensions. Avoiding it requires treating the CWS developer dashboard as a first-class deliverable, not an afterthought. Every permission, every `connect-src` entry, and every data access pattern must be disclosed in both the hosted privacy policy and the dashboard justification fields.

## Key Findings

### Recommended Stack

The existing runtime stack requires no changes. New tooling for this milestone is minimal: GitHub Pages for privacy policy hosting (free, permanent HTTPS, same GitHub org, no third-party branding), `navigator.storage.estimate()` for pre-download disk space estimation (no new manifest permission required), and CRXcavator for pre-submission permission risk scanning. The CWS developer account costs $5 one-time and requires 2-step verification. Playwright is available via `npx` for reproducible 1280x800 screenshot capture without a global install.

**Core technologies (new for this milestone):**
- **GitHub Pages**: privacy policy hosting — free, permanent HTTPS, no third-party branding artifacts, same GitHub org as the codebase
- **`navigator.storage.estimate()`**: disk space check before WebLLM download — no new manifest permission required (contrast with `chrome.system.storage` which would require a new permission and trigger CWS re-review)
- **CRXcavator**: pre-submission automated permission risk scan — catches permission risks, weak CSP, and vulnerable JS libs before reviewers do; run before every submission attempt
- **Playwright (`npx`)**: reproducible 1280x800 screenshot capture — no global install, captures real extension UI at exact required dimensions

**What not to use:**
- TermsFeed / Termly / privacypolicies.com for policy hosting — generic boilerplate includes inapplicable clauses (cookies, analytics, ads); may confuse reviewers
- `chrome.system.storage` for disk space — adds a new manifest permission, triggering CWS re-review
- Notion / Google Docs / Pastebin for policy URL — mutable or login-gated URLs; CWS reviewers require a stable public HTTPS static page
- `unlimitedStorage` permission unless WebLLM bundle is included in the submission — over-permissioning without it being needed

### Expected Features

All work falls into two categories: compliance requirements (P1, blocks submission) and review friction reducers (P2, strongly recommended). Nothing should be deferred for a later milestone except the marquee promotional tile (1400x560, only needed if seeking CWS featured placement).

**Must have (table stakes — blocks submission):**
- Privacy policy written and hosted at a public HTTPS URL — must be linked in the dashboard Privacy Policy URL field (not just in the description)
- Permission justifications written in dashboard for `sidePanel`, `storage`, `host_permissions` (YouTube, Twitch), and `all_frames: true`
- Data usage certification checkboxes: "Website content" and "Browsing activity" — local processing is not an exemption from disclosure
- Disk space warning added to WebLLM consent modal (static size disclosure is mandatory; dynamic `navigator.storage.estimate()` check is recommended)
- WebLLM download progress surfaced in sidebar UI (existing `initProgressCallback` needs to be connected to a visible UI element)
- At least 1 screenshot at 1280x800 px and 1 promotional image at 440x280 px
- Store listing description updated (132 char max; accurate single-purpose framing covering clustering, sentiment, topics, and session history)
- Manifest version incremented to `1.1.0`
- Incognito mode manually verified (no code changes expected, but must be tested)

**Should have (reduce review friction):**
- Privacy policy link in sidebar footer (one anchor tag in `sidebar.html`) — demonstrates transparency, reduces reviewer friction
- Test instructions written for reviewers in dashboard (point to a reliable live stream; explain the ~10-message warm-up period before the sidebar populates)

**Defer (v2+):**
- Marquee promotional image (1400x560) — only needed if seeking CWS featured placement; skip for initial submission
- In-extension privacy policy HTML page — external URL hosted on GitHub Pages is all that is required; an internal page adds zero compliance value

### Architecture Approach

The existing architecture requires only two file changes: `extension/sidebar/sidebar.html` (add disk space disclosure text to the `#llm-consent-modal`) and `extension/sidebar/sidebar.js` (add `checkStorageForLLM()` using `navigator.storage.estimate()`, disable the "Enable AI" button if insufficient quota is detected, and wire the existing `initProgressCallback` to a visible progress indicator). All other compliance work is external to the extension code: the privacy policy is a standalone document hosted on GitHub Pages, and the CWS dashboard fields are metadata entered at submission time.

**Major components and their v1.1 change status:**
1. `docs/privacy-policy.md` + GitHub Pages — NEW: static document, no extension code involved
2. `extension/sidebar/sidebar.html` — MODIFIED: add disk space disclosure text to `#llm-consent-modal`
3. `extension/sidebar/sidebar.js` — MODIFIED: add `checkStorageForLLM()` pre-download check; wire `initProgressCallback` to visible progress UI
4. `extension/manifest.json` — MODIFIED: increment version to `1.1.0`; verify `raw.githubusercontent.com` in `connect-src` is actively used and remove if not
5. CWS Developer Dashboard — NEW (external): permission justifications, privacy URL, data type certifications, single-purpose description, screenshots, promo image

**Key patterns:**
- Disk space check must run before `initializeLLM()` is called — showing the warning after download starts is a pitfall (corrupted cache risk)
- `navigator.storage.estimate()` should be used defensively: it returns quota headroom (~60% of actual disk), not exact physical space; treat as best-effort and show the static size disclosure regardless of whether the dynamic check succeeds
- The `incognito` manifest key should remain unset (defaults to `"spanning"`) — `chrome.storage` is always shared between normal and incognito contexts; setting `"split"` would break session history visibility in incognito

### Critical Pitfalls

1. **Privacy policy missing or linked in the wrong field** — The policy URL must be entered in the dedicated Privacy Policy URL field on the Privacy Practices tab of the CWS dashboard. Linking it only in the store description is treated as missing. Never use a generic "no data collected" template — the extension reads DOM content and that must be disclosed even though processing is local.

2. **Privacy Practices dashboard fields incomplete (Purple Lithium rejection)** — The dashboard Privacy Practices tab has required fields beyond the privacy policy URL: single-purpose description, per-permission justifications, remote code declaration, and data type certification checkboxes. These live on a separate tab and are easy to miss. Incomplete fields cause guaranteed rejection. Complete every field on every tab before submitting.

3. **`connect-src` external domains undisclosed** — The manifest CSP includes `connect-src` for `huggingface.co`, `cdn-lfs.huggingface.co`, and `raw.githubusercontent.com`. Reviewers treat undisclosed external connections as potential data exfiltration. Each entry must be explained in both the privacy policy and the dashboard justification. If `raw.githubusercontent.com` is unused in extension code, remove it — it is the highest-risk entry because GitHub raw content could theoretically contain scripts (verify with `grep -r "raw.githubusercontent" extension/`).

4. **WebLLM download lacks `unlimitedStorage` permission** — If the WebLLM bundle is included in the submission, `unlimitedStorage` must be added to the manifest to prevent Chrome from evicting the ~400MB IndexedDB cache under storage pressure. Omitting it means the model may silently disappear after download. The tradeoff is an install-time warning to users; this is the correct tradeoff when the feature is bundled.

5. **Screenshot dimensions, content, or trademark violations** — Screenshots must be exactly 1280x800 px showing the extension in real use with populated data, not loading states. The store description must not use "YouTube" or "Twitch" in title-case headings adjacent to the extension name in a way that implies partnership or endorsement. The current extension name "Chat Signal Radar" is already clean.

## Implications for Roadmap

Based on combined research, the recommended phase structure follows submission dependency order. The critical insight is that some tasks are pure documentation (no code, no risk), one task is low-risk additive code, and one task is testing only. Grouping by type reduces context switching and allows parallel progress on non-dependent tracks.

### Phase 1: Privacy Policy and Dashboard Compliance

**Rationale:** This is the hard blocker. Nothing can be submitted without a live privacy policy URL and complete dashboard fields. It is also zero-risk work — writing and hosting a document. Completing this first unblocks the dashboard submission flow and reduces iteration cost if the policy needs revision after reviewer feedback.

**Delivers:** Hosted privacy policy at a public HTTPS URL (GitHub Pages); all CWS dashboard fields completed (single-purpose description, permission justifications for all permissions including `all_frames: true`, remote code declaration, data usage certifications for "Website content" and "Browsing activity", privacy URL entered)

**Addresses:**
- Table stakes: Privacy policy URL hosted and linked in the dashboard Privacy Policy URL field
- Table stakes: Permission justifications for `sidePanel`, `storage`, `host_permissions` (YouTube, Twitch), `all_frames: true`
- Table stakes: Data usage certification checkboxes

**Avoids:**
- Pitfall 1 (Missing privacy policy / linked in the wrong field)
- Pitfall 2 (Incomplete Privacy Practices dashboard — Purple Lithium rejection)
- Pitfall 6 (Undeclared "Website content" and "Browsing activity" data types)

### Phase 2: Manifest and Permission Audit

**Rationale:** Verify the manifest is clean before submission. This is a low-risk audit: check `raw.githubusercontent.com` in `connect-src` (remove if unused), confirm `wasm-unsafe-eval` is not altered, make the explicit decision on whether WebLLM is bundled in this submission (if yes, add `unlimitedStorage`), and increment the version to `1.1.0`. These decisions affect dashboard fields from Phase 1, so the audit may require minor Phase 1 field updates.

**Delivers:** Clean manifest ready for ZIP packaging; `raw.githubusercontent.com` removed or justified; `unlimitedStorage` decision made and applied if WebLLM is bundled; all `connect-src` entries documented in privacy policy and dashboard; version set to `1.1.0`

**Uses:** CRXcavator scan to verify permission risk score before submission

**Avoids:**
- Pitfall 3 (Broad host permissions with `all_frames: true` undocumented)
- Pitfall 4 (`wasm-unsafe-eval` accidentally removed; `connect-src` entries undisclosed in policy)
- Pitfall 5 (Missing `unlimitedStorage` when WebLLM is bundled)

### Phase 3: Disk Space Warning and WebLLM Progress UI

**Rationale:** This is the only substantive code change in the milestone. It is isolated to two files (`sidebar.html` and `sidebar.js`) and is additive — it does not alter any existing behavior paths. The static size disclosure text in the consent modal is mandatory per CWS policy guidance. The dynamic `navigator.storage.estimate()` check is recommended. The progress indicator requires connecting an existing callback to a visible UI element (the callback already exists in `llm-adapter.js`).

**Delivers:** Consent modal in `#llm-consent-modal` shows "~400MB, requires ~500MB free disk space" text; "Enable AI" button disabled with message when `navigator.storage.estimate()` reports insufficient quota; LLM initialization progress visible in sidebar during the download sequence (existing `initProgressCallback` wired to a progress indicator element)

**Implements:** Storage estimate flow in sidebar.js; progress callback surface in sidebar UI

**Avoids:**
- Pitfall 5 (No size disclosure before 400MB download begins)
- UX pitfall: Consent modal mentions "AI model" without size context (leads to negative reviews)
- Architecture anti-pattern: Showing storage warning after download starts (corrupted cache risk)

### Phase 4: Store Listing Assets and Copy

**Rationale:** Screenshots require the extension to be in its final working state — they must show real in-use data, not loading states or empty UI. This makes Phase 4 a natural last step for assets. The promotional image (440x280) is parallel work that does not require extension interaction. Screenshot and copy review for trademark compliance is the final gate before submission.

**Delivers:** 1-5 screenshots at 1280x800 px showing real in-use state (cluster buckets with messages, mood indicator active, trending topics populated, session history tab, options page); 1 promotional image at 440x280 px; store listing description reviewed for trademark compliance and single-purpose framing (no title-case YouTube/Twitch in headings adjacent to extension name)

**Avoids:**
- Pitfall 7 (Trademark violation in store copy)
- UX pitfall: Screenshots showing loading states or empty UI (reviewer cannot verify functionality)

### Phase 5: Incognito Verification and Final Submission

**Rationale:** Incognito verification is testing-only work with no expected code changes. It is the final pre-submission gate. Doing it last means the extension is in its final state for the test, including all Phase 3 code changes. If bugs are found, they are fixed before submission rather than discovered by users or reviewers post-launch.

**Delivers:** Manual test pass confirming: side panel opens in incognito, chat messages flow through content script to sidebar, session history is accessible, AI gracefully falls back to rule-based (IndexedDB is per-session in incognito — expected behavior), WASM loads without CSP errors; clean extension ZIP built (no dev artifacts, `.map` files, or test HTML); CRXcavator scan run and reviewed; optional privacy policy link added to sidebar footer; test instructions written for reviewers; submission completed via CWS developer dashboard

**Avoids:**
- Post-launch suspension from incognito behavior regressions
- Extended review from bundling dev artifacts or obfuscated code in the ZIP
- Reviewer rejection from "unable to verify functionality" on an idle stream

### Phase Ordering Rationale

- Phase 1 before everything: The privacy policy URL must be live before the dashboard submission starts; the dashboard form cannot be completed without it. This is the hard dependency on the critical path.
- Phase 2 before Phase 3: The manifest audit determines whether WebLLM is included in this submission, which affects what the consent modal and privacy policy need to say. Make the scope decision before writing UI copy.
- Phase 3 before Phase 4: Screenshots must show the final UI, including the updated consent modal with the disk space disclosure. Capture screenshots after all code changes are complete.
- Phase 5 last: Incognito testing validates the final state of the extension including Phase 3 changes. The clean ZIP build happens at the end of this phase.
- Promotional image (440x280) can be created in parallel with any other phase — it does not depend on extension code.

### Research Flags

Phases with standard, well-documented patterns (no additional research needed):
- **Phase 1:** Privacy policy content and dashboard fields are fully documented in official CWS developer docs. Execute from the playbook in STACK.md and FEATURES.md. No research phase needed.
- **Phase 2:** Manifest audit is mechanical. The `raw.githubusercontent.com` question is a one-line grep. `unlimitedStorage` tradeoff is documented. No research phase needed.
- **Phase 3:** `navigator.storage.estimate()` behavior in extension pages is documented. Implementation pattern is provided verbatim in ARCHITECTURE.md. No research phase needed.
- **Phase 4:** Screenshot and asset requirements are fully specified (1280x800, 440x280). Trademark guidance is documented in PITFALLS.md. No research phase needed.
- **Phase 5:** Incognito behavior is documented in Chrome extension manifest reference. Test checklist is provided in STACK.md. No research phase needed.

No phase requires `/gsd:research-phase` during planning. All implementation details are resolved in the research files.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All tooling recommendations verified against official Chrome developer documentation. `navigator.storage.estimate()` behavior confirmed in Chrome for Developers blog. CRXcavator is a third-party tool (MEDIUM for that specific item, HIGH for everything else). |
| Features | HIGH | All P1 features verified against official CWS program policies, dashboard field requirements, and MV3 requirements pages. Feature prioritization is directly derived from documented rejection categories (Purple Lithium, Purple Potassium). |
| Architecture | HIGH | All integration points verified against official documentation. One MEDIUM confidence item: `sidePanel` incognito behavior is inferred from spanning mode documentation; Chrome's official sidePanel docs do not enumerate incognito-specific behavior. Phase 5 manual verification will confirm. |
| Pitfalls | HIGH | Rejection categories verified against official CWS troubleshooting documentation. Trademark guidelines verified against YouTube API Services branding guidelines. Two third-party blog sources (Extension Radar, moldstud.com) are MEDIUM confidence but consistent with official sources. |

**Overall confidence:** HIGH

### Gaps to Address

- **`raw.githubusercontent.com` usage in code**: Phase 2 must grep the extension codebase to confirm whether any active `fetch()` call targets `raw.githubusercontent.com`. If unused, remove it from `connect-src`. This is a factual question about existing code, answerable in under a minute.
- **WebLLM bundle inclusion decision**: Whether the WebLLM `.wasm` bundle and model are included in the v1.1 submission affects `unlimitedStorage` requirement, `connect-src` entries, and privacy policy scope. This is a product decision that must be made before Phase 2 begins. If WebLLM is not bundled, Pitfall 5 and the `unlimitedStorage` question become moot for this milestone.
- **`sidePanel` incognito behavior**: Documented as MEDIUM confidence because Chrome's official sidePanel API docs do not enumerate incognito-specific restrictions. The inference from spanning mode documentation is sound, but Phase 5 manual testing is the verification source of truth.
- **`initProgressCallback` wiring point in `sidebar.js`**: The exact location where the progress callback connects to a UI element needs a code read before Phase 3 implementation. Not a research gap — a 5-minute code read will resolve it.

## Sources

### Primary (HIGH confidence)
- [Chrome Web Store — Publish your extension](https://developer.chrome.com/docs/webstore/publish) — publishing steps
- [Chrome Web Store — Supplying Images](https://developer.chrome.com/docs/webstore/images) — screenshot and promotional tile dimensions confirmed
- [Chrome Web Store — Complete your listing information](https://developer.chrome.com/docs/webstore/cws-dashboard-listing) — dashboard field requirements confirmed
- [Chrome Web Store — Fill out the privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy) — permissions justification field requirements confirmed
- [Chrome Web Store — Privacy Policies policy](https://developer.chrome.com/docs/webstore/program-policies/privacy) — privacy policy trigger conditions confirmed
- [Chrome Web Store — MV3 additional requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements) — remote code policy confirmed
- [Chrome Web Store — Register your developer account](https://developer.chrome.com/docs/webstore/register) — account requirements ($5 fee, 2-step verification) confirmed
- [Chrome Web Store — Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies) — single purpose, minimum permissions, Limited Use policy
- [Chrome Web Store — Policy updates 2025](https://developer.chrome.com/blog/cws-policy-updates-2025) — one appeal per violation (new 2025 policy) confirmed
- [Chrome Web Store — Troubleshooting violations](https://developer.chrome.com/docs/webstore/troubleshooting) — Purple Lithium, Purple Potassium rejection categories
- [Chrome Web Store — User Data Policy FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) — local processing not an exemption from disclosure
- [Chrome Extensions — Manifest: Incognito](https://developer.chrome.com/docs/extensions/reference/manifest/incognito) — spanning mode storage behavior confirmed
- [Chrome Extensions — activeTab permission](https://developer.chrome.com/docs/extensions/mv3/manifest/activeTab/) — why `host_permissions` cannot be replaced with `activeTab` for persistent content scripts
- [Chrome Extensions — Content Security Policy (MV3)](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy) — `wasm-unsafe-eval` as approved MV3 mechanism
- [Chrome Extensions — chrome.storage API](https://developer.chrome.com/docs/extensions/reference/api/storage) — `unlimitedStorage` behavior, 10MB default quota
- [Chrome Extensions — sidePanel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) — sidePanel behavior (incognito specifics inferred)
- [Chrome for Developers — Estimating Available Storage Space](https://developer.chrome.com/blog/estimating-available-storage-space) — `navigator.storage.estimate()` behavior and quota reporting
- [Chrome for Developers — Extensions and AI](https://developer.chrome.com/docs/extensions/ai) — AI model download guidance for extensions
- [Chrome for Developers — Inform Users of Model Download](https://developer.chrome.com/docs/ai/inform-users-of-model-download) — size disclosure requirement
- [StorageManager.estimate() — MDN](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate) — API availability (Chrome 52+), return value semantics
- [YouTube API Services — Branding Guidelines](https://developers.google.com/youtube/terms/branding-guidelines) — trademark restrictions on "YouTube" in app names and promotional copy

### Secondary (MEDIUM confidence)
- [CRXcavator documentation](https://crxcavator.io/docs) — automated permission scanning tool (third-party, consistent with Chrome reviewer priorities)
- [Extension Radar Blog — CWS developer fee 2026](https://www.extensionradar.com/blog/chrome-web-store-developer-fee-2026) — $5 fee confirmed (consistent with official sources)
- [Why Chrome Extensions Get Rejected — Extension Radar Blog](https://www.extensionradar.com/blog/chrome-extension-rejected) — practical rejection case catalog, trademark violation examples
- [Essential Steps After Chrome Extension Rejection — moldstud.com](https://moldstud.com/articles/p-essential-steps-to-take-after-your-chrome-extension-gets-rejected-a-detailed-guide-for-developers) — resubmission and appeal process details
- [WebextLLM — Published CWS extension using large model download](https://chromewebstore.google.com/detail/webextllm/chbepdchbogmcmhilpfgijbkfpplgnoh) — live precedent confirming `connect-src` model download pattern is approvable

---
*Research completed: 2026-02-19*
*Ready for roadmap: yes*
