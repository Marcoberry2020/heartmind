 const express = require('express');
const router = express.Router();
const axios = require('axios');
const User = require('../models/User');
const auth = require('../middleware/auth');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

// Force axios to use IPv4
axios.defaults.family = 4;

// ✅ CREATE PAYSTACK SESSION (Redirect Mode)
router.post('/create-session', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const email = (user.email && user.email.includes('@'))
      ? user.email.trim()
      : `test+${user._id.toString().slice(-6)}@example.com`;

    const amount = 750 * 100;

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount,
        callback_url: "https://heartmindai.netlify.app/payment-success"
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json",
        },
        timeout: 15000
      }
    );

    const { authorization_url, reference } = response.data.data;

    user.paystackReference = reference;
    await user.save();

    return res.json({ url: authorization_url });

  } catch (err) {
    console.error("PAYSTACK REDIRECT ERROR:", err.response?.data || err.message);
    return res.status(500).json({ error: "Failed to initiate payment session" });
  }
});

// ✅ VERIFY PAYSTACK PAYMENT (Robust)
router.get('/verify/:reference', async (req, res) => {
  try {
    const { reference } = req.params;

    // Find user by reference
    const user = await User.findOne({ paystackReference: reference });

    if (!user) {
      return res.status(404).json({ 
        error: "Reference not found or already used. Payment may already be verified." 
      });
    }

    // Verify payment with Paystack
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
        timeout: 15000
      }
    );

    const { status } = response.data.data;

    if (status !== 'success') {
      return res.status(400).json({ error: "Payment not successful yet." });
    }

    const now = new Date();

    // Extend subscription
    if (user.subscriptionExpiresAt && user.subscriptionExpiresAt > now) {
      user.subscriptionExpiresAt.setMonth(user.subscriptionExpiresAt.getMonth() + 1);
    } else {
      user.subscriptionExpiresAt = new Date(now.setMonth(now.getMonth() + 1));
    }

    // Clear reference to prevent duplicate verification
    user.paystackReference = null;
    await user.save();

    return res.json({ success: true, message: "Subscription activated!" });

  } catch (err) {
    console.error("Payment verification error:", err.response?.data || err.message);
    return res.status(500).json({ error: "Verification failed" });
  }
});

module.exports = router;
