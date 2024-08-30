const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Log MongoDB URI for debugging
console.log('MongoDB URI:', process.env.MONGO_URI);

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log('MongoDB connection error:', err));

// Define a Mongoose schema for tracking data
const trackingSchema = new mongoose.Schema({
  type: String,
  url: String,
  element: String,
  timestamp: String
});

const Tracking = mongoose.model('Tracking', trackingSchema);

// Endpoint to handle tracking data
app.post('/api/pageviews', async (req, res) => {
  try {
    const data = req.body;
    await Tracking.create(data);
    console.log('Tracking data received:', data);
    res.status(200).send('Data received');
  } catch (error) {
    console.error('Error saving tracking data:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve the dashboard page
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

app.listen(port, () => console.log(`Server running on port ${port}`));
