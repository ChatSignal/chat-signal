/**
 * screenshot.mjs
 *
 * Generates three 1280x800 CWS screenshots using Playwright.
 * Each screenshot injects mock data into the actual sidebar HTML to showcase a
 * different feature: message clusters, mood/sentiment, and trending topics.
 *
 * Usage:
 *   node scripts/screenshot.mjs
 *
 * Output:
 *   docs/store/screenshot-clusters.png  (1280x800)
 *   docs/store/screenshot-mood.png      (1280x800)
 *   docs/store/screenshot-topics.png    (1280x800)
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdir } from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 800;
const OUTPUT_DIR = path.resolve(__dirname, '../docs/store');
const SIDEBAR_PATH = path.resolve(__dirname, '../extension/sidebar/sidebar.html');

// ============================================================================
// Chrome API stubs — prevents sidebar.js crash in file:// context
// ============================================================================
const CHROME_STUBS = () => {
  window.chrome = {
    runtime: {
      sendMessage: () => {},
      onMessage: { addListener: () => {} },
      getURL: (p) => p,
      id: 'mock-extension-id',
    },
    storage: {
      local: {
        get: (_keys, cb) => {
          const defaults = {
            aiConsentShown: true,
            aiSummariesEnabled: false,
            settings: {
              windowSize: 500,
              inactivityTimeout: 120,
            },
          };
          if (cb) cb(defaults);
          return Promise.resolve(defaults);
        },
        set: (_items, cb) => {
          if (cb) cb();
          return Promise.resolve();
        },
      },
    },
    sidePanel: {},
  };
};

// ============================================================================
// Mock data injection functions
// ============================================================================

/**
 * Screenshot 1: Clusters — Focus on message cluster buckets
 */
function injectClustersView() {
  // Hide first-run guidance
  const firstRun = document.getElementById('first-run');
  if (firstRun) firstRun.classList.add('hidden');

  // Show and activate status bar
  const status = document.getElementById('status');
  const statusText = document.getElementById('status-text');
  if (status) {
    status.classList.remove('hidden');
    status.classList.add('active');
  }
  if (statusText) statusText.textContent = 'Analyzing 847 messages';

  // Show stats bar
  const stats = document.getElementById('stats');
  const processedCount = document.getElementById('processed-count');
  const windowCurrent = document.getElementById('window-current');
  const windowMax = document.getElementById('window-max');
  if (stats) stats.classList.remove('hidden');
  if (processedCount) processedCount.textContent = '847';
  if (windowCurrent) windowCurrent.textContent = '500';
  if (windowMax) windowMax.textContent = '500';

  // Show mood section (briefly — clusters are the focus)
  const moodSection = document.getElementById('mood-section');
  const moodEmoji = document.getElementById('mood-emoji');
  const moodLabel = document.getElementById('mood-label');
  const moodConfidence = document.getElementById('mood-confidence');
  const moodSummary = document.getElementById('mood-summary');
  if (moodSection) {
    moodSection.classList.remove('hidden');
    moodSection.className = 'mood-section excited';
  }
  if (moodEmoji) moodEmoji.textContent = '🔥';
  if (moodLabel) moodLabel.textContent = 'Excited';
  if (moodConfidence) moodConfidence.textContent = 'strong signal';
  if (moodSummary) moodSummary.textContent = 'Chat is buzzing with energy!';

  // Populate clusters with realistic gaming/streaming chat messages
  const clusters = document.getElementById('clusters');
  if (clusters) {
    clusters.innerHTML = '';

    const bucketData = [
      {
        label: 'Questions',
        count: 4,
        messages: [
          'What settings are you using for the graphics?',
          'How do you get that ability so early in the game?',
          'Is this a new patch or the old version?',
          'What GPU are you running this on?',
        ],
      },
      {
        label: 'Issues / Bugs',
        count: 2,
        messages: [
          'The audio is cutting out on my end',
          'Stream quality dropped for a sec, anyone else?',
        ],
      },
      {
        label: 'Requests',
        count: 2,
        messages: [
          'Can you show the inventory screen?',
          'Please do the boss fight next!',
        ],
      },
      {
        label: 'General Chat',
        count: 3,
        messages: [
          'PogChamp that was insane!!',
          'LUL clutch save right there',
          'This stream is so good, been watching all day',
        ],
      },
    ];

    for (const bucket of bucketData) {
      const bucketEl = document.createElement('div');
      bucketEl.className = 'cluster-bucket';

      const header = document.createElement('div');
      header.className = 'cluster-header';

      const label = document.createElement('span');
      label.className = 'cluster-label';
      label.textContent = bucket.label;

      const countBadge = document.createElement('span');
      countBadge.className = 'cluster-count';
      countBadge.textContent = bucket.count;

      header.appendChild(label);
      header.appendChild(countBadge);

      const messagesEl = document.createElement('div');
      messagesEl.className = 'cluster-messages';

      for (const msg of bucket.messages) {
        const item = document.createElement('div');
        item.className = 'message-item';
        item.textContent = msg;
        messagesEl.appendChild(item);
      }

      bucketEl.appendChild(header);
      bucketEl.appendChild(messagesEl);
      clusters.appendChild(bucketEl);
    }
  }

  // Show End Session button
  const endSessionBtn = document.getElementById('end-session-btn');
  if (endSessionBtn) endSessionBtn.classList.remove('hidden');
}

