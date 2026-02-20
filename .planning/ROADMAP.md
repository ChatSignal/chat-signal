# Roadmap: Chat Signal Radar

## Milestones

- ✅ **v1.0 Short-Term Improvements** — Phases 1-3 (shipped 2026-02-19)
- 🚧 **v1.1 CWS Readiness** — Phases 4-7 (in progress)

## Phases

<details>
<summary>✅ v1.0 Short-Term Improvements (Phases 1-3) — SHIPPED 2026-02-19</summary>

- [x] Phase 1: Analysis Window (2/2 plans) — completed 2026-02-19
- [x] Phase 2: DOMPurify Integration (2/2 plans) — completed 2026-02-19
- [x] Phase 3: Configurable Thresholds (3/3 plans) — completed 2026-02-19

</details>

### 🚧 v1.1 CWS Readiness (In Progress)

**Milestone Goal:** Prepare the extension for Chrome Web Store submission — permissions compliance, privacy policy, LLM storage warnings, and store listing assets.

- [ ] **Phase 4: Privacy and Dashboard Compliance** - Write and host privacy policy; complete all CWS dashboard fields
- [ ] **Phase 5: Manifest Audit and Disclosure UI** - Audit manifest permissions and CSP; add disk space warning to WebLLM consent modal
- [ ] **Phase 6: Store Listing Assets** - Create screenshots, promotional image, and trademark-compliant store copy
- [ ] **Phase 7: Verification and Submission** - Verify incognito behavior; build clean ZIP; submit to CWS

## Phase Details

### Phase 4: Privacy and Dashboard Compliance
**Goal**: A hosted privacy policy exists at a public HTTPS URL and all CWS developer dashboard fields are complete — unblocking any submission attempt
**Depends on**: Nothing (first phase of v1.1)
**Requirements**: PRIV-01, PRIV-02, PRIV-03
**Success Criteria** (what must be TRUE):
  1. Privacy policy is reachable at a public HTTPS URL (GitHub Pages) and accurately discloses chat DOM reading, chrome.storage.local usage, optional HuggingFace model download, and no external server transmission
  2. CWS dashboard Privacy Practices tab has per-permission justifications written for sidePanel, storage, unlimitedStorage, and host_permissions (YouTube, Twitch)
  3. CWS dashboard data usage certification checkboxes for "Website content" and "Browsing activity" are checked and submitted
**Plans:** 1/2 plans executed
Plans:
- [ ] 04-01-PLAN.md — Write privacy policy, CNAME, and CWS justifications doc
- [ ] 04-02-PLAN.md — Configure GitHub Pages hosting and verify live URL

### Phase 5: Manifest Audit and Disclosure UI
**Goal**: The manifest is clean and correctly versioned for submission, and users see a disk space warning before any WebLLM model download begins
**Depends on**: Phase 4
**Requirements**: MNFST-01, MNFST-02, MNFST-03, MNFST-04, DISC-01, DISC-02
**Success Criteria** (what must be TRUE):
  1. Manifest version reads `1.1.0` and description uses single-purpose framing covering clustering, sentiment, topics, and session history
  2. `connect-src` in manifest CSP contains no entries for `raw.githubusercontent.com` unless actively used by extension code (grep-verified)
  3. `unlimitedStorage` permission is present in manifest.json for WebLLM IndexedDB model cache
  4. Consent modal shows disk usage disclosure (approximate size and HuggingFace CDN source) before the user clicks "Enable AI"
  5. "Enable AI" button is disabled with an explanatory message when `navigator.storage.estimate()` reports insufficient available quota
**Plans**: TBD

### Phase 6: Store Listing Assets
**Goal**: All required store listing assets exist and store copy complies with CWS trademark and single-purpose requirements
**Depends on**: Phase 5
**Requirements**: STORE-01, STORE-02, STORE-03
**Success Criteria** (what must be TRUE):
  1. Store description copy uses approved trademark patterns (e.g., "works with YouTube" not "YouTube extension") and accurately describes all features within the character limit
  2. At least one screenshot exists at exactly 1280x800 px showing the sidebar with populated data (cluster buckets, mood indicator, and trending topics visible — not a loading or empty state)
  3. A promotional image exists at 440x280 px suitable for upload to the CWS dashboard
**Plans**: TBD

### Phase 7: Verification and Submission
**Goal**: The extension is manually verified in incognito mode, a clean submission ZIP is built and scanned, and the extension is submitted to the Chrome Web Store
**Depends on**: Phase 6
**Requirements**: VERIF-01, VERIF-02
**Success Criteria** (what must be TRUE):
  1. Manual test in incognito mode confirms: side panel opens, chat messages flow to sidebar, session history is accessible, WASM loads without CSP errors, and AI gracefully falls back to rule-based (IndexedDB is per-session in incognito — expected behavior)
  2. A clean extension ZIP is built containing no dev artifacts, `.map` files, or test HTML; CRXcavator scan is run and permission risk score reviewed before upload
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Analysis Window | v1.0 | 2/2 | Complete | 2026-02-19 |
| 2. DOMPurify Integration | v1.0 | 2/2 | Complete | 2026-02-19 |
| 3. Configurable Thresholds | v1.0 | 3/3 | Complete | 2026-02-19 |
| 4. Privacy and Dashboard Compliance | 1/2 | In Progress|  | - |
| 5. Manifest Audit and Disclosure UI | v1.1 | 0/? | Not started | - |
| 6. Store Listing Assets | v1.1 | 0/? | Not started | - |
| 7. Verification and Submission | v1.1 | 0/? | Not started | - |
