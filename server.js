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
app.use('/api/pageviews', pageViews);

// Import the Registration model
const Registration = require('./models/Registration');

// Register route
app.post('/api/register', async (req, res) => {
  const { domain, email } = req.body;

  if (!domain || !email) {
    return res.status(400).send('Domain and email are required.');
  }

  try {
    const registration = new Registration({ domain, email });
    await registration.save();

    // Display the script URL on the home page
    res.status(200).send('Registration successful.');
  } catch (error) {
    console.error('Error registering domain:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Send tracking data to email
async function sendTrackingDataToClient(domain, email) {
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
    text: 'Here is the tracking data for your domain. (This is a placeholder; implement actual data retrieval and formatting.)'
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Tracking data sent to ${email}`);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

// Automatically send tracking data via email for all registered domains
async function sendTrackingDataToAllClients() {
  const registrations = await Registration.find();

  registrations.forEach(async (reg) => {
    await sendTrackingDataToClient(reg.domain, reg.email);
  });
}

// Schedule the task to run every 2 minutes
cron.schedule('*/1 * * * *', () => {
  console.log('Running scheduled task to send tracking data...');
  sendTrackingDataToAllClients();
});

// Serve the dashboard page
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

app.listen(port, () => console.log(`Server running on port ${port}`));
