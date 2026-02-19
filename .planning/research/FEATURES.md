# Feature Research: Chrome Web Store Compliance

**Domain:** Chrome extension publication compliance
**Milestone:** v1.1 CWS Readiness
**Researched:** 2026-02-19
**Confidence:** HIGH (all claims verified against official Chrome developer documentation)

---

## Context

Chat Signal Radar is a fully functional MV3 Chrome extension with: real-time chat analysis (WASM/Rust), sentiment, topics, session history, WebLLM AI summaries (optional ~400MB model download), DOMPurify sanitization, and configurable thresholds. The existing manifest declares `sidePanel`, `storage`, `https://www.youtube.com/*`, and `https://www.twitch.tv/*` with a custom CSP that adds connect-src for Hugging Face CDN.

This research answers: what CWS compliance features are needed to pass review and publish?

---

## Table Stakes (Required to Pass Review)

These are not optional. Missing any of these results in rejection or suspension.

### 1. Privacy Policy — Publicly Hosted URL

**Why required:** CWS policy mandates a privacy policy if the extension handles any user data. Chat Signal Radar uses `chrome.storage.local` for session history and settings, and optionally caches a ~400MB AI model via IndexedDB. This qualifies as user data handling. A privacy policy URL must be entered in the Developer Dashboard before submission.

**What the policy must cover:**
- What data is stored locally (`chrome.storage.local`: session summaries, user settings)
- What the AI model download stores (IndexedDB cache via WebLLM, ~400MB)
- That no data is transmitted to remote servers (except model download from HuggingFace CDN, which is one-directional and user-initiated)
- That browsing activity (YouTube/Twitch URLs) is accessed only to power the stated feature
- How users can clear stored data (Chrome extension management → Clear data, or the "Clear All History" button)
- Data retention: session history capped at 50 sessions in local storage

**Where to host:** GitHub Pages is acceptable. The URL must be stable (not a raw GitHub blob). A dedicated `privacy-policy.md` rendered via GitHub Pages or a simple HTML file at a permanent URL works. The CWS does not restrict hosting platforms.

**Complexity:** LOW. Writing the document is the main work. Hosting on GitHub Pages is straightforward. No code changes.

**Dependencies:** None. Independent deliverable.

---

### 2. Permission Justifications — Developer Dashboard Form

**Why required:** The CWS Developer Dashboard has a mandatory "Permissions Justification" section where each declared permission must be explained. Reviewers use this to verify the minimum-permissions principle. Without justifications, the extension may be rejected.

**Current permissions that need justifications:**

| Permission | Justification to Write |
|------------|------------------------|
| `sidePanel` | Displays the chat analysis dashboard in Chrome's native side panel. The extension's entire UI lives here. |
| `storage` | Persists user settings (analysis thresholds, AI consent choice) and session history (up to 50 past sessions) using `chrome.storage.local`. |
| `https://www.youtube.com/*` | Content script reads the YouTube live chat DOM to extract messages for analysis. No data is sent remotely. |
| `https://www.twitch.tv/*` | Content script reads the Twitch live chat DOM to extract messages for analysis. No data is sent remotely. |

**Complexity:** LOW. Text-only form fields in the dashboard. No code changes.

**Dependencies:** None. Written during dashboard submission.

---

### 3. Privacy Dashboard Certification — Data Usage Checkboxes

**Why required:** The CWS Developer Dashboard requires checking which data types the extension collects. Incomplete or inaccurate data disclosure results in suspension after 30 days. The dashboard has checkboxes for: Personally Identifiable Information, Financial/Payment info, Health info, Authentication credentials, Website content, Web browsing activity, User activity, Website content, Personal communications, and Location.

**For Chat Signal Radar, the accurate disclosures are:**
- **Website content:** The content script reads chat message text from YouTube/Twitch DOM. This counts as website content access.
- **Web browsing activity:** Accessing chat on specific YouTube/Twitch URLs technically qualifies, even though the extension only operates on those sites and the data stays local.
- All other categories: Not collected.

**The certification must also state:** "This product does not sell or transfer user data to third parties outside of the approved use cases." This is true — the extension is fully local.

**Complexity:** LOW. Checkboxes in the dashboard. No code changes required, but requires careful reading of the data type definitions to avoid over- or under-disclosing.

**Dependencies:** Privacy policy must exist first (provides the document that backs up the certification).

---

### 4. Disk Space Warning Before WebLLM Model Download

**Why required:** Chrome developer documentation explicitly calls out that extensions must "alert the user to the time required to perform these downloads" for large model files. The existing LLM consent modal says "~400MB model" but does not warn about disk space requirements or that the download is stored persistently. This is a UX requirement backed by policy guidance, not a hard policy rule — but failing to disclose it clearly is a user data handling gap.

