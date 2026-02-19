# Testing Patterns

**Analysis Date:** 2026-02-19

## Test Framework

**Runner:**
- Node.js built-in `node:test` (no external framework required)
- Version: Uses native Node.js 18+ test module
- Config: None required (uses standard Node.js behavior)

**Run Commands:**
```bash
npm run test:js              # Run all JavaScript tests in tests/*.test.js
node --test tests/*.test.js  # Direct invocation
```

**Assertion Library:**
- Node.js built-in `node:assert/strict` (strict equality by default)
- All tests use: `import assert from 'node:assert/strict';`

**Rust Tests:**
```bash
cd wasm-engine && cargo test  # Run all Rust unit tests in src/lib.rs
```

## Test File Organization

**Location:**
- JavaScript tests: `/tests/` directory (separate from source code)
  - `tests/sidebar.test.js`
  - `tests/llm-adapter.test.js`
  - `tests/content-script.test.js`
  - `tests/options.test.js`
- Rust tests: co-located in `wasm-engine/src/lib.rs` using `#[cfg(test)]` module

**Naming:**
- Test files: `{module}.test.js` (e.g., `sidebar.test.js`)
- Test functions: `test_description_in_snake_case` (Rust) or descriptive sentences (JavaScript)
- Test suites: group related tests under `describe()` blocks

**Structure - JavaScript:**
```
tests/
├── sidebar.test.js          # Sidebar rendering and UI helpers
├── llm-adapter.test.js      # LLM sentiment analysis and fallback
├── content-script.test.js   # Platform detection and message extraction
└── options.test.js          # Settings and preferences (if applicable)
```

**Structure - Rust:**
```
wasm-engine/src/lib.rs
└── #[cfg(test)]
    mod tests {
        // 18 unit tests organized by feature:
        // - Message clustering (5 tests)
        // - Topic extraction (4 tests)
        // - Sentiment analysis (4 tests)
        // - Spam/duplicate detection (4 tests)
        // - Combined analysis (1 test)
    }
```

## Test Structure

**Suite Organization - JavaScript:**
```javascript
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('sidebar helpers', () => {
  it('renders real topics with size classes and emote markers', async () => {
    // Setup
    globalThis.__CHAT_SIGNAL_RADAR_TEST__ = true;
    const elements = setupSidebarDom();

    // Execute
    await import(`../extension/sidebar/sidebar.js?test=${Date.now()}`);
    const helpers = globalThis.ChatSignalRadarSidebar;
    helpers.updateTopics(topics);

    // Assert
    assert.equal(elements['topics-section'].classList.contains('hidden'), false);
    assert.equal(elements['topics-cloud'].children.length, 3);

    // Cleanup
    restoreGlobals();
  });
});
```

**Suite Organization - Rust:**
```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_message(text: &str) -> Message {
        Message {
            text: text.to_string(),
            author: "TestUser".to_string(),
            timestamp: 0.0,
        }
    }

    #[test]
    fn test_question_clustering() {
        let messages = vec![
            create_test_message("How do I do this?"),
            create_test_message("What is the answer?"),
        ];

        let result = cluster_messages_internal(&messages);

        assert!(result.buckets.iter().any(|b| b.label == "Questions"));
    }
}
```

**Patterns:**

1. **Setup:** Create fixtures, mock globals, establish preconditions
2. **Execution:** Call the function/module being tested
3. **Assertion:** Verify expected behavior
4. **Cleanup:** Restore globals, reset mocks (critical for test isolation)

## Mocking

**Framework:** Manual mocking via global object replacement (no mock library)

**Patterns - JavaScript:**
```javascript
// 1. DOM mocking for tests that need document/window
const originalDocument = globalThis.document;
const originalWindow = globalThis.window;

function setupSidebarDom() {
  const elements = {
    'status-text': createElement(),
    'topics-cloud': createElement(),
    // ... more elements
  };

  globalThis.document = {
    getElementById: (id) => elements[id],
    createElement: () => createElement()
  };

  globalThis.window = {
    location: { href: 'chrome-extension://test/sidebar.html' }
  };

  return elements;
}

function restoreGlobals() {
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
}
```

**Patterns - Test flag for conditional behavior:**
```javascript
const isTestEnv = typeof globalThis !== 'undefined' && globalThis.__CHAT_SIGNAL_RADAR_TEST__ === true;

// In test setup
globalThis.__CHAT_SIGNAL_RADAR_TEST__ = true;

// In module code
if (!isTestEnv) {
  // Only run in production (e.g., event listeners)
  settingsLink.addEventListener('click', ...);
}
```

