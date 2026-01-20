# Privacy Policy for Chat Signal Radar

**Last Updated:** January 2025

## Overview

Chat Signal Radar is a Chrome extension that analyzes YouTube and Twitch live chat in real-time. This privacy policy explains what data the extension collects, how it's used, and your choices.

## Data Collection

### What We Collect

**Locally Processed (never transmitted):**
- Live chat messages from YouTube and Twitch streams you visit
- Analysis results (sentiment, topics, message clusters)
- Session summaries you choose to save

**Stored on Your Device:**
- User preferences and settings (Chrome sync storage)
- Session history summaries (Chrome local storage, up to 50 sessions)
- AI model cache if you enable AI summaries (IndexedDB)

### What We Do NOT Collect

- We do **not** collect personal information
- We do **not** track your browsing history
- We do **not** transmit chat content to external servers
- We do **not** sell or share any data with third parties
- We do **not** use analytics or tracking services

## Data Processing

All chat analysis happens **locally in your browser** using WebAssembly. Messages are:
1. Observed from the chat DOM on YouTube/Twitch pages
2. Processed locally by the WASM engine for clustering and sentiment
3. Displayed in the extension sidebar
4. Discarded after the session (unless you save a summary)

## Network Requests

The extension only makes external network requests in one scenario:

**If you enable AI Summaries:**
- Downloads a ~400MB language model from `huggingface.co`
- This is a one-time download, cached locally for offline use
- No chat content is ever sent to these servers

**If you disable AI Summaries:**
- The extension makes zero external network requests
- All functionality works completely offline

## Data Storage

| Data | Storage Location | Retention |
|------|------------------|-----------|
| Settings | Chrome sync storage | Until you clear or uninstall |
| Session history | Chrome local storage | Up to 50 sessions, manually deletable |
| AI model cache | IndexedDB | Until you clear browser data |

## Your Controls

You can:
- **Disable AI summaries** in Settings to prevent any network requests
- **Clear session history** from the History tab
- **Reset settings** to defaults from the Settings page
- **Uninstall the extension** to remove all stored data

## Permissions Explained

| Permission | Why It's Needed |
|------------|-----------------|
| `sidePanel` | Display the analysis dashboard |
| `storage` | Save your settings and session history |
| `host_permissions` (YouTube/Twitch) | Read chat messages from these sites |

## Children's Privacy

This extension is not directed at children under 13. We do not knowingly collect data from children.

## Changes to This Policy

We may update this privacy policy occasionally. Changes will be noted with an updated "Last Updated" date.

## Contact

For privacy questions or concerns, please open an issue at:
https://github.com/johnzilla/chat-signal-radar/issues

## Summary

**Chat Signal Radar processes everything locally. Your chat data stays on your device and is never transmitted to us or any third party.**
