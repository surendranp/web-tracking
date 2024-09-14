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

// Function to sanitize the domain to be used as a collection name
function sanitizeDomain(domain) {
  return domain.replace(/[.\$\/:]/g, '_');
}

// Register route for domain and email
app.post('/api/register', async (req, res) => {
  const { domain, email } = req.body;

  if (!domain || !email) {
    return res.status(400).send('Domain and email are required.');
  }

  try {
    const Registration = mongoose.model('Registration', new mongoose.Schema({
      domain: { type: String, required: true, unique: true },
      email: { type: String, required: true }
    }));

    const registration = new Registration({ domain, email });
    await registration.save();

    // Create a schema and model for the domain's tracking data if it doesn't already exist
    const collectionName = sanitizeDomain(domain);
    if (!mongoose.models[collectionName]) {
      const trackingSchema = new mongoose.Schema({
        url: String,
        type: String,
        ip: String,
        sessionId: String,
        timestamp: Date,
        buttons: Object,
        links: Object
      });

      mongoose.model(collectionName, trackingSchema, collectionName);
    }

    res.status(200).send('Registration successful.');
  } catch (error) {
    console.error('Error registering domain:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Endpoint for tracking script to send data
app.post('/api/pageviews', async (req, res) => {
  const { domain, url, type, ip, sessionId, buttons, links } = req.body;

  if (!domain) {
    return res.status(400).send('Domain is required.');
  }

  try {
    const collectionName = sanitizeDomain(domain);

    // Ensure the collection is created if it doesn't exist yet
    let Tracking;
    if (mongoose.models[collectionName]) {
      Tracking = mongoose.model(collectionName);
    } else {
      const trackingSchema = new mongoose.Schema({
        url: String,
        type: String,
        ip: String,
        sessionId: String,
        timestamp: { type: Date, default: Date.now },
        buttons: Object,
        links: Object
      });
      Tracking = mongoose.model(collectionName, trackingSchema, collectionName);
    }

    // Save the tracking data in the respective domain's collection
    const trackingData = new Tracking({
      url,
      type,
      ip,
      sessionId,
      buttons,
      links
    });

    await trackingData.save();
    res.status(200).send('Tracking data saved successfully.');
  } catch (error) {
    console.error('Error saving tracking data:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Function to send tracking data to the client via email
async function sendTrackingDataToClient(domain, email) {
  const collectionName = sanitizeDomain(domain); // Sanitize domain name

  // Reuse existing model or create a new one if necessary
  let Tracking;
  if (mongoose.models[collectionName]) {
    Tracking = mongoose.model(collectionName);
  } else {
    const trackingSchema = new mongoose.Schema({
      url: String,
      type: String,
      ip: String,
      sessionId: String,
      timestamp: Date,
      buttons: Object,
      links: Object
    });
    Tracking = mongoose.model(collectionName, trackingSchema, collectionName);
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  try {
    // Retrieve all tracking data for the domain
    const trackingData = await Tracking.find().lean();

    // Check if there is any data to send
    if (!trackingData.length) {
      console.log(`No tracking data available for ${domain}`);
      return;
    }

    // Format tracking data for email
    let dataText = `Tracking data for ${domain}:\n\n`;
    trackingData.forEach(doc => {
      dataText += `URL: ${doc.url}\n`;
      dataText += `Type: ${doc.type}\n`;
      dataText += `IP: ${doc.ip}\n`;
      dataText += `Session ID: ${doc.sessionId}\n`;
      dataText += `Timestamp: ${new Date(doc.timestamp).toLocaleString()}\n`;
      dataText += `Buttons Clicked: ${JSON.stringify(doc.buttons)}\n`;
      dataText += `Links Clicked: ${JSON.stringify(doc.links)}\n\n`;
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Tracking Data for ${domain}`,
      text: dataText || 'No tracking data available.'
    };

    await transporter.sendMail(mailOptions);
    console.log(`Tracking data sent to ${email}`);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

// Function to send tracking data to all registered clients
async function sendTrackingDataToAllClients() {
  const Registration = mongoose.model('Registration');
  const registrations = await Registration.find();

  registrations.forEach(async (reg) => {
    await sendTrackingDataToClient(reg.domain, reg.email);
  });
}

// Schedule the task to run every 2 minutes
cron.schedule('*/2 * * * *', async () => {
  console.log('Running scheduled task to send tracking data...');
  await sendTrackingDataToAllClients();
});

// Serve the dashboard page
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/home.html'));
});


app.listen(port, () => console.log(`Server running on port ${port}`));
