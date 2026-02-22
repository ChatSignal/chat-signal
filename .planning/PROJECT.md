# Chat Signal

## What This Is

A Chrome extension that analyzes YouTube and Twitch live chat in real-time using Rust + WebAssembly with semantic AI. It clusters messages (questions, issues, requests, general) via cosine similarity to prototype vectors, tracks sentiment with 6 moods, detects trending topics, and provides AI-powered session summaries via an in-browser Qwen2.5 SLM. WASM keyword clustering serves as an always-available fallback. All processing happens locally — no chat data leaves the browser.

## Core Value

Real-time chat analysis must be accurate enough to be actionable — semantic clustering via MiniLM encoder vectors replaces keyword matching for dramatically better message classification, while progressive model loading ensures instant results with graceful upgrades.

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
- ✓ Transformers.js integration with all-MiniLM-L6-v2 sentence encoder — v1.2
- ✓ Semantic vector clustering (cosine similarity) replacing keyword-based WASM buckets — v1.2
- ✓ Switch WebLLM SLM from Phi-2 to Qwen2.5-0.5B-Instruct — v1.2
- ✓ GPU scheduler module — priority queue managing encoder vs SLM WebGPU contention — v1.2
- ✓ WASM keyword clustering as fallback when AI models are off or not loaded — v1.2
- ✓ Encoder-to-SLM pipeline — pass pre-clustered groups into Qwen prompts for summarization — v1.2

### Active

(None — next milestone not yet planned)

### Out of Scope

- Incognito mode verification — deferred from v1.1 (VERIF-01), candidate for future
- Clean extension ZIP + CRXcavator scan — deferred from v1.1 (VERIF-02), candidate for future
- Chrome Web Store submission — depends on VERIF-01/VERIF-02
- Export options (JSON/Markdown) — candidate for future milestone
- Platform expansion (Kick, Rumble) — candidate for future milestone
- Alerts on sentiment spikes — candidate for future milestone
- Historical trend graphs — candidate for future milestone
- Per-category sentiment sensitivity — high complexity, low payoff
- Custom sentiment keyword lists — requires Rust changes, 5-10x complexity
- Per-channel settings — storage namespace complexity
- Shared constants module for DEFAULT_SETTINGS — acknowledged debt, not urgent
- Dynamic cluster discovery (K-Means/DBSCAN) — fixed 4-bucket UI makes it unnecessary
- Multiple SLM model choices — single proven model is better for now
- Adaptive cosine threshold tuning — candidate for future milestone

## Context

- Shipped v1.0: 3 phases, 7 plans — analysis window, DOMPurify, configurable thresholds
- Shipped v1.1: 3 phases (4-6), 6 plans — privacy policy, manifest audit, consent modal, store assets
- Shipped v1.2: 5 phases (8-12), 9 plans — MiniLM encoder, GPU scheduler, cosine routing, Qwen SLM, integration
- Known gap: Phase 7 (verification + submission) deferred — VERIF-01, VERIF-02 pending
- v1.2 tech debt: LLM GPU calls bypass scheduler (low), LLM gets keyword not semantic buckets (low), resetEncoder/getMode/getStatus orphaned exports (trivial)
- Codebase: ~20,000 LOC (JS/HTML/CSS) + 913 LOC (Rust), 18 unit tests
- Tech stack: Rust/WASM + vanilla JS Chrome extension (MV3) + Transformers.js + WebLLM
- New modules in v1.2: encoder-adapter.js, gpu-scheduler.js, cosine-router.js, routing-config.js
- DOMPurify 3.3.1 vendored at `extension/libs/dompurify/purify.min.js`
- Transformers.js + ONNX WASM vendored at `extension/libs/transformers/`
- Privacy policy live at https://chatsignal.dev/privacy-policy
- Store assets in `docs/store/` — 3 screenshots + promo image, regenerable via scripts
- Three copies of DEFAULT_SETTINGS exist (sidebar.js, StateManager.js, options.js) — known debt

## Constraints

- **Tech stack**: Rust/WASM + vanilla JS Chrome extension (MV3) — no framework changes
- **Extension size**: DOMPurify (~60KB) acceptable; MiniLM (~25MB) auto-loads; Qwen (~400MB+) consent-gated; Playwright/sharp are devDependencies only
- **Testing**: Rust unit tests must pass; existing test coverage maintained
- **WebGPU contention**: Encoder and SLM cannot run simultaneously — GPU scheduler required
- **Sidebar context**: WebGPU unavailable in MV3 service workers; all model inference runs in sidebar page context

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
| Encode in sidebar page context | WebGPU unavailable in MV3 service workers | ✓ Good — full GPU access, persistent lifetime |
| Prototype cosine routing over K-Means/DBSCAN | Deterministic, O(n×4), maps to fixed 4-bucket UI | ✓ Good — fast, predictable, no cluster count tuning |
| MiniLM auto-loads without consent (~25MB) | Small enough to not warrant consent; Qwen remains gated | ✓ Good — semantic clustering available by default |
| Cosine threshold 0.30 (not 0.35) | Stream chat is noisier than support tickets; lower threshold reduces false General Chat | ✓ Good — appropriate for domain |
| Keyword-scan parser for Qwen output | Qwen2.5 produces preamble before structured content; line-position parsing breaks | ✓ Good — tolerates model chattiness |
| Garbage detection with sentinel values | mood=neutral + confidence=0.5 + summary='' is unambiguous garbage signal | ✓ Good — 2 consecutive triggers → fallback |
| WASM renders during encoder download | encoderLoading flag skips scheduleEncode, not WASM analysis — no blank display | ✓ Good — instant results on cold start |
| Separate consent disclosure for encoder vs SLM | Users understand what auto-loads (~23MB) vs what they opt into (~400MB) | ✓ Good — transparent, accurate |

---
*Last updated: 2026-02-21 after v1.2 milestone*
