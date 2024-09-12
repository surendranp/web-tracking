const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Define schema for tracking data
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

// Create model
const createTrackingModel = (siteIdentifier) => {
  const schema = trackingSchema.clone();
  return mongoose.model(`Tracking_${siteIdentifier}`, schema, `tracking_${siteIdentifier}`);
};

// POST route to collect tracking data
router.post('/', async (req, res) => {
  try {
    const { type, buttonName, linkName, url, ip, sessionId, siteIdentifier } = req.body;

    if (!type || !url || !ip || !sessionId || !siteIdentifier) {
      return res.status(400).send('Missing required fields');
    }

    // Dynamically create or use existing model based on siteIdentifier
    const Tracking = createTrackingModel(siteIdentifier);

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

    res.status(200).send('Data received');
  } catch (error) {
    console.error('Error saving tracking data:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

// GET route to retrieve all tracking data
router.get('/', async (req, res) => {
  try {
    // You may want to query a specific database based on siteIdentifier
    const siteIdentifier = req.query.siteIdentifier;
    if (!siteIdentifier) {
      return res.status(400).send('Site identifier is required');
    }
    const Tracking = createTrackingModel(siteIdentifier);
    const data = await Tracking.find();
    res.json(data);
  } catch (error) {
    console.error('Error fetching tracking data:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
