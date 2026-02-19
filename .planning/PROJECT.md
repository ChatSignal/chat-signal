# Chat Signal Radar

## What This Is

A Chrome extension that analyzes YouTube and Twitch live chat in real-time using Rust + WebAssembly. It clusters messages (questions, issues, requests, general), tracks sentiment with 6 moods, detects trending topics, and provides session summaries. Users can configure analysis window size, inactivity timeout, and other thresholds through the options page. All DOM output is sanitized via DOMPurify.

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

### Active

- [ ] Permission justification and manifest review for CWS compliance
- [ ] Disk space warnings before WebLLM model download (~400MB)
- [ ] Privacy policy hosted on a public URL
- [ ] Store listing screenshots (1280x800 or 640x400)
- [ ] Incognito mode verification (chrome.storage, sidePanel, WASM)

### Out of Scope

- Export options (JSON/Markdown) — candidate for next milestone
- Platform expansion (Kick, Rumble) — candidate for next milestone
- Alerts on sentiment spikes — candidate for next milestone
- Historical trend graphs — candidate for next milestone
- Chrome Web Store publication — NOW IN SCOPE for v1.1
- Per-category sentiment sensitivity — high complexity, low payoff
- Custom sentiment keyword lists — requires Rust changes, 5-10x complexity
- Per-channel settings — storage namespace complexity
- Shared constants module for DEFAULT_SETTINGS — acknowledged debt, not urgent

## Context

- Shipped v1.0 milestone: 3 phases, 7 plans, 33 files changed
- Codebase: ~18,500 LOC (JS/HTML/CSS) + 913 LOC (Rust), 18 unit tests
- Tech stack: Rust/WASM + vanilla JS Chrome extension (MV3)
- DOMPurify 3.3.1 vendored at `extension/libs/dompurify/purify.min.js`
- Analysis window configurable 50-1000 (default 500), up from hardcoded 100
- All numeric validation uses Number.isFinite() — no typeof-number checks remaining
- Three copies of DEFAULT_SETTINGS exist (sidebar.js, StateManager.js, options.js) — known debt
- Options page has input-time validation that blocks save on invalid values

## Constraints

- **Tech stack**: Rust/WASM + vanilla JS Chrome extension (MV3) — no framework changes
- **Extension size**: DOMPurify (~60KB) acceptable; no other new dependencies
- **Scope**: Preparing for Chrome Web Store submission
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

## Current Milestone: v1.1 CWS Readiness

**Goal:** Prepare the extension for Chrome Web Store submission — permissions compliance, privacy policy, LLM storage warnings, and store listing assets.

**Target features:**
- CWS-compliant manifest with permission justifications
- Disk space warnings for WebLLM model download
- Hosted privacy policy
- Store listing screenshots
- Incognito mode verification

---
*Last updated: 2026-02-19 after v1.1 milestone start*
