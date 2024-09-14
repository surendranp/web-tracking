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

// Import and use routes
const pageViews = require('./routes/pageViews');
const registration = require('./routes/registration');
app.use('/api/pageviews', pageViews);
app.use('/api/register', registration);

// Function to send tracking data to the client via email
async function sendTrackingDataToClient(domain, email) {
  const collectionName = domain.replace(/[.\$]/g, '_'); // Sanitize domain name

  // Define schema and model dynamically
  const trackingSchema = new mongoose.Schema({
    url: String,
    type: String,
    ip: String,
    sessionId: String,
    timestamp: Date,
    buttons: Object,
    links: Object
  });

  const Tracking = mongoose.model(collectionName, trackingSchema, collectionName);

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

    if (!trackingData.length) {
      console.log(`No tracking data available for ${domain}`);
      return;
    }

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

app.listen(port, () => console.log(`Server running on port ${port}`));
