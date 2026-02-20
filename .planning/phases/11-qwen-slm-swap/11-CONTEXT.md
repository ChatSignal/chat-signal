# Phase 11: Qwen SLM Swap - Context

**Gathered:** 2026-02-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace Phi-2 with Qwen2.5-0.5B-Instruct in the existing WebLLM consent-gated flow. Update model ID, prompt format (ChatML), response parsing, and feed semantic cluster output into prompts. Adding new AI features or changing the consent flow structure is out of scope.

</domain>

<decisions>
## Implementation Decisions

### Prompt design
- Structured list format for cluster data in prompts — category name, count, and 2-3 sample messages per bucket (same structure as current Phi-2 format)
- Neutral analyst tone for system persona — factual, concise ("Questions focus on X. Sentiment is Y.")
- Separate calls for sentiment analysis and chat summary (keep current two-call pattern) — clearer output, simpler parsing
- Include semantic bucket labels in summary prompts — "These messages were classified as Questions: ..." so Qwen uses pre-classification for better summaries

### Response parsing
- Scan for first keyword occurrence (MOOD:, CONFIDENCE:, REASON:) anywhere in response — ignore conversational preamble before structured output
- On completely unparseable response (no keywords found): silent fallback to neutral mood with 0.5 confidence, no error shown to user
- Summary output: max 4 lines with emoji+category format (keep current constraint)
- Validate summary format: check for emoji+category pattern; if missing, fall back to rule-based summary

### Consent & model size UX
- Keep ~400MB wording in consent modal — Qwen download is similar size to Phi-2, just swap model name references
- Note: the ~950MB figure in earlier planning docs was VRAM requirement, not download size — corrected here
- MiniLM (~25MB) auto-loads without consent (unchanged from Phase 8)
- Generic download progress — "Downloading AI model... 45%" — do not show model name to user

### Fallback behavior
- Show fallback notice when Qwen fails to load — small indicator like "Basic mode" near the summary section
- On garbage output: retry the prompt once, then switch to rule-based for the rest of the session
- Include a "Retry AI" button near the summary section — visible only when in fallback mode, so user can retry without reopening the sidebar
- Placement: below the AI summary area — "Basic mode · Retry AI" — only shown when in fallback

### Claude's Discretion
- Exact ChatML prompt templates and token limits
- How to structure the keyword-scan parser implementation
- Retry button styling and exact wording
- Whether to log unparseable responses to console for debugging

</decisions>

<specifics>
## Specific Ideas

- The `q4f16_1-MLC` suffix means: 4-bit quantized weights, float16 activations, MLC-compiled for WebLLM — this is the standard WebLLM-compatible format
- Current code at `llm-adapter.js:34` has `Phi-2-q4f16_1-MLC` hardcoded — this is the single line to swap to `Qwen2.5-0.5B-Instruct-q4f16_1-MLC`
- STATE.md notes: "Phase 11 gate: verify vendored `libs/web-llm/index.js` includes `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` in `prebuiltAppConfig` before coding starts"

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-qwen-slm-swap*
*Context gathered: 2026-02-20*
