import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

// In-memory chrome.storage.local mock
let storageData = {};

globalThis.chrome = {
  storage: {
    local: {
      get: async (key) => {
        if (typeof key === 'string') {
          return { [key]: storageData[key] };
        }
        return {};
      },
      set: async (obj) => {
        Object.assign(storageData, obj);
      },
      remove: async (key) => {
        delete storageData[key];
      }
    }
  }
};

const { saveSession, loadSessions, getSession, deleteSession, clearAllSessions, getStorageStats } = await import(
  `../extension/storage-manager.js?t=${Date.now()}`
);

describe('storage-manager', () => {
  beforeEach(() => {
    storageData = {};
  });

  it('saves a session and returns an id', async () => {
    const id = await saveSession({ messageCount: 10, mood: 'positive', platform: 'youtube' });
    assert.ok(id.startsWith('session_'));
    const sessions = await loadSessions();
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].messageCount, 10);
  });

  it('loads sessions in insertion order (newest first)', async () => {
    await saveSession({ n: 1 });
    await saveSession({ n: 2 });
    const sessions = await loadSessions();
    assert.equal(sessions.length, 2);
    assert.equal(sessions[0].n, 2);
    assert.equal(sessions[1].n, 1);
  });

  it('caps sessions at MAX_SESSIONS (50)', async () => {
    for (let i = 0; i < 55; i++) {
      await saveSession({ i });
    }
    const sessions = await loadSessions();
    assert.equal(sessions.length, 50);
  });

  it('retrieves a session by id', async () => {
    const id = await saveSession({ mood: 'angry' });
    const session = await getSession(id);
    assert.equal(session.mood, 'angry');
  });

  it('returns null for unknown session id', async () => {
    const session = await getSession('nonexistent');
    assert.equal(session, null);
  });

  it('deletes a session by id', async () => {
    const id = await saveSession({ data: 'x' });
    const deleted = await deleteSession(id);
    assert.equal(deleted, true);
    const sessions = await loadSessions();
    assert.equal(sessions.length, 0);
  });

  it('returns false when deleting nonexistent session', async () => {
    const deleted = await deleteSession('nope');
    assert.equal(deleted, false);
  });

  it('clears all sessions', async () => {
    await saveSession({ a: 1 });
    await saveSession({ b: 2 });
    await clearAllSessions();
    const sessions = await loadSessions();
    assert.equal(sessions.length, 0);
  });

  it('reports storage stats', async () => {
    await saveSession({ msg: 'hello' });
    const stats = await getStorageStats();
    assert.equal(stats.count, 1);
    assert.ok(stats.bytesUsed > 0);
  });
});
