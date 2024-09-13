const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// MongoDB URI
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error('MongoDB URI is not set.');
  process.exit(1);
}
console.log('MongoDB URI:', mongoUri);

// MongoDB Connection
mongoose.connect(mongoUri)
  .then(() => console.log('MongoDB connected'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Define the schema and model for storing domain and email
const registrationSchema = new mongoose.Schema({
  domain: { type: String, required: true },
  email: { type: String, required: true }
});

const Registration = mongoose.model('Registration', registrationSchema);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Import and use routes
const pageViews = require('./routes/pageViews');
app.use('/api/pageviews', pageViews);

// Register endpoint
app.post('/api/register', async (req, res) => {
  try {
    const { domain, email } = req.body;
    if (!domain || !email) {
      return res.status(400).send('Missing required fields');
    }

    const newRegistration = new Registration({ domain, email });
    await newRegistration.save();

    res.status(200).send('Registration successful');
  } catch (error) {
    console.error('Error registering domain and email:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

// Serve the dashboard page
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

app.listen(port, () => console.log(`Server running on port ${port}`));