**What the existing modal already covers (already built):**
- Consent before download
- Size disclosure (~400MB)
- Local processing disclosure ("no data sent to servers")
- Opt-out path ("Skip for now")

**What is missing:**
- No explicit disk space requirement statement (e.g., "requires ~500MB free disk space")
- No statement that the model persists after download and is not re-downloaded on extension updates
- No progress indicator that surfaces during the actual download sequence (the consent modal disappears before download starts; what happens next is unclear in the UI)

**What to add:** One sentence added to the consent modal: "Requires ~500MB free disk space. The model is cached and not re-downloaded on extension updates." A download progress bar or status in the sidebar during the initialization sequence (WebLLM already has a progress callback — it just needs to be surfaced).

**Complexity:** LOW-MEDIUM. The consent modal text change is trivial. Surfacing the existing `initProgressCallback` in the sidebar UI requires connecting an existing callback to a progress indicator element. The `initializeLLM` function in `llm-adapter.js` already accepts a `progressCallback` parameter and the sidebar already calls it — the callback output just needs to display somewhere visible during loading.

**Dependencies:** None. Independent of other compliance work.

---

### 5. Store Listing Assets — Screenshots and Promotional Image

**Why required:** CWS requires at minimum 1 screenshot (1280x800 or 640x400 px) and 1 small promotional image (440x280 px). Extensions with no screenshots or a blank description are rejected at upload.

**What is needed:**
- **1-5 screenshots** at 1280x800 px (preferred) or 640x400 px. PNG format, full bleed (no padding or device frames required by policy, though device frames are common for aesthetics). Screenshots of the sidebar with live chat data: mood indicator active, trending topics populated, cluster buckets with messages, and the session history tab.
- **1 small promotional image** at 440x280 px. A branded graphic (not a screenshot) showing the extension name and purpose. Required for listing display.
- **1 marquee promotional image** at 1400x560 px (optional, required only if seeking featured placement — skip for initial submission).
- **Extension icon** at 128x128 px PNG. The existing icons (16px, 48px, 128px) appear to already exist per `manifest.json`. The 128px icon must work on both light and dark backgrounds.

**Complexity:** LOW. Image creation/capture work. No code changes. Requires taking screenshots with realistic-looking data in the sidebar.

**Dependencies:** The extension must be running with populated data to take good screenshots. This is the last step.

---

### 6. Manifest Version Number Increment

**Why required:** The current manifest has `"version": "0.1.0"`. CWS requires the version field to be a standard Chrome extension version format (1-4 dot-separated integers, e.g., `"1.1.0"`). Using `"0.1.0"` is technically valid but starting at `1.1.0` for the CWS submission establishes a sensible public version baseline. Each subsequent submission must increment.

**Complexity:** TRIVIAL. One field in manifest.json.

**Dependencies:** None. Do last, right before zipping for submission.

---

### 7. Incognito Mode Behavior — Verification and Documentation

**Why required:** Not a hard submission requirement, but a known failure mode. If the extension behaves incorrectly in incognito (crashes, fails silently, loses state) and users report it, reviews can result in suspension. The CWS does not require incognito compatibility, but the default incognito behavior for this extension needs to be understood and documented.

**How the extension behaves in incognito (based on Chrome documentation):**

The extension does not declare an `incognito` key in the manifest, so it defaults to `"spanning"` mode. In spanning mode, the extension runs in a single shared process. `chrome.storage.local` and `chrome.storage.sync` are always shared between regular and incognito processes — session history persists and settings are shared.

**Specific risks to verify:**
- **sidePanel in incognito:** The sidePanel API works in incognito if the extension is allowed. Since the extension uses spanning mode, the same sidebar process serves both regular and incognito tabs. Verify the sidebar opens correctly on an incognito YouTube/Twitch tab.
- **Content script in incognito:** Content scripts run in incognito if the user has enabled the extension in incognito. The `all_frames: true` setting applies. This should work without changes.
- **WebLLM/IndexedDB in incognito:** IndexedDB in incognito is isolated per-session (cleared when the incognito window closes). If the user enabled AI in a normal window, the IndexedDB cache will not be available in incognito — the model will need re-initializing or the fallback will be used. This is expected behavior and acceptable.
- **WASM loading in incognito:** WASM loaded from extension resources (`chrome.runtime.getURL`) works in incognito with no changes.

**What to do:** Manual verification pass (open incognito, navigate to YouTube/Twitch live stream, open sidebar, verify clustering and sentiment work, verify session history is accessible, verify AI gracefully falls back). No code changes expected, but document findings.

**Complexity:** LOW. Manual testing, no code changes unless a bug is found.

**Dependencies:** Requires the extension to be in a testable state.

