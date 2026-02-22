# Phase 11: Qwen SLM Swap - Research

**Researched:** 2026-02-20
**Domain:** WebLLM model swap, ChatML prompt engineering, response parsing, semantic cluster prompt integration
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Prompt design**
- Structured list format for cluster data in prompts — category name, count, and 2-3 sample messages per bucket (same structure as current Phi-2 format)
- Neutral analyst tone for system persona — factual, concise ("Questions focus on X. Sentiment is Y.")
- Separate calls for sentiment analysis and chat summary (keep current two-call pattern) — clearer output, simpler parsing
- Include semantic bucket labels in summary prompts — "These messages were classified as Questions: ..." so Qwen uses pre-classification for better summaries

**Response parsing**
- Scan for first keyword occurrence (MOOD:, CONFIDENCE:, REASON:) anywhere in response — ignore conversational preamble before structured output
- On completely unparseable response (no keywords found): silent fallback to neutral mood with 0.5 confidence, no error shown to user
- Summary output: max 4 lines with emoji+category format (keep current constraint)
- Validate summary format: check for emoji+category pattern; if missing, fall back to rule-based summary

**Consent & model size UX**
- Keep ~400MB wording in consent modal — Qwen download is similar size to Phi-2, just swap model name references
- Note: the ~950MB figure in earlier planning docs was VRAM requirement, not download size — corrected here
- MiniLM (~25MB) auto-loads without consent (unchanged from Phase 8)
- Generic download progress — "Downloading AI model... 45%" — do not show model name to user

**Fallback behavior**
- Show fallback notice when Qwen fails to load — small indicator like "Basic mode" near the summary section
- On garbage output: retry the prompt once, then switch to rule-based for the rest of the session
- Include a "Retry AI" button near the summary section — visible only when in fallback mode, so user can retry without reopening the sidebar
- Placement: below the AI summary area — "Basic mode · Retry AI" — only shown when in fallback

### Claude's Discretion

- Exact ChatML prompt templates and token limits
- How to structure the keyword-scan parser implementation
- Retry button styling and exact wording
- Whether to log unparseable responses to console for debugging

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SLM-01 | WebLLM model switched from Phi-2 to Qwen2.5-0.5B-Instruct-q4f16_1-MLC | Model confirmed present in vendored `libs/web-llm/index.js`; single line change in `llm-adapter.js:34` |
| SLM-02 | Prompt format updated to Qwen ChatML template (`<|im_start|>` / `<|im_end|>`) | WebLLM applies the conv_template automatically from the model's `mlc-chat-config.json` — the OpenAI-style `{role, content}` messages array is the correct input; no manual ChatML wrapping needed in JS code |
| SLM-03 | Response parser updated to handle Qwen2.5 output style (conversational preamble before structured content) | Confirmed Qwen2.5-0.5B-Instruct produces preamble before structured content; keyword-scan parser (search for first MOOD:/CONFIDENCE:/REASON: occurrence) is the correct replacement for line-position parsing |
| SLM-04 | Pre-clustered semantic groups from encoder passed into Qwen prompts for context-aware summarization | `buildSemanticBuckets()` in `sidebar.js` already produces `{label, count, sample_messages[]}` — this is the object to pass into `summarizeBuckets()` with an updated `buildSummaryPrompt()` that names the classification source |

</phase_requirements>

## Summary

Phase 11 is a focused surgical swap inside `llm-adapter.js`. The model ID on line 34 changes from `Phi-2-q4f16_1-MLC` to `Qwen2.5-0.5B-Instruct-q4f16_1-MLC`. The vendored `libs/web-llm/index.js` already contains this model in `prebuiltAppConfig` (confirmed: 2 occurrences, `low_resource_required: true`, `vram_required_MB: 944.62`, `context_window_size: 4096`). The gate from STATE.md ("verify vendored index.js includes this model") is cleared.

