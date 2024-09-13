const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const schedule = require('node-schedule');

// Sanitize keys for safe storage in MongoDB
function sanitizeKey(key) {
  return key.replace(/[.\$]/g, '_');
}

// Define schemas and models
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

const emailSchema = new mongoose.Schema({
  domain: { type: String, required: true },
  email: { type: String, required: true },
});

let Email;

// Function to get or create a Tracking model for the domain
async function getTrackingModel(domain) {
  const collectionName = sanitizeKey(domain);
  try {
    return mongoose.model(collectionName);
  } catch (error) {
    return mongoose.model(collectionName, trackingSchema);
  }
}

router.post('/', async (req, res) => {
  try {
    const { type, buttonName, linkName, url, ip, sessionId, domain } = req.body;

    if (!type || !url || !ip || !sessionId || !domain) {
      console.error('Error: Missing required fields');
      return res.status(400).send('Missing required fields');
    }

    const Tracking = await getTrackingModel(domain);

    let trackingData = await Tracking.findOne({ ip, sessionId });

    if (!trackingData) {
      trackingData = new Tracking({
        type,
        url,
        ip,
        sessionId,
        pageviews: [url]
      });
    }

    if (type === 'pageview') {
      if (!trackingData.pageviews.includes(url)) {
        trackingData.pageviews.push(url);
      }
    }

    if (type === 'button_click') {
      const sanitizedButtonName = sanitizeKey(buttonName || '');
      trackingData.buttons.set(sanitizedButtonName, (trackingData.buttons.get(sanitizedButtonName) || 0) + 1);
    }

    if (type === 'link_click') {
      const sanitizedLinkName = sanitizeKey(linkName || '');
      trackingData.links.set(sanitizedLinkName, (trackingData.links.get(sanitizedLinkName) || 0) + 1);
    }

    await trackingData.save();

    res.status(200).send('Data received');
  } catch (error) {
    console.error('Error saving tracking data:', error.message, error);
    res.status(500).send('Internal Server Error');
  }
});

// Function to send email
async function sendEmail(domain, data) {
  const emailDoc = await Email.findOne({ domain });

  if (!emailDoc) return;

  const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: emailDoc.email,
    subject: `Tracking Data for ${domain}`,
    text: JSON.stringify(data, null, 2)
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Tracking data sent to ${emailDoc.email}`);
  } catch (error) {
    console.error('Error sending email:', error.message, error);
  }
}

// Scheduled job to send tracking data every minute
schedule.scheduleJob('* * * * *', async () => {
  const domains = await Email.find().select('domain');

  for (const domainObj of domains) {
    const domain = domainObj.domain;
    const Tracking = await getTrackingModel(domain);
    
    const now = new Date();
    const startOfDay = new Date(now.setHours(0, 0, 0, 0));
    const endOfDay = new Date(now.setHours(23, 59, 59, 999));
    
    // Retrieve tracking data from today
    const data = await Tracking.find({
      timestamp: {
        $gte: startOfDay,
        $lt: endOfDay
      }
    });

    await sendEmail(domain, data);
  }
});

module.exports = router;
