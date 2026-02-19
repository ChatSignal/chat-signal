/**
 * Centralized state management for the chat signal radar sidebar
 * Replaces scattered global variables with a single state object
 */

export class StateManager {
  constructor() {
    this.state = {
      // WASM and LLM state
      wasmModule: null,
      llmEnabled: false,
      isLLMReady: false,
      
      // Settings
      settings: { ...DEFAULT_SETTINGS },
      
      // Session tracking
      sessionStartTime: null,
      lastAnalysisResult: null,
      currentPlatform: null,
      currentStreamTitle: null,
      currentStreamUrl: null,
      currentMood: 'neutral',
      
      // Message accumulation
      allMessages: [],
      sessionQuestions: [],
      totalMessageCount: 0,
      
      // Sentiment tracking
      sessionSentiment: {
        positive_count: 0,
        negative_count: 0,
        confused_count: 0,
        neutral_count: 0
      },
      lastSentimentUpdate: 0,
      
      // Inactivity detection
      lastMessageTime: null,
      inactivityCheckInterval: null,
      
      // UI state
      currentView: 'live', // 'live' or 'history'
      isProcessing: false,
      sessionTimeoutId: null,
      batchTimeoutId: null
    };
    
    // Constants
    this.MAX_MESSAGES = 500;
    this.MAX_SESSION_QUESTIONS = 50;
  }
  
  // Getters for commonly used state
  get wasmModule() { return this.state.wasmModule; }
  get llmEnabled() { return this.state.llmEnabled; }
  get isLLMReady() { return this.state.isLLMReady; }
  get settings() { return this.state.settings; }
  get currentMood() { return this.state.currentMood; }
  get currentView() { return this.state.currentView; }
  get isProcessing() { return this.state.isProcessing; }
  get sessionStartTime() { return this.state.sessionStartTime; }
  get totalMessageCount() { return this.state.totalMessageCount; }
  get sessionQuestions() { return this.state.sessionQuestions; }
  get sessionSentiment() { return this.state.sessionSentiment; }
  get lastAnalysisResult() { return this.state.lastAnalysisResult; }
  get currentPlatform() { return this.state.currentPlatform; }
  get currentStreamTitle() { return this.state.currentStreamTitle; }
  get allMessages() { return this.state.allMessages; }
  
  // Setters with validation
  set wasmModule(module) {
    this.state.wasmModule = module;
  }
  
  set llmEnabled(enabled) {
    this.state.llmEnabled = Boolean(enabled);
  }
  
  set isLLMReady(ready) {
    this.state.isLLMReady = Boolean(ready);
  }
  
  set settings(newSettings) {
    if (newSettings && typeof newSettings === 'object') {
      this.state.settings = { ...this.state.settings, ...newSettings };
    }
  }
  
  set currentMood(mood) {
    const validMoods = ['neutral', 'positive', 'negative', 'confused', 'excited', 'angry'];
    if (validMoods.includes(mood)) {
      this.state.currentMood = mood;
    }
  }
  
  set currentView(view) {
    if (view === 'live' || view === 'history') {
      this.state.currentView = view;
    }
  }
  
  set isProcessing(processing) {
    this.state.isProcessing = Boolean(processing);
  }
  
  // Session management methods
  startSession(platform, title, url = null) {
    this.state.sessionStartTime = Date.now();
    this.state.currentPlatform = platform;
    this.state.currentStreamTitle = title;
    this.state.currentStreamUrl = url;
    this.state.currentMood = 'neutral';
    this.state.sessionQuestions = [];
    this.state.totalMessageCount = 0;
    this.state.sessionSentiment = {
      positive_count: 0,
      negative_count: 0,
      confused_count: 0,
      neutral_count: 0
    };
    this.state.allMessages = [];
    this.state.lastMessageTime = Date.now();
  }
  
  endSession() {
    const sessionData = this.getSessionData();
    this.state.sessionStartTime = null;
    this.state.lastAnalysisResult = null;
    return sessionData;
  }
  
  getSessionData() {
    if (!this.state.sessionStartTime) return null;
    
    return {
      startTime: this.state.sessionStartTime,
      endTime: Date.now(),
      platform: this.state.currentPlatform,
      streamTitle: this.state.currentStreamTitle,
      streamUrl: this.state.currentStreamUrl,
      totalMessages: this.state.totalMessageCount,
      finalMood: this.state.currentMood,
      questions: [...this.state.sessionQuestions],
      sentiment: { ...this.state.sessionSentiment },
      lastAnalysis: this.state.lastAnalysisResult
    };
  }
  
