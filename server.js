const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const cron = require('node-cron'); // For scheduling tasks
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
app.use('/api/pageviews', pageViews);

// Register route for domain and email
app.post('/api/register', async (req, res) => {
  const { domain, email } = req.body;

  if (!domain || !email) {
    return res.status(400).send('Domain and email are required.');
  }

  try {
    const Registration = mongoose.model('Registration', new mongoose.Schema({
      domain: { type: String, required: true },
      email: { type: String, required: true }
    }));

    const registration = new Registration({ domain, email });
    await registration.save();

    res.status(200).send('Registration successful.');
  } catch (error) {
    console.error('Error registering domain:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Cache models to avoid redefinition errors
const modelsCache = {};

// Function to get or create a model dynamically
function getOrCreateTrackingModel(collectionName) {
  if (!modelsCache[collectionName]) {
    const trackingSchema = new mongoose.Schema({
      url: String,
      type: String,
      ip: String,
      sessionId: String,
      timestamp: Date,
      buttons: Object,
      links: Object
    });

    modelsCache[collectionName] = mongoose.model(collectionName, trackingSchema, collectionName);
  }
  return modelsCache[collectionName];
}

// Function to send tracking data to the client via email
async function sendTrackingDataToClient(domain, email) {
  const collectionName = domain.replace(/[.\$]/g, '_'); // Sanitize domain name
  const Tracking = getOrCreateTrackingModel(collectionName);

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  try {
    // Retrieve all tracking data for the domain
    const trackingData = await Tracking.find().lean(); // Use lean for better performance

    // Check if there is any data to send
    if (!trackingData.length) {
      console.log(`No tracking data available for domain: ${domain}`);
      return;
    }

    // Construct the email content
    const emailContent = trackingData.map(data => `
      <p><strong>URL:</strong> ${data.url}</p>
      <p><strong>Type:</strong> ${data.type}</p>
      <p><strong>IP:</strong> ${data.ip}</p>
      <p><strong>Session ID:</strong> ${data.sessionId}</p>
      <p><strong>Timestamp:</strong> ${data.timestamp}</p>
      <hr>
    `).join('');

    // Send email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Tracking Data for ${domain}`,
      html: emailContent
    });

    console.log(`Tracking data sent to ${email}`);
  } catch (error) {
    console.error('Error sending tracking data:', error);
  }
}

// Schedule the email sending task
cron.schedule('*/2 * * * *', async () => {
  try {
    const registrations = await mongoose.model('Registration').find().lean();
    for (const reg of registrations) {
      await sendTrackingDataToClient(reg.domain, reg.email);
    }
  } catch (error) {
    console.error('Error fetching registrations or sending data:', error);
  }
});

// Start the server
app.listen(port, () => console.log(`Server running on port ${port}`));
