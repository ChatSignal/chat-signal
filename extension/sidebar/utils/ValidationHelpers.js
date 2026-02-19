/**
 * Input validation utilities for WASM data and user input
 * Centralizes all validation logic for better security and maintainability
 */

// Message validation
export function validateMessages(messages) {
  if (!Array.isArray(messages)) {
    throw new Error('Messages must be an array');
  }
  
  messages.forEach((msg, index) => {
    if (!msg || typeof msg !== 'object') {
      throw new Error(`Message at index ${index} must be an object`);
    }
    if (typeof msg.text !== 'string' || msg.text.length > 1000) {
      throw new Error(`Message at index ${index}: text must be string <= 1000 chars`);
    }
    if (typeof msg.timestamp !== 'number' || msg.timestamp <= 0) {
      throw new Error(`Message at index ${index}: timestamp must be positive number`);
    }
    if (msg.author && (typeof msg.author !== 'string' || msg.author.length > 50)) {
      throw new Error(`Message at index ${index}: author must be string <= 50 chars`);
    }
  });
  
  return true;
}

// WASM AnalysisResult validation
export function validateAnalysisResult(result) {
  if (!result || typeof result !== 'object') {
    throw new Error('Invalid result: must be an object');
  }
  
  // Validate buckets
  if (!Array.isArray(result.buckets)) {
    throw new Error('Invalid result: buckets must be an array');
  }
  result.buckets.forEach((bucket, index) => {
    if (!bucket || typeof bucket !== 'object') {
      throw new Error(`Invalid bucket at index ${index}: must be an object`);
    }
    if (typeof bucket.label !== 'string' || bucket.label.length > 100) {
      throw new Error(`Invalid bucket at index ${index}: label must be a string <= 100 chars`);
    }
    if (typeof bucket.count !== 'number' || bucket.count < 0) {
      throw new Error(`Invalid bucket at index ${index}: count must be a non-negative number`);
    }
    if (!Array.isArray(bucket.sample_messages)) {
      throw new Error(`Invalid bucket at index ${index}: sample_messages must be an array`);
    }
    bucket.sample_messages.forEach((msg, msgIndex) => {
      if (typeof msg !== 'string' || msg.length > 500) {
        throw new Error(`Invalid message at bucket ${index}, message ${msgIndex}: must be string <= 500 chars`);
      }
    });
  });
  
  // Validate topics
  if (result.topics && !Array.isArray(result.topics)) {
    throw new Error('Invalid result: topics must be an array if present');
  }
  if (result.topics) {
    result.topics.forEach((topic, index) => {
      if (!topic || typeof topic !== 'object') {
        throw new Error(`Invalid topic at index ${index}: must be an object`);
      }
      if (typeof topic.term !== 'string' || topic.term.length > 50) {
        throw new Error(`Invalid topic at index ${index}: term must be string <= 50 chars`);
      }
      if (typeof topic.count !== 'number' || topic.count <= 0) {
        throw new Error(`Invalid topic at index ${index}: count must be positive number`);
      }
      if (typeof topic.is_emote !== 'boolean') {
        throw new Error(`Invalid topic at index ${index}: is_emote must be boolean`);
      }
    });
  }
  
  // Validate sentiment signals
  if (result.sentiment_signals && typeof result.sentiment_signals !== 'object') {
    throw new Error('Invalid result: sentiment_signals must be an object if present');
  }
  
  if (result.sentiment_signals) {
    const sentimentFields = ['positive_count', 'negative_count', 'confused_count', 'neutral_count'];
    sentimentFields.forEach(field => {
      if (typeof result.sentiment_signals[field] !== 'number' || result.sentiment_signals[field] < 0) {
        throw new Error(`Invalid sentiment_signals.${field}: must be non-negative number`);
      }
    });
  }
  
  // Validate processed_count
  if (typeof result.processed_count !== 'number' || result.processed_count < 0) {
    throw new Error('Invalid result: processed_count must be a non-negative number');
  }
  
  return true;
}

