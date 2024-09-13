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
app.use(bodyParser.json()); // Ensure that body-parser is used to handle JSON payloads

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

// Registration schema
const RegistrationSchema = new mongoose.Schema({
  domain: String,
  email: String
});
const Registration = mongoose.model('Registration', RegistrationSchema);

// Track pageviews - Add this route to handle POST requests from tracking script
app.post('/api/pageviews', async (req, res) => {
  const { domain, pageviewData } = req.body;

  if (!domain || !pageviewData) {
    return res.status(400).send('Domain and pageview data are required.');
  }

  try {
    const collectionName = domain.replace(/\./g, '_');
    const TrackingCollection = mongoose.connection.collection(collectionName);

    await TrackingCollection.insertOne(pageviewData);
    res.status(200).send('Pageview data stored successfully.');
  } catch (error) {
    console.error('Error storing pageview data:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Registration route
app.post('/api/register', async (req, res) => {
  const { domain, email } = req.body;

  if (!domain || !email) {
    return res.status(400).send('Domain and email are required.');
  }

  try {
    const registration = new Registration({ domain, email });
    await registration.save();
    res.status(200).send('Registration successful.');
  } catch (error) {
    console.error('Error registering domain:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Send tracking data to email (same as before)
async function sendTrackingDataToClient(domain, email) {
  try {
    const collectionName = domain.replace(/\./g, '_');
    const TrackingData = mongoose.connection.collection(collectionName);

    const trackingData = await TrackingData.find({}).toArray();

    if (trackingData.length === 0) {
      console.log(`No tracking data found for domain: ${domain}`);
      return;
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Tracking Data for ${domain}`,
      text: `Here is the tracking data for ${domain}:\n\n` + JSON.stringify(trackingData, null, 2)
    };

    await transporter.sendMail(mailOptions);
    console.log(`Tracking data sent to ${email}`);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

// Automatically send tracking data for all registered domains
async function sendTrackingDataToAllClients() {
  const registrations = await Registration.find();

  registrations.forEach(async (reg) => {
    await sendTrackingDataToClient(reg.domain, reg.email);
  });
}

// Schedule email task every 2 minutes (same as before)
cron.schedule('*/2 * * * *', () => {
  console.log('Running scheduled task to send tracking data...');
  sendTrackingDataToAllClients();
});

// Start the server
app.listen(port, () => console.log(`Server running on port ${port}`));
