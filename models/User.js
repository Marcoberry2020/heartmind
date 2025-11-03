 const mongoose = require('mongoose'); // ✅ Add this line

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  passwordHash: String,
  createdAt: { type: Date, default: Date.now },
  // ✅ add subscription support for paid chats
  freeMessages: { type: Number, default: 10 },
  subscriptionExpiresAt: { type: Date, default: null }
});

module.exports = mongoose.model('User', userSchema);
