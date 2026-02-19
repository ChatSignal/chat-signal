# Coding Conventions

**Analysis Date:** 2026-02-19

## Naming Patterns

**Files:**
- JavaScript modules: camelCase with `.js` extension (e.g., `sidebar.js`, `llm-adapter.js`, `StateManager.js`)
- Utility modules: descriptive names with `Helpers` or `Manager` suffix (e.g., `DOMHelpers.js`, `ValidationHelpers.js`, `StateManager.js`)
- Test files: match module name with `.test.js` suffix (e.g., `sidebar.test.js`, `llm-adapter.test.js`)
- Rust modules: snake_case with `.rs` extension (e.g., `lib.rs`)

**Functions:**
- JavaScript: camelCase for all functions (e.g., `extractYouTubeMessage`, `startBatchTimer`, `createFallbackEngine`)
- Exported async functions clearly indicate async behavior: `initializeLLM`, `summarizeBuckets`, `saveSession`
- Helper/utility functions are concise: `showElement`, `hideElement`, `escapeHtml`, `sanitizeText`
- Rust: snake_case (e.g., `cluster_messages_internal`, `extract_topics_internal`, `analyze_sentiment_internal`)

**Variables:**
- Constants: UPPER_SNAKE_CASE (e.g., `BATCH_INTERVAL`, `MAX_RETRIES`, `INACTIVITY_TIMEOUT`)
- State variables: camelCase (e.g., `messageBatch`, `currentContainer`, `lastMessageTime`)
- Boolean flags: prefix with `is` or `has` (e.g., `isTestEnv`, `isInitialized`, `hasAnalysisResult`)
- Configuration/settings objects: camelCase (e.g., `DEFAULT_SETTINGS`, `settings`, `appConfig`)

**Types:**
- Rust structs: PascalCase (e.g., `Message`, `ClusterBucket`, `AnalysisResult`, `SentimentSignals`)
- TypeScript/JSDoc: object properties use camelCase (e.g., `positive_count`, but note: WASM returns snake_case for JSON compatibility)
- Enum-like constants (moods, statuses): lowercase strings (e.g., `'neutral'`, `'excited'`, `'live'`, `'history'`)

## Code Style

**Formatting:**
- Indentation: 2 spaces (JavaScript/CSS), 4 spaces (Rust)
- Line length: practical limit around 100-120 characters (not enforced by linter)
- No automated formatter configured (no Prettier, ESLint, or Biome detected)
- Manual consistency through code review

**Linting:**
- No linting configuration found (no `.eslintrc`, `.prettierrc`, `eslint.config.js`)
- Code follows implicit conventions established by existing files
- Security-first patterns enforced through code review (see Error Handling section)

**Semicolons:**
- JavaScript: semicolons used consistently throughout
- Rust: not applicable (semicolon rules differ)

**String literals:**
- Single quotes for JavaScript strings (e.g., `'neutral'`, `'youtube'`)
- Template literals for string interpolation (e.g., `` `Expected ${count} messages` ``)

## Import Organization

**Order:**
1. Built-in/standard library imports (e.g., `import assert from 'node:assert/strict'`)
2. Local module imports from relative paths (e.g., `import { StateManager } from './modules/StateManager.js'`)
3. Rust: dependencies first, then std library (Cargo.toml specifies wasm-bindgen, serde, serde_json)

**Path Aliases:**
- No path aliases configured
- Relative imports use explicit paths: `../llm-adapter.js`, `./modules/StateManager.js`, `../utils/DOMHelpers.js`
- Chrome extension APIs accessed via global `chrome` object (no imports needed for MV3)

**ES6 Modules:**
- Type: `"module"` declared in `package.json`
- Fully converted to ES6 imports/exports (e.g., `export class StateManager`, `export function sanitizeText`)
- Dynamic imports used for WASM loading: `` await import(`../wasm/wasm_engine.js?nocache=${Date.now()}`) ``
- Test imports use cache-busting query params to avoid caching during development

## Error Handling

**Patterns:**

1. **WASM-to-JS boundary:** `Result<JsValue, JsValue>` with descriptive error messages
   ```rust
   // From wasm-engine/src/lib.rs
   serde_wasm_bindgen::from_value(messages_json)
       .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
   ```

2. **Async operations:** Try-catch with detailed error logging and fallback
   ```javascript
   // From llm-adapter.js
   try {
     const { CreateMLCEngine } = await import(webllmPath);
     engine = await CreateMLCEngine('Phi-2-q4f16_1-MLC', { ... });
   } catch (bundleError) {
     console.warn('[LLM] WebLLM bundle not found, using fallback summarizer:', bundleError);
     engine = createFallbackEngine();
   }
   ```

3. **Input validation:** Explicit checks before processing with clear error messages
   ```javascript
   // From ValidationHelpers.js
   if (!Array.isArray(messages)) {
     throw new Error('Messages must be an array');
   }
   messages.forEach((msg, index) => {
     if (typeof msg.text !== 'string' || msg.text.length > 1000) {
       throw new Error(`Message at index ${index}: text must be string <= 1000 chars`);
     }
   });
   ```

4. **Graceful degradation:** Features fallback when optional dependencies unavailable (e.g., WebLLM → rule-based summarizer)

5. **Error context:** Errors include context (`[LLM]`, `[SessionManager]`, `[Content-Script]`) for easier debugging

## Logging

**Framework:** Native `console` object (no logging library)

**Patterns:**

