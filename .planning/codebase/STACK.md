# Technology Stack

**Analysis Date:** 2026-02-19

## Languages

**Primary:**
- **Rust** 2021 edition - WASM analysis engine at `wasm-engine/`
- **JavaScript** (ES6 modules) - Chrome extension UI and content scripts in `extension/`
- **HTML/CSS** - Extension UI (sidebar, options pages)

**Secondary:**
- **Shell** (Bash) - Build automation in `scripts/`

## Runtime

**Environment:**
- **Chrome Browser** - Extension runs in Chrome MV3 (Manifest V3) environment
- **WebAssembly (WASM)** - Rust compiled to binary WASM module loaded by JavaScript
- **Node.js** (optional, development only) - For running test suite

**Package Manager:**
- **npm** - Root `package.json` for JavaScript development and testing
- **Cargo** - Rust package manager for WASM engine dependencies
- Lockfile: `package-lock.json` exists (implied from npm usage)

## Frameworks & Runtimes

**Core:**
- **Chrome Extension MV3** - Extension framework, Manifest V3 standard
- **WebAssembly (wasm-pack)** - Rust-to-WASM compilation toolchain
- **WebLLM** (optional) - In-browser LLM engine for AI summaries (bundled at `extension/libs/web-llm/index.js`)

**Testing:**
- **Node.js test runner** (`--test` flag) - Native Node.js testing without external framework
- Config: `package.json` defines test script as `node --test tests/*.test.js`

**Build/Dev:**
- **wasm-pack** - Rust to WebAssembly compiler and bundler
- **Bash scripts** - Custom build automation (`scripts/build.sh`, `scripts/watch.sh`)
- **cargo-watch** (optional) - Auto-rebuild during development

## Key Dependencies

**Rust (WASM Engine):**
- `wasm-bindgen` 0.2 - Rust-JavaScript interoperability layer
- `serde` 1.0 + derive feature - Serialization framework for JSON compatibility
- `serde_json` 1.0 - JSON serialization/deserialization
- `serde-wasm-bindgen` 0.6 - Rust struct serialization to JavaScript objects

**JavaScript (Extension):**
- No external npm dependencies (pure vanilla JavaScript)
- Built-in APIs only: `chrome.*`, `IndexedDB`, `localStorage`

## Configuration

**Extension Manifest:**
- Location: `extension/manifest.json` (Manifest V3)
- Permissions: `sidePanel`, `storage`
- Host permissions: YouTube and Twitch domains only
- Content Security Policy includes:
  - `script-src 'self' 'wasm-unsafe-eval'` - Allows WASM execution
  - `connect-src https://huggingface.co https://cdn-lfs.huggingface.co https://raw.githubusercontent.com` - For WebLLM model downloads

**Build Configuration:**
- Rust profile: `release` with `opt-level = "s"` (optimize for size) and `lto = true`
- WASM target: `web` (browser-compatible format)
- Output directory: `wasm-engine/pkg/` (generated) → copied to `extension/wasm/`

**Storage:**
- Browser storage API: `chrome.storage.local` and `chrome.storage.sync`
- IndexedDB: Used by WebLLM for model caching (~400MB per model)

## Platform Requirements

**Development:**
- Rust toolchain (stable, recent version)
- `wasm-pack` command-line tool
- Node.js 16+ (for test runner)
- Chrome browser with Developer Mode enabled
- Bash shell (for build scripts)

**Production:**
- **Deployment Target:** Chrome Browser (via Chrome Web Store or manual unpacking)
- **Minimum Chrome version:** Recent MV3-capable version (Chrome 88+)
- **Supported Platforms:** YouTube.com and Twitch.tv live streams

## File Size & Optimization

**WASM Module Size:**
- Built with `opt-level = "s"` and `lto = true` for minimal binary size
- Output: `wasm_engine.js` and `wasm_engine_bg.wasm` in `extension/wasm/`

**WebLLM Bundle Size:**
- Pre-built bundle at `extension/libs/web-llm/index.js` (~6MB minified)
- Model download: ~400MB per model (Phi-2-q4f16_1) on first run, cached in IndexedDB

---

*Stack analysis: 2026-02-19*
