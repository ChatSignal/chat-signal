# Architecture

**Analysis Date:** 2026-02-19

## Pattern Overview

**Overall:** Modular event-driven Chrome Extension with WebAssembly backend

**Key Characteristics:**
- Content script observes DOM for chat messages, batches them every 5 seconds
- Background service worker relays messages from content to sidebar UI
- Sidebar processes messages through WASM analysis engine
- Modular UI components with centralized state management
- Optional LLM layer for AI-powered sentiment analysis with fallback mode

## Layers

**Content Layer (DOM Observation):**
- Purpose: Monitor live chat on YouTube/Twitch platforms, extract messages in real-time
- Location: `extension/content-script.js`
- Contains: Platform detection (YouTube/Twitch), DOM selectors, message extraction, batching logic
- Depends on: Chrome runtime messaging API
- Used by: Sidebar (receives messages via background service worker)

**Message Relay Layer (Background Service Worker):**
- Purpose: Bridge between content script and sidebar, manage extension lifecycle
- Location: `extension/background.js`
- Contains: Runtime message listener, side panel opener
- Depends on: Chrome runtime, sidePanel API
- Used by: Content script, sidebar

**Analysis Engine (WASM):**
- Purpose: Perform message clustering, topic extraction, sentiment analysis
- Location: `wasm-engine/src/lib.rs` (Rust), compiled to `extension/wasm/wasm_engine.js` (WebAssembly)
- Contains: Clustering logic (Questions/Issues/Requests/General), topic filtering with stop words, sentiment signal analysis
- Depends on: serde for JSON serialization, wasm_bindgen for JS interop
- Used by: Sidebar for analyzing batches of messages

**UI Sidebar Layer (Display & Interaction):**
- Purpose: Display live chat analysis, manage session state, handle user interactions
- Location: `extension/sidebar/`
- Contains:
  - `sidebar.js`: Main entry point, WASM loader, message receiver, analysis orchestration
  - `modules/StateManager.js`: Centralized application state (session, messages, sentiment, mood)
  - `modules/SessionManager.js`: Session lifecycle (start, end, save, history)
  - `utils/`: Helper modules (DOM, validation, formatting)
  - `sidebar.html`: UI structure
  - `sidebar.css`: Styling with system theme support
- Depends on: WASM engine, LLM adapter, storage manager
- Used by: User interactions (buttons, tabs, settings)

**LLM Adapter Layer (Optional AI Analysis):**
- Purpose: Integrate in-browser LLM for AI-powered summaries and mood analysis
- Location: `extension/llm-adapter.js`
- Contains: WebLLM initialization, fallback summarizer, prompt formatting
- Depends on: `libs/web-llm/` (optional bundle), Chrome storage
- Used by: Sidebar for generating AI summaries when enabled

**Storage Layer (Session Persistence):**
- Purpose: Save and retrieve session history using Chrome storage
- Location: `extension/storage-manager.js`
- Contains: Session serialization, history retrieval, cleanup
- Depends on: Chrome storage.local API
- Used by: SessionManager for persisting completed sessions

**Settings Layer (User Preferences):**
- Purpose: Manage user-configurable analysis parameters
- Location: `extension/options/options.js`, accessed by sidebar via chrome.storage.sync
- Contains: Settings form, default values, persistence
- Depends on: Chrome storage.sync API
- Used by: Sidebar analysis pipeline (adjustable thresholds)

## Data Flow

**Live Analysis Flow:**

```
1. User opens YouTube/Twitch stream in content script
   ↓
2. DOM observer detects new chat messages every N milliseconds
   ↓
3. Every 5 seconds, batch of messages sent to background service worker
   ↓
4. Background relays to sidebar via chrome.runtime.sendMessage()
   ↓
5. Sidebar receives messages in chrome.runtime.onMessage listener
   ↓
6. StateManager accumulates messages (keeps last 100 for analysis)
   ↓
7. WASM engine processes messages:
   - cluster_messages(): Categorize into Questions/Issues/Requests/General
   - extract_topics(): Identify trending words (min 5 mentions, filters stop words)
   - analyze_sentiment_signals(): Count sentiment indicators, compute mood score
   ↓
8. UI renders:
   - Mood emoji + label (neutral/positive/angry/excited/negative/confused)
   - Topics cloud (top 20 trending words/emotes)
   - Cluster buckets with sample messages
   ↓
9. Optional: If AI enabled, LLM Adapter generates summary from clusters
   ↓
10. SessionManager accumulates session data (questions, sentiment counts, final mood)
```

**Session Save Flow:**

```
User clicks "End Session" or stream goes inactive (2+ minutes)
   ↓
SessionManager.endSession() extracts session data
   ↓
saveSession() serializes to chrome.storage.local
   ↓
Session appears in "History" tab with metadata (duration, platform, mood, message count)
```

**Settings Update Flow:**

