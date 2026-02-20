# Requirements: Chat Signal Radar — CWS Readiness

**Defined:** 2026-02-19
**Core Value:** Real-time chat analysis must be accurate enough to be actionable — large analysis windows, robust DOM sanitization, and user-tunable thresholds make the tool reliable across different stream sizes.

## v1 Requirements

Requirements for CWS publication. Each maps to roadmap phases.

### Privacy & Compliance

- [x] **PRIV-01**: Privacy policy hosted at a public URL disclosing: chat DOM content reading, chrome.storage.local usage, optional HuggingFace model download, and no data transmitted to external servers (except HuggingFace CDN for model weights)
- [x] **PRIV-02**: CWS dashboard permission justifications written for each manifest permission (sidePanel, storage, unlimitedStorage, host_permissions for youtube.com and twitch.tv)
- [x] **PRIV-03**: CWS dashboard data certification checkboxes completed accurately (website content, browsing activity declarations)

### Manifest & Permissions

- [x] **MNFST-01**: Add `unlimitedStorage` permission to manifest.json for WebLLM IndexedDB model cache (~400MB)
- [x] **MNFST-02**: Increment manifest version from `0.1.0` to `1.1.0` for CWS submission
- [x] **MNFST-03**: Audit `connect-src` CSP — remove `raw.githubusercontent.com` if unused, justify remaining HuggingFace entries
- [x] **MNFST-04**: Update manifest description to single-purpose framing covering all features (clustering, sentiment, topics, session history)

### User Disclosure

- [x] **DISC-01**: Disk space warning shown before WebLLM model download using `navigator.storage.estimate()` — disable "Enable AI" button if insufficient space (~450MB needed)
- [x] **DISC-02**: Consent modal discloses persistent disk usage and download source (HuggingFace CDN)

### Store Listing

- [ ] **STORE-01**: Store description copy using approved trademark patterns ("works with YouTube" not "YouTube extension")
- [ ] **STORE-02**: Screenshots captured at 1280x800 showing sidebar in action on a live stream (minimum 1, up to 5)
- [ ] **STORE-03**: Promotional image created at 440x280

### Verification

- [ ] **VERIF-01**: Extension verified working in incognito mode (chrome.storage, sidePanel, WASM loading, content script injection)
- [ ] **VERIF-02**: Clean extension ZIP built and scanned with CRXcavator before submission

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
| Per-category sentiment sensitivity | High complexity, low payoff |
| Custom sentiment keyword lists | Requires Rust changes, 5-10x complexity |
| Per-channel settings | Storage namespace complexity |
| Shared constants module for DEFAULT_SETTINGS | Acknowledged debt, not urgent |
| Removing WebLLM from submission | Decision made to include it |
| OAuth or account features | Extension operates locally, no user accounts |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PRIV-01 | Phase 4 | Complete |
| PRIV-02 | Phase 4 | Complete |
| PRIV-03 | Phase 4 | Complete |
| MNFST-01 | Phase 5 | Complete |
| MNFST-02 | Phase 5 | Complete |
| MNFST-03 | Phase 5 | Complete |
| MNFST-04 | Phase 5 | Complete |
| DISC-01 | Phase 5 | Complete |
| DISC-02 | Phase 5 | Complete |
| STORE-01 | Phase 6 | Pending |
| STORE-02 | Phase 6 | Pending |
| STORE-03 | Phase 6 | Pending |
| VERIF-01 | Phase 7 | Pending |
| VERIF-02 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-19*
*Last updated: 2026-02-19 after roadmap creation*
