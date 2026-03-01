/**
 * Session management for chat signal radar
 * Handles session lifecycle, inactivity detection, and data persistence
 */

import { stateManager } from './StateManager.js';
import { validateSessionData } from '../utils/ValidationHelpers.js';
import { saveSession, loadSessions, clearAllSessions } from '../../storage-manager.js';
import { formatDuration } from '../utils/FormattingHelpers.js';

export class SessionManager {
  constructor() {
    this.isTestEnv = typeof chrome === 'undefined' || !chrome.storage;
  }
  
  /**
   * Initialize session management
   */
  initialize() {
    this.loadExistingSessions();
  }
  
  /**
   * Start a new session
   */
  startSession(platform, title, url = null) {
    stateManager.startSession(platform, title, url);
    this.startInactivityCheck();
    
    console.log(`[SessionManager] Started session for ${platform}: ${title}`);
  }
  
  /**
   * End the current session and save data
   */
  async endSession() {
    const sessionData = stateManager.getSessionData();
    if (!sessionData) {
      console.warn('[SessionManager] No active session to end');
      return null;
    }
    
    this.stopInactivityCheck();
    
    try {
      const sessionId = await this.saveSession(sessionData);
      console.log('[SessionManager] Session ended and saved:', sessionId);
      return sessionId;
    } catch (error) {
      console.error('[SessionManager] Failed to save session:', error);
      throw error;
    }
  }
  
  /**
   * Save current session data
   */
  async saveCurrentSession() {
    const sessionData = stateManager.getSessionData();
    if (!sessionData) {
      return null;
    }
    
    return this.saveSession(sessionData);
  }
  
  /**
   * Save session data to storage
   */
  async saveSession(sessionData) {
    // Validate session data before saving
    validateSessionData(sessionData);
    
    if (this.isTestEnv) {
      // Mock save for test environment
      console.log('[SessionManager] Test mode: would save session', sessionData);
      return 'test-session-id';
    }
    
    try {
      const sessionId = await saveSession(sessionData);
      return sessionId;
    } catch (error) {
      console.error('[SessionManager] Failed to save session:', error);
      throw error;
    }
  }
  
  /**
   * Load existing sessions from storage
   */
  async loadExistingSessions() {
    if (this.isTestEnv) {
      return [];
    }
    
    try {
      const sessions = await loadSessions();
      return sessions.sort((a, b) => b.endTime - a.endTime); // Most recent first
    } catch (error) {
      console.error('[SessionManager] Failed to load sessions:', error);
      return [];
    }
  }
  
  /**
   * Clear all session history
   */
  async clearAllSessions() {
    if (this.isTestEnv) {
      console.log('[SessionManager] Test mode: would clear all sessions');
      return true;
    }
    
    try {
      await clearAllSessions();
      console.log('[SessionManager] All sessions cleared');
      return true;
    } catch (error) {
      console.error('[SessionManager] Failed to clear sessions:', error);
      throw error;
    }
  }
  
  /**
   * Start inactivity detection
   */
  startInactivityCheck() {
    this.stopInactivityCheck();
    
    const intervalId = setInterval(() => {
      const lastMessageTime = stateManager.state.lastMessageTime;
      const sessionStartTime = stateManager.state.sessionStartTime;
      
      if (lastMessageTime && sessionStartTime) {
        const timeSinceLastMessage = Date.now() - lastMessageTime;
        const inactivityMs = (stateManager.settings.inactivityTimeout || 120) * 1000;
        if (timeSinceLastMessage >= inactivityMs) {
          this.showStreamEndedPrompt();
          this.stopInactivityCheck();
        }
      }
    }, 10000); // Check every 10 seconds
    
    stateManager.setInactivityCheckInterval(intervalId);
  }
  
  /**
   * Stop inactivity detection
   */
  stopInactivityCheck() {
    stateManager.clearInactivityCheckInterval();
  }
  
  /**
   * Show prompt when stream appears to have ended
   */
  showStreamEndedPrompt() {
    const hasSessionData = stateManager.lastAnalysisResult && stateManager.sessionStartTime;
    
    if (hasSessionData) {
      // Dispatch event for UI to show the prompt
      this.dispatchSessionEvent('stream-ended-prompt', {
        hasData: true,
        platform: stateManager.currentPlatform,
        messageCount: stateManager.totalMessageCount
      });
    }
  }
  
  /**
   * Hide the stream ended prompt
   */
  hideStreamEndedPrompt() {
    this.dispatchSessionEvent('stream-ended-prompt-hide');
  }
  
  /**
   * Get session summary data for UI display
   */
  getSessionSummary() {
    const sessionData = stateManager.getSessionData();
    if (!sessionData) {
      return null;
    }
    
    const lastAnalysis = stateManager.lastAnalysisResult;
    const duration = Date.now() - sessionData.startTime;
    
    return {
      ...sessionData,
      duration,
      formattedDuration: formatDuration(duration),
      sentimentData: {
        ...stateManager.sessionSentiment,
        total: stateManager.sessionSentiment.positive_count + 
              stateManager.sessionSentiment.negative_count + 
              stateManager.sessionSentiment.confused_count + 
              stateManager.sessionSentiment.neutral_count
      },
      buckets: lastAnalysis?.buckets || [],
      topics: lastAnalysis?.topics || []
    };
  }
  
  /**
   * Get session data for detail view
   */
  getSessionDetail(sessionId) {
    // This would normally fetch from storage by ID
    // For now, return current session data
    return stateManager.getSessionData();
  }
  
  /**
   * Add a question to the session
   */
  addSessionQuestion(question) {
    stateManager.addQuestion(question);
  }
  
  /**
   * Update session sentiment
   */
  updateSessionSentiment(sentimentSignals) {
    stateManager.updateSentiment(sentimentSignals);
  }
  
  /**
   * Update analysis result
   */
  updateAnalysisResult(result) {
    stateManager.setAnalysisResult(result);
  }
  
  /**
   * Check if session is active
   */
  isSessionActive() {
    return stateManager.sessionStartTime !== null;
  }
  
  /**
   * Get session statistics
   */
  getSessionStats() {
    if (!this.isSessionActive()) {
      return null;
    }
    
    return {
      duration: Date.now() - stateManager.sessionStartTime,
      messageCount: stateManager.totalMessageCount,
      questionCount: stateManager.sessionQuestions.length,
      mood: stateManager.currentMood,
      platform: stateManager.currentPlatform
    };
  }
  
  /**
   * Dispatch session-related events for UI components
   */
  dispatchSessionEvent(eventType, data = {}) {
    const event = new CustomEvent(eventType, {
      detail: data,
      bubbles: true
    });
    document.dispatchEvent(event);
  }
  
  /**
   * Clean up session resources
   */
  cleanup() {
    this.stopInactivityCheck();
    // Note: We don't clear the state here as that's handled by StateManager
  }
}

// Export singleton instance
export const sessionManager = new SessionManager();