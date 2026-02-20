# Chat Signal Radar

## What This Is

A Chrome extension that analyzes YouTube and Twitch live chat in real-time using Rust + WebAssembly. It clusters messages (questions, issues, requests, general), tracks sentiment with 6 moods, detects trending topics, and provides session summaries. Users can configure analysis window size, inactivity timeout, and other thresholds through the options page. All DOM output is sanitized via DOMPurify. The extension is CWS-ready with a hosted privacy policy, permission justifications, disk space disclosure for WebLLM, and automated store listing asset generation.

## Core Value

Real-time chat analysis must be accurate enough to be actionable — large analysis windows, robust DOM sanitization, and user-tunable thresholds make the tool reliable across different stream sizes.

## Requirements

### Validated

- ✓ Message clustering (Questions, Issues, Requests, General Chat) — existing
- ✓ Sentiment analysis with 6 moods (excited, positive, angry, negative, confused, neutral) — existing
- ✓ Trending topics with emote detection — existing
- ✓ Spam/duplicate filtering — existing
- ✓ User-configurable settings via options page — existing
- ✓ Session summary with End Session button — existing
- ✓ Session history persistence — existing
- ✓ System theme support (dark/light) — existing
- ✓ WebLLM consent UX with fallback — existing
- ✓ Smart session detection (inactivity prompt) — existing
- ✓ Configurable analysis window (50-1000 messages, default 500) — v1.0
- ✓ DOMPurify-based XSS protection replacing custom regex sanitizer — v1.0
- ✓ Configurable inactivity timeout (30-600s, default 120s) — v1.0
- ✓ duplicateWindow wired to WASM engine from user settings — v1.0
- ✓ Number.isFinite() validation on all numeric thresholds — v1.0
- ✓ Input-time validation with save-blocking on options page — v1.0
- ✓ Privacy policy hosted at chatsignal.dev/privacy-policy via GitHub Pages — v1.1
- ✓ CWS dashboard permission justifications for all manifest permissions — v1.1
- ✓ Manifest v1.1.0 with unlimitedStorage, audited CSP, single-purpose description — v1.1
- ✓ Consent modal with HuggingFace disclosure and storage availability gating — v1.1
- ✓ Store listing copy with approved trademark patterns — v1.1
- ✓ Three 1280x800 screenshots + 440x280 promo image via automated scripts — v1.1

### Active

- [ ] Incognito mode verification (chrome.storage, sidePanel, WASM)
- [ ] Clean extension ZIP built and scanned with CRXcavator
- [ ] Chrome Web Store submission

### Out of Scope

- Export options (JSON/Markdown) — candidate for next milestone
- Platform expansion (Kick, Rumble) — candidate for next milestone
- Alerts on sentiment spikes — candidate for next milestone
- Historical trend graphs — candidate for next milestone
- Per-category sentiment sensitivity — high complexity, low payoff
- Custom sentiment keyword lists — requires Rust changes, 5-10x complexity
- Per-channel settings — storage namespace complexity
- Shared constants module for DEFAULT_SETTINGS — acknowledged debt, not urgent

## Context

- Shipped v1.0: 3 phases, 7 plans — analysis window, DOMPurify, configurable thresholds
- Shipped v1.1: 3 phases (4-6), 6 plans — privacy policy, manifest audit, consent modal, store assets
- Known gap: Phase 7 (verification + submission) deferred — VERIF-01, VERIF-02 pending
- Codebase: ~18,500 LOC (JS/HTML/CSS) + 913 LOC (Rust), 18 unit tests
- Tech stack: Rust/WASM + vanilla JS Chrome extension (MV3)
- Dev dependencies added in v1.1: Playwright (screenshots), sharp (image generation)
- DOMPurify 3.3.1 vendored at `extension/libs/dompurify/purify.min.js`
- Privacy policy live at https://chatsignal.dev/privacy-policy
- Store assets in `docs/store/` — 3 screenshots + promo image, regenerable via scripts
- Three copies of DEFAULT_SETTINGS exist (sidebar.js, StateManager.js, options.js) — known debt
- sidePanel incognito behavior is medium confidence — manual test is the verification source of truth

## Constraints

- **Tech stack**: Rust/WASM + vanilla JS Chrome extension (MV3) — no framework changes
- **Extension size**: DOMPurify (~60KB) acceptable; Playwright/sharp are devDependencies only
- **Testing**: Rust unit tests must pass; existing test coverage maintained

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use DOMPurify over custom sanitization | Proven library eliminates XSS class of bugs entirely | ✓ Good — zero raw innerHTML remaining |
| Expose all 4 threshold settings | Users have different chat velocities; full control preferred | ✓ Good — analysis window + inactivity timeout shipped |
| Increase MAX_MESSAGES to 500+ | Both topics and sentiment suffer from small 100-message window | ✓ Good — configurable 50-1000, default 500 |
| Number.isFinite() over typeof checks | typeof NaN === 'number' silently accepted NaN | ✓ Good — all validation paths hardened |
| 2x buffer cap on allMessages | Retains history for smooth window expansion without unbounded memory | ✓ Good — predictable memory usage |
| DOMPurify as synchronous script tag | Must be available before ES module executes | ✓ Good — fail-fast if missing |
| Input-time validation with save-blocking | Prevents invalid settings from persisting to storage | ✓ Good — immediate user feedback |
| GitHub Pages for privacy policy | Free, permanent HTTPS, no third-party branding | ✓ Good — live at chatsignal.dev |
| navigator.storage.estimate() for disk check | No new manifest permission vs chrome.system.storage | ✓ Good — gating works without extra permissions |
| Include WebLLM in CWS submission | Users opted in via consent modal; unlimitedStorage justifiable | ✓ Good — disclosed and gated |
| Product name "Chat Signal" | Avoids platform trademarks in name | ✓ Good — CWS compliant |
| Base64 icon embed in promo SVG | libvips/sharp has no emoji font on Linux | ✓ Good — cross-platform reproducible |
| Playwright screenshots with chrome API stubs | Renders real sidebar.html without live extension context | ✓ Good — automated, reproducible |

---
*Last updated: 2026-02-20 after v1.1 milestone*
