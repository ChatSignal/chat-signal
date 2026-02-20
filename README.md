# 📡 Chat Signal Radar

A Chrome extension that uses Rust + WebAssembly to analyze YouTube and Twitch live chat in real-time. Built for content creators who need to keep up with fast-moving chat streams.

## ✨ Features

- **Message Clustering**: Automatically categorizes messages into Questions, Issues/Bugs, Requests, and General Chat
- **Semantic Clustering**: When GPU is available, messages are classified by cosine similarity to prototype vectors using MiniLM embeddings — falls back silently to keyword matching
- **Sentiment Analysis**: Real-time mood indicator showing chat sentiment (excited, positive, angry, negative, confused, neutral)
- **Trending Topics**: Word cloud of frequently mentioned terms, with special highlighting for emotes
- **Session History**: Save and review past session summaries with full sentiment breakdown and captured questions
- **Smart Session Detection**: Auto-prompts to save when stream chat goes inactive for 2+ minutes
- **AI Summaries**: Optional WebLLM-powered chat summaries (works offline, falls back gracefully)
- **Configurable Thresholds**: Adjust analysis window size and inactivity timeout from the settings page

## 🏗️ Architecture

- **Rust WASM Engine** (`wasm-engine/`): High-performance analysis compiled to WebAssembly
  - Message clustering (keyword-based fallback)
  - Topic extraction with stop-word filtering
  - Sentiment signal analysis
- **Semantic AI Pipeline** (`extension/sidebar/`): In-browser ML for smarter clustering
  - MiniLM encoder via Transformers.js (WebGPU with WASM fallback)
  - Cosine similarity routing to prototype vectors per category
  - Automatic mode switching with "Semantic"/"Keyword" badge
- **Chrome Extension** (`extension/`): Manifest V3 extension with sidebar UI
  - Real-time chat observation
  - Mood indicator with theme-aware display
  - Trending topics word cloud
  - Automatic light/dark mode support (follows system theme)
- **Build Scripts** (`scripts/`): Automated build pipeline from Rust → WASM → Extension

## 🚀 Quick Start

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/) (`cargo install wasm-pack`)
- Chrome/Chromium browser

### Build & Install

1. **Build the WASM module:**
   ```bash
   chmod +x scripts/build.sh
   ./scripts/build.sh
   ```

2. **Load extension in Chrome:**
   - Open `chrome://extensions/`
   - Enable **Developer mode** (top-right toggle)
   - Click **Load unpacked**
   - Select the `extension/` folder

3. **Test it:**
   - Navigate to a YouTube live stream or Twitch channel with active chat
   - Click the extension icon to open the sidebar
   - Watch the dashboard update in real-time:
     - 🎭 Mood indicator shows overall chat sentiment
     - 🏷️ Trending topics highlight what people are talking about
     - 📊 Message clusters organize chat by type
   - Click **End Session** to see a full summary with sentiment breakdown
   - Switch to the **History** tab to view past sessions

## 📁 Project Structure

```
chat-signal-radar/
├── wasm-engine/           # Rust → WASM analysis engine
│   ├── Cargo.toml
│   └── src/lib.rs         # Clustering, topics, sentiment
├── extension/             # Chrome extension (Manifest V3)
│   ├── manifest.json
│   ├── background.js      # Service worker
│   ├── content-script.js  # Chat DOM observer
│   ├── llm-adapter.js     # WebLLM integration
│   ├── storage-manager.js # Session history persistence
│   ├── options/           # Settings page
│   │   ├── options.html
│   │   ├── options.js
│   │   └── options.css
│   ├── sidebar/
│   │   ├── sidebar.html   # Dashboard UI
│   │   ├── sidebar.css    # Styling (light/dark theme support)
│   │   ├── sidebar.js     # Main entry point, WASM loading
│   │   ├── encoder-adapter.js    # MiniLM encoder (WebGPU/WASM)
│   │   ├── cosine-router.js      # Semantic cosine classification
│   │   ├── routing-config.js     # Seed phrases & thresholds
│   │   ├── modules/       # Modular components
│   │   │   ├── SessionManager.js  # Session lifecycle & persistence
│   │   │   └── StateManager.js    # Application state management
│   │   └── utils/         # Utility modules
│   │       ├── DOMHelpers.js         # Safe DOM manipulation
│   │       ├── ValidationHelpers.js  # Input validation & sanitization
│   │       └── FormattingHelpers.js  # Text formatting utilities
│   └── wasm/              # (generated) WASM artifacts
├── docs/                  # GitHub Pages site
│   ├── CNAME              # Custom domain (chatsignal.dev)
│   ├── privacy-policy.md  # Published privacy policy
│   ├── cws-justifications.md  # CWS dashboard reference
│   ├── cws-store-listing.md   # Store listing copy reference
│   └── store/             # CWS store assets
│       ├── promo-440x280.png        # Promotional image
│       ├── screenshot-clusters.png  # Screenshot: message clusters
│       ├── screenshot-mood.png      # Screenshot: sentiment/mood
│       └── screenshot-topics.png    # Screenshot: trending topics
├── tests/                 # JavaScript tests
└── scripts/
    ├── build.sh           # Build Rust → WASM → Extension
    ├── watch.sh           # Dev mode with auto-rebuild
    ├── promo-image.mjs    # Generate 440x280 promo image
    └── screenshot.mjs     # Generate 1280x800 CWS screenshots
```

