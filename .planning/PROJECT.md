# Chat Signal Radar — Short-Term Improvements

## What This Is

A Chrome extension that analyzes YouTube and Twitch live chat in real-time using Rust + WebAssembly. It clusters messages (questions, issues, requests, general), tracks sentiment with 6 moods, detects trending topics, and provides session summaries. This milestone focuses on three targeted improvements to analysis quality and user control.

## Core Value

Real-time chat analysis must be accurate enough to be actionable — bigger analysis windows, safer DOM handling, and user-tunable thresholds make the tool reliable across different stream sizes.

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

### Active

- [ ] Increase analysis window (MAX_MESSAGES to 500+) for better topic/sentiment accuracy
- [ ] Replace custom safeSetHTML with DOMPurify for robust XSS protection
- [ ] Expose configurable thresholds in options page: sentiment sensitivity, inactivity timeout, topic min count, analysis window size

### Out of Scope

- Export options (JSON/Markdown) — future milestone
- Platform expansion (Kick, Rumble) — future milestone
- Alerts on sentiment spikes — future milestone
- Historical trend graphs — future milestone
- Chrome Web Store publication — not part of this round

## Context

- Brownfield project with working MVP already shipped
- Existing options page at `extension/options/` handles settings via `chrome.storage.sync`
- WASM engine at `wasm-engine/src/lib.rs` has 18 unit tests covering core analysis
- StateManager currently keeps rolling window of last 100 messages (`MAX_MESSAGES`)
- Current sanitization uses custom `safeSetHTML` in `DOMHelpers.js` — works but not battle-tested
- Sentiment requires 3+ signals before declaring non-neutral mood; users want to tune this
- Inactivity timeout hardcoded at 2 minutes in SessionManager

## Constraints

- **Tech stack**: Rust/WASM + vanilla JS Chrome extension (MV3) — no framework changes
- **Extension size**: DOMPurify (~60KB) acceptable; no other new dependencies
- **Scope**: Working locally only — no Chrome Web Store submission this round
- **Testing**: Rust unit tests must pass; existing test coverage maintained

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use DOMPurify over custom sanitization | Proven library eliminates XSS class of bugs entirely | — Pending |
| Expose all 4 threshold settings | Users have different chat velocities; full control preferred | — Pending |
| Increase MAX_MESSAGES to 500+ | Both topics and sentiment suffer from small 100-message window | — Pending |

---
*Last updated: 2026-02-19 after initialization*
