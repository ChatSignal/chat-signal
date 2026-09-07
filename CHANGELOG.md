# Changelog

All notable changes to Chat Signal are documented here. This project
follows semantic versioning.

## [2.1.1] — 2026-09-07

Follow-up fixes after the 2.1.0 on-device migration.

### Fixed
- Chat messages containing `&`, `<`, `>`, or quotes no longer display
  escaped HTML entities (e.g. `<3` rendering as `&lt;3`) in cluster
  buckets, the AI summary list, or trending topics. Text bound via
  `textContent` is no longer pre-escaped (double-encoding).

### Changed
- The Settings AI toggle and the sidebar fallback notice now guide users
  to update Chrome to enable built-in AI, rather than only reporting that
  on-device AI is unavailable.
- Removed a stale "~400 MB language model download" description from the
  Settings AI toggle — the AI backend is Chrome's built-in Gemini Nano
  (on-device, no download).

### Added
- `minimum_chrome_version` (114) in the manifest — the extension's true
  floor (Side Panel API), so older browsers get a clear message instead
  of a broken install. AI summaries remain a runtime, gracefully
  degrading feature, not an install gate.

## [2.1.0] — 2026-09-07

On-device AI migration and a reduced permission/network footprint,
prepared for Chrome Web Store re-submission.

### Changed
- **AI backend → Chrome built-in AI (Gemini Nano).** Summaries and mood
  analysis now run on-device via the Prompt API using a
  pristine-session-per-call pattern. WebLLM/Qwen removed entirely — no
  ~400 MB model download.
- **MiniLM encoder bundled.** The semantic-clustering model ships inside
  the extension package and loads from the extension's own origin; no
  runtime download from HuggingFace.
- **CSP tightened** to `connect-src 'self'` — the extension makes no
  external network connections.

### Removed
- `unlimitedStorage` permission (permissions are now just `sidePanel`
  and `storage`).
- WebLLM bundle, the SLM path in the GPU scheduler, the model-download
  consent modal, and the HuggingFace CSP allowances.

### Security
- Prompt-injection hardening retained end to end: chat-sample
  sanitization, untrusted-data fences, a last-match parser with
  out-of-vocabulary coercion, mood/signal polarity reconciliation, and
  strict summary validation.
- Trust boundaries: sender validation with per-window chat routing;
  settings validated on the `storage.onChanged` path.
- Supply chain: MiniLM pinned to a HuggingFace commit; DOMPurify pinned
  with provenance recorded in `extension/libs/VENDORED.md`;
  `package-lock.json` committed and `npm ci` used in packaging.

## Earlier releases

Earlier milestones — the v2.0 semantic AI pipeline, the v1.x
CWS-readiness and configurability work, and the initial MVP — predate
this changelog. See `.planning/ROADMAP.md` for the full history.
