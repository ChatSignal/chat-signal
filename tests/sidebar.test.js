import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
const originalChrome = globalThis.chrome;
const originalDOMPurify = globalThis.DOMPurify;
const originalTestFlag = globalThis.__CHAT_SIGNAL_RADAR_TEST__;

function createClassList() {
  const classes = new Set();
  return {
    add: (...names) => names.forEach((name) => classes.add(name)),
    remove: (...names) => names.forEach((name) => classes.delete(name)),
    contains: (name) => classes.has(name),
    toggle: (name, force) => {
      if (force === undefined) {
        if (classes.has(name)) classes.delete(name);
        else classes.add(name);
      } else if (force) {
        classes.add(name);
      } else {
        classes.delete(name);
      }
    },
    toArray: () => Array.from(classes)
  };
}

function createElement() {
  return {
    classList: createClassList(),
    textContent: '',
    innerHTML: '',
    className: '',
    title: '',
    disabled: false,
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    querySelector: () => createElement(),
    addEventListener: () => {}
  };
}

function setupSidebarDom() {
  const elements = {
    'status-text': createElement(),
    'status': createElement(),
    'stats': createElement(),
    'processed-count': createElement(),
    'clusters': createElement(),
    'error': createElement(),
    'ai-summary': createElement(),
    'ai-summary-text': createElement(),
    'mood-section': createElement(),
    'mood-emoji': createElement(),
    'mood-label': createElement(),
    'mood-confidence': createElement(),
    'mood-summary': createElement(),
    'sentiment-samples': createElement(),
    'topics-section': createElement(),
    'topics-cloud': createElement(),
    'ai-opt-in': createElement(),
    'enable-ai-btn': createElement(),
    'first-run': createElement(),
    'settings-link': createElement(),
    'end-session-btn': createElement(),
    'summary-modal': createElement(),
    'save-summary-btn': createElement(),
    'copy-summary-btn': createElement(),
    'close-summary-btn': createElement(),
    'copy-toast': createElement(),
    'summary-duration': createElement(),
    'summary-messages': createElement(),
    'summary-sentiment': createElement(),
    'summary-topics': createElement(),
    'summary-clusters': createElement(),
    'summary-questions': createElement(),
    // LLM consent modal
    'llm-consent-modal': createElement(),
    'llm-enable-btn': createElement(),
    'llm-skip-btn': createElement(),
    'llm-space-warning': createElement(),
    // Stream ended prompt
    'stream-ended-prompt': createElement(),
    'save-session-btn': createElement(),
    'dismiss-prompt-btn': createElement(),
    // Tabs and history
    'live-tab': createElement(),
    'history-tab': createElement(),
    'history-view': createElement(),
    'history-list': createElement(),
    'history-empty': createElement(),
    'clear-history-btn': createElement(),
    // Encoder progress
    'encoder-progress': createElement(),
    'encoder-progress-fill': createElement(),
    'encoder-progress-text': createElement(),
    'encoder-status-text': createElement(),
    // Clustering mode
    'clusters-header': createElement(),
    'clustering-mode-badge': createElement(),
    // Fallback notice
    'ai-fallback-notice': createElement(),
    'fallback-message': createElement(),
    'retry-ai-btn': createElement(),
    // System status
    'ss-analysis': createElement(),
    'ss-semantic': createElement(),
    'ss-ai': createElement(),
    // Window stats
    'window-current': createElement(),
    'window-max': createElement(),
  };

  globalThis.document = {
    getElementById: (id) => elements[id] || createElement(),
    createElement: () => createElement(),
    querySelectorAll: () => []
  };

  globalThis.window = {
    location: { href: 'chrome-extension://test/sidebar.html' },
    addEventListener: () => {},
    dispatchEvent: () => {}
  };

  // Mock DOMPurify (loaded as a global in the real sidebar.html)
  globalThis.DOMPurify = {
    sanitize: (html) => html
  };

  // Mock chrome APIs
  globalThis.chrome = {
    runtime: {
      getURL: (path) => `chrome-extension://test/${path}`,
      sendMessage: () => Promise.resolve(),
      onMessage: { addListener: () => {} }
    },
    storage: {
      sync: {
        get: async () => ({}),
        set: async () => {}
      },
      local: {
        get: async () => ({}),
        set: async () => {}
      },
      onChanged: { addListener: () => {} }
    },
    sidePanel: { open: () => {} },
    action: { onClicked: { addListener: () => {} } }
  };

  return elements;
}

function restoreGlobals() {
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
  globalThis.chrome = originalChrome;
  globalThis.DOMPurify = originalDOMPurify;
  globalThis.__CHAT_SIGNAL_RADAR_TEST__ = originalTestFlag;
}

