const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const fs = require('fs');
const { Parser } = require('json2csv');
const axios = require('axios');  // For geo-location API
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

// Updated Tracking Schema to include geo-location data
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
  location: {
    city: String,
    country: String,
    region: String
  }  // Geo-location info
});

const Tracking = mongoose.models.Tracking || mongoose.model('Tracking', TrackingSchema);

const RegistrationSchema = new mongoose.Schema({
  domain: { type: String, required: true, unique: true },
  email: { type: String, required: true }
});

const Registration = mongoose.models.Registration || mongoose.model('Registration', RegistrationSchema);

// Helper function to get geo-location from IP
async function getGeoLocation(ip) {
  try {
    const response = await axios.get(`https://ipapi.co/${ip}/json/`);
    const { city, country_name: country, region } = response.data;
    return { city, country, region };
  } catch (error) {
    console.error('Error fetching geo-location:', error);
    return { city: 'Unknown', country: 'Unknown', region: 'Unknown' };
  }
}

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

// Tracking endpoint with geo-location
app.post('/api/pageviews', async (req, res) => {
  const { domain, url, type, sessionId, buttonName, linkName } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  if (!domain || !url || !ip || !sessionId) {
    return res.status(400).send('Domain, URL, IP, and Session ID are required.');
  }

  try {
    const collectionName = sanitizeDomain(domain);
    let Tracking = mongoose.models[collectionName];

    if (!Tracking) {
      Tracking = mongoose.model(collectionName, TrackingSchema, collectionName);
    }

    // Fetch geo-location data
    const geoLocation = await getGeoLocation(ip);

    let trackingData = await Tracking.findOne({ ip, sessionId });

    if (!trackingData) {
      trackingData = new Tracking({
        url,
        type,
        ip,
        sessionId,
        pageviews: type === 'pageview' ? [url] : [],
        sessionStart: new Date(),  // Start a new session
        location: geoLocation  // Save geo-location data
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
      trackingData.sessionEnd = new Date();  // Update session end time
    }

    await trackingData.save();
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

    // Calculate unique users based on IP addresses
    const uniqueUsers = new Set(trackingData.map(doc => doc.ip));
    const userCount = uniqueUsers.size;

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

      const sessionDuration = (doc.sessionEnd ? doc.sessionEnd : new Date()) - doc.sessionStart;
      overallDuration += sessionDuration;
    });

    // Prepare data for CSV
    const csvFields = ['URL', 'Timestamp', 'Pageviews', 'Buttons Clicked', 'Links Clicked', 'Session Duration (seconds)', 'City', 'Country', 'Region'];
    const csvData = trackingData.map(doc => {
      const buttonClicks = doc.buttons instanceof Map ? doc.buttons : new Map(Object.entries(doc.buttons));
      const linkClicks = doc.links instanceof Map ? doc.links : new Map(Object.entries(doc.links));

      return {
        URL: doc.url,
        Timestamp: new Date(doc.timestamp).toLocaleString(),
        Pageviews: doc.pageviews.length ? doc.pageviews.join(', ') : 'No pageviews',
        'Buttons Clicked': Object.keys(Object.fromEntries(buttonClicks)).length ? JSON.stringify(Object.fromEntries(buttonClicks)) : 'No button clicks',
        'Links Clicked': Object.keys(Object.fromEntries(linkClicks)).length ? JSON.stringify(Object.fromEntries(linkClicks)) : 'No link clicks',
        'Session Duration (seconds)': Math.floor(((doc.sessionEnd ? doc.sessionEnd : new Date()) - doc.sessionStart) / 1000),
        City: doc.location.city || 'Unknown',
        Country: doc.location.country || 'Unknown',
        Region: doc.location.region || 'Unknown'
      };
    });

    // Convert JSON data to CSV
    const json2csvParser = new Parser({ fields: csvFields });
    const csv = json2csvParser.parse(csvData);

    // Write CSV to a file (temporary file location)
    const filePath = `./daily_tracking_${domain}.csv`;
    fs.writeFileSync(filePath);

    // Email content
    let dataText = `Tracking data for ${domain} (Last 24 Hours):\n\n`;
    dataText += `Total Unique Users: ${userCount}\n`;
    dataText += `Total Pageviews: ${totalPageviews}\n`;
    dataText += `Total Button Clicks: ${totalButtonClicks}\n`;
    dataText += `Total Link Clicks: ${totalLinkClicks}\n`;
    dataText += `Overall Duration for All Users: ${Math.floor(overallDuration / 1000)} seconds\n\n`;

    trackingData.forEach(doc => {
      const buttonClicks = doc.buttons instanceof Map ? doc.buttons : new Map(Object.entries(doc.buttons));
      const linkClicks = doc.links instanceof Map ? doc.links : new Map(Object.entries(doc.links));

      dataText += `URL: ${doc.url}\n`;
      dataText += `Timestamp: ${new Date(doc.timestamp).toLocaleString()}\n`;
      dataText += `Pageviews: ${doc.pageviews.length ? doc.pageviews.join(', ') : 'No pageviews'}\n`;
      dataText += `Buttons Clicked: ${Object.keys(Object.fromEntries(buttonClicks)).length ? JSON.stringify(Object.fromEntries(buttonClicks)) : 'No button clicks'}\n`;
      dataText += `Links Clicked: ${Object.keys(Object.fromEntries(linkClicks)).length ? JSON.stringify(Object.fromEntries(linkClicks)) : 'No link clicks'}\n`;
      dataText += `Session Duration (seconds): ${Math.floor(((doc.sessionEnd ? doc.sessionEnd : new Date()) - doc.sessionStart) / 1000)}\n`;
      dataText += `City: ${doc.location.city || 'Unknown'}\n`;
      dataText += `Country: ${doc.location.country || 'Unknown'}\n`;
      dataText += `Region: ${doc.location.region || 'Unknown'}\n\n`;
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Daily Tracking Report for ${domain}`,
      text: dataText,
      attachments: [
        {
          filename: `daily_tracking_${domain}.csv`,
          path: filePath
        }
      ]
    };

    await transporter.sendMail(mailOptions);
    console.log(`Daily tracking email sent to ${email}`);
    fs.unlinkSync(filePath);  // Remove the file after sending the email
  } catch (error) {
    console.error(`Error sending tracking data email to ${email}:`, error);
  }
}

// Scheduled job to run every day at 9 AM Indian Time
cron.schedule('0/3  * * *', async () => {
  const registrations = await Registration.find({}).lean();
  registrations.forEach(async ({ domain, email }) => {
    await sendTrackingDataToClient(domain, email);
  });
}, {
  scheduled: true,
  timezone: 'Asia/Kolkata'
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