---

### 8. CSP and connect-src Review — Hugging Face CDN Risk

**Why required:** The current CSP in manifest.json includes:
```
connect-src https://huggingface.co https://cdn-lfs.huggingface.co https://raw.githubusercontent.com;
```

In MV3, `connect-src` (as a fetch/XHR directive, not script-src) is permitted for external URLs. The restriction that caused MV3 confusion was on `script-src` loading remote code — `connect-src` for data fetching is allowed. The WebLLM model download fetches model weights from Hugging Face CDN; this is a data fetch, not remote code execution. This pattern is used by other published extensions (WebextLLM is live on the CWS using a similar pattern).

**Risk assessment:** LOW. The CSP is valid. However, during the permissions justification step, the dashboard may surface `connect-src` origins as network access. Be prepared to justify: "Model weights (~400MB) are fetched from Hugging Face CDN on first AI feature use. Download is user-initiated, gated by consent modal. No user data is transmitted — the fetch is one-directional (download only)."

**Complexity:** TRIVIAL. No code changes. Prepare the written justification.

**Dependencies:** None.

---

## Differentiators (Strengthen Review Outcome, Not Required)

These go beyond bare minimums and make the listing more compelling or reduce review friction.

### A. Privacy Policy Link Inside the Extension UI

**Value:** CWS policy requires prominent disclosure when handling data not "closely related to the extension's described functionality." Linking to the privacy policy from inside the extension sidebar or options page reduces reviewer friction and demonstrates transparency. Other extensions that include in-UI privacy links rarely face suspension for disclosure issues.

**What to add:** A "Privacy Policy" link in the sidebar footer next to the existing "Feedback" and "Settings" links.

**Complexity:** LOW. One anchor tag in `sidebar.html`, one URL.

