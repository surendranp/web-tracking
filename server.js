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
    let Tracking = mongoose.models[collectionName];

    if (!Tracking) {
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

    let trackingData = await Tracking.findOne({ ip, sessionId });
    if (!trackingData) {
      trackingData = new Tracking({
        url,
        type,
        ip,
        sessionId,
        pageviews: type === 'pageview' ? [url] : [],
      });
    } else {
      if (type === 'pageview') {
        if (!trackingData.pageviews.includes(url)) {
          trackingData.pageviews.push(url);
        }
      } else if (type === 'button_click') {
        const sanitizedButtonName = buttonName ? buttonName.replace(/[.\$]/g, '_') : 'Unnamed Button';
        trackingData.buttons.set(sanitizedButtonName, (trackingData.buttons.get(sanitizedButtonName) || 0) + 1);
      } else if (type === 'link_click') {
        const sanitizedLinkName = linkName ? linkName.replace(/[.\$]/g, '_') : 'Unnamed Link';
        trackingData.links.set(sanitizedLinkName, (trackingData.links.get(sanitizedLinkName) || 0) + 1);
      }
    }

    await trackingData.save();
    res.status(200).send('Tracking data stored successfully');
  } catch (error) {
    console.error('Error saving tracking data:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Send tracking data to client via email with user count and daily tracking details
async function sendTrackingDataToClient(domain, email) {
  const collectionName = sanitizeDomain(domain);
  let Tracking = mongoose.models[collectionName];

  if (!Tracking) {
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
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const trackingData = await Tracking.find({
      timestamp: { $gte: oneDayAgo }
    }).lean();

    if (!trackingData.length) {
      console.log(`No tracking data available for ${domain}`);
      return;
    }

    const uniqueUsers = new Set(trackingData.map(doc => doc.ip));
    const userCount = uniqueUsers.size;

    let dataText = `Tracking data for ${domain} (Last 24 Hours):\n\n`;
    dataText += `Total Unique Users: ${userCount}\n\n`;

    trackingData.forEach(doc => {
      dataText += `URL: ${doc.url}\n`;
      dataText += `Type: ${doc.type}\n`;
      dataText += `IP: ${doc.ip}\n`;
      dataText += `Session ID: ${doc.sessionId}\n`;
      dataText += `Timestamp: ${new Date(doc.timestamp).toLocaleString()}\n`;
      dataText += `Pageviews: ${doc.pageviews.length ? doc.pageviews.join(', ') : 'No pageviews'}\n`;

      // Handle buttons clicked
      const buttonsObject = Object.entries(doc.buttons).reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {});
      dataText += `Buttons Clicked: ${Object.keys(buttonsObject).length ? JSON.stringify(buttonsObject) : 'No button clicks'}\n`;

      // Handle links clicked
      const linksObject = Object.entries(doc.links).reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {});
      dataText += `Links Clicked: ${Object.keys(linksObject).length ? JSON.stringify(linksObject) : 'No link clicks'}\n\n`;
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Daily Tracking Data for ${domain}`,
      text: dataText || 'No tracking data available.'
    };

    await transporter.sendMail(mailOptions);
    console.log(`Daily tracking data sent to ${email}`);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}


// Send daily tracking data to all registered clients
async function sendDailyTrackingDataToAllClients() {
  const registrations = await Registration.find();
  registrations.forEach(async (reg) => {
    await sendTrackingDataToClient(reg.domain, reg.email);
  });
}

// Schedule the task to run every day at 9 AM
cron.schedule('* * * * *', async () => {
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
