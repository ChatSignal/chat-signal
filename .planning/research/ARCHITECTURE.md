# Architecture Research

**Domain:** Chrome Extension — CWS compliance integration into existing MV3 extension
**Researched:** 2026-02-19
**Confidence:** HIGH (official Chrome docs verified for all critical claims)

---

## Context: What This Research Answers

The existing extension architecture is stable and ships. This document answers five integration questions for the v1.1 CWS Readiness milestone:

1. Where does the privacy policy live, and what must it contain?
2. How do disk space warnings integrate into the existing WebLLM consent flow?
3. Can `host_permissions` be replaced with `activeTab`?
4. What is the correct justification for `all_frames: true`?
5. How does incognito mode affect `chrome.storage.local` and `sidePanel`?

---

## System Overview (Existing + CWS Changes)

```
┌──────────────────────────────────────────────────────────────────┐
│  YouTube / Twitch page (host frame + possible iframes)           │
│  ┌────────────────────┐                                          │
│  │  content-script.js │ ← needs all_frames:true for embedded     │
│  │  (DOM observer,    │   chat iframes on YouTube                │
│  │   MutationObserver)│                                          │
│  └────────┬───────────┘                                          │
└───────────┼──────────────────────────────────────────────────────┘
            │ chrome.runtime.sendMessage (CHAT_MESSAGES)
            ▼
┌──────────────────────┐
│   background.js      │ Service Worker (MV3)
│   (message relay,    │ Re-broadcasts to sidebar
│    sidePanel.open()) │
└──────────┬───────────┘
           │ chrome.runtime.onMessage
           ▼
┌─────────────────────────────────────────────────────────────────┐
│  sidebar/sidebar.html + sidebar.js  (chrome.sidePanel)          │
│                                                                 │
│  ┌─────────────────┐  ┌───────────────────┐                    │
│  │  SessionManager  │  │  StateManager     │                    │
│  │  (lifecycle,     │  │  (rolling window, │                    │
│  │   inactivity)    │  │   accumulation)   │                    │
│  └─────────────────┘  └───────────────────┘                    │
│                                                                 │
│  ┌──────────────────────────────────────┐                       │
│  │  LLM Consent Modal  [MODIFIED v1.1]  │ ← disk space warning  │
│  │  llm-adapter.js     [EXISTING]       │   added here          │
│  └──────────────────────────────────────┘                       │
│                                                                 │
│  ┌────────────────────────────────────┐                         │
│  │  WASM Engine (wasm_engine.wasm)    │                         │
│  │  analyze_chat_with_settings()      │                         │
│  └────────────────────────────────────┘                         │
└────────────────────────┬────────────────────────────────────────┘
                         │ chrome.storage.local / chrome.storage.sync
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│  chrome.storage  (always shared between normal + incognito)      │
│  .local   →  session history (storage-manager.js)               │
│  .sync    →  user settings (options.js, sidebar.js)             │
│  .local   →  AI consent flags (aiConsentShown, aiSummaries)     │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  Privacy Policy  [NEW v1.1]                                      │
│  Hosted externally (GitHub Pages recommended)                    │
│  URL entered in CWS Developer Dashboard                          │
│  No code changes to extension required                           │
└──────────────────────────────────────────────────────────────────┘
```

---

## Integration Point 1: Privacy Policy

### Where It Lives

The privacy policy is a static HTML or Markdown document hosted at a public URL. The extension itself does not change. The URL is entered into the Chrome Web Store Developer Dashboard's privacy fields section — it is not linked from inside the extension.

**Recommended hosting:** GitHub Pages. Cost: free. Setup: create `docs/privacy-policy.md` (or `.html`) in the repository, enable GitHub Pages in repository settings, point to `main` branch `/docs` folder. Result: `https://<username>.github.io/<repo>/privacy-policy`.

**Alternative:** Any static hosting with a stable URL (Netlify, Vercel, personal domain). The URL must remain live permanently; CWS will verify it during review.

### What the Policy Must Contain (Confidence: HIGH)

CWS requires the policy to comprehensively disclose:

1. What data is collected
2. How that data is used
3. With whom data is shared
4. All third parties who receive user data

For Chat Signal Radar specifically, the policy must address:

