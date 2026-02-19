# Features Research: Configurable Analysis Thresholds

**Research type:** Project Research — Features dimension
**Milestone context:** Subsequent milestone — improving analysis accuracy and user configurability
**Date:** 2026-02-19
**Question:** What features do chat analysis tools and Chrome extensions typically offer for user-configurable analysis parameters? What's table stakes vs differentiating?

---

## Research Summary

Chat Signal Radar already has a settings page with five configurable parameters: `topicMinCount` (default 5), `spamThreshold` (default 3), `duplicateWindow` (default 30s), `sentimentSensitivity` (default 3), and `moodUpgradeThreshold` (default 30). The inactivity timeout (2 minutes) and rolling window size (last 100 messages) are currently hardcoded constants. The question is which of the four proposed additions are table stakes, which are differentiators, and what to avoid.

**Key finding:** The market for in-browser real-time chat analytics for small-to-mid streamers is sparse. Competitors (StreamsCharts, Ex Machina Chat Decoder) are enterprise or post-hoc tools aimed at brands, not individual creators sitting in a stream. The Chrome extension space has nothing directly comparable. This means the bar for "table stakes" is lower, but also that user expectations come from adjacent tools (chatbots, moderation tools) that do expose these controls.

---

## Table Stakes (Must-Have or Users Leave)

These are features users expect to find or will be blocked without. Absence causes confusion or distrust in results.

### 1. Sentiment Sensitivity Threshold

**What it is:** The minimum number of sentiment signals required before declaring a non-neutral mood. Currently `sentimentSensitivity: 3` (already shipped).

**Expected behavior:** Low values (1-2) make the mood indicator reactive, good for slow chats. High values (5-10) require more evidence before flipping mood, good for fast chats where noise is high. Users with 50-viewer streams see fewer messages per minute and need lower thresholds to get any signal at all. Users with 50K-viewer streams need higher thresholds to prevent false positives from individual bad actors.

**Why table stakes:** Without this, small streamers see "neutral" forever (too few messages to hit threshold) or large streamers see wild mood swings from 3 messages in a 50K-message window. Either outcome breaks trust in the tool. Moderation tool research confirms: "adjust your auto-mod thresholds by channel, as a livestream with hundreds of messages per minute may need stricter filters than a private 1:1 chat."

**Current state:** Already exists as `sentimentSensitivity` in settings. The `moodUpgradeThreshold` (score required to upgrade to excited/angry) also ships.

**Complexity:** Low. Parameter already threads through the codebase to `computeFallbackSentiment`. No new code paths needed for the parameter itself; only UX/documentation work remains.

**Dependencies:** None. Independent parameter.

---

### 2. Topic Minimum Count

**What it is:** How many times a word must appear before it shows in the Trending Topics section. Currently `topicMinCount: 5` (already shipped).

**Expected behavior:** Small streams (50 viewers) might generate only 20 messages per analysis window. A min-count of 5 means a word needs 25% frequency to appear — nearly impossible. A min-count of 2 or 3 is more useful. Large streams (50K viewers) generate hundreds of messages; min-count of 5 might surface noise. A min-count of 10-15 filters better.

**Why table stakes:** If topics are always empty for small streamers, or always full of single-character emotes for large streamers, the panel is useless and users close it. Competing tools like StreamsCharts allow keyword filtering as a core feature. The WASM function `extract_topics` already accepts `min_count` as a parameter.

**Current state:** Already exists as `topicMinCount` in settings, already passed to `analyze_chat_with_settings`. This is shipped.

**Complexity:** Low. Already fully implemented.

**Dependencies:** Analysis window size (below). These two parameters interact: a larger window with a fixed min-count means more messages, so topics appear more easily. If you make window size configurable, the effective behavior of min-count changes.

---

### 3. Inactivity Timeout

**What it is:** How long without new messages before prompting "Stream ended? Save your session?" Currently hardcoded at `INACTIVITY_TIMEOUT = 120000` (2 minutes) in both `sidebar.js` and `StateManager.js`.

**Expected behavior:** 2 minutes is right for active streams. But scheduled breaks, ad breaks, or "BRB screens" are typically 3-10 minutes on Twitch/YouTube. Streamers frequently go to AFK for longer. A hardcoded 2-minute timeout means false "stream ended?" prompts during every bathroom break, annoying users and training them to dismiss the prompt — defeating its purpose.