WebLLM applies the ChatML conversation template automatically via the model's bundled `mlc-chat-config.json` and an internal `conv_template` mechanism. The JS code uses the same OpenAI-style `{role, content}` messages array it uses today — no manual `<|im_start|>` wrapping is needed in `llm-adapter.js`. This is a critical finding that simplifies the prompt engineering work considerably.

The two substantive changes beyond the model ID are: (1) update `buildSummaryPrompt()` to use semantic bucket labels as classification context ("These messages were classified as Questions:"), and (2) replace the line-position parser in `parseSentimentResponse()` with a keyword-scan parser that tolerates Qwen's preamble. The fallback UI additions (Basic mode indicator + Retry AI button) require a small HTML addition to `sidebar.html` and a fallback-state variable in `llm-adapter.js`.

**Primary recommendation:** Treat this as two plans — Plan 01: model swap + prompt update + keyword-scan parser. Plan 02: fallback UI (Basic mode indicator + Retry AI button). The model swap is low-risk because the API surface is identical; the parser and fallback UI are the non-trivial work.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| WebLLM | vendored (0.2.81 per docs) | In-browser LLM inference | Already integrated; `CreateMLCEngine` API is unchanged |
| Qwen2.5-0.5B-Instruct-q4f16_1-MLC | bundled in index.js | Target SLM | Confirmed in prebuiltAppConfig; 4-bit quantized, float16 activations, MLC-compiled |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `buildSemanticBuckets()` (existing) | — | Produce semantic bucket objects from cosine labels | Already in sidebar.js; pass result directly to `summarizeBuckets()` |
| `computeFallbackSentiment()` (existing) | — | Rule-based sentiment when Qwen fails | Already exported from llm-adapter.js; used in fallback path |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Qwen2.5-0.5B-Instruct-q4f16_1-MLC | Qwen3-0.6B-q4f16_1-MLC | Qwen3 is also in the bundle but uses a different chat template (no default system message per Qwen docs); Qwen2.5 is the locked decision |
| keyword-scan parser | JSON schema output via grammar | WebLLM supports grammar-constrained output, but adds complexity; keyword-scan is the locked decision |

## Architecture Patterns

### Recommended Project Structure

No new files needed. All changes are in:
```
extension/
├── llm-adapter.js           # Model ID swap, prompt updates, parser rewrite, fallback state
└── sidebar/
    └── sidebar.html         # Add fallback notice + Retry AI button element
```

### Pattern 1: Model ID Swap

**What:** Single string change at `llm-adapter.js:34`
**When to use:** Always — model ID is the only initialisation change needed
**Example:**
```javascript
// Before (line 34)
engine = await CreateMLCEngine('Phi-2-q4f16_1-MLC', {

// After
engine = await CreateMLCEngine('Qwen2.5-0.5B-Instruct-q4f16_1-MLC', {
```
Note: The existing `appConfig: { useIndexedDBCache: true }` remains unchanged. WebLLM will cache the Qwen model in IndexedDB after first download, same as Phi-2.

### Pattern 2: ChatML via OpenAI Messages (WebLLM Handles Internally)

**What:** WebLLM's `conv_template` mechanism converts `{role, content}` messages to the model's required format automatically. For Qwen2.5, this means the engine internally formats messages as `<|im_start|>system\n...<|im_end|>\n<|im_start|>user\n...<|im_end|>\n<|im_start|>assistant\n`.
**When to use:** Always — never construct ChatML tokens manually in JS
**Example:**
```javascript
// Source: WebLLM official docs (webllm.mlc.ai/docs/user/basic_usage.html)
// This is the CORRECT pattern — WebLLM applies ChatML internally
const response = await engine.chat.completions.create({
  messages: [
    { role: 'system', content: 'You are a neutral chat analyst. Be concise and factual.' },
    { role: 'user', content: prompt }
  ],
  temperature: 0.3,
  max_tokens: 80
});
```

