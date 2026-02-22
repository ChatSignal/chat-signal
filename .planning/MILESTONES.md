# Milestones

## v1.0 Short-Term Improvements (Shipped: 2026-02-19)

**Phases completed:** 3 phases, 7 plans, 0 tasks

**Key accomplishments:**
- Increased analysis window from 100→500 messages with user-configurable slider (50-1000)
- Vendored DOMPurify 3.3.1 replacing custom regex sanitizer — XSS risk class eliminated
- Migrated all sidebar innerHTML to DOMPurify — zero raw innerHTML assignments remaining
- Added inactivity timeout setting (30-600s) replacing hardcoded 2-minute constant
- Hardened all numeric validation with Number.isFinite() across entire extension
- Added input-time validation with save-blocking to prevent invalid settings

**Stats:** 33 files changed, 3,795 insertions, 234 deletions

---


## v1.1 CWS Readiness (Shipped: 2026-02-20)

**Phases completed:** 3 phases (4-6), 6 plans, 13 tasks

**Key accomplishments:**
- Privacy policy hosted at chatsignal.dev/privacy-policy via GitHub Pages with custom domain and HTTPS
- CWS dashboard permission justifications written for sidePanel, storage, unlimitedStorage, and host_permissions
- Manifest audited to v1.1.0 — unlimitedStorage added, CSP verified and documented with rationale
- Consent modal enhanced with HuggingFace CDN disclosure and navigator.storage.estimate() gating
- Store listing copy authored with approved trademark patterns ("works with YouTube", "for Twitch")
- Three 1280x800 screenshots and 440x280 promo image generated via automated Playwright/sharp scripts

**Stats:** 40 files changed, 3,949 insertions, 160 deletions

### Known Gaps
- **VERIF-01**: Extension not yet verified in incognito mode (Phase 7 deferred)
- **VERIF-02**: Clean extension ZIP not yet built or scanned with CRXcavator (Phase 7 deferred)

---


## v1.2 Semantic AI Pipeline (Shipped: 2026-02-22)

**Phases completed:** 5 phases, 9 plans, 0 tasks

**Key accomplishments:**
- Vendored Transformers.js with all-MiniLM-L6-v2 encoder — WebGPU/WASM backends, hash cache, adaptive batch queue
- GPU scheduler with promise-chain mutex serializing encoder and SLM WebGPU access
- Cosine similarity routing replaces keyword clustering — prototype vectors classify messages into 4 buckets
- Switched SLM to Qwen2.5-0.5B-Instruct with keyword-scan parser and garbage-triggered fallback
- Progressive loading: WASM clusters render instantly, semantic upgrade when encoder ready
- Consent modal updated to separately disclose encoder (~23MB) and language model (~400MB)

**Stats:** 12 files changed, 1,404 insertions, 44 deletions (extension code)

### Tech Debt (accepted)
- GPU-01/GPU-02: LLM GPU calls bypass gpu-scheduler (no runtime failure — WebLLM manages own context)
- SLM-04: LLM receives keyword buckets, not semantic buckets (functional, suboptimal)
- `resetEncoder` imported but never called on session reset
- `getMode`, `getStatus` exported but never consumed

---