**Standard industry practice:** Live chat applications default to 10-minute session timeouts. Hybrid approaches (idle timeout + absolute timeout) are common. For streaming context, 5 minutes as default with user range of 1-15 minutes covers nearly all real cases.

**Why table stakes:** Frequent false positives from a too-short timeout erode trust in the prompt. When it fires at the wrong time repeatedly, users stop responding to it when it fires correctly. This makes the "Smart Session Detection" feature (already shipped as a roadmap item) unreliable.

**Current state:** Hardcoded constant. Not exposed in settings. This is the primary gap.

**Complexity:** Low-Medium. Two code locations need to read from settings instead of a constant: `sidebar.js` line 111 (`INACTIVITY_TIMEOUT = 120000`) and `StateManager.js` line 53 (`this.INACTIVITY_TIMEOUT = 120000`). Must add field to `DEFAULT_SETTINGS` in both `options.js` and `sidebar.js`, add UI slider to options page, and validate the setting is read before `startInactivityCheck()` is called. The synchronization between `sidebar.js` and `StateManager.js` is a mild risk — both currently define the constant independently.

**Dependencies:** Must be loaded from settings before session starts. Settings load is already async on startup (line 208-209 in `sidebar.js`). No new async patterns needed.

---

## Differentiators (Competitive Advantage)

These features go beyond what the adjacent market offers. Building them well creates clear differentiation. Building them poorly adds confusion.

### 4. Analysis Window Size

**What it is:** How many recent messages are included in each analysis pass. Currently hardcoded at `MAX_MESSAGES = 100` in `StateManager.js` line 51.

**Expected behavior:**
- **Time-based window** (e.g., "analyze the last 60 seconds of messages"): Matches how humans experience a conversation. Intuitive to describe. Hard to implement in WASM because timestamps must be compared, and message arrival rate is variable. Already somewhat addressed via `duplicate_window_ms` parameter.
- **Count-based window** (e.g., "analyze the last N messages"): Already how the codebase works (`MAX_MESSAGES = 100`). Simpler to implement but unintuitive to users — "100 messages" means very different things at different chat velocities.

**Why differentiating:** No comparable Chrome extension exposes this. StreamsCharts and Ex Machina use server-side processing with fixed windows suited to enterprise workloads, not per-user tuning. Offering count-based tuning (50/100/200/500 messages) gives streamers a vocabulary for matching tool behavior to their chat velocity. A 200-person stream and a 20K-person stream need fundamentally different windows.

**Interaction with topic min-count:** These two settings interact directly. A larger window means more messages, so a fixed `topicMinCount` of 5 is relatively less selective. If both are configurable, users must understand the relationship. This is a UX complexity cost.

**Complexity:** Medium. `StateManager.js` `MAX_MESSAGES` is used in the message accumulation slice (line 158-159). Needs to read from settings. Also impacts session-wide stats accumulation (separate from rolling analysis window — need to be careful not to conflate them). The WASM `analyze_chat_with_settings` function already accepts the messages array, so no Rust changes needed. The main work is:
1. Add `analysisWindowSize` to `DEFAULT_SETTINGS`
2. Pass it to `StateManager` at settings load time
3. Add UI slider to options page
4. Test that session-wide sentiment accumulation (which uses a different path) is not accidentally affected

**Recommendation:** Build this, but expose it with preset labels ("Small stream (50 msgs)", "Medium (100 msgs)", "Large (200 msgs)") rather than a raw number slider. This prevents users from setting 5 and getting empty topics permanently.

**Dependencies:** Depends on settings infrastructure being solid. Interacts with topic min-count (see above).

---

## Anti-Features (Deliberately Not Build)

These are features that look attractive but would harm the product, user experience, or maintainability.

### A. Time-Based Analysis Window (Seconds)

**Why not:** A time-based window (e.g., "analyze the last 60 seconds") requires the sidebar to track message arrival timestamps relative to wall clock time and trim the array on each analysis pass by time rather than count. This works fine in Apache Flink or Kafka Streams (which have native windowing primitives) but in a Chrome extension service worker context, it adds meaningful complexity for minimal user benefit. Users cannot calibrate "60 seconds of messages" mentally — they think in terms of chat velocity, not absolute time. The count-based window already in the codebase (`MAX_MESSAGES`) is more practically useful and simpler to expose.

**Exception:** The `duplicateWindow` (already configurable, operates in ms) is time-based and is fine for its narrow spam-detection purpose. That purpose requires time because the same user spamming at 5-second intervals is different from 5 identical messages from 5 users.

