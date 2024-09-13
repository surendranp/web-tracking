const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
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

const registration = require('./routes/registration');
app.use('/api/register', registration);

// Serve the dashboard page
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

// Create a transport for sending emails
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,  // Your email address
    pass: process.env.EMAIL_PASS   // Your email password or app password
  }
});

async function sendEmail(to, subject, text) {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      text
    });
    console.log(`Email sent to ${to}`);
  } catch (error) {
    console.error('Error sending email:', error.message);
  }
}

// Function to send daily reports
const sendDailyReports = async () => {
  const domains = await mongoose.connection.db.listCollections().toArray();
  for (const domain of domains) {
    const collection = mongoose.connection.db.collection(domain.name);
    const todayStart = new Date();
    todayStart.setHours(6, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setHours(18, 0, 0, 0);

    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    const trackingDataToday = await collection.find({ timestamp: { $gte: todayStart, $lt: todayEnd } }).toArray();
    const trackingDataYesterday = await collection.find({ timestamp: { $gte: yesterdayStart, $lt: todayStart } }).toArray();

    const emailData = `Daily Report for ${domain.name}:\n\n` +
      `Data from 6:00 AM to 6:00 PM today:\n${JSON.stringify(trackingDataToday, null, 2)}\n\n` +
      `Data from 6:01 PM to 5:59 AM the following day:\n${JSON.stringify(trackingDataYesterday, null, 2)}`;

    const client = await collection.findOne({}, { projection: { _id: 0, email: 1 } });
    if (client && client.email) {
      await sendEmail(client.email, `Daily Report for ${domain.name}`, emailData);
    }
  }
};

// Schedule the daily report
const schedule = require('node-schedule');
schedule.scheduleJob('0 0 * * *', sendDailyReports);

app.listen(port, () => console.log(`Server running on port ${port}`));