describe('sidebar helpers', () => {
  it('renders real topics with size classes and emote markers', async () => {
    globalThis.__CHAT_SIGNAL_RADAR_TEST__ = true;
    const elements = setupSidebarDom();

    await import(`../extension/sidebar/sidebar.js?test=${Date.now()}`);

    const helpers = globalThis.ChatSignalRadarSidebar;
    const topics = [
      { term: 'gg', count: 18, is_emote: true },
      { term: 'audio delay', count: 9, is_emote: false },
      { term: 'new patch', count: 5, is_emote: false }
    ];

    helpers.updateTopics(topics);

    assert.equal(elements['topics-section'].classList.contains('hidden'), false);
    assert.equal(elements['topics-cloud'].children.length, 3);
    const [firstTag] = elements['topics-cloud'].children;
    assert.equal(firstTag.classList.contains('emote'), true);
    restoreGlobals();
  });

  it('updates mood indicator from real chat signals', async () => {
    globalThis.__CHAT_SIGNAL_RADAR_TEST__ = true;
    const elements = setupSidebarDom();

    await import(`../extension/sidebar/sidebar.js?test=${Date.now()}`);

    const helpers = globalThis.ChatSignalRadarSidebar;
    helpers.setSidebarState({
      llmEnabled: false
    });

    const messages = [
      { text: 'this boss fight is insane!', author: 'streamfan01', timestamp: 1712071200000 },
      { text: 'gg everyone', author: 'bluejay', timestamp: 1712071205000 },
      { text: 'lagging a bit but hype', author: 'pixelrush', timestamp: 1712071210000 }
    ];

    const sentimentSignals = {
      positive_count: 6,
      negative_count: 1,
      confused_count: 0,
      neutral_count: 2,
      sentiment_score: 35
    };

    const settings = {
      topicMinCount: 4,
      spamThreshold: 2,
      duplicateWindow: 20,
      sentimentSensitivity: 2,
      moodUpgradeThreshold: 25,
      aiSummariesEnabled: false
    };

    await helpers.updateMoodIndicator(messages, sentimentSignals, settings);

    assert.equal(elements['mood-section'].classList.contains('hidden'), false);
    assert.equal(elements['mood-label'].textContent, 'excited');
    assert.match(elements['mood-confidence'].textContent, /% confidence/);

    restoreGlobals();
  });

  it('builds a session summary using real analysis results', async () => {
    globalThis.__CHAT_SIGNAL_RADAR_TEST__ = true;
    const elements = setupSidebarDom();

    await import(`../extension/sidebar/sidebar.js?test=${Date.now()}`);

    const helpers = globalThis.ChatSignalRadarSidebar;

    const analysisResult = {
      processed_count: 42,
      topics: [
        { term: 'pog', count: 12, is_emote: true },
        { term: 'audio delay', count: 6, is_emote: false }
      ],
      buckets: [
        { label: 'Questions', count: 3, sample_messages: ['Is the update live?', 'What time is the tournament?'] },
        { label: 'Requests', count: 2, sample_messages: ['Play ranked next', 'Show loadout'] }
      ],
      sentiment_signals: {
        positive_count: 7,
        negative_count: 2,
        confused_count: 1,
        neutral_count: 4,
        sentiment_score: 18
      }
    };

    helpers.setSidebarState({
      sessionStartTime: Date.now() - 120000,
      lastAnalysisResult: analysisResult
    });

    const summaryText = helpers.generateSummaryText();
    assert.match(summaryText, /SESSION SUMMARY/);

    helpers.showSessionSummary();
    assert.equal(elements['summary-modal'].classList.contains('hidden'), false);
    // showSessionSummary uses safeCreateElement + appendChild, so check children
    const topicTexts = elements['summary-topics'].children.map(c => c.textContent);
    assert.ok(topicTexts.some(t => t.includes('audio delay')), 'Should contain "audio delay" topic');

    restoreGlobals();
  });

  it('hides AI summary when disabled', async () => {
    globalThis.__CHAT_SIGNAL_RADAR_TEST__ = true;
    const elements = setupSidebarDom();

    await import(`../extension/sidebar/sidebar.js?test=${Date.now()}`);

    const helpers = globalThis.ChatSignalRadarSidebar;
    helpers.setSidebarState({
      settings: {
        topicMinCount: 3,
        spamThreshold: 2,
        duplicateWindow: 20,
        sentimentSensitivity: 2,
        moodUpgradeThreshold: 25,
        aiSummariesEnabled: false
      },
      llmEnabled: false
    });

    helpers.updateAiSummaryState();

    assert.equal(elements['ai-summary'].classList.contains('hidden'), true);
    restoreGlobals();
  });
});