**Dependencies:** Privacy policy URL must exist (Table Stakes #1).

---

### B. Single Purpose Description Optimized for Review

**Value:** The CWS policy requires a "single purpose" that is "narrow and easy to understand." The current manifest description is: "Clusters YouTube/Twitch live chat messages into top questions, issues, and requests." This is accurate but incomplete (omits sentiment, topics, session history). A reviewer seeing features not mentioned in the description can flag them as beyond scope.

**Better description (under 132 chars):** "Real-time live chat analysis for YouTube and Twitch streams: clusters messages, tracks sentiment, and highlights trending topics."

This frames all features as expressions of one purpose (chat analysis), satisfying the single-purpose rule. Clustering, sentiment, topics, and session history are all facets of chat analysis — not separate unrelated functions.

**Complexity:** TRIVIAL. One field in manifest.json and the dashboard.

**Dependencies:** None.

---

### C. Test Instructions for Reviewers

**Value:** The CWS submission includes a "Test Instructions" field where you explain how reviewers can exercise the extension. Extensions requiring specific site configurations (live stream active, chat messages flowing) are hard for reviewers to test. Providing a test YouTube stream URL or instructions prevents rejection due to "unable to verify functionality."

**What to write:** Point to a YouTube live stream that is reliably active (e.g., a 24/7 news channel or a major gaming streamer). Explain that the sidebar populates after ~10 chat messages arrive. Note that AI features are optional and require enabling in the modal.

**Complexity:** TRIVIAL. Text field in dashboard.

**Dependencies:** None.

---

## Anti-Features (Do Not Build for This Milestone)

### X. In-Extension Privacy Policy Page

**Why not:** Building a custom HTML privacy policy page within the extension itself (a separate `privacy.html`) is unnecessary. The CWS requires a publicly accessible URL — an internal extension page cannot be linked from the dashboard. Host externally on GitHub Pages. An extension-internal page adds zero compliance value and duplicates content.

---

### Y. unlimitedStorage Permission

**Why not:** `unlimitedStorage` would allow bypassing Chrome's default storage quota. The extension does not need it: `chrome.storage.local` has a 10MB default (sufficient for 50 sessions of text data), and the WebLLM model uses IndexedDB which operates under browser quota management, not extension storage quota. Requesting `unlimitedStorage` would be a red flag for reviewers (over-permissioning) and would require explicit justification that the extension cannot provide honestly.

---

### Z. Remote Code Execution / Dynamic Import from External URLs

**Why not:** MV3 prohibits executing remotely hosted code. The current architecture is correct (WASM compiled from Rust, bundled in the extension). The WebLLM model weights are data, not code, which is permissible. Do not add any pattern that fetches JavaScript from an external URL and executes it (`eval`, `new Function`, or dynamic `import()` from a non-extension URL). This would trigger rejection.

---

## Feature Dependencies

```
Privacy Policy URL (hosted externally)
    └──required by──> Dashboard Privacy Certification
    └──required by──> Privacy Policy Link in UI (differentiator)

Permission Justifications
    └──written during──> Dashboard submission (no code dependency)

Disk Space Warning (consent modal text update)
    └──enhances──> WebLLM Download Progress (surfacing existing callback)

Store Listing Screenshots
    └──requires──> Extension in working state with populated data

Manifest Version Increment
    └──final step before──> ZIP packaging for submission
```

### Dependency Notes

- **Privacy policy before dashboard certification:** The certification form asks for the URL — write the policy first, deploy it, then fill in the dashboard.
- **Screenshots last:** Take screenshots after all compliance changes are in, so the UI reflects the final state reviewers will see.
- **Version increment is irreversible:** Once submitted, the version cannot be reused. Increment only on the final submission build.

---

## MVP Definition (This Milestone)

### Must Ship for Submission

- [ ] Privacy policy written and hosted at a public URL — blocks dashboard submission
- [ ] Permission justifications written (sidePanel, storage, host_permissions) — blocks submission
- [ ] Dashboard data usage checkboxes filled accurately — blocks submission
- [ ] Store listing description updated (132 chars, accurate single-purpose framing) — blocks submission
- [ ] Screenshots captured (at least 1 at 1280x800) — blocks submission
- [ ] Promotional image created (440x280 px) — blocks submission
- [ ] Disk space warning added to WebLLM consent modal — CWS policy-adjacent requirement
- [ ] WebLLM download progress surfaced in sidebar UI — disclosure best practice
- [ ] Incognito mode verified manually — prevents post-launch suspension
- [ ] Manifest version incremented to 1.1.0 — required before ZIP

### Add If Time Allows

- [ ] Privacy policy link in sidebar footer (differentiator A) — reduces review friction
- [ ] Test instructions written for reviewers (differentiator C) — reduces review friction for reviewers who hit an idle stream

### Explicit Deferrals

- Marquee promotional image (1400x560) — only needed if seeking featured placement; skip for initial submission
- In-extension privacy page — unnecessary overhead
- unlimitedStorage permission — not needed, would trigger over-permissioning concern

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Privacy policy (hosted) | Required for legal compliance | LOW (writing + deploy) | P1 |
| Permission justifications | Required for submission | LOW (text only) | P1 |
| Data usage certification | Required for submission | LOW (checkboxes) | P1 |
| Store listing description fix | Required; reduces rejection risk | TRIVIAL | P1 |
| Screenshots (1 minimum) | Required for submission | LOW (capture) | P1 |
| Promotional image 440x280 | Required for submission | LOW (design) | P1 |
| Disk space warning in modal | Policy-adjacent; user trust | LOW (text change) | P1 |
| WebLLM progress in UI | User transparency; policy guidance | MEDIUM (connect callback to UI) | P1 |
| Manifest version 1.1.0 | Required (wrong format blocks) | TRIVIAL | P1 |
| Incognito verification | Prevents post-launch suspension | LOW (testing) | P1 |
| Privacy link in UI | Reduces reviewer friction | LOW (one anchor) | P2 |
| Test instructions for reviewers | Reduces rejection from untestable state | LOW (text) | P2 |

**Priority key:**
- P1: Required for publication — extension cannot be submitted without it
- P2: Strongly recommended — reduces rejection risk and post-launch issues
- P3: Future consideration — not relevant for this milestone

---

## Sources

- [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies)
- [Fill Out Privacy Fields — CWS Dashboard](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Privacy Policies — CWS Program Policy](https://developer.chrome.com/docs/webstore/program-policies/privacy)
- [Updated Privacy & Secure Handling — Developer FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Manifest — Incognito Key](https://developer.chrome.com/docs/extensions/reference/manifest/incognito)
- [Supplying Images — CWS](https://developer.chrome.com/docs/webstore/images)
- [Prepare Your Extension](https://developer.chrome.com/docs/webstore/prepare)
- [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish)
- [Extensions and AI](https://developer.chrome.com/docs/extensions/ai)
- [Inform Users of Model Download](https://developer.chrome.com/docs/ai/inform-users-of-model-download)
- [Manifest — Content Security Policy](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)
- [Quality Guidelines FAQ — Single Purpose](https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq)
- [Best Practices and Guidelines](https://developer.chrome.com/docs/webstore/program-policies/best-practices)
- [CWS Policy Updates 2025](https://developer.chrome.com/blog/cws-policy-updates-2025)
- [WebextLLM — Published CWS extension using large model](https://chromewebstore.google.com/detail/webextllm/chbepdchbogmcmhilpfgijbkfpplgnoh)

---
*Feature research for: Chrome Web Store compliance — Chat Signal Radar v1.1*
*Researched: 2026-02-19*
