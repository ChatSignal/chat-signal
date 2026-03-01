use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ============================================================================
// WORD LISTS FOR FILTERING AND SENTIMENT
// ============================================================================

/// Common English stop words to filter from topic detection
const STOP_WORDS: &[&str] = &[
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "must", "shall", "can", "need", "to", "of",
    "in", "for", "on", "with", "at", "by", "from", "as", "into", "about",
    "like", "through", "after", "over", "between", "out", "against",
    "during", "without", "before", "under", "around", "among", "this",
    "that", "these", "those", "i", "you", "he", "she", "it", "we", "they",
    "me", "him", "her", "us", "them", "my", "your", "his", "its", "our",
    "their", "mine", "yours", "hers", "ours", "theirs", "and", "but", "or",
    "nor", "so", "yet", "just", "also", "only", "even", "then", "than",
    "when", "if", "not", "no", "yes", "all", "any", "some", "every",
    "each", "both", "few", "more", "most", "other", "such", "own", "same",
    "too", "very", "here", "there", "where", "who", "what", "which", "how",
    "why", "im", "dont", "cant", "wont", "didnt", "isnt", "arent", "wasnt",
    "werent", "hasnt", "havent", "hadnt", "doesnt", "couldnt", "wouldnt",
    "shouldnt", "gonna", "gotta", "its", "thats", "youre", "theyre", "were",
    "hes", "shes", "whats", "theres", "heres", "get", "got", "go", "going",
    "one", "two", "first", "now", "new", "way", "well", "back", "up", "down",
    "out", "off", "come", "came", "make", "made", "take", "took", "see",
    "saw", "know", "knew", "think", "thought", "look", "looks", "looking",
    "want", "use", "find", "give", "tell", "say", "said", "let", "put",
    "try", "leave", "call", "keep", "still", "thing", "things", "really",
    "right", "yeah", "yea", "okay", "ok", "lol", "lmao", "haha", "xd",
];

/// Known Twitch/YouTube emotes (keep these as topics, flag as emotes)
const KNOWN_EMOTES: &[&str] = &[
    "pog", "pogchamp", "kappa", "lul", "lulw", "omegalul", "pepe", "pepega",
    "monkas", "sadge", "copium", "kekw", "poggers", "trihard", "4head",
    "biblethump", "kreygasm", "residentsleeper", "wutface", "hype", "gg",
    "ez", "rip", "pepehands", "pepelaugh", "catjam", "modcheck", "based",
    "cringe", "monkaw", "pausechamp", "widepeeposad", "widepeeohappy",
    "peeposad", "peepohappy", "feelsbadman", "feelsgoodman", "jebaited",
    "notlikethis", "babyrage", "pepejam", "batchest", "clueless", "aware",
];

/// Positive sentiment indicators
const POSITIVE_WORDS: &[&str] = &[
    "love", "great", "awesome", "amazing", "good", "nice", "best",
    "excellent", "fantastic", "wonderful", "perfect", "happy", "excited",
    "hype", "pog", "poggers", "lets", "letsgo", "goat", "fire", "sick",
    "insane", "incredible", "beautiful", "brilliant", "cool", "dope",
    "epic", "god", "godly", "king", "queen", "legend", "legendary",
    "masterpiece", "peak", "sheesh", "slaps", "top", "valid", "win",
    "winning", "congrats", "congratulations", "clutch", "clean",
];

/// Negative sentiment indicators
const NEGATIVE_WORDS: &[&str] = &[
    "hate", "bad", "terrible", "awful", "worst", "sucks", "trash",
    "garbage", "stupid", "dumb", "boring", "dead", "cringe", "fail",
    "failed", "losing", "lost", "sad", "sadge", "angry", "mad", "toxic",
    "annoying", "disappointed", "disappointing", "horrible", "ugly",
    "weak", "mid", "ratio", "bozo", "clown", "yikes", "oof", "rip",
    "pathetic", "shame", "embarrassing", "wtf", "wth",
];

