# CWS Dashboard — Privacy Practices Reference

This document is the copy-paste source for the Chrome Web Store developer dashboard Privacy Practices tab. Each section corresponds to a field in the dashboard.

---

## Single Purpose Description

Chat Signal Radar analyzes YouTube and Twitch live chat in real-time, clustering messages into categories, detecting trending topics, and tracking chat sentiment.

---

## Permission Justifications

### sidePanel

Shows the real-time chat analysis dashboard alongside the stream page so users can monitor chat insights while watching.

### storage

Saves user settings (analysis preferences, AI consent choice) and session summaries to your local browser. All data stays on your device.

### unlimitedStorage

Stores the optional AI model (~400MB) in IndexedDB after a one-time download. The standard storage quota is too small for model weights this size.

### host_permissions: youtube.com

Reads live chat messages from the YouTube page DOM to perform real-time message clustering, topic detection, and sentiment analysis. No data is transmitted off-device.

### host_permissions: twitch.tv

Reads live chat messages from the Twitch page DOM to perform real-time message clustering, topic detection, and sentiment analysis. No data is transmitted off-device.

---

## Content Security Policy (CSP) Rationale

The extension's CSP is set in `manifest.json` under `content_security_policy.extension_pages`:

```
script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src https://huggingface.co https://cdn-lfs.huggingface.co https://raw.githubusercontent.com;
```

### script-src 'self' 'wasm-unsafe-eval'

- `'self'` — Extension scripts are loaded from the extension package only. No external script sources.
- `'wasm-unsafe-eval'` — Required for `WebAssembly.instantiate()`. Both the Rust WASM analysis engine (chat clustering, topic extraction, sentiment analysis) and the optional WebLLM model inference use this API. Chrome MV3 documentation specifies `'wasm-unsafe-eval'` as the correct directive for WASM loading — `'unsafe-eval'` is not used and is not present.

### object-src 'self'

Default minimum for Manifest V3 extensions per Chrome documentation. No external object sources are used.

### connect-src entries

All three connect-src domains support the optional AI summarization feature (WebLLM). When AI is not enabled by the user, no external connections are made — the extension operates entirely on-device.

- `https://huggingface.co` — WebLLM fetches model configuration and metadata from the HuggingFace model hub (e.g., model card JSON, tokenizer config).
- `https://cdn-lfs.huggingface.co` — WebLLM downloads ONNX model weight files from HuggingFace's large file storage CDN. These are binary tensor data files, not executable code.
- `https://raw.githubusercontent.com` — WebLLM fetches WebGPU shader WASM files from the `mlc-ai/binary-mlc-llm-libs` GitHub repository. Confirmed in use at `libs/web-llm/index.js` via the `modelLibURLPrefix` constant: `https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/`.

**Note:** All connect-src entries support the optional AI features. Without AI enabled, no external connections are made. Model weights are binary tensor data, not executable code.

---

## Remote Code Declaration

No, I am not using remote code.

**Note:** The optional HuggingFace download delivers ONNX model weights (binary tensor data), not executable code. Manifest V3 prohibits remote code execution, and model weights do not constitute remote code.

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
- [x] **Allowed transfer** — Data is not transferred to third parties. Chat messages stay on-device. The only external transfer is the optional HuggingFace model download, which sends no user data.
- [x] **Prohibited advertising** — No data is used for advertising, remarketing, or targeting purposes.
- [x] **Prohibited human interaction** — No human reads the chat data. All analysis is automated and runs locally in the browser.

---

## Privacy Policy URL

https://chatsignal.dev/privacy-policy
