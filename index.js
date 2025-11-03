 require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path'); // ✅ Added to serve React build
const authRoutes = require('./routes/auth');
const aiRoutes = require('./routes/ai');
const dataRoutes = require('./routes/data');
const paymentRoutes = require('./routes/payment');

const app = express();
app.use(cors());
app.use(express.json());

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/ai-chat', aiRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/payment', paymentRoutes);

// Root route for Render / testing
app.get('/', (req, res) => {
  res.send('HeartMind backend is running!');
});

// ✅ Serve React frontend build
app.use(express.static(path.join(__dirname, 'client/build')));

 // ✅ Handle all React routes (Express 5 fix using regex)
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});


// Use the port provided by Render
const PORT = process.env.PORT;

if (!PORT) {
  console.error('PORT not defined! Make sure Render sets it.');
  process.exit(1);
}

// Connect to MongoDB and start server
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Mongo connected');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => console.error('Mongo connection error:', err));
