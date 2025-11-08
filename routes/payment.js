 const express = require('express');
const router = express.Router();
const axios = require('axios');
const User = require('../models/User');
const auth = require('../middleware/auth');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
axios.defaults.family = 4;

// ✅ CREATE PAYSTACK SESSION
router.post('/create-session', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Use email for Paystack
    const email = (user.email && user.email.includes('@'))
      ? user.email.trim()
      : `test+${user._id.toString().slice(-6)}@example.com`;

    const amount = 750 * 100; // ₦750

    const init = await axios.post(
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

    const { authorization_url, reference } = init.data.data;

    // Save reference to user
    user.paystackReference = reference;
    await user.save();

    res.json({ url: authorization_url });

  } catch (err) {
    console.error("PAYSTACK REDIRECT ERROR:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to initiate payment session" });
  }
});

// ✅ VERIFY PAYSTACK PAYMENT
router.get('/verify/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    console.log("VERIFY REFERENCE (incoming):", reference);

    // Step 1: Verify payment with Paystack
    const confirm = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
        timeout: 15000
      }
    );

    const { status, customer } = confirm.data.data;
    if (status !== 'success') {
      return res.status(400).json({ error: "Payment verification failed" });
    }

    // Step 2: Find user by Paystack customer email
    const user = await User.findOne({ email: customer.email });
    if (!user) return res.status(404).json({ error: "User not found" });

    // Step 3: Update subscription
    const now = new Date();
    if (user.subscriptionExpiresAt && user.subscriptionExpiresAt > now) {
      user.subscriptionExpiresAt.setMonth(user.subscriptionExpiresAt.getMonth() + 1);
    } else {
      user.subscriptionExpiresAt = new Date(now.setMonth(now.getMonth() + 1));
    }

    user.paystackReference = null;
    await user.save();

    return res.json({ success: true, message: "Subscription activated!" });

  } catch (err) {
    console.error("Payment verification error:", err.response?.data || err.message);
    res.status(500).json({ error: "Verification failed" });
  }
});

module.exports = router;