/// Confused/questioning indicators
const CONFUSED_INDICATORS: &[&str] = &[
    "confused", "wait", "wut", "idk", "explain", "pepega", "huh",
    "understand", "unclear", "lost", "clueless",
];

#[derive(Serialize, Deserialize, Clone)]
pub struct Message {
    pub text: String,
    pub author: String,
    pub timestamp: f64,
}

#[derive(Serialize, Deserialize)]
pub struct ClusterBucket {
    pub label: String,
    pub count: usize,
    pub sample_messages: Vec<String>,
}

#[derive(Serialize, Deserialize)]
pub struct ClusterResult {
    pub buckets: Vec<ClusterBucket>,
    pub processed_count: usize,
}

// ============================================================================
// NEW DATA STRUCTURES FOR TOPIC DETECTION AND SENTIMENT ANALYSIS
// ============================================================================

/// A trending topic/word with its frequency count
#[derive(Serialize, Deserialize, Clone)]
pub struct TopicEntry {
    pub term: String,
    pub count: usize,
    pub is_emote: bool,
}

/// Result of topic extraction
#[derive(Serialize, Deserialize)]
pub struct TopicResult {
    pub topics: Vec<TopicEntry>,
    pub total_words_processed: usize,
}

/// Pre-computed sentiment signals for rule-based analysis
#[derive(Serialize, Deserialize, Clone)]
pub struct SentimentSignals {
    pub positive_count: usize,
    pub negative_count: usize,
    pub confused_count: usize,
    pub neutral_count: usize,
    /// Aggregate sentiment score from -100 (very negative) to 100 (very positive)
    pub sentiment_score: i32,
    /// Sample messages for each sentiment category (up to 3 each)
    pub positive_samples: Vec<String>,
    pub negative_samples: Vec<String>,
    pub confused_samples: Vec<String>,
}

/// Combined analysis result including clusters, topics, and sentiment
#[derive(Serialize, Deserialize)]
pub struct AnalysisResult {
    pub buckets: Vec<ClusterBucket>,
    pub processed_count: usize,
    pub topics: Vec<TopicEntry>,
    pub sentiment_signals: SentimentSignals,
}

/// Result of spam filtering
#[derive(Serialize, Deserialize)]
pub struct SpamFilterResult {
    pub filtered_messages: Vec<Message>,
    pub spam_count: usize,
    pub duplicate_count: usize,
    pub original_count: usize,
}

// ============================================================================
// WORD-BOUNDARY MATCHING HELPERS
// ============================================================================

/// Check if a specific word appears as a whole word in the lowercased text.
/// Words are delimited by whitespace; leading/trailing punctuation is stripped.
fn text_has_word(text_lower: &str, word: &str) -> bool {
    text_lower.split_whitespace().any(|part| {
        let trimmed = part.trim_matches(|c: char| c.is_ascii_punctuation());
        trimmed == word
    })
}

/// Check if any word from the list appears as a whole word in the lowercased text.
fn text_has_any_word(text_lower: &str, words: &[&str]) -> bool {
    text_lower.split_whitespace().any(|part| {
        let trimmed = part.trim_matches(|c: char| c.is_ascii_punctuation());
        words.contains(&trimmed)
    })
}

/// Extended analysis result with spam stats
#[derive(Serialize, Deserialize)]
pub struct AnalysisResultWithSpam {
    pub buckets: Vec<ClusterBucket>,
    pub processed_count: usize,
    pub topics: Vec<TopicEntry>,
    pub sentiment_signals: SentimentSignals,
    pub spam_count: usize,
    pub duplicate_count: usize,
}

