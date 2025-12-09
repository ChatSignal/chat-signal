# 📡 Chat Signal Radar

A Chrome extension that uses Rust + WebAssembly to analyze YouTube and Twitch live chat in real-time. Built for content creators who need to keep up with fast-moving chat streams.

## ✨ Features

- **Message Clustering**: Automatically categorizes messages into Questions, Issues/Bugs, Requests, and General Chat
- **Sentiment Analysis**: Real-time mood indicator showing chat sentiment (excited, positive, angry, negative, confused, neutral)
- **Trending Topics**: Word cloud of frequently mentioned terms, with special highlighting for emotes
- **AI Summaries**: Optional WebLLM-powered chat summaries (works offline, falls back gracefully)

## 🏗️ Architecture

- **Rust WASM Engine** (`wasm-engine/`): High-performance analysis compiled to WebAssembly
  - Message clustering
  - Topic extraction with stop-word filtering
  - Sentiment signal analysis
- **Chrome Extension** (`extension/`): Manifest V3 extension with sidebar UI
  - Real-time chat observation
  - Mood indicator with color-coded display
  - Trending topics word cloud
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
│   ├── sidebar/
│   │   ├── sidebar.html   # Dashboard UI
│   │   ├── sidebar.css    # Styling (mood colors, topic tags)
│   │   └── sidebar.js     # WASM loading, rendering
│   └── wasm/              # (generated) WASM artifacts
└── scripts/
    ├── build.sh           # Build Rust → WASM → Extension
    └── watch.sh           # Dev mode with auto-rebuild
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

### Run Tests

```bash
cd wasm-engine
cargo test
```

14 unit tests cover clustering, topic extraction, and sentiment analysis.

## 🎯 How It Works

1. **Content Script** observes YouTube/Twitch chat DOM
2. Batches messages every 5 seconds
3. Sends batch to **Sidebar** via `chrome.runtime`
4. **WASM engine** runs combined analysis:
   - Clusters messages by type
   - Extracts trending topics (5+ mentions)
   - Computes sentiment signals
5. **LLM Adapter** optionally enhances sentiment with WebLLM
6. **Sidebar UI** displays:
   - Mood indicator (emoji + label + confidence)
   - Trending topics word cloud
   - Categorized message clusters
   - AI summary (if LLM available)

## 🎭 Sentiment Moods

| Mood | Emoji | Trigger |
|------|-------|---------|
| Excited | 🎉 | Very positive chat (score > 50) |
| Positive | 😊 | Positive keywords (love, great, pog, etc.) |
| Neutral | 😐 | Normal chat |
| Confused | 🤔 | Questions, "wait", "huh", etc. |
| Negative | 😔 | Negative keywords (bad, boring, etc.) |
| Angry | 😠 | Very negative chat (score < -50) |

## 📝 License

MPL 2.0

## 🤝 Contributing

PRs welcome! Some ideas for future improvements:

- User-configurable sentiment keywords
- Additional streaming platforms
- Historical trend graphs
- Export/share functionality
- Embedding-based semantic clustering