| Data Item | Reality | Policy Statement |
|-----------|---------|------------------|
| Chat messages | Read from DOM, analyzed locally, never transmitted | "Chat messages are processed locally in your browser. No message content is sent to external servers." |
| Session history | Stored in `chrome.storage.local` on device only | "Session summaries are stored locally on your device using Chrome's extension storage API." |
| User settings | Stored in `chrome.storage.sync` (syncs across user's Chrome devices) | "Your settings are stored using Chrome Sync and may be synchronized across your signed-in Chrome devices." |
| AI model download | Fetched from HuggingFace CDN if user consents | "If you enable AI Summaries, a model (~400MB) is downloaded from HuggingFace and cached locally. No user data is sent to HuggingFace." |
| Hugging Face CDN | Only accessed for model binary, not user data | Disclose in policy that this network connection occurs. |

**No analytics, no crash reporting, no user accounts** — this simplifies the policy significantly.

### CWS Dashboard Privacy Fields (Confidence: HIGH)

The developer dashboard requires filling out:

1. **Single Purpose Description** — one paragraph explaining what the extension does
2. **Permission Justifications** — per-permission explanation (see Integration Point 3)
3. **Remote Code Declaration** — must declare no remote code execution (WASM is bundled, not remote)
4. **Data Usage Certification** — checkboxes for each data type collected
5. **Privacy Policy URL** — the hosted URL from above

---

## Integration Point 2: Disk Space Warning in WebLLM Consent Flow

### Current Consent Flow

```
[First activation]
  → check aiConsentShown in chrome.storage.local
      → if false: show llm-consent-modal in sidebar.html
          → user clicks "Enable AI" or "Skip"
              → set aiSummariesEnabled + aiConsentShown in chrome.storage.sync
                  → if "Enable AI": call initializeLLM() → WebLLM downloads model
```

The modal is defined in `sidebar.html` (element `#llm-consent-modal`) and handled by event listeners in `sidebar.js` (`llmEnableBtn`, `llmSkipBtn` around line 72).

### Where to Add Disk Space Warning

**Location:** Inside `#llm-consent-modal` in `sidebar.html`, and the JS logic in `sidebar.js` or `llm-adapter.js`.

**What to add:**

1. **Static size disclosure** — the modal already says "~400MB" in the `#ai-opt-in` div (line 54 of `sidebar.html`). The consent modal itself (`#llm-consent-modal`) needs the same disclosure. This is a pure HTML change.

2. **Dynamic space check (optional but recommended)** — before showing "Enable AI" as an active option, call `navigator.storage.estimate()` and compare `quota - usage` to 450MB (10% buffer over 400MB). If insufficient space, disable the "Enable AI" button and show a warning message.

**Implementation pattern:**

```javascript
// In sidebar.js, before or when showing llm-consent-modal
async function checkStorageForLLM() {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const { usage, quota } = await navigator.storage.estimate();
    const available = quota - usage;
    const MODEL_SIZE_BYTES = 450 * 1024 * 1024; // 450MB with buffer
    if (available < MODEL_SIZE_BYTES) {
      const availableMB = Math.round(available / (1024 * 1024));
      return { hasSpace: false, availableMB };
    }
  }
  return { hasSpace: true, availableMB: null };
}
```

**When to call it:** When `llmEnableBtn` is about to be displayed — either in the modal show handler or when the modal is about to be shown.

**Files changed:**
- `extension/sidebar/sidebar.html` — add disk size disclosure text to `#llm-consent-modal` HTML
- `extension/sidebar/sidebar.js` — add `checkStorageForLLM()` call, disable button + show warning if insufficient space

**Files not changed:**
- `extension/llm-adapter.js` — `initializeLLM()` is unchanged; the check is a pre-condition in the UI layer, not the adapter layer
- `manifest.json` — no new permissions required; `navigator.storage.estimate()` is a standard Web API with no permission requirement

**Confidence note (MEDIUM):** `navigator.storage.estimate()` returns estimates, not exact values. The quota reported inside a Chrome extension sidebar may differ from a web page context because extensions are treated as a separate origin. The function should be treated as a best-effort check, not a guarantee. The static "~400MB" disclosure is mandatory regardless of whether the dynamic check is implemented.

---

## Integration Point 3: host_permissions vs activeTab

### Verdict: host_permissions Must Stay (Confidence: HIGH)

`activeTab` cannot replace `host_permissions` for Chat Signal Radar. The reason is architectural: content scripts declared in the manifest run automatically on page load and continuously observe the DOM via `MutationObserver`. `activeTab` only grants temporary host permission following a user gesture (clicking the extension icon, keyboard shortcut, context menu). Once granted, it persists only until the user navigates away.

The content script in `content-script.js` must:
- Inject automatically when the user opens a YouTube or Twitch live stream
- Run a persistent `MutationObserver` for the full session duration
- Batch and send messages every 5 seconds regardless of whether the user has clicked the extension icon

None of these behaviors are compatible with `activeTab`, which is gesture-gated and navigation-scoped.

**Formal rule from Chrome docs:** "If your extension needs persistent access to specific websites... you need `host_permissions`."

### Permission Justification Text for CWS Dashboard

The CWS dashboard requires a text justification for each permission. Use the following:

| Permission | Justification |
|------------|---------------|
| `host_permissions: youtube.com` | "Required to inject a content script that observes the live chat DOM on YouTube streams. The extension monitors chat messages in real time without transmitting any data off the device." |
| `host_permissions: twitch.tv` | "Required to inject a content script that observes the live chat DOM on Twitch streams. The extension monitors chat messages in real time without transmitting any data off the device." |
| `storage` | "Used to persist user settings (chrome.storage.sync) and session history (chrome.storage.local) on the user's device. No data is sent to external servers." |
| `sidePanel` | "Required to display the analysis dashboard in Chrome's side panel, keeping it visible alongside the stream page." |

### CSP Justification

The existing CSP in `manifest.json`:

```
script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src https://huggingface.co https://cdn-lfs.huggingface.co https://raw.githubusercontent.com;
```

**`wasm-unsafe-eval`** — explicitly allowed in MV3 by Chrome for extensions that use WebAssembly. Chrome's minimum CSP includes it. No justification needed in the dashboard; it is a standard MV3 pattern.

**`connect-src` to HuggingFace/GitHub** — CWS reviewers may ask about this. The justification: "Used to download the optional AI model (Phi-2, ~400MB) from HuggingFace when the user explicitly opts in to AI summaries. Only accessed after explicit user consent. No user data is sent."

**If the WebLLM bundle is not present** (the extension ships without it), remove HuggingFace/GitHub from `connect-src` to reduce the permission surface. The `llm-adapter.js` fallback path does not require network access.

---

## Integration Point 4: all_frames: true Justification

### Why It Is Needed

YouTube embeds its live chat in an iframe whose source is `https://www.youtube.com/live_chat?v=...`. This iframe is a separate frame on the same origin (`www.youtube.com`), but it is a child frame, not the top frame. Without `all_frames: true`, the content script only runs in the top frame (the main video page) and never reaches the chat container.

Twitch's primary chat is in the main frame on `twitch.tv`, but streamer pages may embed Twitch via iframes. `all_frames: true` ensures coverage in embedded scenarios.

**Justification text for CWS dashboard:**

"YouTube Live Chat is rendered inside an iframe (https://www.youtube.com/live_chat). The content script must run in all frames matching the host_permissions patterns so it can observe the chat DOM in that iframe. Without all_frames: true, no chat messages would be captured on YouTube."

### Risk: Script Runs in More Frames Than Strictly Necessary

With `all_frames: true`, the content script injects into every YouTube and Twitch iframe, not just the chat iframe. The content script already handles this gracefully:

```javascript
// content-script.js lines 9-11
const isYouTube = window.location.hostname.includes('youtube.com');
const isTwitch = window.location.hostname.includes('twitch.tv');
```

And then checks for platform-specific selectors before setting up observers. If neither selector matches, the script exits silently without any DOM manipulation. This is correct behavior and demonstrates responsible `all_frames` usage.

**If CWS pushes back:** The alternative is programmatic injection from `background.js` using `chrome.scripting.executeScript()` with frame filtering. This is more complex but allows targeting only the specific iframe URL pattern (`*://www.youtube.com/live_chat*`). This would also allow removing `all_frames: true` from the manifest. This is a fallback — pursue only if the CWS reviewer specifically objects.

---

## Integration Point 5: Incognito Mode

### chrome.storage Behavior (Confidence: HIGH)

`chrome.storage.local` and `chrome.storage.sync` are **always shared** between normal and incognito extension processes. This is explicitly documented in Chrome's extension manifest reference:

> "chrome.storage.sync and chrome.storage.local are always shared between regular and incognito processes."

**Implication for Chat Signal Radar:**

Session history saved while in incognito will appear in the History tab in normal mode, and vice versa. This is the expected and unavoidable behavior for `chrome.storage.local`. The extension does not need to change anything to "handle" incognito — storage works identically.

**User-facing implication to disclose (optional):** Session summaries saved in incognito mode are persisted to device storage the same as those from normal mode. This may be unexpected for privacy-conscious users. Consider noting this in the privacy policy under "Session History."

### sidePanel Behavior in Incognito (Confidence: MEDIUM)

Chrome's official `sidePanel` API documentation does not enumerate incognito-specific restrictions. The default incognito behavior for extensions is **"spanning"** mode, where the extension runs in a single shared process and receives events from incognito tabs with an incognito flag. In spanning mode, the side panel is associated with the window, not the tab.

Extensions are not enabled in incognito mode by default — users must explicitly enable it in `chrome://extensions`. When enabled:
- `chrome.sidePanel.open({ windowId })` works the same as in normal mode
- The sidebar HTML/JS runs in the extension's shared process, not the incognito page context
- `chrome.storage` access from the sidebar works normally (shared storage)

**What to test manually:**
1. Enable the extension in incognito via `chrome://extensions`
2. Open a YouTube live stream in an incognito window
3. Click the extension icon — sidePanel should open
4. Verify chat messages flow through content script → background → sidebar
5. Save a session, verify it appears in History tab

No code changes are expected to be required for incognito support. This is a verification-only task.

### WASM in Incognito

WASM runs inside the sidebar document, which is an extension page (not a web page). Extension pages are not subject to the same incognito isolation as web pages. The WASM module loads from `chrome.runtime.getURL('wasm/wasm_engine_bg.wasm')` — an extension-origin URL — which works in both normal and incognito contexts when the extension is allowed in incognito.

No changes required.

---

## New vs Modified Components

| Component | Status | Change Type | Files |
|-----------|--------|-------------|-------|
| Privacy policy document | **NEW** | External static file, no extension code | `docs/privacy-policy.md` (or GitHub Pages) |
| LLM consent modal (HTML) | **MODIFIED** | Add disk space disclosure text | `extension/sidebar/sidebar.html` |
| Sidebar JS (storage check) | **MODIFIED** | Add `checkStorageForLLM()` + button disable | `extension/sidebar/sidebar.js` |
| manifest.json | **MODIFIED** | Permission justifications (dashboard only, not file) | `extension/manifest.json` (possibly minor wording tweak) |
| CWS Developer Dashboard | **NEW** | Permission justification text, privacy URL, data disclosure | External — no code |
| Store listing assets | **NEW** | 1280x800 screenshots, 440x280 promo image | External files — no code |
| Incognito verification | **VERIFICATION** | Manual test, no code changes expected | — |

---

## Data Flow Changes (v1.1 Additions)

### Storage Estimate Flow (new)

```
[User triggers consent modal]
  → sidebar.js: checkStorageForLLM()
      → navigator.storage.estimate()
          → { usage, quota }
              → if (quota - usage) < 450MB:
                  → disable #llm-enable-btn
                  → show "Insufficient storage: ~XMB available, ~400MB needed"
              → else:
                  → show normal consent modal
                      → user clicks "Enable AI"
                          → initializeLLM() (existing flow, unchanged)
```

### Privacy Policy Access Flow (new, external only)

```
[CWS reviewer / user]
  → opens https://<username>.github.io/<repo>/privacy-policy
      → static HTML page served by GitHub Pages
          → no extension code involved
```

---

## Build Order Recommendation

These tasks are independent of each other. Suggested sequencing based on risk and verification dependencies:

**Step 1 — Privacy policy (no code risk)**
Create and host the policy first. It can be submitted to the CWS dashboard immediately and refined later. This unblocks the dashboard submission flow.

**Step 2 — Disk space warning (low code risk)**
Modify `sidebar.html` to add static size disclosure to the consent modal. Add dynamic `checkStorageForLLM()` to `sidebar.js`. Manual test with the extension loaded. This is additive and does not change any existing behavior paths.

**Step 3 — Incognito verification (test, no code)**
Enable extension in incognito, run manual test checklist. If issues are found, address them before proceeding. Expected outcome: no code changes needed.

**Step 4 — CWS Dashboard submission**
Fill out all privacy fields, permission justifications, upload screenshots and promo image, provide privacy policy URL. Review against checklist.

**Step 5 — Store listing assets (external, non-blocking)**
Screenshots and promo image can be prepared in parallel with steps 1-3. They do not block code work.

---

## Anti-Patterns to Avoid

### Removing host_permissions for "Minimum Permissions"

**What people do:** Replace `host_permissions` with `activeTab` to reduce perceived permission surface, assuming it makes approval easier.

**Why it breaks:** `activeTab` is gesture-gated and does not allow auto-injected content scripts. The extension would stop capturing chat entirely.

**Do this instead:** Keep `host_permissions` and write a clear justification in the CWS dashboard explaining that the content script must auto-inject to observe chat DOM continuously.

### Adding connect-src to manifest for Remote Code

**What people do:** Add URLs to `connect-src` to allow fetching remote JavaScript logic.

**Why it breaks:** MV3 policy prohibits remote code execution. Fetching JS from `connect-src` and executing it is banned. CWS will reject.

**Do this instead:** All JS logic must be bundled in the extension package. The HuggingFace `connect-src` entries are for binary model download only (not JS execution) — this is permitted.

### Declaring `incognito: "split"` Without Reason

**What people do:** Set `"incognito": "split"` in `manifest.json` thinking it improves privacy.

**Why it breaks:** In split mode, the sidebar runs in a separate incognito process and cannot access the shared `chrome.storage` data from normal mode sessions. History Tab would be empty in incognito.

**Do this instead:** Leave the default `"spanning"` mode (omit the `incognito` key from manifest). Shared storage is the correct behavior for this extension.

### Showing Storage Warning After Download Starts

**What people do:** Show the disk space estimate after calling `initializeLLM()`, when it is too late to stop the download.

**Why it breaks:** Users may run out of space mid-download, causing a corrupted or incomplete model cache.

**Do this instead:** Call `navigator.storage.estimate()` before the user clicks "Enable AI", before `initializeLLM()` is ever called. Disable the button if insufficient space is detected.

---

## Integration Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Sidebar ↔ llm-adapter.js | Import + function calls | Disk space check lives in sidebar.js, not adapter; adapter's initializeLLM() is unchanged |
| sidebar.html ↔ sidebar.js | DOM events | Consent modal button events already wired; add storage check to existing handler |
| Extension ↔ GitHub Pages | None | Privacy policy is external; no in-extension link required |
| Extension ↔ CWS Dashboard | None (submission time only) | Justification text is dashboard metadata, not manifest fields |
| chrome.storage ↔ Incognito | Shared automatically | No code boundary; Chrome handles this transparently |

---

## Sources

- [Chrome Web Store: Privacy Policy Requirements](https://developer.chrome.com/docs/webstore/program-policies/privacy) — HIGH confidence
- [Chrome Web Store: Fill out the privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy) — HIGH confidence
- [Chrome Web Store: MV3 Additional Requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements) — HIGH confidence
- [Chrome Extensions: activeTab permission](https://developer.chrome.com/docs/extensions/mv3/manifest/activeTab/) — HIGH confidence
- [Chrome Extensions: Content Security Policy (MV3)](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy) — HIGH confidence
- [Chrome Extensions: Manifest - Incognito](https://developer.chrome.com/docs/extensions/reference/manifest/incognito) — HIGH confidence
- [Chrome Extensions: sidePanel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) — HIGH confidence (incognito behavior not documented; MEDIUM confidence on behavior inference)
- [Chrome for Developers: Estimating Available Storage Space](https://developer.chrome.com/blog/estimating-available-storage-space) — HIGH confidence
- [Chrome Extensions: Supplying Images (screenshots)](https://developer.chrome.com/docs/webstore/images) — HIGH confidence

---

*Architecture research for: CWS compliance integration — Chat Signal Radar v1.1*
*Researched: 2026-02-19*
