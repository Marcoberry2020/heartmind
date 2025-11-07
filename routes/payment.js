 const express = require('express');
const router = express.Router();
const axios = require('axios');
const User = require('../models/User');
const auth = require('../middleware/auth');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_PUBLIC = process.env.PAYSTACK_PUBLIC_KEY;

// ✅ Force axios to use IPv4 (Render sometimes fails with IPv6)
axios.defaults.family = 4;

// ✅ NEW PAYSTACK REDIRECT SESSION (Frontend uses this)
router.post('/create-session', auth, async (req, res) => {
  try {
    console.log("PAYSTACK SECRET LOADED:", !!PAYSTACK_SECRET);

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const email = (user.email && user.email.includes('@'))
      ? user.email.trim()
      : `test+${user._id.toString().slice(-6)}@example.com`;

    console.log("Initializing Paystack for email:", email);

    const amount = 750 * 100;

    // ✅ Initialize transaction
    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email,
        amount,
        callback_url: 'https://heartmind.ai/payment-success'
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000 // ✅ prevents Paystack request timeout
      }
    );

    const { authorization_url, reference } = response.data.data;

    // ✅ Save reference for verify
    user.paystackReference = reference;
    await user.save();

    return res.json({ url: authorization_url });

  } catch (err) {
    console.error('PAYSTACK REDIRECT ERROR:', err.response?.data || err.message);
    return res.status(500).json({ error: 'Failed to initiate payment session' });
  }
});
// ✅ Decrement free messages
router.post("/decrement-free", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.freeMessages > 0) {
      user.freeMessages -= 1;
      await user.save();
    }

    res.json({ success: true, freeMessages: user.freeMessages });

  } catch (err) {
    console.error("Decrement error:", err.message);
    res.status(500).json({ error: "Could not update free messages" });
  }
});


// ✅ Verify Paystack payment
router.get('/verify/:reference', auth, async (req, res) => {
  try {
    const { reference } = req.params;
    const user = await User.findById(req.userId);

    if (!user || user.paystackReference !== reference)
      return res.status(400).json({ error: 'Invalid reference' });

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      { 
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
        timeout: 15000
      }
    );

    const { status } = response.data.data;

    if (status === 'success') {
      const now = new Date();

      // ✅ Extend or start subscription
      if (user.subscriptionExpiresAt && user.subscriptionExpiresAt > now) {
        user.subscriptionExpiresAt.setMonth(
          user.subscriptionExpiresAt.getMonth() + 1
        );
      } else {
        user.subscriptionExpiresAt = new Date(
          now.setMonth(now.getMonth() + 1)
        );
      }

      user.paystackReference = null;
      await user.save();

      return res.json({ success: true, message: 'Subscription activated!' });
    }

    return res.status(400).json({ error: 'Payment verification failed' });

  } catch (err) {
    console.error('Payment verification error:', err.response?.data || err.message);
    return res.status(500).json({ error: 'Verification failed' });
  }
});

module.exports = router;
