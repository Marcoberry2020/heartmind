 const express = require('express');
const auth = require('../middleware/auth');
const Journal = require('../models/Journal');
const Conversation = require('../models/Conversation');
const router = express.Router();

// ✨ Create a journal entry
router.post('/journal', auth, async (req, res) => {
  const { entry, mood } = req.body;
  const doc = await Journal.create({ userId: req.userId, entry, mood });
  res.json(doc);
});

// ✨ Get all journals for user
router.get('/journal', auth, async (req, res) => {
  const items = await Journal.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(50);
  res.json(items);
});

// 🗑️ Delete a journal entry by ID
router.delete('/journal/:id', auth, async (req, res) => {
  try {
    const deleted = await Journal.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId, // ensures users can only delete their own journals
    });

    if (!deleted) {
      return res.status(404).json({ message: 'Journal not found' });
    }

    res.json({ message: 'Journal deleted successfully' });
  } catch (error) {
    console.error('Error deleting journal:', error);
    res.status(500).json({ message: 'Server error deleting journal' });
  }
});

// 💬 Save a conversation
router.post('/conversation', auth, async (req, res) => {
  const { messages } = req.body;
  const conv = await Conversation.create({ userId: req.userId, messages });
  res.json(conv);
});

// 💬 Get user conversations
router.get('/conversation', auth, async (req, res) => {
  const convs = await Conversation.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(20);
  res.json(convs);
});

module.exports = router;
