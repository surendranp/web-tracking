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
  elements: { type: Map, of: Number, default: {} },
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
  const { domain, url, type, sessionId, buttonName, linkName, elementName, elementTag, adBlockerActive } = req.body;

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
      // 🔴 NEW: Track clicks on any element (div, img, span, etc.)
      else if (type === 'element_click') {
        const sanitizedElementName = elementName ? elementName.replace(/[.\$]/g, '_') : elementTag || 'Unnamed Element';
        existingTrackingData.elements.set(sanitizedElementName, (existingTrackingData.elements.get(sanitizedElementName) || 0) + 1);
      }

      existingTrackingData.sessionEnd = new Date();  // Update session end time
      existingTrackingData.adBlockerActive = adBlockerActive;  // Update ad blocker status

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
        buttons: type === 'button_click' ? { [buttonName]: 1 } : {},
        links: type === 'link_click' ? { [linkName]: 1 } : {},
        elements: type === 'element_click' ? { [elementName]: 1 } : {}, // 🔴 NEW: Store element click
        sessionStart: new Date(),  // Start a new session
        country: geoLocationData.country,
        city: geoLocationData.city,
        adBlockerActive  // Save ad blocker status
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
    const adBlockerUsers = trackingData.filter(doc => doc.adBlockerActive).length;

    let totalPageviews = 0;
    let totalButtonClicks = 0;
    let totalLinkClicks = 0;
    let totalElementClicks = 0; // 🔴 NEW: Track total element clicks
    let overallDuration = 0;  // To store the total duration of all users

    trackingData.forEach(doc => {
      totalPageviews += doc.pageviews.length;

      const buttonClicks = doc.buttons instanceof Map ? doc.buttons : new Map(Object.entries(doc.buttons));
      totalButtonClicks += [...buttonClicks.values()].reduce((sum, count) => sum + count, 0);

      const linkClicks = doc.links instanceof Map ? doc.links : new Map(Object.entries(doc.links));
      totalLinkClicks += [...linkClicks.values()].reduce((sum, count) => sum + count, 0);

      const elementClicks = doc.elements instanceof Map ? doc.elements : new Map(Object.entries(doc.elements)); // 🔴 NEW
      totalElementClicks += [...elementClicks.values()].reduce((sum, count) => sum + count, 0); // 🔴 NEW

      // Calculate the session duration (if sessionEnd is null, use current time)
      const sessionDuration = ((doc.sessionEnd ? doc.sessionEnd : new Date()) - doc.sessionStart);
      overallDuration += sessionDuration;
    });

    // Convert overallDuration from milliseconds to hours, minutes, and seconds
    const totalDurationInSeconds = Math.floor(overallDuration / 1000);
    const hours = Math.floor(totalDurationInSeconds / 3600);
    const minutes = Math.floor((totalDurationInSeconds % 3600) / 60);
    const seconds = totalDurationInSeconds % 60;

    // Prepare data for CSV
    const csvFields = [
      'URL', 'Timestamp', 'Pageviews', 
      'Buttons Clicked', 'Links Clicked', 'Elements Clicked', // 🔴 NEW: Elements Clicked
      'Session Duration (seconds)', 'Session Duration (H:M:S)', 
      'Country', 'City'
    ];
    
    const csvData = trackingData.map(doc => {
      const buttonClicks = doc.buttons instanceof Map ? doc.buttons : new Map(Object.entries(doc.buttons));
      const linkClicks = doc.links instanceof Map ? doc.links : new Map(Object.entries(doc.links));
      const elementClicks = doc.elements instanceof Map ? doc.elements : new Map(Object.entries(doc.elements)); // 🔴 NEW

      // Calculate the session duration
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
        'Elements Clicked': Object.keys(Object.fromEntries(elementClicks)).length ? JSON.stringify(Object.fromEntries(elementClicks)) : 'No element clicks', // 🔴 NEW
        'Session Duration (seconds)': sessionDurationInSeconds,
        'Session Duration (H:M:S)': `${hours}h ${minutes}m ${seconds}s`,  // Formatted session duration
        Country: doc.country || 'Unknown',
        City: doc.city || 'Unknown'
      };
    });

    // Add the overall total duration (for all users) to the CSV
    csvData.push({
      URL: 'Total Duration for All Users',
      Timestamp: '',
      Pageviews: '',
      'Buttons Clicked': '',
      'Links Clicked': '',
      'Elements Clicked': '',
      'Session Duration (seconds)': `${hours} hours, ${minutes} minutes, ${seconds} seconds`
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
    dataText += `Total Ad Blocker Users: ${adBlockerUsers}\n`;
    dataText += `Total Pageviews: ${totalPageviews}\n`;
    dataText += `Total Button Clicks: ${totalButtonClicks}\n`;
    dataText += `Total Link Clicks: ${totalLinkClicks}\n`;
    dataText += `Total Element Clicks: ${totalElementClicks}\n`; // 🔴 NEW
    dataText += `Overall Duration for All Users: ${hours} hours, ${minutes} minutes, and ${seconds} seconds\n\n`;

    trackingData.forEach(doc => {
      const buttonClicks = doc.buttons instanceof Map ? doc.buttons : new Map(Object.entries(doc.buttons));
      const linksObject = doc.links instanceof Map ? doc.links : new Map(Object.entries(doc.links));
      const elementsObject = doc.elements instanceof Map ? doc.elements : new Map(Object.entries(doc.elements)); // 🔴 NEW

      dataText += `URL: ${doc.url}\n`;
      dataText += `Timestamp: ${new Date(doc.timestamp).toLocaleString()}\n`;
      dataText += `Pageviews: ${doc.pageviews.length ? doc.pageviews.join(', ') : 'No pageviews'}\n`;
      dataText += `Buttons Clicked: ${Object.keys(Object.fromEntries(buttonClicks)).length ? JSON.stringify(Object.fromEntries(buttonClicks)) : 'No button clicks'}\n`;
      dataText += `Links Clicked: ${Object.keys(Object.fromEntries(linksObject)).length ? JSON.stringify(Object.fromEntries(linksObject)) : 'No link clicks'}\n`;
      dataText += `Elements Clicked: ${Object.keys(Object.fromEntries(elementsObject)).length ? JSON.stringify(Object.fromEntries(elementsObject)) : 'No element clicks'}\n\n`; // 🔴 NEW
    });

    // Email options with attachment
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Daily Tracking Data for ${domain}`,
      text: dataText || 'No tracking data available.',
      attachments: [{ filename: `daily_tracking_${domain}.csv`, path: filePath }]
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

app.get('/api/clients', async (req, res) => {
  try {
    const clients = await Registration.find({}, 'domain'); // Fetch all registered clients (only domain names)
    res.status(200).json(clients);
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).send('Internal Server Error');
  }
});
app.get('/api/client-data/:domain', async (req, res) => {
  const { domain } = req.params;
  try {
    const collectionName = sanitizeDomain(domain);
    let Tracking = mongoose.models[collectionName];

    if (!Tracking) {
      Tracking = mongoose.model(collectionName, TrackingSchema, collectionName);
    }

    const trackingData = await Tracking.find({}).lean(); // Fetch all tracking data
    res.status(200).json(trackingData);
  } catch (error) {
    console.error(`Error fetching data for ${domain}:`, error);
    res.status(500).send('Internal Server Error');
  }
});

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
  console.log(`Server is running on port http://localhost:${port}`);
});