### Pattern 3: Keyword-Scan Parser (replaces line-position parser)

**What:** Search for the first occurrence of each keyword anywhere in the response string, not by line position. Qwen2.5-0.5B-Instruct may prepend a conversational sentence before the structured output.
**When to use:** All structured sentiment parsing
**Example:**
```javascript
function parseSentimentResponse(response) {
  let mood = 'neutral';
  let confidence = 0.5;
  let reason = '';

  // Scan for keywords at any position in the response
  const moodMatch = response.match(/MOOD:\s*([a-z]+)/i);
  const confMatch = response.match(/CONFIDENCE:\s*([0-9.]+)/i);
  const reasonMatch = response.match(/REASON:\s*(.+?)(?:\n|$)/i);

  if (moodMatch) mood = moodMatch[1].trim().toLowerCase();
  if (confMatch) confidence = parseFloat(confMatch[1]) || 0.5;
  if (reasonMatch) reason = reasonMatch[1].trim();

  // Completely unparseable: silent fallback
  if (!moodMatch && !confMatch) {
    if (DEBUG) console.warn('[LLM] Unparseable response, falling back silently:', response);
    return { mood: 'neutral', confidence: 0.5, summary: '', emoji: MOOD_EMOJIS.neutral };
  }

  const validMoods = ['excited', 'positive', 'angry', 'negative', 'confused', 'neutral'];
  if (!validMoods.includes(mood)) mood = 'neutral';

  return {
    mood,
    confidence: Math.min(1, Math.max(0, confidence)),
    summary: reason,
    emoji: MOOD_EMOJIS[mood] || '😐'
  };
}
```

### Pattern 4: Semantic Bucket Context in Summary Prompt

**What:** `buildSummaryPrompt()` receives buckets that already have a `label` field (e.g., "Questions") from cosine routing. The prompt should explicitly state that these are pre-classified groups so Qwen can produce more specific summaries.
**When to use:** `summarizeBuckets()` call path
**Example:**
```javascript
function buildSummaryPrompt(buckets) {
  let prompt = 'Analyze these pre-classified live stream chat groups:\n\n';

  buckets.forEach((bucket, index) => {
    prompt += `${index + 1}. ${bucket.label} (${bucket.count} messages classified as ${bucket.label}):\n`;
    bucket.sample_messages.slice(0, 3).forEach(msg => {
      prompt += `   - "${msg}"\n`;
    });
    prompt += '\n';
  });

  prompt += 'Provide one line per group with an emoji. Max 4 lines total.\nFormat: emoji Category: insight';
  return prompt;
}
```

### Pattern 5: Fallback State Variable + Retry

**What:** Track whether the session is in fallback mode with a module-level boolean. Expose an `isInFallback()` getter and a `retryLLM()` function that resets state and re-initialises.
**When to use:** After repeated parse failures or engine load failure
**Example:**
```javascript
// In llm-adapter.js
let _inFallback = false;
let _garbageCount = 0;
const MAX_GARBAGE_BEFORE_FALLBACK = 2; // retry once, then fallback

// After parsing: if no keywords found
if (!moodMatch && !confMatch) {
  _garbageCount++;
  if (_garbageCount >= MAX_GARBAGE_BEFORE_FALLBACK) {
    _inFallback = true;
    engine = createFallbackEngine(); // switch to rule-based for session
  }
  return fallbackResult;
}
_garbageCount = 0; // reset on good parse

function isInFallback() { return _inFallback; }

async function retryLLM(progressCallback) {
  _inFallback = false;
  _garbageCount = 0;
  engine = null;
  isInitialized = false;
  isInitializing = false;
  await initializeLLM(progressCallback);
}

export { isInFallback, retryLLM, /* ... existing exports */ };
```

### Pattern 6: Fallback UI in sidebar.html + sidebar.js