## 🛠️ Development

### Dev Workflow

1. **Start watch mode:**
   ```bash
   chmod +x scripts/watch.sh
   ./scripts/watch.sh
   ```

2. **Open a test stream** (YouTube live or Twitch with active chat)

3. **After code changes:**
   - Watch mode auto-rebuilds WASM
   - Go to `chrome://extensions/`
   - Click reload icon on Chat Signal Radar extension
   - Refresh the stream page

4. **Debugging:** 
   - Check Chrome DevTools Console for validation errors and security warnings
   - Session data and validation logs are prefixed with `[SessionManager]` or `[StateManager]`
   - Security blocks are logged when unsafe content is detected

### Watch Mode (Auto-rebuild)

Requires [cargo-watch](https://github.com/watchexec/cargo-watch):
```bash
cargo install cargo-watch
```

### Modifying the Analysis Logic

Edit `wasm-engine/src/lib.rs` and rebuild. The engine includes:

- **Clustering**: Keyword-based message categorization
- **Topic Detection**: Word frequency with smart stop-word filtering
- **Sentiment Analysis**: Lexicon-based mood detection

Word lists for emotes, stop words, and sentiment are defined at the top of `lib.rs`.

### Extension Architecture

The extension uses a modular architecture with clear separation of concerns:

- **Security-First Design**: All DOM operations use safe helpers from `DOMHelpers.js` with XSS protection
- **Input Validation**: Comprehensive validation of WASM data and user input via `ValidationHelpers.js`
- **Session Management**: `SessionManager.js` handles session lifecycle, inactivity detection, and persistence
- **State Management**: `StateManager.js` maintains application state and analysis results
- **Type Safety**: All data structures are validated before processing to prevent runtime errors

### Security Features

- **XSS Prevention**: Replaces unsafe `innerHTML` with safe DOM manipulation
- **Input Sanitization**: All user input and WASM output is validated and sanitized
- **Data Validation**: Comprehensive validation for messages, analysis results, settings, and session data
- **Safe Patterns**: Only allowed static HTML patterns are used for trusted content

### Run Tests

```bash
cd wasm-engine
cargo test
```

18 unit tests cover clustering, topic extraction, sentiment analysis, and spam detection.

For extension logic tests:

```bash
npm run test:js
```

## 🎯 How It Works

1. **Content Script** observes YouTube/Twitch chat DOM
2. Batches messages every 5 seconds
3. Sends batch to **Sidebar** via `chrome.runtime`
4. **WASM engine** runs combined analysis:
   - Clusters messages by type (keyword-based)
   - Extracts trending topics (5+ mentions)
   - Computes sentiment signals
5. **Semantic pipeline** (when encoder is ready) overrides cluster assignments:
   - MiniLM encodes messages into 384-dim embeddings
   - Cosine similarity routes each message to the nearest prototype vector
   - Badge shows "Semantic" or "Keyword" to indicate active mode
6. **LLM Adapter** optionally enhances sentiment with WebLLM
7. **Sidebar UI** displays:
   - Mood indicator (emoji + label + confidence)
   - Trending topics word cloud
   - Categorized message clusters (semantic or keyword)
   - AI summary (if LLM available)

## 🎭 Sentiment Moods

| Mood | Emoji | Trigger |
|------|-------|---------|
| Excited | 🎉 | Strong positive signals (score > 30) |
| Positive | 😊 | Positive keywords (love, great, pog, etc.) |
| Neutral | 😐 | Few sentiment signals detected |
| Confused | 🤔 | Questions, "wait", "huh", etc. |
| Negative | 😔 | Negative keywords (bad, boring, etc.) |
| Angry | 😠 | Strong negative signals (score < -30) |

Sentiment requires at least 3 signal-bearing messages before showing a non-neutral mood.

## 📝 License

MPL 2.0

## 🔒 Privacy

Chat Signal Radar processes everything locally in your browser. No chat content is sent to any server. The only external request is an optional one-time AI model download from HuggingFace CDN (if you enable AI summaries).

Full privacy policy: **[chatsignal.dev/privacy-policy](https://chatsignal.dev/privacy-policy)**

## 🤝 Contributing

PRs welcome! Some ideas for future improvements:

- User-configurable sentiment keywords
- Additional streaming platforms
- Historical trend graphs
- Export/share functionality
- Threshold calibration for semantic clustering per-category
