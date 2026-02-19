# Roadmap: Chat Signal Radar — Short-Term Improvements

## Overview

Three targeted improvements to an already-shipped Chrome extension: increase the WASM analysis window for better topic and sentiment accuracy on medium and large streams, replace the custom HTML sanitizer with DOMPurify for robust XSS protection, and wire all remaining hardcoded thresholds through the existing settings pipeline so users can tune behavior to their stream size. Each phase delivers one complete, independently testable capability. No Rust logic changes required.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Analysis Window** - Raise MAX_MESSAGES from 100 to 500 across all accumulation paths and expose analysisWindowSize as a user setting
- [ ] **Phase 2: DOMPurify Integration** - Replace custom safeSetHTML with DOMPurify for robust XSS protection in the sidebar
- [ ] **Phase 3: Configurable Thresholds** - Wire inactivityTimeout and duplicateWindow to settings and harden numeric validation

## Phase Details

### Phase 1: Analysis Window
**Goal**: Users experience more accurate topic and sentiment analysis because the engine sees 5x more messages per analysis pass, and can configure the window size through the options page
**Depends on**: Nothing (first phase)
**Requirements**: WIN-01
**Success Criteria** (what must be TRUE):
  1. Opening a high-traffic stream shows more populated topic tags than before — fewer "no topics yet" states
  2. The options page has an Analysis Window field (range 50-1000, default 500) that persists across browser restarts
  3. Changing the analysis window size in options takes effect in the sidebar without requiring extension reload
  4. All three DEFAULT_SETTINGS copies (sidebar.js, StateManager.js, options.js) agree on the default value of 500
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md — Add analysisWindowSize to all three DEFAULT_SETTINGS copies, wire full options pipeline (slider, time estimate, low-value warning), add ValidationHelpers validation
- [x] 01-02-PLAN.md — Replace MAX_MESSAGES constant with dynamic windowing in sidebar.js, add "X/N in window" stats indicator to sidebar.html and sidebar.css

### Phase 2: DOMPurify Integration
**Goal**: All innerHTML assignments in the sidebar pass through DOMPurify, eliminating the XSS risk class from WASM-originated strings, with the old regex-based sanitizer removed
**Depends on**: Phase 1
**Requirements**: SAN-01, SAN-02, SAN-03
**Success Criteria** (what must be TRUE):
  1. The sidebar renders topic terms, cluster cards, and session history cards correctly with no visible change to the UI
  2. Searching the sidebar JS for direct innerHTML assignments returns zero results after migration
  3. extension/libs/dompurify/purify.min.js exists and loads before the ES module in sidebar.html
  4. The old safeSetHTML regex implementation is removed from DOMHelpers.js
**Plans**: 2 plans

Plans:
- [ ] 02-01-PLAN.md — Vendor DOMPurify 3.3.1, add script tag to sidebar.html, replace safeSetHTML internals in DOMHelpers.js with DOMPurify-backed implementation
- [ ] 02-02-PLAN.md — Migrate all sidebar.js innerHTML assignments to DOMPurify, remove private safeSetHTML/escapeHtml/safeCreateElement copies, import from DOMHelpers.js

### Phase 3: Configurable Thresholds
**Goal**: Users can tune inactivity timeout to avoid false "stream ended?" prompts, duplicateWindow is correctly passed to the WASM engine, and all numeric threshold validation rejects NaN inputs
**Depends on**: Phase 2
**Requirements**: THR-01, THR-02, THR-03
**Success Criteria** (what must be TRUE):
  1. The options page has an Inactivity Timeout field (range 30-600s, default 120s) that prevents false session-end prompts during ad breaks
  2. Clearing any numeric threshold field in options shows a validation error rather than silently writing NaN or 0 to storage
  3. The WASM analyze_chat call receives the user's duplicateWindow setting instead of a hardcoded value
  4. Both sidebar.js and SessionManager read inactivityTimeout from settings rather than a hardcoded constant
**Plans**: 2 plans

Plans:
- [ ] 03-01-PLAN.md — Add inactivityTimeout setting to options UI and all DEFAULT_SETTINGS, replace hardcoded INACTIVITY_TIMEOUT constants with live settings reads, verify duplicateWindow wiring
- [ ] 03-02-PLAN.md — Harden all numeric validation with Number.isFinite(), add missing sentimentSensitivity/moodUpgradeThreshold validation, add input-time validation with save-blocking to options page

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Analysis Window | 2/2 | Complete | 2026-02-19 |
| 2. DOMPurify Integration | 0/2 | Not started | - |
| 3. Configurable Thresholds | 0/2 | Not started | - |
