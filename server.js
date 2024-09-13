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
  throw new Error('MONGODB_URI environment variable not set.');
}

mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => console.log('Connected to MongoDB'));

// Registration Schema
const registrationSchema = new mongoose.Schema({
  domain: { type: String, required: true, unique: true },
  email: { type: String, required: true }
});

const Registration = mongoose.model('Registration', registrationSchema);

// Import and use routes
const pageViewsRouter = require('./routes/pageviews');
app.use('/api/pageviews', pageViewsRouter);

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Handle registration
app.post('/api/register', async (req, res) => {
  try {
    const { domain, email } = req.body;
    if (!domain || !email) {
      return res.status(400).send('Domain and email are required.');
    }

    const existingRegistration = await Registration.findOne({ domain });

    if (existingRegistration) {
      return res.status(400).send('Domain is already registered.');
    }

    const registration = new Registration({ domain, email });
    await registration.save();

    res.status(201).send('Registration successful');
  } catch (error) {
    console.error('Error registering domain:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

// Schedule email sending every 2 minutes
cron.schedule('*/2 * * * *', async () => {
  try {
    const registrations = await Registration.find();

    for (const registration of registrations) {
      const domain = registration.domain;
      const email = registration.email;

      await sendTrackingDataToClient(domain, email); // Function to send tracking data
    }
  } catch (error) {
    console.error('Error in scheduled task:', error.message);
  }
});

// Start the server
app.listen(port, () => console.log(`Server running on port ${port}`));

// Function to send tracking data to the client via email
async function sendTrackingDataToClient(domain, email) {
  // Define or get the model for tracking data
  const sanitizedDomain = domain.replace(/[.\$]/g, '_'); // Sanitize domain name
  const trackingSchema = new mongoose.Schema({
    url: String,
    type: String,
    ip: String,
    sessionId: String,
    timestamp: Date,
    buttons: Object,
    links: Object
  });

  const Tracking = mongoose.model(sanitizedDomain, trackingSchema, sanitizedDomain);

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