describe('session export (v2.3)', () => {
  async function loadSidebar() {
    globalThis.__CHAT_SIGNAL_RADAR_TEST__ = true;
    setupSidebarDom();
    await import(`../extension/sidebar/sidebar.js?test=${Date.now()}-${Math.random()}`);
    return globalThis.ChatSignalRadarSidebar;
  }

  const sampleSession = () => ({
    startTime: new Date(2026, 3, 2, 12, 0, 0).getTime(), // local 2026-04-02
    duration: 3661000,
    platform: 'twitch',
    streamTitle: 'Ranked grind',
    streamUrl: 'https://twitch.tv/foo',
    messageCount: 128,
    mood: 'excited',
    sentimentSignals: { positive_count: 40, negative_count: 5, confused_count: 3, neutral_count: 12 },
    topics: [{ term: 'pog', count: 9, is_emote: true }, { term: 'audio', count: 6, is_emote: false }],
    buckets: [{ label: 'Questions', count: 4, sample_messages: ['when is the next map?'] }],
    sessionQuestions: ['when is the next map?', 'what gpu?']
  });

  it('generateSessionMarkdown renders all sections with a correct score', async () => {
    const h = await loadSidebar();
    const md = h.generateSessionMarkdown(sampleSession());
    assert.match(md, /# Chat Signal - Session Summary/);
    assert.match(md, /\*\*Platform:\*\* twitch/);
    assert.match(md, /\*\*Mood:\*\* excited/);
    assert.match(md, /\| Positive \| 40 \|/);
    assert.match(md, /\| \*\*Score\*\* \| \*\*58\/100\*\* \|/); // (40-5)/60 => 58
    assert.match(md, /## Trending Topics/);
    assert.match(md, /- pog \(9\) \[emote\]/);
    assert.match(md, /### Questions \(4\)/);
    assert.match(md, /## Top Questions/);
    restoreGlobals();
  });

  it('generateSessionMarkdown omits optional sections and scores 0 with no signals', async () => {
    const h = await loadSidebar();
    const md = h.generateSessionMarkdown({
      startTime: Date.now(), duration: 1000, platform: 'youtube', messageCount: 0, mood: 'neutral',
      sentimentSignals: { positive_count: 0, negative_count: 0, confused_count: 0, neutral_count: 0 },
      topics: [], buckets: [], sessionQuestions: []
    });
    assert.match(md, /\*\*Score\*\* \| \*\*0\/100\*\*/);
    assert.doesNotMatch(md, /## Trending Topics/);
    assert.doesNotMatch(md, /## Clusters/);
    assert.doesNotMatch(md, /## Top Questions/);
    restoreGlobals();
  });

  it('sanitizePlatform whitelists known platforms', async () => {
    const h = await loadSidebar();
    assert.equal(h.sanitizePlatform('youtube'), 'youtube');
    assert.equal(h.sanitizePlatform('twitch'), 'twitch');
    assert.equal(h.sanitizePlatform('kick'), 'unknown');
    assert.equal(h.sanitizePlatform(undefined), 'unknown');
    assert.equal(h.sanitizePlatform('../../etc'), 'unknown');
    restoreGlobals();
  });

  it('buildExportFilename uses date, whitelisted platform, and format extension', async () => {
    const h = await loadSidebar();
    const s = sampleSession();
    assert.equal(h.buildExportFilename(s, 'json'), 'chatsignal-2026-04-02-twitch.json');
    assert.equal(h.buildExportFilename(s, 'markdown'), 'chatsignal-2026-04-02-twitch.md');
    assert.equal(h.buildExportFilename({ ...s, platform: 'kick' }, 'json'), 'chatsignal-2026-04-02-unknown.json');
    restoreGlobals();
  });

  it('pickDisplayBuckets prefers semantic buckets only when active and non-empty', async () => {
    const h = await loadSidebar();
    const kw = [{ label: 'General Chat', count: 3 }];
    const sem = [{ label: 'Questions', count: 2 }];
    assert.deepEqual(h.pickDisplayBuckets(kw, sem, true), sem);   // semantic active
    assert.deepEqual(h.pickDisplayBuckets(kw, sem, false), kw);   // keyword mode
    assert.deepEqual(h.pickDisplayBuckets(kw, [], true), kw);     // empty semantic
    assert.deepEqual(h.pickDisplayBuckets(undefined, null, false), []); // nothing
    restoreGlobals();
  });
});