**What to Mock:**
- DOM elements (always mock for sidebar tests)
- Chrome extension APIs (only when not needed: test LLM sentiment separately from chrome.storage)
- Global objects (`window`, `document`)
- Time-based operations (not currently mocked; tests accept async delays)

**What NOT to Mock:**
- WASM functions (test with real WASM output)
- Core business logic (test actual sentiment analysis, clustering)
- Utility functions like `sanitizeText()`, `escapeHtml()` (simple and deterministic)

## Fixtures and Factories

**Test Data - JavaScript:**
```javascript
// From sidebar.test.js - real analysis results
const analysisResult = {
  processed_count: 42,
  topics: [
    { term: 'pog', count: 12, is_emote: true },
    { term: 'audio delay', count: 6, is_emote: false }
  ],
  buckets: [
    { label: 'Questions', count: 3, sample_messages: ['Is the update live?'] },
    { label: 'Requests', count: 2, sample_messages: ['Play ranked next'] }
  ],
  sentiment_signals: {
    positive_count: 7,
    negative_count: 2,
    confused_count: 1,
    neutral_count: 4,
    sentiment_score: 18
  }
};
```

**Test Data - Rust:**
```rust
fn create_test_message(text: &str) -> Message {
    Message {
        text: text.to_string(),
        author: "TestUser".to_string(),
        timestamp: 0.0,
    }
}

fn create_test_message_with_author(text: &str, author: &str, timestamp: f64) -> Message {
    Message {
        text: text.to_string(),
        author: author.to_string(),
        timestamp,
    }
}

// Usage in tests
let messages = vec![
    create_test_message("How do I do this?"),
    create_test_message("What is the answer?"),
];
```

**Location:**
- Fixtures in test file itself (no separate fixtures directory)
- Helpers at bottom of test module (helper functions before test cases)
- Rust: helper functions in `tests` module

## Coverage

**Requirements:** No coverage tools configured or enforced

**Current State:**
- Rust: 18 unit tests in `wasm-engine/src/lib.rs` covering all major analysis functions
- JavaScript: 4 test files with ~15 total tests covering sidebar, LLM adapter, and content scripts
- Manual verification that critical paths are tested

**View Coverage (Rust):**
```bash
cd wasm-engine && cargo tarpaulin --out Html  # Install tarpaulin first
```

## Test Types

**Unit Tests (JavaScript):**
- Scope: Individual functions and modules (sidebar helpers, LLM sentiment, content-script extraction)
- Approach: Mock dependencies (DOM, globals), test function output in isolation
- Example: `test_sentiment_positive()` verifies sentiment analysis correctly counts positive signals

**Unit Tests (Rust):**
- Scope: Analysis functions (`cluster_messages_internal`, `extract_topics_internal`, `analyze_sentiment_internal`)
- Approach: No mocking (internal functions called directly), test with various message combinations
- Example: `test_question_clustering()` tests clustering logic with known message patterns
- Benefits: Rust's type system + tests ensure correctness before WASM compilation

**Integration Tests:**
- Not formally separated; sidebar/llm-adapter tests act as light integration tests
- Example: `test_analyze_chat_returns_all_components()` verifies clustering + topics + sentiment work together
- Integration with WASM: JavaScript tests call real WASM functions (not mocked)

**E2E Tests:**
- Not implemented (manual testing on YouTube/Twitch required)
- Future: Could add Playwright tests for full sidebar UI on real streaming sites

## Common Patterns

**Async Testing - JavaScript:**
```javascript
it('builds a session summary using real analysis results', async () => {
  globalThis.__CHAT_SIGNAL_RADAR_TEST__ = true;
  const elements = setupSidebarDom();

  // Dynamic import for modules with setup
  await import(`../extension/sidebar/sidebar.js?test=${Date.now()}`);

  const helpers = globalThis.ChatSignalRadarSidebar;

  // Call async function
  const summaryText = helpers.generateSummaryText();
  assert.match(summaryText, /SESSION SUMMARY/);

  restoreGlobals();
});
```

**Async Testing - Rust:**
```rust
// Rust functions are not async in this codebase
// All analysis is synchronous for performance in WASM
#[test]
fn test_sentiment_positive() {
    let messages = vec![...];
    let signals = analyze_sentiment_internal(&messages);  // synchronous
    assert!(signals.positive_count > signals.negative_count);
}
```

**Error Testing - Validation:**
```javascript
// From ValidationHelpers tests (not in test files, but pattern used)
try {
  validateMessages('not an array');
  assert.fail('Should have thrown');
} catch (error) {
  assert.match(error.message, /Messages must be an array/);
}
```

