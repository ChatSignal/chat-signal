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
- The chat observer no longer silently drops messages during burst
  inserts. When one added subtree carried multiple messages, only the
  first was captured (`querySelector`); it now gathers every match, so
  fast-moving chats are counted completely.

### Changed
- The Settings AI toggle and the sidebar fallback notice now guide users
  to update Chrome to enable built-in AI, rather than only reporting that
  on-device AI is unavailable.
- Removed a stale "~400 MB language model download" description from the
  Settings AI toggle — the AI backend is Chrome's built-in Gemini Nano
  (on-device, no download).

### Security
- Bumped the shipped DOMPurify from 3.3.1 to 3.4.15 (non-major) to clear
  the sanitizer advisories affecting <=3.3.1 — notably general
  mutation-XSS (GHSA-h8r8-wccr-v5f2). DOMPurify sanitizes chat-derived
  HTML at runtime, so this is the extension's XSS boundary. Provenance and
  SHA-256 updated in `extension/libs/VENDORED.md`.

### Added
- Each captured chat message now carries a stable, DOM-anchored `id`
  (native element id where the platform provides one, else a synthesized
  id cached per element via a `WeakMap`). Foundation for future
  moderation/deletion handling — nothing consumes it yet, and there is no
  behavior change.
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
