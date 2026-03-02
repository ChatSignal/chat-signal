---
title: Privacy Policy
permalink: /privacy-policy
---

# Privacy Policy for Chat Signal

**Last updated: March 2026**

Chat Signal is a Chrome extension that analyzes live chat on YouTube and Twitch. Here is a plain-English explanation of what happens with your data when you use it.

## What Chat Signal does with chat messages

When you have a YouTube or Twitch stream open, Chat Signal reads the live chat messages that are already visible on the page. It processes them locally in your browser to cluster questions, flag common issues, surface trending topics, and track the overall mood of chat.

Chat messages are processed entirely on your device. They are never sent to any server.

## What gets saved on your device

Session summaries are saved locally on your device using Chrome's storage. You can clear them from the History tab or by removing the extension.

Your settings — things like your analysis preferences and whether you have enabled AI summaries — are also saved locally.

## Model downloads from HuggingFace

Chat Signal uses two AI models, both downloaded from HuggingFace CDN and stored locally on your device. No chat content is sent to HuggingFace or anywhere else.

- **Encoder model (~23MB)**: A small model (MiniLM) used for semantic message clustering. This downloads automatically on first use and is cached locally.
- **Language model (~400MB, optional)**: A larger model (Qwen2.5-0.5B) used for AI-powered summaries and mood analysis. This is only downloaded if you choose to enable AI summaries in the consent dialog or settings.

Both models run entirely in your browser. After the initial download, they work offline.

If you enable AI summaries, the extension also downloads WebGPU shader files from GitHub (`raw.githubusercontent.com`). These are small runtime support files required by the AI inference engine. No user data is sent to GitHub.

## What Chat Signal does not collect

Chat Signal does not collect personal information. It does not track you across sites, run analytics, or share anything with third parties.

## Changes to this policy

We may update this policy. Check back for changes.

## Questions

For privacy questions, open an issue at: https://github.com/ChatSignal/chat-signal/issues
