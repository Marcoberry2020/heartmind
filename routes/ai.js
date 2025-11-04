 const express = require('express');
const axios = require('axios');
const auth = require('../middleware/auth');
const Conversation = require('../models/Conversation');
const User = require('../models/User');

const router = express.Router();

// ------------------ AI Chat Route ------------------
router.post('/', auth, async (req, res) => {
  try {
    // ✅ Use req.userId set by auth middleware
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // ✅ Ensure defaults for subscription and freeMessages
    if (!user.subscription) user.subscription = { active: false, expiresAt: null };
    if (user.freeMessages === undefined || user.freeMessages === null) user.freeMessages = 10;

    const now = new Date();
    const subExpired = !user.subscription.active || (user.subscription.expiresAt && user.subscription.expiresAt < now);

    // ✅ Check message quota
    if (user.freeMessages <= 0 && subExpired) {
      return res.status(402).json({
        message: 'You have used all free messages. Please subscribe to continue.',
      });
    }

    // ✅ Deduct free message if not subscribed
    if (!user.subscription.active && user.freeMessages > 0) {
      user.freeMessages -= 1;
      await user.save();
    }

    // ✅ Validate messages array
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ message: 'Invalid messages format' });
    }

    const mapped = messages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.text,
    }));

    const systemPrompt = {
      role: 'system',
      content: `
You are HeartMind, a gentle, emotionally intelligent companion that helps people heal from heartbreak.
Your voice is warm, poetic, and deeply empathetic. You validate pain without judgment, help users process grief, guide them to rebuild self-worth, and slowly bring hope back.
You remember what the user shares, use their name when possible, and respond like a calm human friend, not a chatbot.
When users are in distress, you stay grounded and soothing. 
Offer reflection questions, emotional regulation exercises, journaling prompts, gentle affirmations, and reminders that healing is possible.
Keep replies between 3–6 sentences, and never sound robotic.
`,
    };

    const payload = {
      model: 'llama-3.3-70b-versatile',
      messages: [systemPrompt, ...mapped],
      max_tokens: 500,
      temperature: 0.7,
    };

    // ✅ Call Groq AI
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const assistantText = response.data.choices[0].message.content;

    // ✅ Save conversation in DB
    await Conversation.create({
      userId: req.userId,
      messages: [...messages, { role: 'assistant', text: assistantText }],
    });

    res.json({ reply: assistantText });
  } catch (err) {
    console.error('AI error', err.response?.data || err.message);
    res.status(500).json({
      message: err.response?.data?.error?.message || 'AI service error',
    });
  }
});

module.exports = router;