---

### B. Per-Category Sensitivity (Questions vs. Issues vs. Requests)

**Why not:** Each cluster bucket (Questions, Issues/Bugs, Requests) uses keyword lists in the Rust WASM engine. Exposing per-bucket sensitivity would require: (a) exposing those keyword lists to users, (b) per-bucket threshold settings, and (c) significant UI to explain what each threshold means. This is a power-user feature with high explanation cost and low payoff for the target user (a streamer glancing at a sidebar). Moderator-specific tools are already flagged in the roadmap as a "Future Ideas" item, which is the correct placement.

---

### C. Custom Sentiment Keyword Lists

**Why not:** The roadmap already explicitly lists "User-configurable sentiment keywords" as a future idea, not a next-up feature. Building this now requires:
- A UI for managing arbitrary keyword lists
- Validation that lists are non-empty and don't conflict
- Rebuilding or parameterizing the WASM engine to accept dynamic word lists (currently `POSITIVE_WORDS`, `NEGATIVE_WORDS`, `CONFUSED_INDICATORS` are compile-time constants in Rust)
- Storage for potentially large user-defined lists

This is 5-10x the complexity of any other setting on this list and targets a different user archetype (power users who understand NLP) than the target user (streamers who want a dashboard that works). Build it later, behind a "Custom keywords" section that is clearly labeled as advanced.

---

### D. Separate Settings per Stream/Channel

**Why not:** Storing per-channel settings (e.g., "use sensitivity=2 on my small alt account, sensitivity=6 on my main") requires keying settings by channel URL or channel ID. `chrome.storage.sync` has a 100KB quota and per-item limits. Managing a settings namespace per channel adds significant state management complexity and a settings UI that must know which channel is active. The value is real but the implementation cost is high. The correct stepping stone is a "preset" system (Small/Medium/Large stream profile) that the user applies manually.

---

## Feature Interaction Map

```
analysisWindowSize (new)
    ↕ interacts (larger window = easier to hit threshold)
topicMinCount (existing, shipped)

sentimentSensitivity (existing, shipped)
    ↕ interacts (more messages in window = more signals available)
analysisWindowSize (new)

inactivityTimeout (new — expose existing constant)
    → independent of all analysis parameters

duplicateWindow (existing, shipped)
    → operates in time domain, independent of count-based window
```

---

## Implementation Priority Order

Given the interactions and complexity assessments:

1. **Inactivity Timeout** — expose hardcoded constant, zero new logic, immediate user value for streamers with breaks/BRB screens. Low complexity, no dependencies.
2. **Analysis Window Size** — medium complexity, clear differentiator, use preset labels not raw slider. Depends on settings infrastructure (already solid).
3. **Sentiment Sensitivity** and **Topic Min Count** — already shipped. Documentation and default value tuning only.

The four settings proposed in the milestone context map cleanly to: two already shipped (sensitivity, topic min count), one needing exposure (inactivity timeout), one differentiating and worth building (window size).

---

## Sources

- [Chat Analyzer: Track Twitch, YouTube & Kick Mentions - Streams Charts](https://streamscharts.com/tools/chat-analyzer)
- [Understanding Twitch Chat: Analyzing Hype and Sentiment with Ex Machina's Chat Decoder](https://www.exmachinagroup.com/case-study/twitch-chat-decoder)
- [10 Essential Chat Moderation Tools - GetStream](https://getstream.io/blog/chat-moderation-tools/)
- [A guide to windowing in stream processing - Quix](https://quix.io/blog/windowing-stream-processing-guide)
- [How to Build Window Functions - OneUptime](https://oneuptime.com/blog/post/2026-01-30-stream-processing-window-functions/view)
- [Real-time Twitch chat sentiment analysis with Apache Flink - Towards Data Science](https://towardsdatascience.com/real-time-twitch-chat-sentiment-analysis-with-apache-flink-e165ac1a8dcf/)
- [Session Window - RisingWave](https://risingwave.com/glossary/session-window/)
- [Idle Session Timeout Best Practice - TIMIFY](https://blog.timify.com/session-timeout-set-up-best-practice-protection-with-timify/)
- [Twitch-Chat-Analyzer (GitHub - wredan)](https://github.com/wredan/Twitch-Chat-Analyzer)
- [Feature Creep Anti-Pattern - Develpreneur](https://develpreneur.com/the-feature-creep-anti-pattern/)
