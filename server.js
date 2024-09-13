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

// Function to fetch tracking data from MongoDB
async function fetchTrackingData(domain) {
  const sanitizedDomain = domain.replace(/[.\$]/g, '_');
  const Tracking = mongoose.model(sanitizedDomain, new mongoose.Schema({}, { strict: false }));

  // Time periods to fetch the data (6 AM - 6 PM and 6:01 PM - 5:59 AM)
  const morningStart = new Date();
  morningStart.setHours(6, 0, 0, 0);
  
  const morningEnd = new Date();
  morningEnd.setHours(17, 59, 59, 999);

  const eveningStart = new Date(morningEnd);
  eveningStart.setSeconds(eveningStart.getSeconds() + 1);

  const nextDayMorningEnd = new Date();
  nextDayMorningEnd.setHours(5, 59, 59, 999);
  nextDayMorningEnd.setDate(nextDayMorningEnd.getDate() + 1);

  // Fetch morning and evening data
  const morningData = await Tracking.find({
    timestamp: { $gte: morningStart, $lte: morningEnd }
  });

  const eveningData = await Tracking.find({
    timestamp: { $gte: eveningStart, $lte: nextDayMorningEnd }
  });

  return { morningData, eveningData };
}

// Daily cron job to send email with tracking data
cron.schedule('0 9 * * *', async () => {
  const Registration = mongoose.model('Registration');
  const registrations = await Registration.find();

  registrations.forEach(async registration => {
    const { domain, email } = registration;

    // Fetch the tracking data
    const { morningData, eveningData } = await fetchTrackingData(domain);

    // Prepare the report
    let report = `Daily Tracking Report for ${domain}\n\nMorning (6:00 AM to 6:00 PM):\n`;
    morningData.forEach(data => {
      report += `URL: ${data.url}, Page Views: ${data.pageviews.length}, Buttons Clicked: ${[...data.buttons.entries()].map(([btn, count]) => `${btn}: ${count}`).join(', ')}\n`;
    });

    report += `\nEvening (6:01 PM to 5:59 AM):\n`;
    eveningData.forEach(data => {
      report += `URL: ${data.url}, Page Views: ${data.pageviews.length}, Buttons Clicked: ${[...data.buttons.entries()].map(([btn, count]) => `${btn}: ${count}`).join(', ')}\n`;
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
