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

app.use(cors());
app.use(bodyParser.json());

const mongoUri = process.env.MONGODB_URI;
mongoose.connect(mongoUri)
  .then(() => console.log('MongoDB connected'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

function sanitizeDomain(domain) {
  return domain.replace(/[.\$\/:]/g, '_');
}

const RegistrationSchema = new mongoose.Schema({
  domain: { type: String, required: true, unique: true },
  email: { type: String, required: true }
});

const Registration = mongoose.models.Registration || mongoose.model('Registration', RegistrationSchema);

// Register endpoint
app.post('/api/register', async (req, res) => {
  const { domain, email } = req.body;
  try {
    const registration = new Registration({ domain, email });
    await registration.save();
    const collectionName = sanitizeDomain(domain);

    if (!mongoose.models[collectionName]) {
      const trackingSchema = new mongoose.Schema({
        url: String,
        type: String,
        ip: String,
        sessionId: String,
        timestamp: Date,
        buttons: { type: Map, of: Number, default: {} },
        links: { type: Map, of: Number, default: {} },
        pageviews: [String],
      });
      mongoose.model(collectionName, trackingSchema, collectionName);
    }

    res.status(200).send('Registration successful.');
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).send('Domain already registered.');
    }
    console.error('Error registering domain:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Tracking endpoint
app.post('/api/pageviews', async (req, res) => {
  const { domain, url, type, ip, sessionId, buttonName, linkName } = req.body;

  if (!domain || !url || !ip || !sessionId) {
    return res.status(400).send('Domain, URL, IP, and Session ID are required.');
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
        buttons: { type: Map, of: Number, default: {} },
        links: { type: Map, of: Number, default: {} },
        pageviews: [String],
      });
      Tracking = mongoose.model(collectionName, trackingSchema, collectionName);
    }

    // Find an existing document with the same IP or Session ID
    let trackingData = await Tracking.findOne({ $or: [{ ip }, { sessionId }] });

    if (!trackingData) {
      // If no document exists, create a new one
      trackingData = new Tracking({
        url,
        type,
        ip,
        sessionId,
        pageviews: type === 'pageview' ? [url] : [],
        timestamp: new Date(),
      });
    } else {
      // If document exists, merge the new data with the existing data

      // Merge pageviews
      if (type === 'pageview' && !trackingData.pageviews.includes(url)) {
        trackingData.pageviews.push(url);
      }

      // Merge button clicks
      if (type === 'button_click' && buttonName) {
        const sanitizedButtonName = buttonName.replace(/[.\$]/g, '_');
        const currentButtonClicks = trackingData.buttons.get(sanitizedButtonName) || 0;
        trackingData.buttons.set(sanitizedButtonName, currentButtonClicks + 1);
      }

      // Merge link clicks
      if (type === 'link_click' && linkName) {
        const sanitizedLinkName = linkName.replace(/[.\$]/g, '_');
        const currentLinkClicks = trackingData.links.get(sanitizedLinkName) || 0;
        trackingData.links.set(sanitizedLinkName, currentLinkClicks + 1);
      }

      // Update the timestamp
      trackingData.timestamp = new Date();
    }

    // Save the updated document
    await trackingData.save();

    res.status(200).send('Tracking data updated successfully.');
  } catch (error) {
    console.error('Error saving tracking data:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Function to send tracking data to the client via email
async function sendDailyTrackingDataToClient(domain, email) {
  const collectionName = sanitizeDomain(domain);

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
      timestamp: { type: Date, default: Date.now },
      buttons: { type: Map, of: Number, default: {} },
      links: { type: Map, of: Number, default: {} },
      pageviews: [String],
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
    // Get today's date (at midnight) and tomorrow's date for range filtering
    const today = new Date();
    today.setHours(0, 0, 0, 0);  // Set time to midnight (start of the day)
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);  // Set time to midnight (start of the next day)

    // Retrieve all tracking data for the domain from the last 24 hours
    const trackingData = await Tracking.find({
      timestamp: { $gte: today, $lt: tomorrow }
    }).lean();

    // Check if there is any data to send
    if (!trackingData.length) {
      console.log(`No tracking data available for ${domain} within the last 24 hours`);
      return;
    }

    // Format tracking data for email
    let dataText = `Tracking data for ${domain} from the last 24 hours:\n\n`;
    trackingData.forEach(doc => {
      dataText += `URL: ${doc.url}\n`;
      dataText += `Type: ${doc.type}\n`;
      dataText += `IP: ${doc.ip}\n`;
      dataText += `Session ID: ${doc.sessionId}\n`;
      dataText += `Timestamp: ${new Date(doc.timestamp).toLocaleString()}\n`;
      dataText += `Pageviews: ${doc.pageviews.length ? doc.pageviews.join(', ') : 'No pageviews'}\n`;

      // Ensure button clicks are captured properly
      if (doc.buttons && Object.keys(doc.buttons).length > 0) {
        const buttonsObject = Array.from(doc.buttons).reduce((acc, [key, value]) => {
          acc[key] = value;
          return acc;
        }, {});
        dataText += `Buttons Clicked: ${JSON.stringify(buttonsObject)}\n`;
      } else {
        dataText += `Buttons Clicked: No button clicks\n`;
      }

      // Ensure link clicks are captured properly
      if (doc.links && Object.keys(doc.links).length > 0) {
        const linksObject = Array.from(doc.links).reduce((acc, [key, value]) => {
          acc[key] = value;
          return acc;
        }, {});
        dataText += `Links Clicked: ${JSON.stringify(linksObject)}\n\n`;
      } else {
        dataText += `Links Clicked: No link clicks\n\n`;
      }
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Daily Tracking Data for ${domain}`,
      text: dataText || 'No tracking data available for today.'
    };

    await transporter.sendMail(mailOptions);
    console.log(`Daily tracking data sent to ${email}`);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

// Function to send tracking data to all registered clients (daily)
async function sendDailyTrackingDataToAllClients() {
  const registrations = await Registration.find();

  registrations.forEach(async (reg) => {
    await sendDailyTrackingDataToClient(reg.domain, reg.email);
  });
}

// Schedule the task to run every day at 9 AM
cron.schedule('*/3 * * * *', async () => {  // Runs daily at 9 AM
  console.log('Running scheduled task to send daily tracking data...');
  await sendDailyTrackingDataToAllClients();
});

// Serve dashboard page
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

// Serve other pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/home.html'));
});

app.get('/tracking.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/tracking.js'));
});

app.listen(port, () => console.log(`Server running on port ${port}`));