  // Message management
  addMessage(message) {
    this.state.allMessages.push(message);
    this.state.lastMessageTime = Date.now();
    
    // Keep only the last MAX_MESSAGES for processing
    if (this.state.allMessages.length > this.MAX_MESSAGES) {
      this.state.allMessages = this.state.allMessages.slice(-this.MAX_MESSAGES);
    }
    
    this.state.totalMessageCount++;
  }
  
  setMaxMessages(n) {
    this.MAX_MESSAGES = Math.max(50, Math.min(1000, parseInt(n, 10) || 500));
  }

  addQuestion(question) {
    if (!this.state.sessionQuestions.includes(question)) {
      this.state.sessionQuestions.push(question);
      // Keep only the last MAX_SESSION_QUESTIONS
      if (this.state.sessionQuestions.length > this.MAX_SESSION_QUESTIONS) {
        this.state.sessionQuestions = this.state.sessionQuestions.slice(-this.MAX_SESSION_QUESTIONS);
      }
    }
  }
  
  updateSentiment(sentimentSignals) {
    if (!sentimentSignals) return;
    
    // Update cumulative sentiment counts
    this.state.sessionSentiment.positive_count += sentimentSignals.positive_count || 0;
    this.state.sessionSentiment.negative_count += sentimentSignals.negative_count || 0;
    this.state.sessionSentiment.confused_count += sentimentSignals.confused_count || 0;
    this.state.sessionSentiment.neutral_count += sentimentSignals.neutral_count || 0;
    
    this.state.lastSentimentUpdate = Date.now();
  }
  
  setAnalysisResult(result) {
    this.state.lastAnalysisResult = result;
  }
  
  // Timeout management
  setSessionTimeout(id) {
    this.clearSessionTimeout();
    this.state.sessionTimeoutId = id;
  }
  
  clearSessionTimeout() {
    if (this.state.sessionTimeoutId) {
      clearTimeout(this.state.sessionTimeoutId);
      this.state.sessionTimeoutId = null;
    }
  }
  
  setBatchTimeout(id) {
    this.clearBatchTimeout();
    this.state.batchTimeoutId = id;
  }
  
  clearBatchTimeout() {
    if (this.state.batchTimeoutId) {
      clearTimeout(this.state.batchTimeoutId);
      this.state.batchTimeoutId = null;
    }
  }
  
  setInactivityCheckInterval(id) {
    this.clearInactivityCheckInterval();
    this.state.inactivityCheckInterval = id;
  }
  
  clearInactivityCheckInterval() {
    if (this.state.inactivityCheckInterval) {
      clearInterval(this.state.inactivityCheckInterval);
      this.state.inactivityCheckInterval = null;
    }
  }
  
  // Cleanup method
  cleanup() {
    this.clearSessionTimeout();
    this.clearBatchTimeout();
    this.clearInactivityCheckInterval();
    
    // Reset state
    this.state = {
      wasmModule: null,
      llmEnabled: false,
      isLLMReady: false,
      settings: { ...DEFAULT_SETTINGS },
      sessionStartTime: null,
      lastAnalysisResult: null,
      currentPlatform: null,
      currentStreamTitle: null,
      currentStreamUrl: null,
      currentMood: 'neutral',
      allMessages: [],
      sessionQuestions: [],
      totalMessageCount: 0,
      sessionSentiment: {
        positive_count: 0,
        negative_count: 0,
        confused_count: 0,
        neutral_count: 0
      },
      lastSentimentUpdate: 0,
      lastMessageTime: null,
      inactivityCheckInterval: null,
      currentView: 'live',
      isProcessing: false,
      sessionTimeoutId: null,
      batchTimeoutId: null
    };
  }
}

// Default settings (moved from sidebar.js)
const DEFAULT_SETTINGS = {
  topicMinCount: 5,
  spamThreshold: 3,
  duplicateWindow: 30,
  aiSummariesEnabled: false,
  aiConsentShown: false,
  analysisWindowSize: 500,
  inactivityTimeout: 120
};

// Export singleton instance
export const stateManager = new StateManager();