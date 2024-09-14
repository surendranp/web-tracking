const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Sanitize keys for safe storage in MongoDB
function sanitizeKey(key) {
  return key.replace(/[.\$]/g, '_');
}

// Function to get or create a tracking model
function getOrCreateTrackingModel(collectionName) {
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

  return mongoose.model(collectionName, trackingSchema, collectionName);
}

// POST route to collect tracking data
router.post('/', async (req, res) => {
  try {
    const { type, buttonName, linkName, url, ip, sessionId, domain } = req.body;

    if (!type || !url || !ip || !sessionId || !domain) {
      console.error('Error: Missing required fields');
      console.error('Received data:', req.body); // Log the received data
      return res.status(400).send('Missing required fields');
    }

    const collectionName = sanitizeKey(domain); // Sanitize the domain name
    const Tracking = getOrCreateTrackingModel(collectionName);

    let trackingData = await Tracking.findOne({ ip, sessionId });

    if (!trackingData) {
      trackingData = new Tracking({
        type,
        url,
        ip,
        sessionId,
        pageviews: [url] // Track the first pageview
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

module.exports = router;