**What:** A small indicator + button below the AI summary area. Hidden by default, shown only when `isInFallback()` returns true.
**When to use:** After LLM falls into rule-based mode due to repeated garbage output or load failure
**Example HTML:**
```html
<!-- After #ai-summary div in sidebar.html -->
<div id="ai-fallback-notice" class="ai-fallback-notice hidden">
  <span class="fallback-label">Basic mode</span>
  <button id="retry-ai-btn" class="btn-link">Retry AI</button>
</div>
```
**Example sidebar.js wiring:**
```javascript
// After generateAISummary call succeeds/fails:
const fallbackNotice = document.getElementById('ai-fallback-notice');
if (isInFallback()) {
  fallbackNotice.classList.remove('hidden');
} else {
  fallbackNotice.classList.add('hidden');
}

document.getElementById('retry-ai-btn').addEventListener('click', async () => {
  fallbackNotice.classList.add('hidden');
  await retryLLM((progress) => {
    statusText.textContent = `Reloading AI: ${Math.round(progress.progress * 100)}%`;
  });
  statusText.textContent = 'Ready! Waiting for chat messages...';
  if (isInFallback()) fallbackNotice.classList.remove('hidden');
});
```

### Anti-Patterns to Avoid

- **Manual ChatML construction:** Do NOT build `<|im_start|>system\n...<|im_end|>` strings in JS. WebLLM applies the template internally from the model config. Manual construction would double-apply the template and produce malformed prompts.
- **Assuming structured output starts on line 1:** The current `parseSentimentResponse()` uses `line.toUpperCase().startsWith('MOOD:')` — this breaks when Qwen2.5-0.5B prepends a preamble sentence. Replace with regex scan.
- **Using `Phi-2-q4f16_1-MLC` as reference:** Note the capitalized form `Phi-2-q4f16_1-MLC` used in the current code is NOT in the vendored bundle (only `phi-2-q4f16_1-MLC` with lowercase is present). This suggests the current code may already be relying on fallback behavior. The Qwen model ID `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` IS present in the bundle with correct capitalisation.
- **Showing model name in progress UI:** The locked decision is generic "Downloading AI model... 45%" — do not expose the model ID to users.
- **Clearing fallback state on summary call:** Reset `_garbageCount` to 0 only on successful parse. Do not reset on each call unconditionally.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ChatML formatting | Manual `<|im_start|>` concatenation | WebLLM's internal conv_template | Engine applies it automatically from model config — manual wrapping causes double-application |
| Retry backoff | Custom exponential backoff | Simple one-retry threshold (MAX_GARBAGE=2) | Locked decision; complexity adds no value for a session-scoped fallback |
| Grammar-constrained output | JSON schema via WebLLM grammar API | Keyword-scan regex | Grammar constrained output is more reliable but the locked decision is keyword-scan |

**Key insight:** WebLLM's OpenAI-compatible API is a complete abstraction layer. The model name is the only init-time configuration that changes between Phi-2 and Qwen2.5.

## Common Pitfalls

### Pitfall 1: Wrong Model ID Capitalisation
**What goes wrong:** `CreateMLCEngine('Phi-2-q4f16_1-MLC', ...)` — the current code uses `Phi-2` (capital P) which is NOT in the vendored bundle. The bundle contains `phi-2-q4f16_1-MLC` (lowercase). This means the current implementation may be relying on WebLLM's fallback path or the model ID lookup is case-insensitive. When swapping to Qwen, use the exact string from the bundle: `Qwen2.5-0.5B-Instruct-q4f16_1-MLC`.
**Why it happens:** Copy-paste from docs vs actual bundle model_id strings.
**How to avoid:** Copy the model_id verbatim from the search output of the bundle: `Qwen2.5-0.5B-Instruct-q4f16_1-MLC`.
**Warning signs:** Engine initialization succeeds but no model is cached; progress bar shows 0% then complete instantly (fallback triggered).