1. **Debug flag:** `const DEBUG = false` at module top, used for verbose output
   ```javascript
   if (DEBUG) console.log('[LLM] WebLLM engine initialized successfully');
   ```

2. **Severity levels:**
   - `console.log()` for informational messages
   - `console.warn()` for recoverable errors (e.g., fallback activated)
   - `console.error()` for critical failures

3. **Message format:** Include module prefix in brackets: `[LLM]`, `[SessionManager]`, `[Content-Script]`
   ```javascript
   console.log('[SessionManager] Started session for youtube: My Stream Title');
   console.error('[LLM] Initialization failed:', error);
   ```

4. **When to log:**
   - State transitions (session start/end, LLM initialization)
   - Fallback activation
   - Critical errors only in production (debug flag controls verbose output)
   - Skip logging in test environment when not debugging

## Comments

**When to Comment:**
- Complex algorithms (e.g., spam detection logic, sentiment score calculation)
- Non-obvious business rules (e.g., why certain words are filtered)
- Section dividers for code organization (e.g., `// ============ TOPIC EXTRACTION ============`)
- Configuration reasons (e.g., "Optimize for size" in Cargo.toml `opt-level = "s"`)
- **Avoid:** Self-documenting function names usually sufficient; skip obvious comments like `// Set x to y`

**JSDoc/TSDoc:**
- Used for exported functions with complex signatures
- Include: description, parameters, return type, examples for WASM exports
- Example from `lib.rs`:
  ```rust
  /// Clusters chat messages into labeled buckets (Questions, Issues, Requests, General Chat).
  ///
  /// # Input JSON Shape
  /// Array of message objects: [{ "text": "...", "author": "...", "timestamp": ... }]
  ///
  /// # Output JSON Shape
  /// { "buckets": [...], "processed_count": 10 }
  #[wasm_bindgen]
  pub fn cluster_messages(messages_json: JsValue) -> Result<JsValue, JsValue>
  ```
- Rust: doc comments (`///`) for public items
- JavaScript: JSDoc not consistently used; considered for future refactoring

## Function Design

**Size:**
- Target 20-50 lines per function (practical guideline, not strict)
- Break into smaller functions when: (1) reused in multiple places, (2) tests are needed at that layer, (3) single concern > 30 lines
- Large functions example: `sidebar.js` `updateClusters()` ~60 lines (necessary complexity for UI updates)

**Parameters:**
- Prefer explicit parameters over large config objects, except for settings/options
- Settings objects use snake_case from WASM, converted to camelCase in JS (e.g., `topicMinCount`, `spamThreshold`)
- Keep to ≤ 4 parameters; use object spread `{ ...settings, ...newSettings }` for overrides
- Arrow functions for callbacks: `(msg) => msg.text.toLowerCase()`

**Return Values:**
- Async functions return `Promise<T>` explicitly
- Validation functions return `true` on success, throw on failure (e.g., `ValidationHelpers.js`)
- Utility functions return simple values or objects (e.g., `sanitizeText()` returns sanitized string)
- WASM exports return `Result<JsValue, JsValue>` for JSON serialization compatibility
- Null handling: explicit checks preferred over truthiness
  ```javascript
  if (result !== null && result !== undefined) { ... }
  ```

## Module Design

**Exports:**
- Named exports preferred for utilities: `export function sanitizeText() { ... }`
- Default export for classes: `export class StateManager { ... }`
- Barrel files not used (no index.js re-exports)
- Each module is self-contained; minimal cross-module dependencies

**Architecture:**
- **Separation of concerns:** UI logic (`sidebar.js`) separate from data validation (`ValidationHelpers.js`), state management (`StateManager.js`), storage (`storage-manager.js`)
- **Utils directory:** `DOMHelpers.js` (safe DOM manipulation), `ValidationHelpers.js` (input validation), `FormattingHelpers.js` (text formatting)
- **Modules directory:** `StateManager.js` (application state), `SessionManager.js` (session lifecycle)
- **WASM layer:** `lib.rs` contains all analysis logic; JS calls WASM via `wasm_engine.js` generated module

**Imports:**
- Content script: no dependencies on sidebar or extension modules (runs in page context)
- Sidebar: imports from `llm-adapter.js`, `storage-manager.js`, utility modules
- LLM adapter: self-contained, no imports except config
- WASM: generates TypeScript definitions (`wasm_engine.d.ts`) for type checking in JavaScript

## Security Patterns

**Security-First DOM Manipulation:**
- **Never use `innerHTML` directly** on user-controlled content
- Always use `DOMHelpers.js` functions: `safeCreateElement()`, `escapeHtml()`, `safeSetHTML()`
- Example:
  ```javascript
  // ❌ Unsafe
  element.innerHTML = userInput; // XSS vulnerability

  // ✅ Safe
  element.textContent = userInput; // Automatically escaped
  // or
  const safe = escapeHtml(userInput);
  safeSetHTML(element, `<p>${safe}</p>`);
  ```

**Input Validation:**
- All WASM outputs validated before use: `validateAnalysisResult()`, `validateMessages()`
- All user input sanitized: `sanitizeText()`, `sanitizePlatform()`
- Settings validated before applying: `validateSettings()`

**Chrome API Safety:**
- Messages passed via `chrome.runtime.sendMessage()` use `type` field for routing
- Storage uses `chrome.storage.sync` and `chrome.storage.local` (both safe)
- Extension URLs accessed via `chrome.runtime.getURL()` (prevents path traversal)

## Testing Conventions

See TESTING.md for detailed test structure and patterns.

---

*Convention analysis: 2026-02-19*