**Error Testing - Rust:**
```rust
#[test]
fn test_request_clustering() {
    let messages = vec![...];
    let result = cluster_messages_internal(&messages);

    let requests_bucket = result.buckets.iter().find(|b| b.label == "Requests");
    assert!(requests_bucket.is_some(), "Requests bucket should exist");
    let count = requests_bucket.unwrap().count;
    assert!(count >= 2, "Expected at least 2 requests, got {}", count);
}
```

**Assertion Patterns:**
- Exact equality: `assert.equal(value, expected)`
- Existence checks: `assert(condition, 'message')` or `assert.ok(value)`
- Array/String matching: `assert.match(text, /pattern/)`
- Negation: `assert.notEqual(value, unexpected)` or `assert(!condition)`
- Type-specific: `assert.strictEqual()` for strict equality (no type coercion)

## Test Execution

**Run all tests:**
```bash
npm run test:js                    # JavaScript tests only
cd wasm-engine && cargo test       # Rust tests only
```

**Run specific test file:**
```bash
node --test tests/sidebar.test.js
node --test tests/llm-adapter.test.js
```

**Run specific test (requires grep or filtering):**
```bash
cd wasm-engine && cargo test test_question_clustering -- --exact
```

## Test Isolation

**Cleanup patterns:**
```javascript
const originalDocument = globalThis.document;

function restoreGlobals() {
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
  globalThis.__CHAT_SIGNAL_RADAR_TEST__ = originalTestFlag;
}

// Called at end of each test
```

**Why important:**
- Tests modify global state (`globalThis.document`, `globalThis.window`)
- Cleanup prevents cross-test contamination
- Must restore before test completes or next test will see dirty state

## Current Test Coverage

**Rust Tests (18 total) - wasm-engine/src/lib.rs:**
1. `test_question_clustering()` - Questions identified with `?` or keywords
2. `test_issue_clustering()` - Issues/Bugs identified
3. `test_request_clustering()` - Requests identified with `please`, `can you`
4. `test_sample_messages_limit()` - Only 3 samples per bucket
5. `test_general_chat_only()` - Only General Chat when no special clusters
6. `test_topic_extraction_basic()` - Emotes detected and flagged
7. `test_stop_word_filtering()` - Common words filtered out
8. `test_emote_preservation()` - Known emotes always kept
9. `test_min_count_threshold()` - Min count filtering works
10. `test_sentiment_positive()` - Positive words counted correctly
11. `test_sentiment_negative()` - Negative words counted correctly
12. `test_sentiment_confused()` - Question marks and confused words counted
13. `test_sentiment_neutral()` - Neutral messages counted
14. `test_analyze_chat_returns_all_components()` - Combined analysis works
15. `test_spam_detection_same_user()` - Duplicates from same user detected
16. `test_spam_detection_cross_user()` - Spam from multiple users detected
17. `test_duplicate_window()` - Time window respected for duplicates
18. `test_analyze_with_settings()` - Settings applied correctly

**JavaScript Tests (~15 total):**
- `sidebar.test.js`: Topic rendering, mood indicator, session summary, AI opt-in
- `llm-adapter.test.js`: Fallback sentiment computation (mood upgrades, neutral handling)
- `content-script.test.js`: YouTube/Twitch message extraction, chat container finding
- `options.test.js`: Settings validation (if applicable)

## Adding New Tests

**JavaScript Test Template:**
```javascript
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
const originalTestFlag = globalThis.__CHAT_SIGNAL_RADAR_TEST__;

function setupTestEnvironment() {
  // Setup globals and fixtures
  globalThis.__CHAT_SIGNAL_RADAR_TEST__ = true;
  // ... mock document/window
  return { /* mock objects */ };
}

function restoreGlobals() {
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
  globalThis.__CHAT_SIGNAL_RADAR_TEST__ = originalTestFlag;
}

describe('feature being tested', () => {
  it('should behave as expected', async () => {
    const mocks = setupTestEnvironment();

    // Execute
    const result = await functionUnderTest();

    // Assert
    assert.equal(result.property, expectedValue);

    restoreGlobals();
  });
});
```

**Rust Test Template:**
```rust
#[test]
fn test_descriptive_name() {
    // Setup
    let messages = vec![
        create_test_message("Sample message"),
    ];

    // Execute
    let result = function_under_test(&messages);

    // Assert
    assert_eq!(result.field, expected_value);
    assert!(condition, "descriptive assertion message");
}
```

---

*Testing analysis: 2026-02-19*
