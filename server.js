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

const Registration = mongoose.model('Registration', RegistrationSchema);

const TrackingSchema = new mongoose.Schema({
  url: String,
  type: String,
  ip: String,
  sessionId: String,
  timestamp: { type: Date, default: Date.now },
  buttons: { type: Map, of: Number, default: {} },
  links: { type: Map, of: Number, default: {} },
  pageviews: [String],
  sessionStart: { type: Date, default: Date.now },
  sessionEnd: { type: Date },
  country: String,
  city: String,
  adBlockerCount: { type: Number, default: 0 }
});

const Tracking = mongoose.model('Tracking', TrackingSchema);

// Register endpoint
app.post('/api/register', async (req, res) => {
  const { domain, email } = req.body;
  try {
    const registration = new Registration({ domain, email });
    await registration.save();
    res.status(200).send('Registration successful.');
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).send('Domain already registered.');
    }
    console.error('Error registering domain:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Ad blocker tracking endpoint
app.post('/api/adblocker', async (req, res) => {
  const { domain, adBlocker, sessionId } = req.body;

  if (!domain || !sessionId) {
    return res.status(400).send('Domain and Session ID are required.');
  }

  try {
    const collectionName = sanitizeDomain(domain);
    let Tracking = mongoose.model(collectionName, TrackingSchema);

    // Update existing document or create a new one
    await Tracking.findOneAndUpdate(
      { sessionId },
      { $inc: { adBlockerCount: adBlocker ? 1 : 0 } },
      { upsert: true, new: true }
    );

    res.status(200).send('Ad blocker status recorded successfully');
  } catch (error) {
    console.error('Error saving ad blocker status:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Tracking endpoint
app.post('/api/pageviews', async (req, res) => {
  const { domain, url, type, sessionId, buttonName, linkName } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress.split(',')[0].trim();

  if (!domain || !url || !ip || !sessionId) {
    return res.status(400).send('Domain, URL, IP, and Session ID are required.');
  }

  try {
    const collectionName = sanitizeDomain(domain);
    let Tracking = mongoose.model(collectionName, TrackingSchema);
    
    // Fetch geolocation data
    const geoLocationUrl = `https://ipapi.co/${ip}/json/`;
    let geoLocationData = { country: 'Unknown', city: 'Unknown' };

    try {
      const response = await axios.get(geoLocationUrl);
      geoLocationData = {
        country: response.data.country_name || 'Unknown',
        city: response.data.city || 'Unknown'
      };
    } catch (geoError) {
      console.error('Error fetching geolocation data:', geoError.message);
    }

    const updateFields = {
      sessionEnd: new Date(),
      $setOnInsert: { sessionStart: new Date(), country: geoLocationData.country, city: geoLocationData.city }
    };

    if (type === 'pageview') {
      updateFields.$addToSet = { pageviews: url };  // Add pageview only if not already present
    } else if (type === 'button_click') {
      const sanitizedButtonName = buttonName ? buttonName.replace(/[.\$]/g, '_') : 'Unnamed Button';
      updateFields.$inc = { [`buttons.${sanitizedButtonName}`]: 1 };  // Increment button click count
    } else if (type === 'link_click') {
      const sanitizedLinkName = linkName ? linkName.replace(/[.\$]/g, '_') : 'Unnamed Link';
      updateFields.$inc = { [`links.${sanitizedLinkName}`]: 1 };  // Increment link click count
    }

    // Update or create document
    await Tracking.findOneAndUpdate(
      { ip, sessionId },
      updateFields,
      { upsert: true, new: true }
    );

    res.status(200).send('Tracking data stored successfully');
  } catch (error) {
    console.error('Error saving tracking data:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Send tracking data to client via email with CSV attachment
async function sendTrackingDataToClient(domain, email) {
  const collectionName = sanitizeDomain(domain);
  let Tracking = mongoose.model(collectionName, TrackingSchema);

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
    const adBlockerUsers = trackingData.filter(doc => doc.adBlockerCount > 0).length;

    let totalPageviews = 0;
    let totalButtonClicks = 0;
    let totalLinkClicks = 0;
    let overallDuration = 0;

    trackingData.forEach(doc => {
      totalPageviews += doc.pageviews.length;
      totalButtonClicks += [...doc.buttons.values()].reduce((sum, count) => sum + count, 0);
      totalLinkClicks += [...doc.links.values()].reduce((sum, count) => sum + count, 0);
      overallDuration += (doc.sessionEnd ? doc.sessionEnd : new Date()) - doc.sessionStart;
    });

    const csvFields = ['URL', 'Timestamp', 'Pageviews', 'Buttons Clicked', 'Links Clicked', 'Session Duration (seconds)'];
    const csvData = trackingData.map(doc => ({
      URL: doc.url,
      Timestamp: new Date(doc.timestamp).toLocaleString(),
      Pageviews: doc.pageviews.length ? doc.pageviews.join(', ') : 'No pageviews',
      'Buttons Clicked': JSON.stringify([...doc.buttons.entries()]),
      'Links Clicked': JSON.stringify([...doc.links.entries()]),
      'Session Duration (seconds)': Math.floor(((doc.sessionEnd ? doc.sessionEnd : new Date()) - doc.sessionStart) / 1000)
    }));

    const json2csvParser = new Parser({ fields: csvFields });
    const csv = json2csvParser.parse(csvData);

    const filePath = `./daily_tracking_${domain}.csv`;
    fs.writeFileSync(filePath, csv);

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Daily Tracking Data for ${domain}`,
      text: `Tracking data for ${domain} (Last 24 Hours):\n\nTotal Unique Users: ${userCount}\nTotal Ad Blocker Users: ${adBlockerUsers}\nTotal Pageviews: ${totalPageviews}\nTotal Button Clicks: ${totalButtonClicks}\nTotal Link Clicks: ${totalLinkClicks}\nOverall Duration for All Users: ${Math.floor(overallDuration / 1000)} seconds\n`,
      attachments: [{ filename: `daily_tracking_${domain}.csv`, path: filePath }]
    };

    await transporter.sendMail(mailOptions);
    console.log(`Daily tracking data with CSV attachment sent to ${email}`);
    fs.unlinkSync(filePath);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

// Send daily tracking data to all registered clients
async function sendDailyTrackingDataToAllClients() {
  try {
    const registrations = await Registration.find({});
    for (const { domain, email } of registrations) {
      await sendTrackingDataToClient(domain, email);
    }
  } catch (error) {
    console.error('Error sending daily tracking data to clients:', error);
  }
}

// Schedule daily email at 9 AM Indian Time
cron.schedule('0 3 * * *', async () => {
  console.log('Sending daily tracking data...');
  await sendDailyTrackingDataToAllClients();
}, {
  timezone: 'Asia/Kolkata'
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

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
