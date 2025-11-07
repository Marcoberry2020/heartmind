 const express = require('express');
const router = express.Router();
const axios = require('axios');
const User = require('../models/User');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
axios.defaults.family = 4;

// ✅ Create Paystack session (unchanged)
router.post('/create-session', async (req, res) => {
  try {
    const { userId } = req.body; // pass userId from frontend
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const email = (user.email && user.email.includes('@'))
      ? user.email.trim()
      : `test+${user._id.toString().slice(-6)}@example.com`;

    const amount = 750 * 100;

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

    console.log("INIT REFERENCE (saved):", reference);

    user.paystackReference = reference;
    await user.save();

    res.json({ url: authorization_url });
  } catch (err) {
    console.error("PAYSTACK REDIRECT ERROR:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to initiate payment session" });
  }
});

// ✅ Verify Paystack payment (public route)
router.get('/verify/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    console.log("VERIFY REFERENCE (incoming):", reference);

    // Verify with Paystack
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

    // Update user subscription based on email or userId stored when initiating payment
    const user = await User.findOne({ paystackReference: reference });
    if (!user) return res.status(404).json({ error: "User not found" });

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
