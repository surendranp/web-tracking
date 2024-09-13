const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
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

// Serve the homepage and dashboard
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/home.html'));
});

// Handle domain and email registration
app.post('/api/register', async (req, res) => {
  const { domain, email } = req.body;
  if (!domain || !email) {
    return res.status(400).send('Domain and email are required');
  }

  const registrationSchema = new mongoose.Schema({
    domain: { type: String, required: true },
    email: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  });
  const Registration = mongoose.model('Registration', registrationSchema);

  try {
    const registration = new Registration({ domain, email });
    await registration.save();
    res.status(200).send('Registration successful');
    
    // Send the tracking script and instructions to the client
    let transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    let mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Tracking Script Instructions',
      text: `Add this script to your website:\n\n<script src="https://your-server-url/tracking.js"></script>`
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error during registration:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Daily cron job to send email with tracking data
cron.schedule('* * * * *', async () => {
  const Registration = mongoose.model('Registration');
  const registrations = await Registration.find();

  registrations.forEach(async registration => {
    const { domain, email } = registration;

    const sanitizedDomain = domain.replace(/[.\$]/g, '_'); // Sanitize domain name for MongoDB collection
    const Tracking = mongoose.model(sanitizedDomain);

    // Fetch data for the last 24 hours
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const trackingData = await Tracking.find({ timestamp: { $gte: yesterday } });

    let report = '';
    trackingData.forEach(data => {
      report += `URL: ${data.url}, Page Views: ${data.pageviews.length}, Buttons Clicked: ${[...data.buttons.entries()].map(([btn, count]) => `${btn}: ${count}`).join(', ')}, Links Clicked: ${[...data.links.entries()].map(([link, count]) => `${link}: ${count}`).join(', ')}\n`;
    });

    if (!report) {
      report = 'No activity recorded in the last 24 hours.';
    }

    // Send the report via email
    let transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    let mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Daily Tracking Report for ${domain}`,
      text: report
    };

    await transporter.sendMail(mailOptions);
  });
});

app.listen(port, () => console.log(`Server running on port ${port}`));
