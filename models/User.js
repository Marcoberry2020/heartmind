 const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  passwordHash: String,

  // 🔐 Forgot password
  resetPasswordToken: String,
  resetPasswordExpires: Date,

  createdAt: { type: Date, default: Date.now },

  freeMessages: { type: Number, default: 2 },
  freeStreams: { type: Number, default: 2 },

  subscriptionExpiresAt: { type: Date, default: null },

  chatHistory: [
    {
      role: String,
      text: String,
      timestamp: { type: Date, default: Date.now }
    }
  ],

  emotionalProfile: {
    moods: { type: [String], default: [] },
    triggers: { type: [String], default: [] },
    goals: { type: [String], default: [] },
    preferences: { type: [String], default: [] }
  }
});

module.exports = mongoose.model('User', userSchema);
