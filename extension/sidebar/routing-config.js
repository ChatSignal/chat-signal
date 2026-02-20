// routing-config.js
// Static configuration for cosine similarity routing.
// One file for all classification tuning — seed phrases and per-category thresholds.
//
// Claude's discretion: seed phrases and starting threshold values (0.30).
// Threshold calibration note (STATE.md): 0.30 is a starting point for stream chat;
// literature values (0.35) are from support ticket domain — stream chat is noisier.

export const ROUTING_CONFIG = {
  // Per-category tuning. Labels must exactly match WASM engine bucket labels.
  // General Chat is NOT listed here — it is the implicit default (Pitfall 4 guard).
  // When no category exceeds its threshold, the message routes to defaultLabel.
  categories: [
    {
      label: 'Questions',
      threshold: 0.30,
      seedPhrases: [
        'what is this',
        'how does this work',
        'can someone explain',
        'why is this happening',
        'what does that mean',
      ],
    },
    {
      label: 'Issues/Bugs',
      threshold: 0.30,
      seedPhrases: [
        'this is broken',
        'not working for me',
        'I found a bug',
        'getting an error',
        'something is wrong here',
      ],
    },
    {
      label: 'Requests',
      threshold: 0.30,
      seedPhrases: [
        'please add this feature',
        'can you make it',
        'I would like to see',
        'it would be great if',
        'suggestion for improvement',
      ],
    },
  ],

  // Fallback label used when no category exceeds its threshold.
  defaultLabel: 'General Chat',

  // WASM encoding speed threshold (ms per message) above which cosine routing
  // silently falls back to keyword mode. Applies to WASM backend only;
  // WebGPU should remain well under this.
  wasmSpeedThresholdMsPerMessage: 200,
};
