---
phase: 11-qwen-slm-swap
plan: 01
subsystem: llm
tags: [webllm, qwen2.5, sentiment, summarization, fallback]

# Dependency graph
requires:
  - phase: 10-semantic-cosine-routing
    provides: semantic bucket labels (label, count, sample_messages[]) passed to summarizeBuckets()
provides:
  - Qwen2.5-0.5B-Instruct-q4f16_1-MLC model swap in llm-adapter.js
  - Keyword-scan regex parser for sentiment (handles Qwen conversational preamble)
  - Semantic classification context in summary prompts (pre-classified wording, 3 samples/bucket)
  - Garbage-triggered fallback state: _inFallback, _garbageCount, MAX_GARBAGE_BEFORE_FALLBACK
  - hasSummaryFormat() validator with rule-based fallback for invalid LLM summary output
  - isInFallback() and retryLLM() exports for sidebar UI integration
affects:
  - 11-02 (fallback UI: Basic mode indicator + Retry AI button in sidebar.html/sidebar.js)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Keyword-scan regex parser: response.match(/KEYWORD:\s*/i) finds structured fields anywhere in response, tolerates preamble
    - Garbage count tracking: module-level _garbageCount resets only on successful parse (not per call), triggers session-wide fallback at threshold
    - Summary format validation: hasSummaryFormat() checks for colon-delimited line before rendering LLM output

key-files:
  created: []
  modified:
    - extension/llm-adapter.js

key-decisions:
  - "Keyword-scan parser (response.match(/MOOD:/i)) replaces line-position parser (startsWith) to handle Qwen2.5 conversational preamble"
  - "Garbage detection: mood=neutral AND confidence=0.5 AND summary='' identifies silent fallback result from parseSentimentResponse"
  - "_garbageCount resets to 0 only on successful parse — consecutive failure tracking (locked decision)"
  - "hasSummaryFormat() validates at least one line matches /\\S.*:\\s*\\S/ pattern before rendering LLM summary"
  - "retryLLM() performs full engine reload (not state-only reset) — relies on IndexedDB cache for ~2-5s re-init"

patterns-established:
  - "Keyword-scan parser pattern: use response.match(/KEYWORD:\\s*([value])/i) for all structured LLM output parsing"
  - "Fallback state pattern: module-level boolean (_inFallback) + exported getter (isInFallback()) + reset function (retryLLM())"

requirements-completed: [SLM-01, SLM-02, SLM-03, SLM-04]

# Metrics
duration: 2min
completed: 2026-02-20
---

# Phase 11 Plan 01: Qwen SLM Swap Summary

**Qwen2.5-0.5B-Instruct model swap with keyword-scan parser, semantic cluster prompts, and garbage-triggered session fallback state**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-20T22:22:44Z
- **Completed:** 2026-02-20T22:24:39Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Swapped model ID from `Phi-2-q4f16_1-MLC` to `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` (confirmed present in vendored bundle)
- Updated `buildSummaryPrompt()` with semantic classification context ("pre-classified" wording, 3 samples/bucket instead of 2)
- Updated `summarizeBuckets()` system prompt to neutral analyst tone ("You are a neutral chat analyst...")
- Replaced line-position `parseSentimentResponse()` with keyword-scan regex parser that handles Qwen's conversational preamble
- Added garbage-triggered session fallback: 2 consecutive unparseable responses switches engine to rule-based for the session
- Added `hasSummaryFormat()` validator so invalid LLM summaries fall back to `generateFallbackSummary()`
- Exported `isInFallback()` and `retryLLM()` for Plan 02 sidebar UI wiring

## Task Commits

Each task was committed atomically:

1. **Task 1: Swap model ID and update prompts for Qwen2.5 with semantic context** - `d689e13` (feat)
2. **Task 2: Replace parser with keyword-scan regex and add garbage-triggered fallback state** - `d6317c9` (feat)

## Files Created/Modified
- `extension/llm-adapter.js` - Model swap, neutral analyst system prompt, semantic cluster prompt with 3 samples, keyword-scan parser, garbage tracking, hasSummaryFormat validator, isInFallback/retryLLM exports

## Decisions Made
- Garbage detection uses the specific sentinel values from `parseSentimentResponse()`: mood='neutral', confidence=0.5, summary='' — this is the exact tuple returned on silent fallback, making detection unambiguous
- `_garbageCount` resets to 0 on any successful parse, not per session — this means 2 failures must be consecutive to trigger fallback (locked decision)
- `retryLLM()` resets all engine state variables and calls `initializeLLM()` fresh — full reload via IndexedDB cache is fast and correct (locked decision)
- `hasSummaryFormat()` uses `/\S.*:\s*\S/` pattern — permissive enough to match "emoji Category: insight" lines without requiring a specific emoji regex

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `isInFallback()` and `retryLLM()` are exported and ready for Plan 02 sidebar wiring
- Plan 02 needs to add the fallback UI: "Basic mode · Retry AI" indicator below the AI summary area in `sidebar.html` and `sidebar.js`
- The Qwen model ID capitalisation is correct (`Qwen2.5-0.5B-Instruct-q4f16_1-MLC` matches the vendored bundle exactly — note the research found Phi-2 capitalization was wrong in the current code, which is pre-existing and out of scope)

---
*Phase: 11-qwen-slm-swap*
*Completed: 2026-02-20*
