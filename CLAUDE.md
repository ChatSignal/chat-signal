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
  - `sidebar/`: UI components (HTML, JS, CSS)
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

There are 14 unit tests in `wasm-engine/src/lib.rs` covering:
- Message clustering (5 tests)
- Topic extraction (4 tests)
- Sentiment analysis (4 tests)
- Combined analysis (1 test)

## Key Files

- `wasm-engine/src/lib.rs`: Core analysis engine with clustering, topic extraction, and sentiment analysis
- `wasm-engine/Cargo.toml`: Rust dependencies (wasm-bindgen, serde)
- `extension/manifest.json`: Extension permissions and configuration
- `extension/content-script.js`: Platform-specific chat extraction (YouTube/Twitch selectors)
- `extension/llm-adapter.js`: WebLLM integration for AI-powered sentiment analysis
- `extension/sidebar/sidebar.js`: WASM loading, UI rendering, mood/topic display
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
- Always escape HTML when rendering user content (use `escapeHtml()`)
- Structure messages with `type` field for chrome message passing
- Use `chrome.runtime.getURL()` for extension resource paths
- LLM calls should have fallback behavior for when WebLLM is unavailable

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

### How it works

1. `llm-adapter.js` attempts to load WebLLM from `libs/web-llm/index.js`
2. If successful, uses Phi-2-q4f16_1-MLC model for summarization (~400MB download on first run)
3. If bundle not found, falls back to rule-based summary extraction
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