/**
 * Screenshot 2: Mood/Sentiment — Focus on mood indicator prominently
 */
function injectMoodView() {
  // Hide first-run guidance
  const firstRun = document.getElementById('first-run');
  if (firstRun) firstRun.classList.add('hidden');

  // Show active status
  const status = document.getElementById('status');
  const statusText = document.getElementById('status-text');
  if (status) {
    status.classList.remove('hidden');
    status.classList.add('active');
  }
  if (statusText) statusText.textContent = 'Analyzing 847 messages';

  // Show stats
  const stats = document.getElementById('stats');
  const processedCount = document.getElementById('processed-count');
  const windowCurrent = document.getElementById('window-current');
  const windowMax = document.getElementById('window-max');
  if (stats) stats.classList.remove('hidden');
  if (processedCount) processedCount.textContent = '847';
  if (windowCurrent) windowCurrent.textContent = '500';
  if (windowMax) windowMax.textContent = '500';

  // Show mood section prominently with Excited mood
  const moodSection = document.getElementById('mood-section');
  const moodEmoji = document.getElementById('mood-emoji');
  const moodLabel = document.getElementById('mood-label');
  const moodConfidence = document.getElementById('mood-confidence');
  const moodSummary = document.getElementById('mood-summary');
  if (moodSection) {
    moodSection.classList.remove('hidden');
    moodSection.className = 'mood-section excited';
  }
  if (moodEmoji) moodEmoji.textContent = '🔥';
  if (moodLabel) moodLabel.textContent = 'Excited';
  if (moodConfidence) moodConfidence.textContent = 'strong signal';
  if (moodSummary) {
    moodSummary.textContent = 'Chat is loving the gameplay — lots of hype and positive reactions';
  }

  // Show sentiment samples
  const sentimentSamples = document.getElementById('sentiment-samples');
  if (sentimentSamples) {
    sentimentSamples.classList.remove('hidden');
    sentimentSamples.innerHTML = `
      <div class="samples-label">Sample positive messages</div>
      <ul class="samples-list">
        <li>PogChamp that was absolutely insane!!</li>
        <li>This is the best gaming content on the platform, love it</li>
        <li>LUL incredible play, chat is going off!</li>
      </ul>
    `;
  }

  // Show topics section with a few tags
  const topicsSection = document.getElementById('topics-section');
  const topicsCloud = document.getElementById('topics-cloud');
  if (topicsSection) topicsSection.classList.remove('hidden');
  if (topicsCloud) {
    topicsCloud.innerHTML = '';
    const topics = [
      { word: 'PogChamp', count: 94, emote: true, size: 'size-large' },
      { word: 'clutch', count: 47, emote: false, size: 'size-medium' },
      { word: 'LUL', count: 38, emote: true, size: 'size-medium' },
      { word: 'gameplay', count: 22, emote: false, size: 'size-small' },
    ];
    for (const t of topics) {
      const tag = document.createElement('span');
      tag.className = `topic-tag ${t.emote ? 'emote' : ''} ${t.size}`.trim();
      tag.innerHTML = `${t.word} <span class="topic-count">${t.count}</span>`;
      topicsCloud.appendChild(tag);
    }
  }

  // Show a minimal cluster section
  const clusters = document.getElementById('clusters');
  if (clusters) {
    clusters.innerHTML = '';
    const bucketEl = document.createElement('div');
    bucketEl.className = 'cluster-bucket';
    bucketEl.innerHTML = `
      <div class="cluster-header">
        <span class="cluster-label">Questions</span>
        <span class="cluster-count">4</span>
      </div>
      <div class="cluster-messages">
        <div class="message-item">What settings are you using for the graphics?</div>
        <div class="message-item">How do you get that ability so early?</div>
      </div>
    `;
    clusters.appendChild(bucketEl);
  }

  // Show End Session button
  const endSessionBtn = document.getElementById('end-session-btn');
  if (endSessionBtn) endSessionBtn.classList.remove('hidden');
}

/**
 * Screenshot 3: Topics — Focus on trending topics cloud prominently
 */
