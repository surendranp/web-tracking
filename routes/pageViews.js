const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// Sanitize keys for safe storage in MongoDB
function sanitizeKey(key) {
  return key.replace(/[.\$]/g, '_');
}

// Define the schema for tracking data
const trackingSchema = new mongoose.Schema({
  type: { type: String, required: true },
  url: { type: String, required: true },
  buttons: { type: Map, of: Number, default: {} },
  links: { type: Map, of: Number, default: {} },
  pageviews: [String],
  timestamp: { type: Date, default: Date.now },
  ip: { type: String, default: '' },
  sessionId: { type: String, default: '' },
  duration: Number,
});

// Handle POST requests for tracking data
router.post('/', async (req, res) => {
  try {
    const { type, buttonName, linkName, url, ip, sessionId, domain } = req.body;

    // Check for required fields
    if (!type || !url || !domain) {
      console.error('Error: Missing required fields');
      console.error('Received data:', req.body);
      return res.status(400).send('Missing required fields');
    }

    // Create a dynamic collection name based on the domain
    const collectionName = sanitizeKey(domain);

    // Check if model is already defined
    let Tracking;
    if (mongoose.models[collectionName]) {
      Tracking = mongoose.models[collectionName];
    } else {
      Tracking = mongoose.model(collectionName, trackingSchema, collectionName);
    }

    // Find or create tracking data document
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

    // Update tracking data
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
    console.error('Error saving tracking data:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
