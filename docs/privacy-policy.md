---
title: Privacy Policy
permalink: /privacy-policy
---

# Privacy Policy for Chat Signal

**Last updated: September 2026**

Chat Signal is a Chrome extension that analyzes live chat on YouTube and Twitch. Here is a plain-English explanation of what happens with your data when you use it.

## What Chat Signal does with chat messages

When you have a YouTube or Twitch stream open, Chat Signal reads the live chat messages that are already visible on the page. It processes them locally in your browser to cluster questions, flag common issues, surface trending topics, and track the overall mood of chat.

Chat messages are processed entirely on your device. They are never sent to any server.

## What gets saved on your device

Session summaries are saved locally on your device using Chrome's storage. You can clear them from the History tab or by removing the extension.

Your settings — things like your analysis preferences and whether you have enabled AI summaries — are also saved locally.

## AI models — on-device, no downloads

Chat Signal's AI runs entirely on your device, and the extension itself does **not** download any AI models from external servers:

- **Semantic clustering** uses a small encoder model (MiniLM, ~23MB) that ships **bundled inside the extension package**. It loads locally — nothing is fetched from the network.
- **AI summaries and mood analysis (optional)** use **Chrome's built-in AI (Gemini Nano)**, which is part of the Chrome browser and managed by Chrome — it is not downloaded or hosted by Chat Signal. When you enable AI summaries, chat text is processed on-device by Chrome's built-in model. If your browser or device doesn't support it, Chat Signal falls back to a simpler rule-based analysis.

In all cases, chat content is processed locally and is never sent to any server.

## What Chat Signal does not collect

Chat Signal does not collect personal information. It does not track you across sites, run analytics, or share anything with third parties.

## Changes to this policy

We may update this policy. Check back for changes.

## Questions

For privacy questions, open an issue at: https://github.com/ChatSignal/chat-signal/issues
