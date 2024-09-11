const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Define schema for tracking data
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

// Function to get tracking model for the current domain-based collection
function getTrackingModel(dbConnection, collectionName) {
  return dbConnection.model('Tracking', trackingSchema, collectionName); // Use the provided collection name
}

// POST route to collect tracking data
router.post('/', async (req, res) => {
  try {
    const { type, buttonName, linkName, url, ip, sessionId } = req.body;

    if (!type || !url || !ip || !sessionId) {
      return res.status(400).send('Missing required fields');
    }

    const Tracking = getTrackingModel(req.dbConnection, req.collectionName);

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
      const sanitizedButtonName = buttonName.replace(/[.\$]/g, '_');
      trackingData.buttons.set(sanitizedButtonName, (trackingData.buttons.get(sanitizedButtonName) || 0) + 1);
    }

    // Track link clicks
    if (type === 'link_click') {
      const sanitizedLinkName = linkName.replace(/[.\$]/g, '_');
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
    const Tracking = getTrackingModel(req.dbConnection, req.collectionName);
    const data = await Tracking.find();
    res.json(data);
  } catch (error) {
    console.error('Error fetching tracking data:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
