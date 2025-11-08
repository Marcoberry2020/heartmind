 const express = require('express');
const axios = require('axios');
const auth = require('../middleware/auth');
const Conversation = require('../models/Conversation');
const User = require('../models/User');

const router = express.Router();

// ------------------ AI Chat Route With Memory ------------------
router.post('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // ✅ Default free messages
    if (user.freeMessages == null) user.freeMessages = 10;

    const now = new Date();
    const isSubscribed =
      user.subscriptionExpiresAt &&
      new Date(user.subscriptionExpiresAt) > now;

    // ✅ Enforce free messages / subscription
    if (user.freeMessages <= 0 && !isSubscribed) {
      return res.status(402).json({
        message:
          'You have used all free messages. Please subscribe to continue.',
      });
    }

    // ✅ Deduct message if not subscribed
    if (!isSubscribed && user.freeMessages > 0) {
      user.freeMessages -= 1;
      await user.save();
    }

    // ✅ Validate frontend messages
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ message: 'Invalid messages format' });
    }

    // ---------- 1️⃣ SAVE USER INPUT TO MEMORY ----------
    user.chatHistory.push({
      role: 'user',
      text: messages[messages.length - 1].text,
    });

    // ✅ Keep only last 20 messages
    if (user.chatHistory.length > 20) {
      user.chatHistory = user.chatHistory.slice(-20);
    }

    await user.save();

    // ---------- 2️⃣ BUILD MEMORY FOR AI ----------
    const shortTerm = user.chatHistory.map((m) => ({
      role: m.role,
      content: m.text,
    }));

    const longTermMemory = `
User Name: ${user.name || "Unknown"}

Long-term Emotional Memory:
- Moods: ${user.emotionalProfile?.moods?.join(', ') || "None"}
- Triggers: ${user.emotionalProfile?.triggers?.join(', ') || "None"}
- Goals: ${user.emotionalProfile?.goals?.join(', ') || "None"}
- Preferences: ${user.emotionalProfile?.preferences?.join(', ') || "None"}

Use this memory to stay emotionally consistent and human.
`;

    const systemPrompt = {
      role: 'system',
      content: `
You are HeartMind, an empathetic emotional healing companion.

ALWAYS use this memory:
${longTermMemory}

Rules:
 - Sound human, warm, emotional, and deeply caring.
- Validate feelings before offering advice.
- Use the user's name naturally in conversation.
- Remember and reference past emotions, struggles, and patterns.
- act like a real human speaking.
- Keep responses short and human: usually 1–3 sentences. Only use 4 sentences when the user shares something deep or emotional.
- Never sound robotic, formal, or scripted.
- Speak like a gentle mix of a supportive therapist and a loving partner.
- Be sweet, comforting, and reassuring, especially during heartbreak or loneliness.
- Give real-world advice on healing, emotional growth, relationships, and rebuilding self-worth.
- Use grounding exercises, reflection questions, and small healing steps when needed.
- Never judge the user. Never minimize their feelings.
- No lists unless important. No more than one short list per response.
- Never mention that you are an AI or model.
`,
    };

    // ---------- 3️⃣ SEND TO GROQ ----------
    const payload = {
      model: 'llama-3.3-70b-versatile',
      messages: [systemPrompt, ...shortTerm],
      max_tokens: 500,
      temperature: 0.7,
    };

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

    // ---------- 4️⃣ SAVE ASSISTANT RESPONSE TO MEMORY ----------
    user.chatHistory.push({
      role: 'assistant',
      text: assistantText,
    });

    if (user.chatHistory.length > 20) {
      user.chatHistory = user.chatHistory.slice(-20);
    }

    await user.save();

    // ---------- 5️⃣ EXTRACT NEW MEMORY ----------
    const memoryExtractionPayload = {
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `
Analyze the user's last message and extract emotional memory.
Return ONLY JSON.

Format:
{
 "moods": [],
 "triggers": [],
 "goals": [],
 "preferences": []
}
`
        },
        {
          role: "user",
          content: messages[messages.length - 1].text
        }
      ]
    };

    try {
      const memRes = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        memoryExtractionPayload,
        {
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );

      const extracted = JSON.parse(memRes.data.choices[0].message.content);

      // ✅ Save long-term emotional memory
      user.emotionalProfile = {
        moods: [...new Set([...(user.emotionalProfile.moods || []), ...extracted.moods])],
        triggers: [...new Set([...(user.emotionalProfile.triggers || []), ...extracted.triggers])],
        goals: [...new Set([...(user.emotionalProfile.goals || []), ...extracted.goals])],
        preferences: [...new Set([...(user.emotionalProfile.preferences || []), ...extracted.preferences])],
      };

      await user.save();

    } catch (err) {
      console.error("Memory extraction failed:", err.message);
    }

    // ✅ Return assistant message
    res.json({ reply: assistantText });

  } catch (err) {
    console.error('AI error', err.response?.data || err.message);
    res.status(500).json({
      message: err.response?.data?.error?.message || 'AI service error',
    });
  }
});

module.exports = router;
