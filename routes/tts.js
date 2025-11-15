 const express = require('express');
const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js');
const router = express.Router();

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

router.post('/', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: "Text is required" });

    const audio = await elevenlabs.textToSpeech.convert(
      'JBFqnCBsd6RMkjVDRZzb', // Free human voice ID
      {
        text,
        modelId: 'eleven_multilingual_v2',
        outputFormat: 'mp3_44100_128',
      }
    );

    // Convert ArrayBuffer to Base64
    const audioBase64 = Buffer.from(audio).toString('base64');

    res.json({ success: true, audio: audioBase64, format: 'audio/mpeg', text });

  } catch (err) {
    console.error("TTS SDK ERROR:", err);
    res.status(500).json({ error: "TTS failed", details: err.message || err });
  }
});

module.exports = router;