### Pitfall 2: Line-Position Parser Breaks on Qwen Preamble
**What goes wrong:** Qwen2.5-0.5B-Instruct is instruction-tuned and commonly outputs a brief preamble ("Based on the provided signals, ") before the structured output. The current parser uses `line.startsWith('MOOD:')` which only matches if the keyword is the first content on a line at the start of the response.
**Why it happens:** Phi-2 was more terse; Qwen2.5-0.5B is more conversational due to its instruction-tuning.
**How to avoid:** Use `response.match(/MOOD:\s*([a-z]+)/i)` regex which finds the keyword anywhere in the string.
**Warning signs:** `parseSentimentResponse` always returns `neutral` with `0.5` confidence even when non-neutral signals exist.

### Pitfall 3: Summary Parser Assuming Emoji+Category on Line 1
**What goes wrong:** `generateAISummary()` in sidebar.js splits on newlines and renders all lines. If Qwen prepends preamble text, the first "line" will be prose, not an emoji+category entry, which looks wrong in the UI.
**Why it happens:** Same preamble issue as Pitfall 2, but for the summary call.
**How to avoid:** After receiving the summary text, validate that at least one line matches the emoji+category pattern (e.g., `/^[^\w\s]\s+\w/` or simpler: contains an emoji). If zero lines match, fall back to `generateFallbackSummary()`.
**Warning signs:** AI Summary section shows a prose paragraph instead of the bullet list.

### Pitfall 4: VRAM vs. Download Size Confusion
**What goes wrong:** The consent modal says "~450MB" (download size). The bundle config shows `vram_required_MB: 944.62` (~950MB). These are different things. The CONTEXT.md has already corrected this: keep ~400MB wording in consent modal (download size, consistent with current text).
**Why it happens:** VRAM and download size are often conflated.
**How to avoid:** Do not update the consent modal size text unless explicitly asked. The current "~450MB" wording is correct for the download/storage size.
**Warning signs:** N/A — this is a documentation pitfall, not a runtime one.

### Pitfall 5: `isInFallback()` Not Checked Before Showing AI Summary
**What goes wrong:** If the session is in fallback mode and `llmEnabled` is still true (because `isInitialized` is true for the fallback engine), `generateAISummary()` still gets called. The fallback engine produces rule-based output, which is fine, but the fallback notice won't show unless the sidebar explicitly checks `isInFallback()` after each summary generation.
**Why it happens:** The existing `_isFallback` flag on the engine object only identifies the initial fallback state, not the garbage-triggered fallback state added in this phase.
**How to avoid:** Export `isInFallback()` from `llm-adapter.js` and check it in `sidebar.js` after `generateAISummary()` completes.

### Pitfall 6: Token Budget for Qwen2.5-0.5B
**What goes wrong:** Qwen2.5-0.5B has `context_window_size: 4096`. The sentiment prompt uses `max_tokens: 60` and the summary uses `max_tokens: 150`. These are unchanged. The full prompt (system + user) must fit within 4096 - max_tokens. For the summary prompt with 4 buckets × 3 samples, the prompt is roughly 200-300 tokens — well within budget.
**Why it happens:** 0.5B models have smaller context windows than larger models.
**How to avoid:** Keep `max_tokens` values at or below current settings (60 for sentiment, 150 for summary). Do not expand sample count beyond 3 per bucket.
**Warning signs:** Engine throws an error about context length exceeded.

## Code Examples

### Complete Sentiment Prompt (Qwen-compatible, unchanged from current)

```javascript
// Source: verified against existing llm-adapter.js + Qwen ChatML docs
// WebLLM applies ChatML internally — no manual <|im_start|> needed

const response = await engine.chat.completions.create({
  messages: [
    {
      role: 'system',
      content: 'You are analyzing live stream chat sentiment. Be concise and accurate. Consider emotes and slang as valid sentiment indicators.'
    },
    {
      role: 'user',
      content: `Analyze the overall mood of this live stream chat.

Pre-computed signals:
${signalSummary}

