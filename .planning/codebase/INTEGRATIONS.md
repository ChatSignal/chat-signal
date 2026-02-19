# External Integrations

**Analysis Date:** 2026-02-19

## APIs & External Services

**WebLLM (AI Model Inference):**
- Service: MLCChat WebLLM - In-browser LLM engine
  - Model: Phi-2-q4f16_1-MLC (default, configurable)
  - SDK/Client: `@mlc-ai/web-llm` (bundled at `extension/libs/web-llm/index.js`)
  - Model download source: HuggingFace CDN
  - Configuration: `extension/llm-adapter.js` (lines 34-47)
  - Auth: None (models downloaded via public CDN)
  - Fallback: Rule-based summarizer when WebLLM unavailable (`extension/llm-adapter.js`, lines 75-93)

**GitHub (Build/Documentation):**
- Usage: Raw file serving for documentation links
  - CSP allow: `https://raw.githubusercontent.com` for model manifest
  - No authentication required (public resources)

**HuggingFace (Model Distribution):**
- Service: CDN for ML model artifacts
  - CSP allow: `https://huggingface.co` and `https://cdn-lfs.huggingface.co`
  - Models auto-downloaded on first run (~400MB)
  - Cached locally in browser IndexedDB (managed by WebLLM)

## Data Storage

**Browser Local Storage:**
- **Type:** Chrome Extension Storage API (local namespace)
- **Client:** Native `chrome.storage.local` API
- **Purpose:** Session history persistence
- **Location:** `extension/storage-manager.js`
- **Schema:** `sessionHistory` key stores array of session objects
  - Max 50 sessions retained
  - Fields: `id`, `startTime`, `endTime`, `platform`, `streamTitle`, `streamUrl`, `messageCount`, `buckets`, `topics`, `sentimentSignals`, `mood`, `savedAt`

**Browser Sync Storage:**
- **Type:** Chrome Extension Storage API (sync namespace)
- **Client:** Native `chrome.storage.sync` API
- **Purpose:** User settings synchronization across Chrome profile
- **Location:** `extension/options/options.js`, `extension/sidebar/sidebar.js`
- **Data Stored:**
  - `settings` - User configuration (topic threshold, spam filter, sentiment sensitivity)
  - `aiConsentShown` - LLM feature opt-in state

**IndexedDB:**
- **Type:** Browser IndexedDB (managed by WebLLM)
- **Purpose:** LLM model caching
- **Auto-managed:** WebLLM engine handles database creation and updates
- **Configuration:** Set via `appConfig.useIndexedDBCache: true` in `extension/llm-adapter.js` (line 45)
- **Size:** ~400MB per model (Phi-2-q4f16_1)

**File Storage:**
- **Local filesystem only** - No cloud file storage integration
- Chrome extension cannot access user file system directly

**Caching:**
- **Browser Cache:** Standard HTTP cache (implicit)
- **IndexedDB:** WebLLM model artifacts cached locally
- **Memory:** WASM analysis results stored in-memory during session

## Authentication & Identity

**Authentication:**
- **Type:** None required - No user accounts
- **Identity:** Extension operates on per-user basis (Chrome profile isolation)
- **Session tracking:** Session IDs generated client-side (timestamp + random)

**User Consent:**
- **LLM Consent Flow:** `extension/sidebar/sidebar.js` (lines 1000+)
  - First-run modal asks user to enable/disable AI features
  - Modal ID: `llm-consent-modal`
  - Settings key: `aiConsentShown` (tracks if user has made choice)
  - User choice persisted: `aiSummariesEnabled` in sync storage

## Monitoring & Observability

**Error Tracking:**
- Type: Browser console logging only
- Implementation: Inline `console.error()` and `console.warn()` calls
- Debug mode: `const DEBUG = false` in files (toggles verbose logging)
- No external error tracking service

**Logs:**
- **Approach:** Console logging to browser DevTools
- **Locations:**
  - `extension/llm-adapter.js` - LLM initialization and inference logs (lines 50, 54, 64)
  - `extension/content-script.js` - Chat detection logs (lines 89, 137, 154)
  - `extension/sidebar/sidebar.js` - Analysis and state change logs
  - `extension/storage-manager.js` - Storage operation errors (line 56)
- **Log Levels:** `console.log()` (info), `console.warn()` (warnings), `console.error()` (errors)

## CI/CD & Deployment

**Hosting:**
- **Platform:** Chrome Web Store (target for publication)
- **Current Distribution:** Manual unpacking in developer mode
- **Build process:** `scripts/build.sh` compiles Rust WASM and stages extension

**CI Pipeline:**
- Type: None detected in codebase
- Test execution: Manual (`npm run test:js`)
- No automated deployment pipeline

**Build Process:**
```bash
./scripts/build.sh
# Runs: cd wasm-engine && wasm-pack build --target web --out-dir pkg
# Copies artifacts to: extension/wasm/
```

## Environment Configuration

**Required Environment Variables:**
- None - Extension requires no environment variables
- All configuration is stored in Chrome storage APIs

**Settings Available (User-Configurable):**
- `topicMinCount` (default: 5) - Minimum message count for topic extraction
- `spamThreshold` (default: 3) - Threshold for spam detection
- `duplicateWindow` (default: 30) - Time window for duplicate message detection (seconds)
- `sentimentSensitivity` (default: 3) - Minimum sentiment signals required
- `moodUpgradeThreshold` (default: 30) - Sentiment score threshold for mood upgrades
- `aiSummariesEnabled` (default: false) - Enable WebLLM AI features

**Secrets Location:**
- No API keys or secrets used
- Configuration stored unencrypted in Chrome storage (browser-isolated)

## Webhooks & Callbacks

**Incoming Webhooks:**
- None - Extension only receives messages from its own content scripts

**Outgoing Webhooks:**
- None - No external API calls except HuggingFace CDN for model downloads

**Internal Message Passing:**
- **Content Script → Background Worker → Sidebar UI**
  - Message type: `CHAT_MESSAGES`
  - Flow: `extension/content-script.js` → `extension/background.js` → `extension/sidebar/sidebar.js`
  - Schema: `{ type: 'CHAT_MESSAGES', messages, platform, streamUrl, streamTitle }`

## Real-Time Data Sources

**YouTube Chat:**
- **Source:** DOM observer on YouTube live chat
- **Selectors:**
  - Container: `#chatframe` (iframe) or `yt-live-chat-item-list-renderer #items`
  - Messages: `yt-live-chat-text-message-renderer`
  - Author: `#author-name`
  - Text: `#message`
- **Location:** `extension/content-script.js` (lines 14-29)

**Twitch Chat:**
- **Source:** DOM observer on Twitch chat container
- **Selectors:**
  - Container: `.chat-scrollable-area__message-container`
  - Messages: `.chat-line__message`
  - Author: `.chat-author__display-name`
  - Text: `.text-fragment`
- **Location:** `extension/content-script.js` (lines 16, 31-42)

**Data Collection:**
- **Batch interval:** 5 seconds (configurable in `content-script.js`)
- **Payload:** Recent messages (text, author, timestamp)
- **Scope:** Live streams only, chat messages only (no user identity leakage)

---

*Integration audit: 2026-02-19*
