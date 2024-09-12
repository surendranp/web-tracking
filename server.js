const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const nodemailer = require('nodemailer');

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

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Import and use routes
const pageViews = require('./routes/pageViews');
app.use('/api/pageviews', pageViews);

// Serve the dashboard page
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

// Route for client information
app.post('/register', async (req, res) => {
  try {
    const { domain, email } = req.body;
    if (!domain || !email) {
      return res.status(400).send('Domain and email are required.');
    }

    const Client = mongoose.model('Client', new mongoose.Schema({
      domain: { type: String, required: true, unique: true },
      email: { type: String, required: true }
    }));

    let client = await Client.findOne({ domain });
    if (!client) {
      client = new Client({ domain, email });
      await client.save();
    } else {
      client.email = email;
      await client.save();
    }

    const transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const trackingScriptUrl = 'https://web-tracking-production.up.railway.app/tracking.js';
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your Tracking Script',
      text: `Hello,\n\nThank you for registering. To add tracking to your site, please include the following script in the <head> section of your pages:\n\n<script src="${trackingScriptUrl}"></script>\n\nBest regards,\nTracking Team`
    };

    await transporter.sendMail(mailOptions);

    res.status(200).send('Registration successful. Tracking script sent to your email.');
  } catch (error) {
    console.error('Error registering client:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