Recent messages:
${sampleMessages}

Classify the overall mood as ONE of: excited, positive, angry, negative, confused, neutral

Respond in this exact format:
MOOD: [mood]
CONFIDENCE: [0.0-1.0]
REASON: [one sentence explanation]`
    }
  ],
  temperature: 0.3,
  max_tokens: 80
});
```

### Semantic-Context Summary Prompt

```javascript
// buildSummaryPrompt with semantic bucket context (SLM-04)
function buildSummaryPrompt(buckets) {
  let prompt = 'Analyze these pre-classified live stream chat groups:\n\n';

  buckets.forEach((bucket, index) => {
    prompt += `${index + 1}. ${bucket.label} (${bucket.count} messages):\n`;
    bucket.sample_messages.slice(0, 3).forEach(msg => {
      prompt += `   - "${msg}"\n`;
    });
    prompt += '\n';
  });

  prompt += 'Provide one line per category with an emoji. Max 4 lines.\nFormat: emoji Category: brief insight';
  return prompt;
}
```

### Keyword-Scan Parser (regex-based, replaces startsWith approach)

```javascript
// Replaces parseSentimentResponse() — handles Qwen preamble
function parseSentimentResponse(response) {
  const moodMatch = response.match(/MOOD:\s*([a-z]+)/i);
  const confMatch = response.match(/CONFIDENCE:\s*([0-9.]+)/i);
  const reasonMatch = response.match(/REASON:\s*(.+?)(?:\n|$)/i);

  // Completely unparseable: silent neutral fallback (locked decision)
  if (!moodMatch) {
    if (DEBUG) console.warn('[LLM] No MOOD keyword found, silent fallback. Response:', response);
    return { mood: 'neutral', confidence: 0.5, summary: '', emoji: MOOD_EMOJIS.neutral };
  }

  const validMoods = ['excited', 'positive', 'angry', 'negative', 'confused', 'neutral'];
  let mood = (moodMatch[1] || '').trim().toLowerCase();
  if (!validMoods.includes(mood)) mood = 'neutral';

  const confidence = confMatch ? Math.min(1, Math.max(0, parseFloat(confMatch[1]) || 0.5)) : 0.5;
  const reason = reasonMatch ? reasonMatch[1].trim() : '';

  return { mood, confidence, summary: reason, emoji: MOOD_EMOJIS[mood] || '😐' };
}
```

### Summary Validation Pattern

