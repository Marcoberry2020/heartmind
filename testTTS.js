const axios = require('axios');

async function testTTS() {
  try {
    const payload = {
      text: "Hello, this is a test from HeartMind AI",
      voice: "alloy" // replace with your voice ID if needed
    };

    const response = await axios.post(
      'https://heartmind-vghw.onrender.com/api/tts', // your backend endpoint
      payload,
      {
        headers: { "Content-Type": "application/json" }
      }
    );

    console.log('TTS response:', response.data);
  } catch (err) {
    console.error('TTS test failed:', err.response?.data || err.message);
  }
}

testTTS();
