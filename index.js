 require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const aiRoutes = require('./routes/ai');
const dataRoutes = require('./routes/data');
const paymentRoutes = require('./routes/payment');

const app = express();

// ✅ Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ API routes (must come before React static)
app.use('/api/auth', authRoutes);
app.use('/api/ai-chat', aiRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/payment', paymentRoutes);

// ✅ Optional Paystack webhook (raw body)
app.post('/api/payment/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  console.log('Webhook received!');
  res.sendStatus(200);
});

// ✅ Root route
app.get('/', (req, res) => res.send('HeartMind backend is running!'));

// ✅ Serve React build (after API routes)
app.use(express.static(path.join(__dirname, 'client/build')));
app.get(/.*/, (req, res) =>
  res.sendFile(path.join(__dirname, 'client/build', 'index.html'))
);

// ✅ Start server
const PORT = process.env.PORT || 4000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => console.error('MongoDB connection error:', err));
