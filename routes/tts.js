 const express = require('express');
const axios = require('axios');
const auth = require('../middleware/auth'); // optional if you want to protect TTS
const router = express.Router();

router.post('/', auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Text is required" });

    const VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // female sweet voice
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      { text, voice_settings: { stability: 0.8, similarity_boost: 0.8 } },
      {
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        responseType: "arraybuffer",
      }
    );

    res.set('Content-Type', 'audio/mpeg');
    res.send(response.data);
  } catch (err) {
    console.error("TTS error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to generate voice" });
  }
});

module.exports = router;
