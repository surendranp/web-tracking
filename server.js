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
        sessionStart: { type: Date, default: Date.now },  // Session start time
        sessionEnd: { type: Date },  // Session end time (updated when user leaves)
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
    let Tracking;
    if (mongoose.models[collectionName]) {
      Tracking = mongoose.model(collectionName);
    } else {
      const trackingSchema = new mongoose.Schema({
        url: String,
        type: String,
        ip: String,
        sessionId: String,
        sessionStart: { type: Date, default: Date.now },  // Track session start
        sessionEnd: { type: Date },  // Track session end
        timestamp: { type: Date, default: Date.now },
        buttons: { type: Map, of: Number, default: {} },
        links: { type: Map, of: Number, default: {} },
        pageviews: [String],
      });
      Tracking = mongoose.model(collectionName, trackingSchema, collectionName);
    }

    let trackingData = await Tracking.findOne({ $or: [{ ip }, { sessionId }] });

    if (!trackingData) {
      // If no document exists, create a new one
      trackingData = new Tracking({
        url,
        type,
        ip,
        sessionId,
        pageviews: type === 'pageview' ? [url] : [],
        sessionStart: new Date(),  // Start a new session
      });
    } else {
      // Merge pageviews, button clicks, and links (similar to earlier code)
      // Update session end time to current time
      trackingData.sessionEnd = new Date();
      
      if (type === 'pageview' && !trackingData.pageviews.includes(url)) {
        trackingData.pageviews.push(url);
      }
      if (type === 'button_click' && buttonName) {
        const sanitizedButtonName = buttonName.replace(/[.\$]/g, '_');
        const currentButtonClicks = trackingData.buttons.get(sanitizedButtonName) || 0;
        trackingData.buttons.set(sanitizedButtonName, currentButtonClicks + 1);
      }
      if (type === 'link_click' && linkName) {
        const sanitizedLinkName = linkName.replace(/[.\$]/g, '_');
        const currentLinkClicks = trackingData.links.get(sanitizedLinkName) || 0;
        trackingData.links.set(sanitizedLinkName, currentLinkClicks + 1);
      }
    }

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

  let Tracking;
  if (mongoose.models[collectionName]) {
    Tracking = mongoose.model(collectionName);
  } else {
    const trackingSchema = new mongoose.Schema({
      url: String,
      type: String,
      ip: String,
      sessionId: String,
      sessionStart: { type: Date, default: Date.now },
      sessionEnd: { type: Date },
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const trackingData = await Tracking.find({
      timestamp: { $gte: today, $lt: tomorrow }
    }).lean();

    if (!trackingData.length) {
      console.log(`No tracking data available for ${domain} within the last 24 hours`);
      return;
    }

    let dataText = `Tracking data for ${domain} from the last 24 hours:\n\n`;
    let overallDuration = 0;  // Initialize overall duration

    trackingData.forEach(doc => {
      const sessionDuration = (doc.sessionEnd ? doc.sessionEnd : new Date()) - doc.sessionStart;
      overallDuration += sessionDuration;  // Add to the overall duration
      
      dataText += `URL: ${doc.url}\n`;
      dataText += `IP: ${doc.ip}\n`;
      dataText += `Session ID: ${doc.sessionId}\n`;
      dataText += `Session Duration: ${Math.floor(sessionDuration / 1000)} seconds\n`;  // Duration in seconds
      dataText += `Timestamp: ${new Date(doc.timestamp).toLocaleString()}\n`;
      dataText += `Pageviews: ${doc.pageviews.length ? doc.pageviews.join(', ') : 'No pageviews'}\n`;

      if (doc.buttons && Object.keys(doc.buttons).length > 0) {
        const buttonsObject = Array.from(doc.buttons).reduce((acc, [key, value]) => {
          acc[key] = value;
          return acc;
        }, {});
        dataText += `Buttons Clicked: ${JSON.stringify(buttonsObject)}\n`;
      } else {
        dataText += `Buttons Clicked: No button clicks\n`;
      }

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

    // Add overall duration to the email
    dataText += `\nOverall Duration for All Users: ${Math.floor(overallDuration / 1000)} seconds\n`;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Daily Tracking Data for ${domain}`,
      text: dataText
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
cron.schedule('*/30 * * * *', async () => {  // Runs daily at 9 AM
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