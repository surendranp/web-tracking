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

// Define Schema and Model for Client Info
const clientSchema = new mongoose.Schema({
  domain: String,
  email: String
});
const Client = mongoose.model('Client', clientSchema);

// Define Schema and Model for Tracking Data
const trackingSchema = new mongoose.Schema({
  type: { type: String, required: true },
  url: { type: String, required: true },
  buttons: { type: Map, of: Number, default: {} },
  links: { type: Map, of: Number, default: {} },
  pageviews: [String],
  timestamp: { type: Date, default: Date.now },
  ip: { type: String, required: true },
  sessionId: String,
  duration: Number,
});
const Tracking = mongoose.model('Tracking', trackingSchema);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Import and use routes
const pageViews = require('./routes/pageViews');
app.use('/api/pageviews', pageViews);

// Serve the dashboard page
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

// Route to handle client domain and email input
app.post('/register', async (req, res) => {
  const { domain, email } = req.body;
  if (!domain || !email) {
    return res.status(400).send('Domain and email are required.');
  }

  try {
    const newClient = new Client({ domain, email });
    await newClient.save();
    res.status(200).send('Client registered successfully.');
  } catch (error) {
    console.error('Error registering client:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

// Route to get the tracking script and instructions
app.get('/tracking-script', (req, res) => {
  res.send(`
    <h1>Tracking Script</h1>
    <p>To track your website, add the following script to your website's HTML:</p>
    <pre>
<script src="https://web-tracking-mongodburi.up.railway.app/tracking.js"></script>
    </pre>
  `);
});

// Set up Nodemailer for sending emails
const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Function to send tracking details to clients
async function sendTrackingReports() {
  try {
    const clients = await Client.find();
    for (const client of clients) {
      const { domain, email } = client;

      // Get tracking data for the client's domain
      const trackingData = await Tracking.find({ domain });

      // Create report data (you can customize this part)
      const reportData = trackingData.map(data => 
        `URL: ${data.url}\nButtons: ${JSON.stringify(data.buttons)}\nLinks: ${JSON.stringify(data.links)}\n\n`
      ).join('\n');

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Your Website Tracking Report',
        text: `Here is your tracking report:\n\n${reportData}`
      };

      await transporter.sendMail(mailOptions);
    }
  } catch (error) {
    console.error('Error sending tracking reports:', error.message);
  }
}

// Schedule to send tracking reports every minute
cron.schedule('12 9 * * *', sendTrackingReports);

app.listen(port, () => console.log(`Server running on port ${port}`));
