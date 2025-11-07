 const express = require('express');
const router = express.Router();
const axios = require('axios');
const User = require('../models/User');
const auth = require('../middleware/auth');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

// Fix IPv6 issue on Render
axios.defaults.family = 4;

/**
 * CREATE PAYSTACK SESSION
 */
router.post('/create-session', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Use test email if user.email is invalid
    const email = user.email && user.email.includes('@')
      ? user.email.trim()
      : `test+${user._id.toString().slice(-6)}@example.com`;

    const amount = 750 * 100; // ₦750 in kobo

    // Initialize Paystack transaction
    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      { email, amount },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    const { authorization_url, reference } = response.data.data;

    // Save reference to user
    user.paystackReference = reference;
    await user.save();

    // ✅ Return authorization URL and reference to frontend
    res.json({ authorization_url, reference });

  } catch (err) {
    console.error('PAYSTACK REDIRECT ERROR:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to initiate payment session' });
  }
});

/**
 * VERIFY PAYMENT
 */
router.get('/verify/:reference', async (req, res) => {
  try {
    const { reference } = req.params;

    const user = await User.findOne({ paystackReference: reference });
    if (!user) return res.status(404).json({ error: 'Invalid reference' });

    // Verify payment with Paystack
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

      // Extend subscription by 1 month
      if (user.subscriptionExpiresAt && user.subscriptionExpiresAt > now) {
        const current = new Date(user.subscriptionExpiresAt);
        current.setMonth(current.getMonth() + 1);
        user.subscriptionExpiresAt = current;
      } else {
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        user.subscriptionExpiresAt = nextMonth;
      }

      // Clear reference
      user.paystackReference = null;
      await user.save();

      return res.json({ success: true, message: 'Subscription activated!' });
    }

    return res.status(400).json({ error: 'Payment verification failed' });

  } catch (err) {
    console.error('Payment verification error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Verification failed' });
  }
});

module.exports = router;
