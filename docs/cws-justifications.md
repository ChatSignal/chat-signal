# CWS Dashboard — Privacy Practices Reference

This document is the copy-paste source for the Chrome Web Store developer dashboard Privacy Practices tab. Each section corresponds to a field in the dashboard.

---

## Single Purpose Description

Chat Signal Radar analyzes YouTube and Twitch live chat in real-time, clustering messages into categories, detecting trending topics, and tracking chat sentiment.

---

## Permission Justifications

### sidePanel

Shows the real-time chat analysis dashboard alongside the stream page so creators can monitor chat while watching.

### storage

Saves user settings (analysis preferences, AI consent choice) and session summaries to your local browser. All data stays on your device.

### unlimitedStorage

Stores the optional AI model (~400MB) in IndexedDB after a one-time download. The standard storage quota is too small for model weights this size.

**Note: Added to manifest in Phase 5 — paste into dashboard after manifest update.**

### host_permissions: youtube.com

Reads live chat messages from the YouTube page DOM to perform real-time message clustering, topic detection, and sentiment analysis. No data is transmitted off-device.

### host_permissions: twitch.tv

Reads live chat messages from the Twitch page DOM to perform real-time message clustering, topic detection, and sentiment analysis. No data is transmitted off-device.

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
