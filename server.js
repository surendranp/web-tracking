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
  city: String,// Added city
  adBlockerCount: { type: Number, default: 0 }      
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
// Ad blocker tracking endpoint
app.post('/api/adblocker', async (req, res) => {
  const { domain, adBlocker, sessionId } = req.body;

  if (!domain || !sessionId) {
    return res.status(400).send('Domain and Session ID are required.');
  }

  try {
    const collectionName = sanitizeDomain(domain);
    let Tracking = mongoose.models[collectionName];

    if (!Tracking) {
      Tracking = mongoose.model(collectionName, TrackingSchema, collectionName);
    }

    // Update or create the tracking document
    let existingTrackingData = await Tracking.findOne({ sessionId });

    if (existingTrackingData) {
      existingTrackingData.adBlockerCount = existingTrackingData.adBlockerCount || 0;
      if (adBlocker) {
        existingTrackingData.adBlockerCount += 1; // Increment if ad blocker is detected
      }
      await existingTrackingData.save();
    } else {
      // Create a new document if no existing one found
      const newTrackingData = new Tracking({
        sessionId,
        adBlockerCount: adBlocker ? 1 : 0
      });

      await newTrackingData.save();
    }

    res.status(200).send('Ad blocker status recorded successfully');
  } catch (error) {
    console.error('Error saving ad blocker status:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Tracking endpoint
app.post('/api/pageviews', async (req, res) => {
  const { domain, url, type, sessionId, buttonName, linkName } = req.body;

  // Handle IPs behind proxies
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const cleanedIp = ip.split(',')[0].trim(); // In case multiple IPs are returned

  if (!domain || !url || !cleanedIp || !sessionId) {
    return res.status(400).send('Domain, URL, IP, and Session ID are required.');
  }

  try {
    const collectionName = sanitizeDomain(domain);
    let Tracking = mongoose.models[collectionName];

    if (!Tracking) {
      Tracking = mongoose.model(collectionName, TrackingSchema, collectionName);
    }

    // Fetch geolocation data using ipapi or any other IP-based service
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

    // Check if a document with the same IP and sessionId exists
    let existingTrackingData = await Tracking.findOne({ ip: cleanedIp, sessionId });

    if (existingTrackingData) {
      // Merge the new data with the existing data
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
      existingTrackingData.sessionEnd = new Date();  // Update session end time

      // Save the merged data
      await existingTrackingData.save();
    } else {
      // Create a new tracking document if no existing one found
      const newTrackingData = new Tracking({
        url,
        type,
        ip: cleanedIp,
        sessionId,
        pageviews: type === 'pageview' ? [url] : [],
        sessionStart: new Date(),  // Start a new session
        country: geoLocationData.country,
        city: geoLocationData.city
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

    // Calculate unique users based on IP addresses
    const uniqueUsers = new Set(trackingData.map(doc => doc.ip));
    const userCount = uniqueUsers.size;

    // Calculate total ad blocker users
    const adBlockerUsers = trackingData.filter(doc => doc.adBlockerCount > 0).length;

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
    const csvFields = ['URL', 'Timestamp', 'Pageviews', 'Buttons Clicked', 'Links Clicked', 'Session Duration (seconds)'];
    const csvData = trackingData.map(doc => {
      const buttonClicks = doc.buttons instanceof Map ? doc.buttons : new Map(Object.entries(doc.buttons));
      const linkClicks = doc.links instanceof Map ? doc.links : new Map(Object.entries(doc.links));

      return {
        URL: doc.url,
        Timestamp: new Date(doc.timestamp).toLocaleString(),
        Pageviews: doc.pageviews.length ? doc.pageviews.join(', ') : 'No pageviews',
        'Buttons Clicked': Object.keys(Object.fromEntries(buttonClicks)).length ? JSON.stringify(Object.fromEntries(buttonClicks)) : 'No button clicks',
        'Links Clicked': Object.keys(Object.fromEntries(linkClicks)).length ? JSON.stringify(Object.fromEntries(linkClicks)) : 'No link clicks',
        'Session Duration (seconds)': Math.floor(((doc.sessionEnd ? doc.sessionEnd : new Date()) - doc.sessionStart) / 1000)
      };
    });

    // Convert JSON data to CSV
    const json2csvParser = new Parser({ fields: csvFields });
    const csv = json2csvParser.parse(csvData);

    // Write CSV to a file (temporary file location)
    const filePath = `./daily_tracking_${domain}.csv`;
    fs.writeFileSync(filePath, csv);

    // Email content
    let dataText = `Tracking data for ${domain} (Last 24 Hours):\n\n`;
    dataText += `Total Unique Users: ${userCount}\n`;
    dataText += `Total Ad Blocker Users: ${adBlockerUsers}\n`; // Add this line
    dataText += `Total Pageviews: ${totalPageviews}\n`;
    dataText += `Total Button Clicks: ${totalButtonClicks}\n`;
    dataText += `Total Link Clicks: ${totalLinkClicks}\n`;
    dataText += `Overall Duration for All Users: ${Math.floor(overallDuration / 1000)} seconds\n\n`;

    trackingData.forEach(doc => {
      const buttonClicks = doc.buttons instanceof Map ? doc.buttons : new Map(Object.entries(doc.buttons));
      const linksObject = doc.links instanceof Map ? doc.links : new Map(Object.entries(doc.links));

      dataText += `URL: ${doc.url}\n`;
      dataText += `Timestamp: ${new Date(doc.timestamp).toLocaleString()}\n`;
      dataText += `Pageviews: ${doc.pageviews.length ? doc.pageviews.join(', ') : 'No pageviews'}\n`;
      dataText += `Buttons Clicked: ${Object.keys(Object.fromEntries(buttonClicks)).length ? JSON.stringify(Object.fromEntries(buttonClicks)) : 'No button clicks'}\n`;
      dataText += `Links Clicked: ${Object.keys(Object.fromEntries(linksObject)).length ? JSON.stringify(Object.fromEntries(linksObject)) : 'No link clicks'}\n\n`;
    });

    // Email options with attachment
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Daily Tracking Data for ${domain}`,
      text: dataText || 'No tracking data available.',
      attachments: [
        {
          filename: `daily_tracking_${domain}.csv`,
          path: filePath
        }
      ]
    };

    // Send email
    await transporter.sendMail(mailOptions);
    console.log(`Daily tracking data with CSV attachment sent to ${email}`);

    // Clean up the CSV file after sending the email
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