```
User adjusts settings in chrome://extensions → Options
   ↓
chrome.storage.sync saves updated values
   ↓
Sidebar loads settings on startup (getSettings())
   ↓
StateManager.settings updated
   ↓
Next analysis run uses new thresholds (topicMinCount, spamThreshold, etc.)
```

**State Management:**

- **Centralized:** StateManager.state object holds all sidebar state (session, messages, sentiment, mood, UI state)
- **Accumulation:** Messages accumulate in allMessages array (rolling window: last 100 messages kept for WASM processing, but totalMessageCount increments forever)
- **Session-wide Tracking:** sessionQuestions, sessionSentiment accumulate across entire session (not reset between analysis runs)
- **Mood Determination:**
  - WASM computes sentiment_signals (positive_count, negative_count, confused_count, neutral_count)
  - LLM Adapter upgrades based on score thresholds (excited if score > 30, angry if score < -30)
  - Falls back to signal-based mood if LLM unavailable

## Key Abstractions

**Message (Rust struct):**
- Purpose: Represent a single chat message from any platform
- Examples: `wasm-engine/src/lib.rs` lines 74-79
- Pattern: Serializable to/from JSON with serde

**ClusterBucket (Rust struct):**
- Purpose: Group messages by category (Questions, Issues, Requests, General)
- Examples: `wasm-engine/src/lib.rs` lines 82-86
- Pattern: Contains label, count, and up to 3 sample messages

**AnalysisResult (Rust struct):**
- Purpose: Complete analysis output (clusters, topics, sentiment signals)
- Examples: `wasm-engine/src/lib.rs` lines 130-135
- Pattern: Returned by analyze_chat() WASM function, validated before rendering

**SessionData (JavaScript object):**
- Purpose: Snapshot of session for storage
- Examples: `extension/storage-manager.js` lines 9-23
- Pattern: Serializable to JSON, includes metadata (startTime, endTime, platform, messageCount, mood, sentiment, questions)

**StateManager (JavaScript class):**
- Purpose: Single source of truth for sidebar application state
- Examples: `extension/sidebar/modules/StateManager.js` lines 6-50+
- Pattern: Encapsulates state object with typed getters/setters, prevents direct mutation

## Entry Points

**Content Script Entry:**
- Location: `extension/content-script.js`
- Triggers: Page load on youtube.com or twitch.tv (manifest.json content_scripts matches)
- Responsibilities: Detect platform, find chat DOM container, set up DOM observer, batch messages every 5s, send to background worker

**Background Service Worker Entry:**
- Location: `extension/background.js`
- Triggers: Extension installation, action icon click
- Responsibilities: Open side panel when extension icon clicked, relay messages from content to sidebar

**Sidebar Entry:**
- Location: `extension/sidebar/sidebar.js`
- Triggers: Side panel opened (via background.js or user clicking extension icon)
- Responsibilities: Load WASM engine, listen for chat messages, manage session lifecycle, orchestrate analysis, render UI

**Options Page Entry:**
- Location: `extension/options/options.html` + `extension/options/options.js`
- Triggers: User opens chrome://extensions → Chat Signal Radar → Options
- Responsibilities: Display settings form, persist user preferences to chrome.storage.sync

## Error Handling

**Strategy:** Layered fallbacks with console logging

**Patterns:**
- **WASM Errors:** Try/catch in sidebar.js wraps WASM calls, displays error div if analysis fails
- **LLM Errors:** initializeLLM() catches bundle load failures, falls back to rule-based summarizer
- **Message Validation:** ValidationHelpers.js validates WASM output before rendering (prevents XSS)
- **Storage Errors:** SessionManager catches chrome.storage errors, logs but doesn't crash
- **DOM Errors:** DOMHelpers.js uses textContent instead of innerHTML, safeCreateElement for all DOM mutations

## Cross-Cutting Concerns

**Logging:**
- Debug flag at top of each module (const DEBUG = false for production)
- Console.log with module prefix: `[SessionManager]`, `[LLM]`, `[Storage]`
- Used for tracking state changes, message flow, errors

**Validation:**
- Input validation in `extension/sidebar/utils/ValidationHelpers.js`
- WASM output validated before rendering (buckets, topics, sentiment signals)
- User input sanitized via textContent, never innerHTML
- Message text length capped (1000 chars), author length capped (50 chars)

**Authentication:**
- None required; extension operates on user's local machine
- Chrome extension permissions (sidePanel, storage) enforced by browser

**Security:**
- Content Security Policy in manifest.json: script-src 'self' 'wasm-unsafe-eval'
- No user data sent to external servers (LLM runs locally if enabled)
- XSS protection: DOMHelpers.escapeHtml(), textContent instead of innerHTML
- Secrets: .env file .gitignored, no credentials hardcoded

**Performance:**
- Sentiment analysis throttled to every 10 seconds (SENTIMENT_UPDATE_INTERVAL)
- Message batching in content script (5 second intervals)
- WASM processes last 100 messages per batch (rolling window)
- Session questions limited to 50 unique questions max

---

*Architecture analysis: 2026-02-19*
