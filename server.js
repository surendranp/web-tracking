// server.js
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const fs = require('fs');
const { Parser } = require('json2csv');
const axios = require('axios');
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

// Updated TrackingSchema with country and city
const TrackingSchema = new mongoose.Schema({
  url: String,
  type: String,
  ip: String,
  sessionId: String,
  timestamp: { type: Date, default: Date.now },
  buttons: { type: Map, of: Number, default: {} },
  links: { type: Map, of: Number, default: {} },
  pageviews: [String],
  sessionStart: { type: Date, default: Date.now },  // Session start time
  sessionEnd: { type: Date },  // Session end time
  country: String,  // Added country
  city: String,      // Added city
  adBlockerActive: { type: Boolean, default: false }  // New field for ad blocker status
});

const Tracking = mongoose.models.Tracking || mongoose.model('Tracking', TrackingSchema);

// Register endpoint
app.post('/api/register', async (req, res) => {
  const { domain, email } = req.body;
  try {
    const registration = new Registration({ domain, email });
    await registration.save();
    const collectionName = sanitizeDomain(domain);

    if (!mongoose.models[collectionName]) {
      mongoose.model(collectionName, TrackingSchema, collectionName);
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
  const { domain, url, type, sessionId, buttonName, linkName, adBlockerActive } = req.body;

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const cleanedIp = ip.split(',')[0].trim();

  if (!domain || !url || !cleanedIp) {
    return res.status(400).send('Domain, URL, and IP are required.');
  }

  try {
    const collectionName = sanitizeDomain(domain);
    let Tracking = mongoose.models[collectionName];

    if (!Tracking) {
      Tracking = mongoose.model(collectionName, TrackingSchema, collectionName);
    }

    const geoLocationUrl = `https://ipapi.co/${cleanedIp}/json/`;
    let geoLocationData = { country: 'Unknown', city: 'Unknown' };

    try {
      const response = await axios.get(geoLocationUrl);
      if (response.data) {
        geoLocationData = {
          country: response.data.country_name || 'Unknown',
          city: response.data.city || 'Unknown'
        };
      }
    } catch (geoError) {
      console.error('Error fetching geolocation data:', geoError.message);
    }

    let existingTrackingData = await Tracking.findOne({ ip: cleanedIp });

    if (existingTrackingData) {
      if (type === 'pageview') {
        if (!existingTrackingData.pageviews.includes(url)) {
          existingTrackingData.pageviews.push(url);
        }
      } else if (type === 'button_click') {
        const sanitizedButtonName = buttonName ? buttonName.replace(/[.\$]/g, '_') : 'Unnamed Button';
        existingTrackingData.buttons.set(sanitizedButtonName, (existingTrackingData.buttons.get(sanitizedButtonName) || 0) + 1);
      } else if (type === 'link_click') {
        const sanitizedLinkName = linkName ? linkName.replace(/[.\$]/g, '_') : 'Unnamed Link';
        existingTrackingData.links.set(sanitizedLinkName, (existingTrackingData.links.get(sanitizedLinkName) || 0) + 1);
      }

      existingTrackingData.sessionEnd = new Date();
      existingTrackingData.adBlockerActive = adBlockerActive;
      existingTrackingData.country = geoLocationData.country;
      existingTrackingData.city = geoLocationData.city;

      await existingTrackingData.save();
    } else {
      const newTrackingData = new Tracking({
        url,
        type,
        ip: cleanedIp,
        sessionId,
        pageviews: type === 'pageview' ? [url] : [],
        sessionStart: new Date(),
        sessionEnd: new Date(),
        country: geoLocationData.country,
        city: geoLocationData.city,
        adBlockerActive
      });

      await newTrackingData.save();
    }

    res.status(200).send('Tracking data stored successfully');
  } catch (error) {
    console.error('Error saving tracking data:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Send tracking data to client via email with CSV attachment
async function sendTrackingDataToClient(domain, email) {
  const collectionName = sanitizeDomain(domain);
  let Tracking = mongoose.models[collectionName];

  if (!Tracking) {
    Tracking = mongoose.model(collectionName, TrackingSchema, collectionName);
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
    const adBlockerUsers = trackingData.filter(doc => doc.adBlockerActive).length;

    let totalPageviews = 0;
    let totalButtonClicks = 0;
    let totalLinkClicks = 0;
    let overallDuration = 0;

    trackingData.forEach(doc => {
      totalPageviews += doc.pageviews.length;

      const buttonClicks = doc.buttons instanceof Map ? doc.buttons : new Map(Object.entries(doc.buttons));
      totalButtonClicks += [...buttonClicks.values()].reduce((sum, count) => sum + count, 0);

      const linkClicks = doc.links instanceof Map ? doc.links : new Map(Object.entries(doc.links));
      totalLinkClicks += [...linkClicks.values()].reduce((sum, count) => sum + count, 0);

      const sessionDuration = ((doc.sessionEnd ? doc.sessionEnd : new Date()) - doc.sessionStart);
      overallDuration += sessionDuration;
    });

    const totalDurationInSeconds = Math.floor(overallDuration / 1000);
    const hours = Math.floor(totalDurationInSeconds / 3600);
    const minutes = Math.floor((totalDurationInSeconds % 3600) / 60);
    const seconds = totalDurationInSeconds % 60;

    const csvFields = ['URL', 'Timestamp', 'Pageviews', 'Buttons Clicked', 'Links Clicked', 'Session Duration (seconds)', 'Session Duration (H:M:S)', 'Country', 'City'];
    const csvData = trackingData.map(doc => {
      const buttonClicks = doc.buttons instanceof Map ? doc.buttons : new Map(Object.entries(doc.buttons));
      const linkClicks = doc.links instanceof Map ? doc.links : new Map(Object.entries(doc.links));

      const sessionDurationMs = (doc.sessionEnd ? doc.sessionEnd : new Date()) - doc.sessionStart;
      const sessionDurationInSeconds = Math.floor(sessionDurationMs / 1000);
      const hours = Math.floor(sessionDurationInSeconds / 3600);
      const minutes = Math.floor((sessionDurationInSeconds % 3600) / 60);
      const seconds = sessionDurationInSeconds % 60;

      return {
        URL: doc.url,
        Timestamp: new Date(doc.timestamp).toLocaleString(),
        Pageviews: doc.pageviews.length ? doc.pageviews.join(', ') : 'No pageviews',
        'Buttons Clicked': Object.keys(Object.fromEntries(buttonClicks)).length ? JSON.stringify(Object.fromEntries(buttonClicks)) : 'No button clicks',
        'Links Clicked': Object.keys(Object.fromEntries(linkClicks)).length ? JSON.stringify(Object.fromEntries(linkClicks)) : 'No link clicks',
        'Session Duration (seconds)': sessionDurationInSeconds,
        'Session Duration (H:M:S)': `${hours}:${minutes}:${seconds}`,
        Country: doc.country || 'Unknown',
        City: doc.city || 'Unknown'
      };
    });

    const json2csvParser = new Parser({ fields: csvFields });
    const csv = json2csvParser.parse(csvData);

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Daily Tracking Report for ${domain}`,
      text: `Here is your tracking report for ${domain}:\n\nTotal Pageviews: ${totalPageviews}\nTotal Button Clicks: ${totalButtonClicks}\nTotal Link Clicks: ${totalLinkClicks}\nTotal Users: ${userCount}\nTotal Users with Ad Blockers: ${adBlockerUsers}\nOverall Session Duration: ${hours} hours, ${minutes} minutes, ${seconds} seconds.`,
      attachments: [
        {
          filename: `${domain}_tracking_report.csv`,
          content: csv
        }
      ]
    };

    await transporter.sendMail(mailOptions);
    console.log(`Tracking data sent to ${email}`);
  } catch (error) {
    console.error('Error sending tracking data email:', error);
  }
}

// Schedule daily email reports at 9 AM Indian Time
cron.schedule('* * * * *', async () => {
  console.log('Running daily report task at 9 AM Indian Time');
  const registrations = await Registration.find({});

  for (const registration of registrations) {
    await sendTrackingDataToClient(registration.domain, registration.email);
  }
});

// Serve frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
