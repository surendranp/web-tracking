const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer'); // Add Nodemailer for sending emails
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

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Import and use routes
const pageViews = require('./routes/pageViews');
const registration = require('./routes/registration'); // Add registration route
app.use('/api/pageviews', pageViews);
app.use('/api/register', registration); // Use registration route

// Serve the dashboard page
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

// Setup email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail', // You can use any email service provider
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Function to send email
async function sendEmail(to, subject, text) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    text
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${to}`);
  } catch (error) {
    console.error('Error sending email:', error.message);
  }
}

// API to send tracking details via email
app.post('/api/send-tracking-data', async (req, res) => {
  try {
    const { domain } = req.body;

    if (!domain) {
      return res.status(400).send('Domain is required');
    }

    const sanitizedDomain = domain.replace(/[.\$]/g, '_'); // Sanitize domain name
    const Tracking = mongoose.model(sanitizedDomain);
    const trackingData = await Tracking.find({}); // Fetch all tracking data

    if (!trackingData) {
      return res.status(404).send('No tracking data found');
    }

    const client = await mongoose.model('Client').findOne({ domain });
    if (!client) {
      return res.status(404).send('Client not found');
    }

    const email = client.email;
    if (!email) {
      return res.status(404).send('Email not found for the domain');
    }

    // Prepare tracking details
    const details = trackingData.map(data => JSON.stringify(data)).join('\n');

    await sendEmail(email, 'Your Tracking Data', details);
    res.status(200).send('Tracking data sent');
  } catch (error) {
    console.error('Error sending tracking data:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