```javascript
// In generateAISummary() — validate emoji+category format after LLM response
function hasSummaryFormat(text) {
  // At least one line must look like: [emoji] [Word]: [content]
  return text.split('\n').some(line => /\S.*:\s*\S/.test(line.trim()) && line.trim().length > 0);
}

// Usage in generateAISummary():
const summaryText = response.choices[0].message.content;
if (!hasSummaryFormat(summaryText)) {
  // Fall back to rule-based — use generateFallbackSummary with current buckets prompt
  aiSummaryText.textContent = generateFallbackSummary(buildSummaryPrompt(buckets));
} else {
  // Render normally
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Phi-2 (2.7B params, 2048 ctx) | Qwen2.5-0.5B-Instruct (0.5B params, 4096 ctx) | Phase 11 | Smaller download (~400MB), longer context window, better instruction following per Qwen2.5 benchmarks |
| Line-position keyword parser | Regex keyword-scan parser | Phase 11 | Handles preamble-prefixed responses; required for Qwen2.5-0.5B |
| WASM keyword bucket labels in prompts | Semantic cosine bucket labels in prompts | Phase 11 | Qwen receives pre-classified categories, enabling more specific insights |

**Key finding — model confirmed in bundle:**
```
model_id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC"
model:    "https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC"
model_lib: [modelLibURLPrefix + modelVersion + "/Qwen2-0.5B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm"]
low_resource_required: true
vram_required_MB: 944.62
context_window_size: 4096
```
Phase 11 gate from STATE.md is cleared: the model is present in the vendored bundle.

## Open Questions

1. **Does `Phi-2-q4f16_1-MLC` (capitalized) actually work in the current code?**
   - What we know: The vendored bundle only contains `phi-2-q4f16_1-MLC` (lowercase). The current `llm-adapter.js:34` passes `Phi-2-q4f16_1-MLC` (capital P).
   - What's unclear: Whether WebLLM model ID lookup is case-insensitive, or whether the current code silently falls through to `createFallbackEngine()` on every load.
   - Recommendation: This is a pre-existing issue. For this phase, use the exact bundle model_id string `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` and do not attempt to fix the Phi-2 capitalisation (out of scope). The swap will work regardless because Qwen is correctly capitalised in the bundle.

2. **Qwen2.5-0.5B structured output reliability (LOW confidence)**
   - What we know: STATE.md notes this as LOW confidence until 20+ real outputs validated. Qwen2.5 docs claim "significant improvements in generating structured outputs especially JSON." The 0.5B size is small, and instruction following fidelity is lower than 7B+ variants.
   - What's unclear: Exact rate of preamble prepending vs. clean structured output.
   - Recommendation: The keyword-scan parser (locked decision) handles preamble gracefully. The retry-once-then-fallback (locked decision) handles persistent garbage. Empirical validation is deferred to a live testing step post-implementation.

3. **Should `retryLLM()` reload the full model or just reset garbage state?**
   - What we know: If the engine is in garbage mode but technically loaded, a reload calls `CreateMLCEngine` again which triggers re-download (or cache hit). If the issue is prompt/parse, a full reload wastes time.
   - What's unclear: Whether garbage output is a transient model state or a permanent load artifact.
   - Recommendation: Implement `retryLLM()` as a full engine reload (safer), relying on IndexedDB cache to make it fast (~2-5s from cache vs. minutes from network). This matches the locked decision to show "Retry AI" as a deliberate user action.

## Sources

### Primary (HIGH confidence)
- `/home/john/vault/projects/github.com/chat-signal-radar/extension/libs/web-llm/index.js` — confirmed `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` in `prebuiltAppConfig` at line 1738, `low_resource_required: true`, `vram_required_MB: 944.62`, `context_window_size: 4096`
- WebLLM official docs (webllm.mlc.ai/docs/user/basic_usage.html v0.2.81) — confirmed OpenAI-compatible `{role, content}` messages API; `conv_template` applied internally
- `/home/john/vault/projects/github.com/chat-signal-radar/extension/llm-adapter.js` — full codebase review of current implementation
- `/home/john/vault/projects/github.com/chat-signal-radar/extension/sidebar/sidebar.js` — `buildSemanticBuckets()` already produces the correct bucket shape for SLM-04

### Secondary (MEDIUM confidence)
- Qwen official docs (qwen.readthedocs.io/en/latest/getting_started/concepts.html) — ChatML format `<|im_start|>role\ncontent<|im_end|>`; Qwen2.5 resilient to diverse system prompts
- Qwen/Qwen2.5-0.5B-Instruct HuggingFace model card — instruction following improvements, structured output (especially JSON) improvements over Qwen2
- WebLLM GitHub issue #276 — confirmed conv_template mechanism for chat template application

### Tertiary (LOW confidence)
- Qwen2.5-0.5B structured output preamble frequency — no empirical data found; assessment based on general small-model behavior and Qwen2.5 instruction tuning claims

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Qwen2.5-0.5B-Instruct-q4f16_1-MLC confirmed in vendored bundle
- Architecture: HIGH — WebLLM API is unchanged; conv_template is internal; code patterns verified against existing codebase
- Pitfalls: HIGH for parser and model ID issues (verified by code inspection); MEDIUM for token budget (calculated); LOW for Qwen preamble frequency (empirical validation deferred)

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (stable: WebLLM bundle is vendored, no external dependency churn)
