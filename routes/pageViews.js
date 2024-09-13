const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Sanitize keys for safe storage in MongoDB
function sanitizeKey(key) {
  return key.replace(/[.\$]/g, '_');
}

// POST route to collect tracking data
router.post('/', async (req, res) => {
  try {
    const { type, buttonName, linkName, url, ip, sessionId, domain } = req.body;

    if (!type || !url || !ip || !sessionId || !domain) {
      console.error('Error: Missing required fields');
      return res.status(400).send('Missing required fields');
    }

    // Create a dynamic collection name based on the domain
    const collectionName = sanitizeKey(domain); // Sanitize the domain name
    const trackingSchema = new mongoose.Schema({
      type: { type: String, required: true },
      url: { type: String, required: true },
      buttons: { type: Map, of: Number, default: {} },  // Store button click counts
      links: { type: Map, of: Number, default: {} },    // Store link click counts
      pageviews: [String],                              // Track navigation flow
      timestamp: { type: Date, default: Date.now },
      ip: { type: String, required: true },
      sessionId: String,
      duration: Number,
    });

    let Tracking;

    try {
      Tracking = mongoose.model(collectionName);
    } catch (error) {
      Tracking = mongoose.model(collectionName, trackingSchema); // Define model only if it does not already exist
    }

    // Find the document by IP and sessionId
    let trackingData = await Tracking.findOne({ ip, sessionId });

    if (!trackingData) {
      // Create a new document if none exists
      trackingData = new Tracking({
        type,
        url,
        ip,
        sessionId,
        pageviews: [url] // Track the first pageview
      });
    }

    // Update pageviews for navigation flow
    if (type === 'pageview') {
      if (!trackingData.pageviews.includes(url)) {
        trackingData.pageviews.push(url);
      }
    }

    // Track button clicks
    if (type === 'button_click') {
      const sanitizedButtonName = sanitizeKey(buttonName || '');
      trackingData.buttons.set(sanitizedButtonName, (trackingData.buttons.get(sanitizedButtonName) || 0) + 1);
    }

    // Track link clicks
    if (type === 'link_click') {
      const sanitizedLinkName = sanitizeKey(linkName || '');
      trackingData.links.set(sanitizedLinkName, (trackingData.links.get(sanitizedLinkName) || 0) + 1);
    }

    // Save updated tracking data
    await trackingData.save();

    // Send tracking data to the client
    const Registration = mongoose.model('Registration');
    const registration = await Registration.findOne({ domain });

    if (registration) {
      const email = registration.email;
      await sendTrackingDataToClient(domain, email);
    }

    res.status(200).send('Data received');
  } catch (error) {
    console.error('Error saving tracking data:', error.message, error);
    res.status(500).send('Internal Server Error');
  }
});

// Function to send tracking data to the client via email
async function sendTrackingDataToClient(domain, email) {
  const collectionName = domain.replace(/[.\$]/g, '_'); // Sanitize domain name

  // Define or get the model for tracking data
  const trackingSchema = new mongoose.Schema({
    url: String,
    type: String,
    ip: String,
    sessionId: String,
    timestamp: Date,
    buttons: Object,
    links: Object
  });

  const Tracking = mongoose.model(collectionName, trackingSchema, collectionName);

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  try {
    // Retrieve all tracking data for the domain
    const trackingData = await Tracking.find().lean(); // Use lean for better performance

    if (!trackingData.length) {
      console.log(`No tracking data available for ${domain}`);
      return;
    }

    // Format tracking data for email
    let dataText = `Tracking data for ${domain}:\n\n`;
    trackingData.forEach(doc => {
      dataText += `URL: ${doc.url}\n`;
      dataText += `Type: ${doc.type}\n`;
      dataText += `IP: ${doc.ip}\n`;
      dataText += `Session ID: ${doc.sessionId}\n`;
      dataText += `Timestamp: ${new Date(doc.timestamp).toLocaleString()}\n`;
      dataText += `Buttons Clicked: ${JSON.stringify(doc.buttons)}\n`;
      dataText += `Links Clicked: ${JSON.stringify(doc.links)}\n\n`;
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Tracking Data for ${domain}`,
      text: dataText || 'No tracking data available.'
    };

    await transporter.sendMail(mailOptions);
    console.log(`Tracking data sent to ${email}`);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

module.exports = router;
