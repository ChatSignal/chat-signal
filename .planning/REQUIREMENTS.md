# Requirements: Chat Signal Radar — Short-Term Improvements

**Defined:** 2026-02-19
**Core Value:** Real-time chat analysis must be accurate enough to be actionable — bigger analysis windows, safer DOM handling, and user-tunable thresholds make the tool reliable across different stream sizes.

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Sanitization

- [ ] **SAN-01**: Vendor DOMPurify 3.3.1 as `extension/libs/dompurify/purify.min.js` and load via script tag in sidebar.html before ES module
- [ ] **SAN-02**: Migrate all innerHTML assignments in sidebar to use DOMPurify.sanitize() via updated DOMHelpers
- [ ] **SAN-03**: Remove old regex-based safeSetHTML implementation after migration

### Analysis Window

- [ ] **WIN-01**: Add analysis window size setting (range 50-1000, default 500, step 50) to options page and wire to StateManager MAX_MESSAGES across all accumulation paths

### Thresholds

- [ ] **THR-01**: Expose inactivity timeout setting (range 30-600s, default 120s, step 30) in options page and wire to SessionManager and sidebar inactivity detection
- [ ] **THR-02**: Fix duplicateWindow — pass `settings.duplicateWindow` to WASM `analyze_chat_with_settings()` call sites instead of hardcoded value
- [ ] **THR-03**: Harden all numeric threshold validation with `Number.isFinite()` replacing `typeof` checks in ValidationHelpers.js and options.js

## v2 Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Export

- **EXP-01**: User can download session data as JSON file
- **EXP-02**: User can download session data as Markdown file

### Platform Expansion

- **PLAT-01**: Support Kick live chat extraction
- **PLAT-02**: Support Rumble live chat extraction

### Alerts

- **ALRT-01**: User receives notification when sentiment spikes positively or negatively

### Historical Trends

- **HIST-01**: User can view sentiment/engagement graphs over time during a stream

## Out of Scope

| Feature | Reason |
|---------|--------|
| DOMPurify in content script | Host page CSP conflicts — sanitization only needed in sidebar |
| Manifest.json CSP changes | DOMPurify 3.x works under existing `script-src 'self'` |
| Per-category sentiment sensitivity | High explanation cost, low payoff for target user |
| Custom sentiment keyword lists | Requires Rust changes, 5-10x complexity, wrong milestone |
| Per-channel settings | Storage namespace complexity, defer to future |
| Shared constants module for DEFAULT_SETTINGS | Acknowledged debt but out of scope for this round |
| Chrome Web Store publication | Not part of this improvement round |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SAN-01 | Phase 2 | Pending |
| SAN-02 | Phase 2 | Pending |
| SAN-03 | Phase 2 | Pending |
| WIN-01 | Phase 1 | Pending |
| THR-01 | Phase 3 | Pending |
| THR-02 | Phase 3 | Pending |
| THR-03 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 7 total
- Mapped to phases: 7
- Unmapped: 0

---
*Requirements defined: 2026-02-19*
*Last updated: 2026-02-19 after roadmap creation*
