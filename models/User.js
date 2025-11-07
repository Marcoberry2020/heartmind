 const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  passwordHash: String,
  createdAt: { type: Date, default: Date.now },

  // ✅ Free messages before needing subscription
  freeMessages: { type: Number, default: 10 },

  // ✅ Subscription expiration for paid users
  subscriptionExpiresAt: { type: Date, default: null },

  // ✅ SHORT-TERM MEMORY (conversation history)
  chatHistory: [
    {
      role: { type: String },      // "user" | "assistant"
      text: { type: String },      // the message content
      timestamp: { type: Date, default: Date.now }
    }
  ],

  // ✅ LONG-TERM EMOTIONAL MEMORY (personality profile)
  emotionalProfile: {
    moods: { type: [String], default: [] },        // e.g. ["sad", "anxious"]
    triggers: { type: [String], default: [] },     // e.g. ["loneliness"]
    goals: { type: [String], default: [] },        // e.g. ["healing", "confidence"]
    preferences: { type: [String], default: [] }   // e.g. ["gentle tone", "short advice"]
  }
});

module.exports = mongoose.model('User', userSchema);
