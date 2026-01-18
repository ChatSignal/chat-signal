// Storage Manager for Session History
// Uses chrome.storage.local for persisting session summaries

const STORAGE_KEY = 'sessionHistory';
const MAX_SESSIONS = 50;

/**
 * Session data schema
 * @typedef {Object} SessionData
 * @property {string} id - Unique session ID (timestamp-based)
 * @property {number} startTime - Session start timestamp
 * @property {number} endTime - Session end timestamp
 * @property {number} duration - Duration in milliseconds
 * @property {string} platform - 'youtube' | 'twitch'
 * @property {string} streamTitle - Title of the stream
 * @property {string} streamUrl - URL of the stream
 * @property {number} messageCount - Total messages processed
 * @property {Array} buckets - ClusterBucket array
 * @property {Array} topics - TopicEntry array
 * @property {Object} sentimentSignals - Sentiment analysis results
 * @property {string} mood - Final mood classification
 * @property {number} savedAt - Timestamp when saved
 */

/**
 * Save a session to history
 * @param {SessionData} sessionData
 * @returns {Promise<string>} Session ID
 */
export async function saveSession(sessionData) {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const sessions = result[STORAGE_KEY] || [];

    // Generate unique ID
    const id = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const session = {
      ...sessionData,
      id,
      savedAt: Date.now()
    };

    // Add new session at the beginning
    sessions.unshift(session);

    // Trim to max sessions
    if (sessions.length > MAX_SESSIONS) {
      sessions.splice(MAX_SESSIONS);
    }

    await chrome.storage.local.set({ [STORAGE_KEY]: sessions });

    return id;
  } catch (error) {
    console.error('[Storage] Failed to save session:', error);
    throw error;
  }
}

/**
 * Load sessions from history
 * @param {number} limit - Maximum sessions to return (default: 50)
 * @returns {Promise<SessionData[]>}
 */
export async function loadSessions(limit = MAX_SESSIONS) {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const sessions = result[STORAGE_KEY] || [];
    return sessions.slice(0, limit);
  } catch (error) {
    console.error('[Storage] Failed to load sessions:', error);
    return [];
  }
}

/**
 * Get a single session by ID
 * @param {string} sessionId
 * @returns {Promise<SessionData|null>}
 */
export async function getSession(sessionId) {
  try {
    const sessions = await loadSessions();
    return sessions.find(s => s.id === sessionId) || null;
  } catch (error) {
    console.error('[Storage] Failed to get session:', error);
    return null;
  }
}

/**
 * Delete a session by ID
 * @param {string} sessionId
 * @returns {Promise<boolean>}
 */
export async function deleteSession(sessionId) {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const sessions = result[STORAGE_KEY] || [];

    const filtered = sessions.filter(s => s.id !== sessionId);

    if (filtered.length === sessions.length) {
      return false; // Session not found
    }

    await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
    return true;
  } catch (error) {
    console.error('[Storage] Failed to delete session:', error);
    throw error;
  }
}

/**
 * Clear all session history
 * @returns {Promise<void>}
 */
export async function clearAllSessions() {
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
  } catch (error) {
    console.error('[Storage] Failed to clear sessions:', error);
    throw error;
  }
}

/**
 * Get storage usage stats
 * @returns {Promise<{count: number, bytesUsed: number}>}
 */
export async function getStorageStats() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const sessions = result[STORAGE_KEY] || [];
    const bytesUsed = JSON.stringify(sessions).length;
    return {
      count: sessions.length,
      bytesUsed
    };
  } catch (error) {
    console.error('[Storage] Failed to get storage stats:', error);
    return { count: 0, bytesUsed: 0 };
  }
}
