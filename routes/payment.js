 const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Stripe = require('stripe');
const router = express.Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

router.post('/create-session', auth, async (req, res) => {
  try {
    // ✅ Fetch user to get email
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: 'HeartMind Subscription' },
          unit_amount: 999, // $9.99
        },
        quantity: 1,
      }],
      success_url: `${process.env.CLIENT_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/dashboard`,
      customer_email: user.email, // ✅ now valid
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Payment session creation failed' });
  }
});

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed.', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const user = await User.findOne({ email: session.customer_email });
    if (user) {
      user.subscription.active = true;
      user.subscription.expiresAt = new Date(Date.now() + 30*24*60*60*1000); // 30 days
      await user.save();
    }
  }

  res.json({ received: true });
});

module.exports = router;
