const express = require('express');
const mongoose = require('mongoose');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Define tracking schema
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

// Sanitize domain name for MongoDB collection
function sanitizeKey(key) {
  return key.replace(/[^\w]/g, '_'); // Replace any non-word character with '_'
}

// Dynamically create or fetch the appropriate model
function getTrackingModel(domain) {
  const collectionName = sanitizeKey(domain);
  return mongoose.modelNames().includes(collectionName)
    ? mongoose.model(collectionName)
    : mongoose.model(collectionName, trackingSchema, collectionName);
}

// Registration schema for domain and email
const registrationSchema = new mongoose.Schema({
  domain: { type: String, required: true },
  email: { type: String, required: true },
});

const Registration = mongoose.model('Registration', registrationSchema);

// Register client domains
app.post('/api/register', async (req, res) => {
  const { domain, email } = req.body;
  
  try {
    const existingRegistration = await Registration.findOne({ domain });
    if (existingRegistration) {
      return res.status(400).send('Domain already registered.');
    }
    
    const registration = new Registration({ domain, email });
    await registration.save();
    res.status(201).send('Registered successfully!');
  } catch (error) {
    console.error('Error registering client:', error);
    res.status(500).send('Registration failed.');
  }
});

// Track user activity
app.post('/api/pageviews', async (req, res) => {
  const { domain, type, url, buttons, links, pageviews, ip, sessionId, duration } = req.body;

  try {
    const Tracking = getTrackingModel(domain);
    const newTracking = new Tracking({ type, url, buttons, links, pageviews, ip, sessionId, duration });
    await newTracking.save();
    res.status(201).send('Tracking data saved.');
  } catch (error) {
    console.error('Error saving tracking data:', error);
    res.status(500).send('Error saving tracking data.');
  }
});

// Email function
async function sendTrackingDataToClient(domain, email) {
  const Tracking = getTrackingModel(domain);

  try {
    const data = await Tracking.find({ timestamp: { $gte: new Date(Date.now() - 86400000) } }); // Last 24 hours of data
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
      subject: `Tracking Data for ${domain}`,
      text: `Here is your tracking data: ${JSON.stringify(data, null, 2)}`,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Tracking data sent to ${email}`);
  } catch (error) {
    console.error(`Error sending email to ${email}:`, error);
  }
}

// Send tracking data to all clients
async function sendTrackingDataToAllClients() {
  try {
    const registrations = await Registration.find();
    const sendPromises = registrations.map(reg => sendTrackingDataToClient(reg.domain, reg.email));
    await Promise.all(sendPromises);
    console.log('All tracking data sent successfully');
  } catch (error) {
    console.error('Error sending tracking data to all clients:', error);
  }
}

// Schedule cron job to send data daily
cron.schedule('* * * * *', async () => {
  console.log('Running scheduled task to send tracking data...');
  await sendTrackingDataToAllClients();
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`Server running on port ${process.env.PORT || 3000}`);
});