/// Clusters chat messages into labeled buckets (Questions, Issues, Requests, General Chat).
///
/// # Input JSON Shape
/// 
/// Array of message objects:
/// ```json
/// [
///   {
///     "text": "How do I install this?",
///     "author": "user123",
///     "timestamp": 1638360000000
///   }
/// ]
/// ```
///
/// # Output JSON Shape
///
/// ```json
/// {
///   "buckets": [
///     {
///       "label": "Questions",
///       "count": 5,
///       "sample_messages": ["How do I...", "What is...", "Why does..."]
///     }
///   ],
///   "processed_count": 10
/// }
/// ```
///
/// # Clustering Rules (v0)
///
/// - **Questions**: Contains `?` or keywords: `how`, `what`, `why`
/// - **Issues/Bugs**: Keywords: `bug`, `error`, `broken`, `issue`
/// - **Requests**: Keywords: `please`, `can you`, `could you`, `would you`
/// - **General Chat**: Everything else
///
/// Returns up to 3 sample messages per bucket.
#[wasm_bindgen]
pub fn cluster_messages(messages_json: JsValue) -> Result<JsValue, JsValue> {
    let messages: Vec<Message> = serde_wasm_bindgen::from_value(messages_json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;

    let result = cluster_messages_internal(&messages);

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

// ============================================================================
// TOPIC EXTRACTION
// ============================================================================

/// Internal function for topic extraction (used by both WASM export and tests)
fn extract_topics_internal(messages: &[Message], min_count: usize) -> TopicResult {
    let mut word_counts: HashMap<String, (usize, bool)> = HashMap::new();
    let mut total_words = 0;

    for msg in messages.iter() {
        // Tokenize: split on whitespace and punctuation, lowercase
        let text_lower = msg.text.to_lowercase();
        let words: Vec<&str> = text_lower
            .split(|c: char| c.is_whitespace() || (c.is_ascii_punctuation() && c != '\''))
            .filter(|w| !w.is_empty() && w.len() > 1)
            .collect();

        for word in words {
            total_words += 1;

            // Check if it's a known emote
            let is_emote = KNOWN_EMOTES.contains(&word);

            // Skip stop words UNLESS it's a known emote
            if !is_emote && STOP_WORDS.contains(&word) {
                continue;
            }

            let entry = word_counts.entry(word.to_string()).or_insert((0, is_emote));
            entry.0 += 1;
        }
    }

    // Filter by min_count and sort by frequency
    let mut topics: Vec<TopicEntry> = word_counts
        .into_iter()
        .filter(|(_, (count, _))| *count >= min_count)
        .map(|(term, (count, is_emote))| TopicEntry { term, count, is_emote })
        .collect();

    topics.sort_by(|a, b| b.count.cmp(&a.count));
    topics.truncate(20); // Top 20 topics

    TopicResult {
        topics,
        total_words_processed: total_words,
    }
}

/// Extract trending topics from chat messages.
///
/// Filters out common English stop words but preserves known emotes.
/// Returns topics mentioned at least `min_count` times, sorted by frequency.
#[wasm_bindgen]
pub fn extract_topics(messages_json: JsValue, min_count: usize) -> Result<JsValue, JsValue> {
    let messages: Vec<Message> = serde_wasm_bindgen::from_value(messages_json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;

    let result = extract_topics_internal(&messages, min_count);

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

// ============================================================================
// SENTIMENT ANALYSIS
// ============================================================================

/// Internal function for sentiment signal analysis
fn analyze_sentiment_internal(messages: &[Message]) -> SentimentSignals {
    let mut positive = 0;
    let mut negative = 0;
    let mut confused = 0;
    let mut neutral = 0;

    let mut positive_samples: Vec<String> = Vec::new();
    let mut negative_samples: Vec<String> = Vec::new();
    let mut confused_samples: Vec<String> = Vec::new();

    const MAX_SAMPLES: usize = 3;

    for msg in messages.iter() {
        let text_lower = msg.text.to_lowercase();
        let mut msg_classified = false;

        // Check for positive signals first (so "this is awesome?" counts as positive)
        if POSITIVE_WORDS.iter().any(|w| text_has_word(&text_lower, w)) {
            positive += 1;
            if positive_samples.len() < MAX_SAMPLES {
                positive_samples.push(msg.text.clone());
            }
            msg_classified = true;
        }

        // Check for negative signals
        if !msg_classified && NEGATIVE_WORDS.iter().any(|w| text_has_word(&text_lower, w)) {
            negative += 1;
            if negative_samples.len() < MAX_SAMPLES {
                negative_samples.push(msg.text.clone());
            }
            msg_classified = true;
        }

        // Check for confusion (question marks, confused words) only when no sentiment signal
        if !msg_classified && (text_lower.contains('?') ||
           CONFUSED_INDICATORS.iter().any(|w| text_has_word(&text_lower, w))) {
            confused += 1;
            if confused_samples.len() < MAX_SAMPLES {
                confused_samples.push(msg.text.clone());
            }
            msg_classified = true;
        }

        // Everything else is neutral
        if !msg_classified {
            neutral += 1;
        }
    }

    // Calculate aggregate sentiment score (-100 to 100)
    let total = (positive + negative + confused + neutral) as i32;
    let sentiment_score = if total > 0 {
        ((positive as i32 - negative as i32) * 100) / total
    } else {
        0
    };

    SentimentSignals {
        positive_count: positive,
        negative_count: negative,
        confused_count: confused,
        neutral_count: neutral,
        sentiment_score: sentiment_score.clamp(-100, 100),
        positive_samples,
        negative_samples,
        confused_samples,
    }
}

/// Analyze sentiment signals in chat messages.
///
/// Returns counts of positive, negative, confused, and neutral messages,
/// plus an aggregate sentiment score from -100 (very negative) to 100 (very positive).
#[wasm_bindgen]
pub fn analyze_sentiment_signals(messages_json: JsValue) -> Result<JsValue, JsValue> {
    let messages: Vec<Message> = serde_wasm_bindgen::from_value(messages_json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;

    let result = analyze_sentiment_internal(&messages);

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

// ============================================================================
// COMBINED ANALYSIS
// ============================================================================

/// Internal function for clustering (used by both WASM export and tests)
fn cluster_messages_internal(messages: &[Message]) -> ClusterResult {
    let mut questions = Vec::new();
    let mut issues = Vec::new();
    let mut requests = Vec::new();
    let mut general = Vec::new();

    for msg in messages.iter() {
        let text_lower = msg.text.to_lowercase();

        if text_lower.contains('?') || text_has_any_word(&text_lower, &["how", "what", "why"]) {
            questions.push(msg.text.clone());
        } else if text_has_any_word(&text_lower, &["bug", "error", "broken", "issue"]) {
            issues.push(msg.text.clone());
        } else if text_has_word(&text_lower, "please") || text_lower.contains("can you") || text_lower.contains("could you") || text_lower.contains("would you") {
            requests.push(msg.text.clone());
        } else {
            general.push(msg.text.clone());
        }
    }

    let mut buckets = Vec::new();

    if !questions.is_empty() {
        buckets.push(ClusterBucket {
            label: "Questions".to_string(),
            count: questions.len(),
            sample_messages: questions.into_iter().take(3).collect(),
        });
    }

    if !issues.is_empty() {
        buckets.push(ClusterBucket {
            label: "Issues/Bugs".to_string(),
            count: issues.len(),
            sample_messages: issues.into_iter().take(3).collect(),
        });
    }

    if !requests.is_empty() {
        buckets.push(ClusterBucket {
            label: "Requests".to_string(),
            count: requests.len(),
            sample_messages: requests.into_iter().take(3).collect(),
        });
    }

    if !general.is_empty() {
        buckets.push(ClusterBucket {
            label: "General Chat".to_string(),
            count: general.len(),
            sample_messages: general.into_iter().take(3).collect(),
        });
    }

    ClusterResult {
        buckets,
        processed_count: messages.len(),
    }
}

/// Perform complete chat analysis: clustering, topic extraction, and sentiment analysis.
///
/// This is the main entry point that combines all analysis functions for efficiency.
/// Topics are extracted with a minimum count of 5.
#[wasm_bindgen]
pub fn analyze_chat(messages_json: JsValue) -> Result<JsValue, JsValue> {
    let messages: Vec<Message> = serde_wasm_bindgen::from_value(messages_json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;

    // Run all analyses
    let cluster_result = cluster_messages_internal(&messages);
    let topic_result = extract_topics_internal(&messages, 5);
    let sentiment_signals = analyze_sentiment_internal(&messages);

    let result = AnalysisResult {
        buckets: cluster_result.buckets,
        processed_count: cluster_result.processed_count,
        topics: topic_result.topics,
        sentiment_signals,
    };

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

// ============================================================================
// SPAM/DUPLICATE DETECTION
// ============================================================================

/// Internal function for spam and duplicate filtering
fn filter_spam_internal(
    messages: &[Message],
    spam_threshold: usize,
    duplicate_window_ms: f64,
) -> SpamFilterResult {
    let mut filtered = Vec::new();
    let mut spam_count = 0;
    let mut duplicate_count = 0;

    // Track (author, text_lower) -> last_timestamp for duplicate detection
    let mut author_text_timestamps: HashMap<(String, String), f64> = HashMap::new();

    // Track text_lower -> count for cross-user spam detection
    let mut text_counts: HashMap<String, usize> = HashMap::new();

    for msg in messages.iter() {
        let text_lower = msg.text.to_lowercase().trim().to_string();
        let author_lower = msg.author.to_lowercase();

        // Skip empty messages
        if text_lower.is_empty() {
            continue;
        }

        // Check for duplicate from same author within time window
        let key = (author_lower.clone(), text_lower.clone());
        if let Some(last_ts) = author_text_timestamps.get(&key) {
            if msg.timestamp - last_ts < duplicate_window_ms {
                duplicate_count += 1;
                continue;
            }
        }

        // Check for spam (same text appearing too many times across users)
        let text_count = text_counts.entry(text_lower.clone()).or_insert(0);
        *text_count += 1;

        if *text_count > spam_threshold {
            spam_count += 1;
            continue;
        }

        // Message passes filters, keep it
        author_text_timestamps.insert(key, msg.timestamp);
        filtered.push(msg.clone());
    }

    SpamFilterResult {
        filtered_messages: filtered,
        spam_count,
        duplicate_count,
        original_count: messages.len(),
    }
}

/// Filter spam and duplicate messages from chat.
///
/// # Parameters
/// - `spam_threshold`: Maximum times a message text can appear before being flagged as spam
/// - `duplicate_window_ms`: Time window in milliseconds for same-author duplicate detection
#[wasm_bindgen]
pub fn filter_spam(
    messages_json: JsValue,
    spam_threshold: usize,
    duplicate_window_ms: f64,
) -> Result<JsValue, JsValue> {
    let messages: Vec<Message> = serde_wasm_bindgen::from_value(messages_json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;

    let result = filter_spam_internal(&messages, spam_threshold, duplicate_window_ms);

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Perform complete chat analysis with configurable settings.
///
/// This runs spam filtering first, then analysis on filtered messages.
///
/// # Parameters
/// - `topic_min_count`: Minimum mentions for a word to appear as a trending topic
/// - `spam_threshold`: Maximum times a message text can appear before being flagged as spam
/// - `duplicate_window_ms`: Time window in milliseconds for same-author duplicate detection
#[wasm_bindgen]
pub fn analyze_chat_with_settings(
    messages_json: JsValue,
    topic_min_count: usize,
    spam_threshold: usize,
    duplicate_window_ms: f64,
) -> Result<JsValue, JsValue> {
    let messages: Vec<Message> = serde_wasm_bindgen::from_value(messages_json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;

    // First, filter spam and duplicates
    let spam_result = filter_spam_internal(&messages, spam_threshold, duplicate_window_ms);

    // Run analysis on filtered messages
    let cluster_result = cluster_messages_internal(&spam_result.filtered_messages);
    let topic_result = extract_topics_internal(&spam_result.filtered_messages, topic_min_count);
    let sentiment_signals = analyze_sentiment_internal(&spam_result.filtered_messages);

    let result = AnalysisResultWithSpam {
        buckets: cluster_result.buckets,
        processed_count: spam_result.filtered_messages.len(),
        topics: topic_result.topics,
        sentiment_signals,
        spam_count: spam_result.spam_count,
        duplicate_count: spam_result.duplicate_count,
    };

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

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
            create_test_message("Why does this happen?"),
            create_test_message("Just a regular message"),
        ];

        let result = cluster_messages_internal(&messages);

        // Should have Questions and General Chat buckets
        assert!(result.buckets.iter().any(|b| b.label == "Questions"));
        
        let questions_bucket = result.buckets.iter().find(|b| b.label == "Questions").unwrap();
        assert_eq!(questions_bucket.count, 3);
    }

    #[test]
    fn test_issue_clustering() {
        let messages = vec![
            create_test_message("This is broken!"),
            create_test_message("I found a bug in the system"),
            create_test_message("Error when loading"),
            create_test_message("Everything works great"),
        ];

        let result = cluster_messages_internal(&messages);

        let issues_bucket = result.buckets.iter().find(|b| b.label == "Issues/Bugs");
        assert!(issues_bucket.is_some());
        assert_eq!(issues_bucket.unwrap().count, 3);
    }

    #[test]
    fn test_request_clustering() {
        let messages = vec![
            create_test_message("Please help me"),
            create_test_message("Could you check this"),
            create_test_message("Thanks for streaming"),
        ];

        let result = cluster_messages_internal(&messages);

        let requests_bucket = result.buckets.iter().find(|b| b.label == "Requests");
        assert!(requests_bucket.is_some(), "Requests bucket should exist");
        let count = requests_bucket.unwrap().count;
        assert!(count >= 2, "Expected at least 2 requests, got {}", count);
    }

    #[test]
    fn test_sample_messages_limit() {
        let messages = vec![
            create_test_message("Question 1?"),
            create_test_message("Question 2?"),
            create_test_message("Question 3?"),
            create_test_message("Question 4?"),
            create_test_message("Question 5?"),
        ];

        let result = cluster_messages_internal(&messages);

        let questions_bucket = result.buckets.iter().find(|b| b.label == "Questions").unwrap();
        assert_eq!(questions_bucket.count, 5);
        assert_eq!(questions_bucket.sample_messages.len(), 3); // Should only show 3 samples
    }

    #[test]
    fn test_general_chat_only() {
        let messages = vec![
            create_test_message("Hello everyone"),
            create_test_message("Great stream today"),
            create_test_message("Thanks for the content"),
            create_test_message("Keep up the good work"),
        ];

        let result = cluster_messages_internal(&messages);

        // Should only have General Chat bucket
        assert_eq!(result.buckets.len(), 1);
        let general_bucket = result.buckets.iter().find(|b| b.label == "General Chat");
        assert!(general_bucket.is_some());
        assert_eq!(general_bucket.unwrap().count, 4);

        // Ensure no other buckets exist
        assert!(result.buckets.iter().find(|b| b.label == "Questions").is_none());
        assert!(result.buckets.iter().find(|b| b.label == "Issues/Bugs").is_none());
        assert!(result.buckets.iter().find(|b| b.label == "Requests").is_none());
    }

    // ========================================================================
    // TOPIC EXTRACTION TESTS
    // ========================================================================

    #[test]
    fn test_topic_extraction_basic() {
        let messages = vec![
            create_test_message("pog pog pog this is amazing"),
            create_test_message("pog what a play"),
            create_test_message("this stream is pog"),
            create_test_message("pog poggers lets go"),
            create_test_message("wow pog moment"),
        ];

        let result = extract_topics_internal(&messages, 3);

        // "pog" should be top topic (mentioned 5+ times)
        assert!(!result.topics.is_empty(), "Should have at least one topic");
        assert_eq!(result.topics[0].term, "pog");
        assert!(result.topics[0].count >= 5, "pog should appear at least 5 times");
        assert!(result.topics[0].is_emote, "pog should be flagged as emote");
    }

    #[test]
    fn test_stop_word_filtering() {
        let messages = vec![
            create_test_message("the the the the the"),
            create_test_message("awesome awesome awesome awesome awesome"),
        ];

        let result = extract_topics_internal(&messages, 1);

        // "the" should be filtered out, "awesome" should remain
        assert!(result.topics.iter().any(|t| t.term == "awesome"), "awesome should be a topic");
        assert!(!result.topics.iter().any(|t| t.term == "the"), "the should be filtered out");
    }

    #[test]
    fn test_emote_preservation() {
        let messages = vec![
            create_test_message("kekw kekw kekw"),
            create_test_message("sadge sadge sadge"),
            create_test_message("copium copium copium"),
        ];

        let result = extract_topics_internal(&messages, 2);

        // All emotes should be detected and flagged
        for topic in &result.topics {
            assert!(topic.is_emote, "{} should be flagged as emote", topic.term);
        }
    }

    #[test]
    fn test_min_count_threshold() {
        let messages = vec![
            create_test_message("rare rare"),
            create_test_message("common common common common common"),
        ];

        let result = extract_topics_internal(&messages, 5);

        // Only "common" should pass the threshold
        assert_eq!(result.topics.len(), 1, "Only one topic should meet threshold");
        assert_eq!(result.topics[0].term, "common");
    }

    // ========================================================================
    // SENTIMENT ANALYSIS TESTS
    // ========================================================================

    #[test]
    fn test_sentiment_positive() {
        let messages = vec![
            create_test_message("this is awesome!"),
            create_test_message("love this stream"),
            create_test_message("POG POG POG"),
            create_test_message("great content"),
        ];

        let signals = analyze_sentiment_internal(&messages);

        assert!(signals.positive_count > signals.negative_count,
            "Positive count ({}) should exceed negative count ({})",
            signals.positive_count, signals.negative_count);
        assert!(signals.sentiment_score > 0,
            "Sentiment score should be positive, got {}", signals.sentiment_score);
    }

    #[test]
    fn test_sentiment_negative() {
        let messages = vec![
            create_test_message("this sucks"),
            create_test_message("terrible gameplay"),
            create_test_message("so boring"),
            create_test_message("trash stream"),
        ];

        let signals = analyze_sentiment_internal(&messages);

        assert!(signals.negative_count > signals.positive_count,
            "Negative count ({}) should exceed positive count ({})",
            signals.negative_count, signals.positive_count);
        assert!(signals.sentiment_score < 0,
            "Sentiment score should be negative, got {}", signals.sentiment_score);
    }

    #[test]
    fn test_sentiment_confused() {
        let messages = vec![
            create_test_message("what is happening?"),
            create_test_message("wait what?"),
            create_test_message("huh? confused"),
            create_test_message("can someone explain?"),
        ];

        let signals = analyze_sentiment_internal(&messages);

        assert!(signals.confused_count >= 3,
            "Confused count should be at least 3, got {}", signals.confused_count);
    }

    #[test]
    fn test_sentiment_neutral() {
        let messages = vec![
            create_test_message("hello"),
            create_test_message("hi there"),
            create_test_message("stream started"),
        ];

        let signals = analyze_sentiment_internal(&messages);

        assert!(signals.neutral_count >= 2,
            "Neutral count should be at least 2, got {}", signals.neutral_count);
    }

    // ========================================================================
    // COMBINED ANALYSIS TESTS
    // ========================================================================

    #[test]
    fn test_analyze_chat_returns_all_components() {
        let messages = vec![
            create_test_message("How does this work?"),
            create_test_message("pog pog pog pog pog"),
            create_test_message("this is awesome!"),
            create_test_message("hello everyone"),
        ];

        let cluster_result = cluster_messages_internal(&messages);
        let topic_result = extract_topics_internal(&messages, 3);
        let sentiment = analyze_sentiment_internal(&messages);

        // Verify all components work together
        assert!(!cluster_result.buckets.is_empty(), "Should have cluster buckets");
        assert_eq!(cluster_result.processed_count, 4);

        // Topics should include pog (mentioned 5 times)
        assert!(topic_result.topics.iter().any(|t| t.term == "pog"));

        // Sentiment should be computed
        assert!(sentiment.positive_count + sentiment.negative_count +
                sentiment.confused_count + sentiment.neutral_count == 4);
    }

    // ========================================================================
    // SPAM/DUPLICATE DETECTION TESTS
    // ========================================================================

    fn create_test_message_with_author(text: &str, author: &str, timestamp: f64) -> Message {
        Message {
            text: text.to_string(),
            author: author.to_string(),
            timestamp,
        }
    }

    #[test]
    fn test_spam_detection_same_user() {
        let messages = vec![
            create_test_message_with_author("hello", "user1", 1000.0),
            create_test_message_with_author("hello", "user1", 2000.0),  // duplicate
            create_test_message_with_author("hello", "user1", 3000.0),  // duplicate
            create_test_message_with_author("different message", "user1", 4000.0),
        ];

        let result = filter_spam_internal(&messages, 10, 30000.0);

        assert_eq!(result.duplicate_count, 2, "Should detect 2 duplicates from same user");
        assert_eq!(result.filtered_messages.len(), 2, "Should keep 2 unique messages");
    }

    #[test]
    fn test_spam_detection_cross_user() {
        let messages = vec![
            create_test_message_with_author("spam message", "user1", 1000.0),
            create_test_message_with_author("spam message", "user2", 2000.0),
            create_test_message_with_author("spam message", "user3", 3000.0),
            create_test_message_with_author("spam message", "user4", 4000.0),  // over threshold
            create_test_message_with_author("unique message", "user5", 5000.0),
        ];

        let result = filter_spam_internal(&messages, 3, 30000.0);

        assert_eq!(result.spam_count, 1, "Should detect 1 spam message");
        assert_eq!(result.filtered_messages.len(), 4, "Should keep 4 messages (3 spam + 1 unique)");
    }

    #[test]
    fn test_duplicate_window() {
        let messages = vec![
            create_test_message_with_author("hello", "user1", 1000.0),
            create_test_message_with_author("hello", "user1", 40000.0),  // outside 30s window
        ];

        let result = filter_spam_internal(&messages, 10, 30000.0);

        assert_eq!(result.duplicate_count, 0, "Should not detect duplicate outside window");
        assert_eq!(result.filtered_messages.len(), 2, "Should keep both messages");
    }

    #[test]
    fn test_analyze_with_settings() {
        let messages = vec![
            create_test_message_with_author("pog pog pog", "user1", 1000.0),
            create_test_message_with_author("pog pog pog", "user2", 2000.0),
            create_test_message_with_author("pog pog pog", "user3", 3000.0),
            create_test_message_with_author("pog pog pog", "user4", 4000.0),  // spam (threshold 3)
            create_test_message_with_author("How does this work?", "user5", 5000.0),
        ];

        let cluster_result = cluster_messages_internal(&messages);
        let spam_result = filter_spam_internal(&messages, 3, 30000.0);

        // Verify spam filtering
        assert_eq!(spam_result.spam_count, 1, "Should detect 1 spam");
        assert_eq!(spam_result.filtered_messages.len(), 4, "Should keep 4 messages");

        // Verify clusters on original (unfiltered)
        assert!(cluster_result.buckets.iter().any(|b| b.label == "Questions"),
            "Should have Questions bucket");
    }
}
