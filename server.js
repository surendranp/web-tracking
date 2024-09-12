const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const schedule = require('node-schedule'); // For scheduling emails
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); // For handling form submissions

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

// Define schemas and models
const clientSchema = new mongoose.Schema({
  domain: { type: String, required: true },
  email: { type: String, required: true },
});

const Client = mongoose.model('Client', clientSchema);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Serve the homepage
app.get('/', (req, res) => {
  res.send(`
    <h1>Welcome to the Tracking Service</h1>
    <p>Please enter your domain and email address below:</p>
    <form action="/register" method="post">
      <label for="domain">Domain:</label>
      <input type="text" id="domain" name="domain" required><br><br>
      <label for="email">Email:</label>
      <input type="email" id="email" name="email" required><br><br>
      <input type="submit" value="Register">
    </form>
    <h2>Tracking Script</h2>
    <p>To track your website, add the following script to your website's HTML:</p>
    <pre>
<script src="https://web-tracking-mongodburi.up.railway.app/tracking.js"></script>
    </pre>
  `);
});

// Register route
app.post('/register', async (req, res) => {
  try {
    const { domain, email } = req.body;

    if (!domain || !email) {
      return res.status(400).send('Missing required fields');
    }

    // Save client information
    const client = new Client({ domain, email });
    await client.save();

    res.send('Registration successful');
  } catch (error) {
    console.error('Error registering client:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Function to send emails
async function sendEmail(clientEmail, subject, html) {
  const transporter = nodemailer.createTransport({
    service: 'gmail', // Use your email provider
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: clientEmail,
    subject: subject,
    html: html,
  };

  return transporter.sendMail(mailOptions);
}

// Function to generate and send daily reports
async function sendDailyReports() {
  try {
    const clients = await Client.find();

    for (const client of clients) {
      // Generate the report for this client
      // This is where you would generate the report based on their domain data

      // Example HTML content for the email
      const htmlContent = `
        <h1>Daily Tracking Report</h1>
        <p>Here are the tracking details for your domain ${client.domain}:</p>
        <p>...Tracking details go here...</p>
      `;

      await sendEmail(client.email, 'Daily Tracking Report', htmlContent);
    }
  } catch (error) {
    console.error('Error sending daily reports:', error);
  }
}

// Schedule daily email sending
schedule.scheduleJob('* * * * *', sendDailyReports); // Sends email at 9 AM every day

// Serve the dashboard page
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

app.listen(port, () => console.log(`Server running on port ${port}`));
