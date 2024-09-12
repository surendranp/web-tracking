const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');  // Added for email functionality
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

// Serve the dashboard page
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

// Serve the homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/home.html'));
});

// Handle domain and email registration
app.post('/api/register', async (req, res) => {
  const { domain, email } = req.body;

  if (!domain || !email) {
    return res.status(400).send('Domain and email are required');
  }

  // Save the domain and email to MongoDB (create schema and model)
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
    
    // Send email with tracking script instructions
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
      text: `Thank you for registering your domain. Please add the following script to the <head> section of your website:\n\n<script src="https://web-tracking-mongodburi.up.railway.app/tracking.js"></script>`
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error during registration:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Email sending cron job (daily report)
const cron = require('node-cron');

cron.schedule('* * * * *', async () => {
  const registrations = await Registration.find();

  registrations.forEach(async registration => {
    const { domain, email } = registration;

    // Fetch and compile daily tracking data here (dummy data for now)
    const dailyData = 'Tracking data for today...'; // Fetch and process actual data

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
      subject: 'Daily Tracking Report',
      text: `Here is your daily tracking report for ${domain}:\n\n${dailyData}`
    };

    await transporter.sendMail(mailOptions);
  });
});

app.listen(port, () => console.log(`Server running on port ${port}`));
