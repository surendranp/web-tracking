const express = require('express');
const mongoose = require('mongoose');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Define the tracking schema
const trackingSchema = new mongoose.Schema({
  type: { type: String, required: true },
  url: { type: String, required: true },
  buttons: { type: Map, of: Number, default: {} },
  links: { type: Map, of: Number, default: {} },
  pageviews: { type: [String], default: [] },
  timestamp: { type: Date, default: Date.now },
  ip: { type: String, required: true },
  sessionId: { type: String, required: true },
  duration: { type: Number, default: 0 },
});

// Sanitize domain name for MongoDB collection names
function sanitizeDomain(domain) {
  return domain.replace(/[^\w]/g, '_');  // Replace non-word characters with '_'
}

// Dynamically fetch or create a model based on the domain name
function getTrackingModel(domain) {
  const collectionName = sanitizeDomain(domain);
  if (mongoose.modelNames().includes(collectionName)) {
    return mongoose.model(collectionName);  // Return existing model
  }
  return mongoose.model(collectionName, trackingSchema, collectionName);  // Create a new model
}

// Registration schema for domain and email
const registrationSchema = new mongoose.Schema({
  domain: { type: String, required: true },
  email: { type: String, required: true },
});

const Registration = mongoose.model('Registration', registrationSchema);

// Register a client domain and email
app.post('/api/register', async (req, res) => {
  const { domain, email } = req.body;

  try {
    const existingRegistration = await Registration.findOne({ domain });
    if (existingRegistration) {
      return res.status(400).send('Domain already registered.');
    }
    
    const registration = new Registration({ domain, email });
    await registration.save();
    res.status(201).send('Registration successful!');
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).send('Registration failed.');
  }
});

// Track user activity and store in domain-named collection
app.post('/api/pageviews', async (req, res) => {
  const { domain, type, url, buttons, links, pageviews, ip, sessionId, duration } = req.body;

  try {
    const TrackingModel = getTrackingModel(domain);  // Dynamically get the correct model
    const trackingData = new TrackingModel({
      type, url, buttons, links, pageviews, ip, sessionId, duration,
    });
    await trackingData.save();
    console.log(`Tracking data saved for domain: ${domain}`);
    res.status(201).send('Tracking data saved.');
  } catch (error) {
    console.error('Error saving tracking data:', error);
    res.status(500).send('Error saving tracking data.');
  }
});

// Email function to send tracking data to the client
async function sendTrackingDataToClient(domain, email) {
  const TrackingModel = getTrackingModel(domain);
  
  try {
    // Fetch last 24 hours of tracking data
    const data = await TrackingModel.find({ timestamp: { $gte: new Date(Date.now() - 86400000) } });
    if (data.length === 0) {
      console.log(`No tracking data found for domain: ${domain}`);
      return; // Skip if no data available
    }

    // Setup email transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
      subject: `Daily Tracking Data for ${domain}`,
      text: `Here is your tracking data: ${JSON.stringify(data, null, 2)}`,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Tracking data sent to ${email} for domain: ${domain}`);
  } catch (error) {
    console.error(`Error sending email for domain: ${domain}`, error);
  }
}

// Send tracking data to all registered clients
async function sendTrackingDataToAllClients() {
  try {
    const registrations = await Registration.find();  // Fetch all registered domains
    const sendPromises = registrations.map(reg => sendTrackingDataToClient(reg.domain, reg.email));
    await Promise.all(sendPromises);
    console.log('All tracking data emails sent successfully');
  } catch (error) {
    console.error('Error sending tracking data to clients:', error);
  }
}

// Schedule email job daily at midnight
cron.schedule('* * * * *', async () => {
  console.log('Running scheduled task to send tracking data...');
  await sendTrackingDataToAllClients();
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
