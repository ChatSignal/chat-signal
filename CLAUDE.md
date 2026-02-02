# CLAUDE.md

This file provides guidance for Claude Code (or any AI assistant) when working with the chat-signal-radar codebase.

## Project Overview

Chat Signal Radar is a Chrome extension that analyzes YouTube and Twitch live chat in real-time using Rust + WebAssembly. It provides content creators with a real-time dashboard showing:

- **Message Clustering**: Questions, Issues/Bugs, Requests, and General Chat
- **Sentiment Analysis**: Overall chat mood (excited, positive, angry, negative, confused, neutral)
- **Topic Detection**: Trending words and emotes mentioned frequently

## Architecture

```
Content Script → Background Worker → Sidebar UI → WASM Engine
(DOM observer)    (message relay)    (display)    (analysis)
                                         ↓
                                    LLM Adapter
                                  (WebLLM/fallback)
```

- **wasm-engine/**: Rust WASM analysis engine
  - Message clustering (keyword-based)
  - Topic extraction (with stop word filtering)
  - Sentiment signal analysis (lexicon-based)
- **extension/**: Chrome Extension (Manifest V3)
  - `content-script.js`: DOM observer for YouTube/Twitch chat
  - `background.js`: Service worker for message relay
  - `llm-adapter.js`: WebLLM integration with fallback summarizer
  - `sidebar/`: UI components (HTML, JS, CSS with system theme support)
  - `libs/web-llm/`: Bundled WebLLM library (optional, for AI summaries)
  - `wasm/`: Generated WASM artifacts (git-ignored)
- **scripts/**: Build automation

## Build Commands

```bash
# Build WASM and copy to extension
./scripts/build.sh

# Development mode with auto-rebuild (requires cargo-watch)
./scripts/watch.sh

# Build WASM only
cd wasm-engine && wasm-pack build --target web --release
```

## Test Commands

```bash
# Run Rust unit tests
cd wasm-engine && cargo test
```

There are 18 unit tests in `wasm-engine/src/lib.rs` covering:
- Message clustering (5 tests)
- Topic extraction (4 tests)
- Sentiment analysis (4 tests)
- Spam/duplicate detection (4 tests)
- Combined analysis (1 test)

## Key Files

- `wasm-engine/src/lib.rs`: Core analysis engine with clustering, topic extraction, and sentiment analysis
- `wasm-engine/Cargo.toml`: Rust dependencies (wasm-bindgen, serde)
- `extension/manifest.json`: Extension permissions and configuration
- `extension/content-script.js`: Platform-specific chat extraction (YouTube/Twitch selectors)
- `extension/llm-adapter.js`: WebLLM integration for AI-powered sentiment analysis
- `extension/sidebar/sidebar.js`: Main entry point, WASM loading, UI event handling
- `extension/sidebar/modules/`: Modular components
  - `SessionManager.js`: Session lifecycle, inactivity detection, persistence
  - `StateManager.js`: Application state management and data accumulation
- `extension/sidebar/utils/`: Utility modules
  - `DOMHelpers.js`: Safe DOM manipulation with XSS protection
  - `ValidationHelpers.js`: Input validation and sanitization
  - `FormattingHelpers.js`: Text formatting and display utilities
- `extension/storage-manager.js`: Session history persistence using chrome.storage.local
- `extension/WEBLLM_SETUP.md`: Detailed WebLLM setup instructions

## WASM Engine Functions

The Rust WASM engine exports these main functions:

### `cluster_messages(messages)`
Clusters messages into buckets (Questions, Issues/Bugs, Requests, General Chat).

### `analyze_chat(messages)`
Combined analysis returning:
- `buckets`: Clustered messages
- `topics`: Trending words/phrases (min 5 mentions)
- `sentiment_signals`: Positive/negative/confused/neutral counts + score

### `extract_topics(messages, min_count)`
Extracts frequently mentioned words, filtering stop words but preserving emotes.

### `analyze_sentiment_signals(messages)`
Analyzes sentiment using lexicon-based matching.

## Word Lists (in lib.rs)

- `STOP_WORDS`: Common English words filtered from topics
- `KNOWN_EMOTES`: Twitch/YouTube emotes preserved and flagged
- `POSITIVE_WORDS`: Positive sentiment indicators
- `NEGATIVE_WORDS`: Negative sentiment indicators
- `CONFUSED_INDICATORS`: Confusion/question indicators

## Coding Conventions

### Rust (wasm-engine)
- Use `#[derive(Serialize, Deserialize)]` for JSON-compatible structs
- Export functions to JS with `#[wasm_bindgen]`
- Return `Result<JsValue, JsValue>` for JS interop errors
- Keep functions unit-testable by separating internal logic from wasm_bindgen exports

### JavaScript (extension)
- Use ES6 modules with dynamic imports for WASM
- **Security-First**: Always use safe DOM helpers from `DOMHelpers.js` instead of `innerHTML`
- **Input Validation**: Validate all WASM output and user input with `ValidationHelpers.js`
- Structure messages with `type` field for chrome message passing
- Use `chrome.runtime.getURL()` for extension resource paths
- LLM calls should have fallback behavior for when WebLLM is unavailable
- Follow modular architecture: separate concerns into modules/ and utils/

### CSS (sidebar)
- Use CSS variables for theming (defined in `:root`)
- Support system theme via `@media (prefers-color-scheme: dark)`
- Use `var(--variable-name)` for colors, not hardcoded values

## Sentiment Analysis Logic

The sentiment system uses a two-tier approach:

1. **WASM Engine** counts messages matching sentiment keywords:
   - Positive: "love", "great", "pog", "awesome", etc.
   - Negative: "hate", "bad", "boring", "trash", etc.
   - Confused: "?", "wait", "huh", "explain", etc.
   - Neutral: everything else

2. **LLM Adapter** determines mood from signals:
   - Ignores neutral messages when calculating mood
   - Requires at least 3 sentiment signals before declaring a non-neutral mood
   - Upgrades positive → excited when sentiment_score > 30
   - Upgrades negative → angry when sentiment_score < -30
   - Falls back to rule-based analysis if WebLLM unavailable

## Data Flow

```
Messages (from content script)
    ↓
analyze_chat() [WASM]
    ↓
AnalysisResult {
  buckets: ClusterBucket[],
  topics: TopicEntry[],
  sentiment_signals: SentimentSignals
}
    ↓
Sidebar renders:
  - Mood indicator (with optional LLM enhancement)
  - Trending topics cloud
  - Cluster buckets
  - AI summary (optional)
```

## Development Workflow

1. Make changes to Rust code in `wasm-engine/src/lib.rs`
2. Run `./scripts/build.sh` to compile and copy artifacts
3. Load/reload extension in Chrome (`chrome://extensions/` → Developer mode → Load unpacked → select `extension/` folder)
4. Open YouTube/Twitch live stream and click extension icon to test

## Dependencies

- Rust (latest stable)
- wasm-pack
- Chrome browser
- Optional: cargo-watch for development auto-rebuild

## WebLLM Integration (Optional)

The extension supports optional AI-powered summaries using WebLLM (in-browser LLM). The feature gracefully degrades to a rule-based fallback if WebLLM is not available.

### User Consent Flow

On first run, users see a consent modal before any AI model download:
- **Enable AI** - Sets `aiSummariesEnabled: true` in settings, downloads ~400MB model
- **Skip** - Keeps `aiSummariesEnabled: false`, uses rule-based fallback

The same `aiSummariesEnabled` setting is used by both the consent modal and the Settings page toggle, providing a single source of truth. A separate `aiConsentShown` flag tracks whether the user has seen the consent modal.

### How it works

1. `llm-adapter.js` attempts to load WebLLM from `libs/web-llm/index.js`
2. If user consented and bundle found, uses Phi-2-q4f16_1-MLC model for summarization
3. If bundle not found or user declined, falls back to rule-based summary extraction
4. Sidebar displays AI-generated summaries alongside cluster buckets

### Setup Options

See `extension/WEBLLM_SETUP.md` for detailed instructions. Three options:
- **Manual Bundle** (recommended): Download pre-built WebLLM files
- **Build from Source**: Use npm/esbuild to bundle
- **Fallback Only**: Works without any setup using rule-based summaries

### LLM Adapter API

```javascript
import { initializeLLM, summarizeBuckets, analyzeSentiment, isLLMReady, resetLLM } from './llm-adapter.js';

await initializeLLM(progressCallback);  // Initialize engine
const summary = await summarizeBuckets(buckets);  // Generate summary
const sentiment = await analyzeSentiment(messages, signals);  // Analyze mood
isLLMReady();  // Check if ready
await resetLLM();  // Cleanup
```

## Roadmap

### Shipped (MVP)
- [x] Message clustering (Questions, Issues, Requests, General Chat)
- [x] Sentiment analysis with 6 moods
- [x] Trending topics with emote detection
- [x] Spam/duplicate filtering
- [x] User-configurable settings
- [x] Session summary with "End Session" button
- [x] Copy summary to clipboard
- [x] System theme support (dark/light)
- [x] First-run guidance
- [x] Extension icons

### Shipped (Post-MVP)
- [x] **WebLLM Consent UX**: Prompt user before downloading ~400MB AI model, with "Remember my choice" option
- [x] **Smart Session Detection**: Auto-detect when messages stop for 2+ minutes and prompt "Stream ended? Save your session summary"
- [x] **Session History**: Persist summaries to chrome.storage.local, "History" tab to view past sessions
- [x] **Session-wide Stats**: Accumulate questions, sentiment, and message counts across entire session (not just rolling window)

### Next Up
- [ ] **Export Options**: Download session data as JSON or Markdown files
- [ ] **Platform Expansion**: Add support for additional streaming platforms
  - **Kick** - Best candidate, similar architecture to Twitch
  - **Rumble** - Simpler DOM structure, growing audience
  - *Note: X Spaces investigated but tabled due to audio-first model and Shadow DOM complexity*
- [ ] **Alerts**: Notify when sentiment spikes (positive or negative)
- [ ] **Historical Trends**: Graphs showing sentiment/engagement over time during a stream

### Future Ideas
- User-configurable sentiment keywords
- Embedding-based semantic clustering (beyond keyword matching)
- Moderator-specific features (flagging, quick actions)
- Multi-stream monitoring
- API/webhook integration for external tools
- Chrome Web Store publication
