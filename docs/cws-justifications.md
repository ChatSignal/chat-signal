# CWS Dashboard — Privacy Practices Reference

This document is the copy-paste source for the Chrome Web Store developer dashboard Privacy Practices tab. Each section corresponds to a field in the dashboard.

---

## Single Purpose Description

Chat Signal analyzes YouTube and Twitch live chat in real-time, clustering messages into categories, detecting trending topics, and tracking chat sentiment.

---

## Permission Justifications

### sidePanel

Shows the real-time chat analysis dashboard alongside the stream page so users can monitor chat insights while watching.

### storage

Saves user settings (analysis preferences, AI enablement choice) and session summaries to your local browser. All data stays on your device.

### host_permissions: youtube.com

Reads live chat messages from the YouTube page DOM to perform real-time message clustering, topic detection, and sentiment analysis. No data is transmitted off-device.

### host_permissions: twitch.tv

Reads live chat messages from the Twitch page DOM to perform real-time message clustering, topic detection, and sentiment analysis. No data is transmitted off-device.

### all_frames: true (content_scripts)

Required because YouTube serves live chat inside a same-origin iframe (`#chatframe`). The content script must run inside this iframe to observe new chat messages via MutationObserver. Without `all_frames: true`, the script cannot access the chat DOM reliably across all YouTube player configurations.

---

## Content Security Policy (CSP) Rationale

The extension's CSP is set in `manifest.json` under `content_security_policy.extension_pages`:

```
script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src 'self';
```

### script-src 'self' 'wasm-unsafe-eval'

- `'self'` — Extension scripts are loaded from the extension package only. No external script sources.
- `'wasm-unsafe-eval'` — Required for `WebAssembly.instantiate()`. Used by the Rust WASM analysis engine (chat clustering, topic extraction, sentiment analysis) and by the bundled Transformers.js / ONNX runtime that powers the on-device MiniLM encoder. Chrome MV3 documentation specifies `'wasm-unsafe-eval'` as the correct directive for WASM loading — `'unsafe-eval'` is not used and is not present.

### object-src 'self'

Default minimum for Manifest V3 extensions per Chrome documentation. No external object sources are used.

### connect-src 'self'

The extension makes **no external network connections**. All AI runs on-device:

- The **MiniLM encoder** (semantic clustering) is bundled in the extension package and loaded from the extension's own origin — no download.
- **AI summaries** use **Chrome's built-in AI (Gemini Nano)**, which is part of the browser and managed by Chrome; the extension does not fetch it.

`connect-src 'self'` permits only same-origin loads of the bundled model and runtime files. There are no third-party hosts in the policy, so no chat data or any other data can be sent off-device.

---

## Remote Code Declaration

No, I am not using remote code.

**Note:** All code and model files are bundled in the extension package and loaded locally; there are no runtime downloads of code or model weights. Manifest V3 prohibits remote code execution, and the extension performs none.

---

## Data Usage Checkboxes

### Group 1: Data types collected

- [x] **Website content** — The extension reads live chat messages from YouTube and Twitch pages. Chat text is publicly visible content on those pages.
- [x] **Browsing activity** — The host_permissions for youtube.com and twitch.tv mean the extension is active on those domains, which constitutes access to browsing activity data under CWS policy.

Not checked (and why):
- [ ] Personally identifiable information — No usernames, account details, or identifiers are stored or transmitted.
- [ ] Financial or payment information — Not applicable.
- [ ] Health information — Not applicable.
- [ ] Authentication information — Not applicable.
- [ ] Personal communications — Chat messages are public stream content, not private communications.
- [ ] User-generated content — The extension reads but does not store or transmit individual chat messages; only aggregated analysis results are retained.

### Group 2: Compliance certifications (Limited Use)

All four limited-use compliance statements apply and are checked:

- [x] **Allowed use** — Data is used only to provide the extension's core functionality (real-time chat analysis). No secondary uses.
- [x] **Allowed transfer** — Data is not transferred to third parties. Chat messages stay on-device, and the extension makes no external network connections at all (`connect-src 'self'`).
- [x] **Prohibited advertising** — No data is used for advertising, remarketing, or targeting purposes.
- [x] **Prohibited human interaction** — No human reads the chat data. All analysis is automated and runs locally in the browser.

---

## Privacy Policy URL

https://chatsignal.dev/privacy-policy
