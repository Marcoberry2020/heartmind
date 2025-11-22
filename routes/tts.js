 const express = require("express");
const { ElevenLabsClient } = require("@elevenlabs/elevenlabs-js");
const router = express.Router();

const ELEVEN_API_KEY = process.env.ELEVEN_KEY;

if (!ELEVEN_API_KEY) {
  console.error("❌ ELEVEN_KEY missing from .env");
}

const cache = new Map();

// Helper: Convert ReadableStream → Base64 without waiting for full audio
async function streamToBase64(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("base64");
}

router.post("/", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Text required" });
    }

    if (cache.has(text)) {
      return res.json({ audio: cache.get(text) });
    }

    const elevenlabs = new ElevenLabsClient({ apiKey: ELEVEN_API_KEY });

    // Convert text to speech with streaming
    const audioStream = await elevenlabs.textToSpeech.convert(
      "21m00Tcm4TlvDq8ikWAM", // voice ID
      {
        text,
        modelId: "eleven_multilingual_v2",
        outputFormat: "mp3_44100_128",
      }
    );

    // Convert chunks to Base64 as soon as they arrive
    const audioBase64 = await streamToBase64(audioStream);

    // Cache the result
    cache.set(text, audioBase64);

    // Respond immediately
    res.json({ audio: audioBase64 });
  } catch (err) {
    console.error("ELEVENLABS TTS ERROR:", err);
    res.status(500).json({ error: "TTS failed", details: err.message });
  }
});

module.exports = router;