function injectTopicsView() {
  // Hide first-run guidance
  const firstRun = document.getElementById('first-run');
  if (firstRun) firstRun.classList.add('hidden');

  // Show active status
  const status = document.getElementById('status');
  const statusText = document.getElementById('status-text');
  if (status) {
    status.classList.remove('hidden');
    status.classList.add('active');
  }
  if (statusText) statusText.textContent = 'Analyzing 847 messages';

  // Show stats
  const stats = document.getElementById('stats');
  const processedCount = document.getElementById('processed-count');
  const windowCurrent = document.getElementById('window-current');
  const windowMax = document.getElementById('window-max');
  if (stats) stats.classList.remove('hidden');
  if (processedCount) processedCount.textContent = '847';
  if (windowCurrent) windowCurrent.textContent = '500';
  if (windowMax) windowMax.textContent = '500';

  // Show mood in a less prominent positive state
  const moodSection = document.getElementById('mood-section');
  const moodEmoji = document.getElementById('mood-emoji');
  const moodLabel = document.getElementById('mood-label');
  const moodConfidence = document.getElementById('mood-confidence');
  const moodSummary = document.getElementById('mood-summary');
  if (moodSection) {
    moodSection.classList.remove('hidden');
    moodSection.className = 'mood-section positive';
  }
  if (moodEmoji) moodEmoji.textContent = '😄';
  if (moodLabel) moodLabel.textContent = 'Positive';
  if (moodConfidence) moodConfidence.textContent = 'moderate signal';
  if (moodSummary) moodSummary.textContent = 'Chat is engaged and enjoying the content';

  // Show topics section prominently with 10 topic tags of varying sizes
  const topicsSection = document.getElementById('topics-section');
  const topicsCloud = document.getElementById('topics-cloud');
  if (topicsSection) topicsSection.classList.remove('hidden');
  if (topicsCloud) {
    topicsCloud.innerHTML = '';
    const topics = [
      { word: 'PogChamp', count: 94, emote: true, size: 'size-large' },
      { word: 'clutch', count: 71, emote: false, size: 'size-large' },
      { word: 'LUL', count: 58, emote: true, size: 'size-large' },
      { word: 'nerf', count: 43, emote: false, size: 'size-medium' },
      { word: 'settings', count: 38, emote: false, size: 'size-medium' },
      { word: 'GG', count: 31, emote: false, size: 'size-medium' },
      { word: 'boss', count: 24, emote: false, size: 'size-medium' },
      { word: 'HeyGuys', count: 19, emote: true, size: 'size-small' },
      { word: 'inventory', count: 14, emote: false, size: 'size-small' },
      { word: 'patch', count: 11, emote: false, size: 'size-small' },
      { word: 'OMEGALUL', count: 9, emote: true, size: 'size-small' },
    ];
    for (const t of topics) {
      const tag = document.createElement('span');
      tag.className = `topic-tag ${t.emote ? 'emote' : ''} ${t.size}`.trim();
      tag.innerHTML = `${t.word} <span class="topic-count">${t.count}</span>`;
      topicsCloud.appendChild(tag);
    }
  }

  // Show minimal clusters
  const clusters = document.getElementById('clusters');
  if (clusters) {
    clusters.innerHTML = '';
    const bucketEl = document.createElement('div');
    bucketEl.className = 'cluster-bucket';
    bucketEl.innerHTML = `
      <div class="cluster-header">
        <span class="cluster-label">Requests</span>
        <span class="cluster-count">2</span>
      </div>
      <div class="cluster-messages">
        <div class="message-item">Can you show the inventory screen?</div>
      </div>
    `;
    clusters.appendChild(bucketEl);
  }

  // Show End Session button
  const endSessionBtn = document.getElementById('end-session-btn');
  if (endSessionBtn) endSessionBtn.classList.remove('hidden');
}

// ============================================================================
// Main
// ============================================================================

const SCREENSHOTS = [
  {
    name: 'screenshot-clusters',
    inject: injectClustersView,
    label: 'Clusters view',
  },
  {
    name: 'screenshot-mood',
    inject: injectMoodView,
    label: 'Mood/Sentiment view',
  },
  {
    name: 'screenshot-topics',
    inject: injectTopicsView,
    label: 'Trending Topics view',
  },
];

let browser;
try {
  await mkdir(OUTPUT_DIR, { recursive: true });

  browser = await chromium.launch({ headless: true });

  for (const config of SCREENSHOTS) {
    const context = await browser.newContext({
      viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
      colorScheme: 'dark',
      deviceScaleFactor: 1,
    });

    const page = await context.newPage();

    // Inject chrome API stubs BEFORE page load to prevent sidebar.js crash
    await page.addInitScript(CHROME_STUBS);

    // Navigate to actual sidebar HTML
    await page.goto(`file://${SIDEBAR_PATH}`);
    await page.waitForLoadState('domcontentloaded');

    // Brief pause to let CSS load and apply
    await page.waitForTimeout(500);

    // Set body/html background so 1280px viewport sides are filled with dark color
    await page.evaluate(() => {
      document.body.style.maxWidth = '420px';
      document.body.style.margin = '0 auto';
      document.body.style.background = '#1f2937';
      document.documentElement.style.background = '#1f2937';
    });

    // Inject mock data for this screenshot
    await page.evaluate(config.inject);

    // Allow DOM updates to paint
    await page.waitForTimeout(200);

    // Capture screenshot at exactly viewport dimensions (no fullPage)
    const outputPath = path.resolve(OUTPUT_DIR, `${config.name}.png`);
    await page.screenshot({
      path: outputPath,
      type: 'png',
    });

    console.log(`Generated ${config.label}: ${outputPath}`);

    await context.close();
  }

  console.log('All screenshots generated successfully.');
} catch (err) {
  console.error('Screenshot generation failed:', err);
  process.exit(1);
} finally {
  if (browser) await browser.close();
}
