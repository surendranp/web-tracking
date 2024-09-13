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

// Registration schema (Define it only once)
const RegistrationSchema = new mongoose.Schema({
  domain: String,
  email: String
});
const Registration = mongoose.model('Registration', RegistrationSchema);

// Register route
app.post('/api/register', async (req, res) => {
  const { domain, email } = req.body;

  if (!domain || !email) {
    return res.status(400).send('Domain and email are required.');
  }

  try {
    // Save registration details
    const registration = new Registration({ domain, email });
    await registration.save();

    res.status(200).send('Registration successful.');
  } catch (error) {
    console.error('Error registering domain:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Send tracking data to email
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

// Serve the dashboard page
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

// Automatically send tracking data via email for all registered domains
async function sendTrackingDataToAllClients() {
  const registrations = await Registration.find();

  registrations.forEach(async (reg) => {
    await sendTrackingDataToClient(reg.domain, reg.email);
  });
}

// Schedule email task every 2 minutes
cron.schedule('*/2 * * * *', () => {
  console.log('Running scheduled task to send tracking data...');
  sendTrackingDataToAllClients();
});

// Start the server
app.listen(port, () => console.log(`Server running on port ${port}`));