// Settings validation
export function validateSettings(settings) {
  if (!settings || typeof settings !== 'object') {
    throw new Error('Settings must be an object');
  }
  
  // Validate topicMinCount
  if (typeof settings.topicMinCount !== 'number' || settings.topicMinCount < 1 || settings.topicMinCount > 100) {
    throw new Error('topicMinCount must be a number between 1 and 100');
  }
  
  // Validate spamThreshold
  if (typeof settings.spamThreshold !== 'number' || settings.spamThreshold < 1 || settings.spamThreshold > 10) {
    throw new Error('spamThreshold must be a number between 1 and 10');
  }
  
  // Validate duplicateWindow
  if (typeof settings.duplicateWindow !== 'number' || settings.duplicateWindow < 5 || settings.duplicateWindow > 300) {
    throw new Error('duplicateWindow must be a number between 5 and 300 seconds');
  }

  // Validate analysisWindowSize
  if (settings.analysisWindowSize !== undefined) {
    if (typeof settings.analysisWindowSize !== 'number' ||
        !Number.isInteger(settings.analysisWindowSize) ||
        settings.analysisWindowSize < 50 ||
        settings.analysisWindowSize > 1000) {
      throw new Error('analysisWindowSize must be an integer between 50 and 1000');
    }
  }

  // Validate inactivityTimeout
  if (settings.inactivityTimeout !== undefined) {
    if (!Number.isFinite(settings.inactivityTimeout) || settings.inactivityTimeout < 30 || settings.inactivityTimeout > 600) {
      throw new Error('inactivityTimeout must be a number between 30 and 600 seconds');
    }
  }

  // Validate boolean settings
  const booleanSettings = ['aiSummariesEnabled', 'aiConsentShown'];
  booleanSettings.forEach(setting => {
    if (typeof settings[setting] !== 'boolean') {
      throw new Error(`${setting} must be a boolean`);
    }
  });
  
  return true;
}

// Session data validation
export function validateSessionData(sessionData) {
  if (!sessionData || typeof sessionData !== 'object') {
    throw new Error('Session data must be an object');
  }
  
  // Required fields
  const requiredFields = ['startTime', 'endTime', 'platform', 'totalMessages', 'finalMood'];
  requiredFields.forEach(field => {
    if (!(field in sessionData)) {
      throw new Error(`Session data missing required field: ${field}`);
    }
  });
  
  // Validate timestamps
  if (typeof sessionData.startTime !== 'number' || sessionData.startTime <= 0) {
    throw new Error('Session startTime must be a positive number');
  }
  if (typeof sessionData.endTime !== 'number' || sessionData.endTime <= 0) {
    throw new Error('Session endTime must be a positive number');
  }
  if (sessionData.endTime < sessionData.startTime) {
    throw new Error('Session endTime must be after startTime');
  }
  
  // Validate platform
  if (typeof sessionData.platform !== 'string' || !['youtube', 'twitch'].includes(sessionData.platform)) {
    throw new Error('Session platform must be "youtube" or "twitch"');
  }
  
  // Validate message count
  if (typeof sessionData.totalMessages !== 'number' || sessionData.totalMessages < 0) {
    throw new Error('Session totalMessages must be a non-negative number');
  }
  
  // Validate mood
  const validMoods = ['neutral', 'positive', 'negative', 'confused', 'excited', 'angry'];
  if (!validMoods.includes(sessionData.finalMood)) {
    throw new Error(`Session finalMood must be one of: ${validMoods.join(', ')}`);
  }
  
  // Validate optional fields
  if (sessionData.questions && !Array.isArray(sessionData.questions)) {
    throw new Error('Session questions must be an array');
  }
  
  if (sessionData.sentiment && typeof sessionData.sentiment !== 'object') {
    throw new Error('Session sentiment must be an object');
  }
  
  return true;
}

// Sanitization utilities
export function sanitizeText(text, maxLength = 1000) {
  if (typeof text !== 'string') {
    return '';
  }
  
  // Remove potentially dangerous characters
  return text
    .slice(0, maxLength)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // Remove control characters
}

export function sanitizePlatform(platform) {
  const validPlatforms = ['youtube', 'twitch'];
  return validPlatforms.includes(platform) ? platform : null;
}

// Type checking utilities
export function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

export function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

export function isValidTimestamp(value) {
  return isPositiveInteger(value) && value <= Date.now() + 86400000; // Allow 1 day in future for clock skew
}