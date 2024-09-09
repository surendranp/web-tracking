const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Define the schema for tracking data
const trackingSchema = new mongoose.Schema({
  type: { type: String, required: true },
  url: { type: String, required: true },
  buttonClicks: { type: Map, of: Number, default: {} },
  navLinkClicks: { type: Map, of: Number, default: {} },
  timestamp: { type: Date, default: Date.now },
  ip: { type: String, required: true },
  sessionId: String,
  duration: Number,
});

// Create a model for tracking data
const Tracking = mongoose.model('Tracking', trackingSchema);

// Function to sanitize keys
function sanitizeKey(key) {
  return key.replace(/[.\$]/g, '_');
}

// POST route to collect tracking data
router.post('/', async (req, res) => {
  try {
    const { type, buttonName, navLinkName, url, ip, sessionId } = req.body;

    // Ensure valid data
    if (!type || !url || !ip || !sessionId) {
      return res.status(400).send('Missing required fields');
    }

    // Sanitize keys
    const sanitizedButtonName = sanitizeKey(buttonName || '');
    const sanitizedNavLinkName = sanitizeKey(navLinkName || '');

    // Find the document by IP and sessionId
    let trackingData = await Tracking.findOne({ ip, sessionId });

    if (!trackingData) {
      // If no document exists, create a new one
      trackingData = new Tracking({
        type,
        url,
        ip,
        sessionId,
      });
    }

    if (type === 'button_click') {
      trackingData.buttonClicks.set(sanitizedButtonName, (trackingData.buttonClicks.get(sanitizedButtonName) || 0) + 1);
    } else if (type === 'navlink_click') {
      trackingData.navLinkClicks.set(sanitizedNavLinkName, (trackingData.navLinkClicks.get(sanitizedNavLinkName) || 0) + 1);
    } else if (type === 'pageview') {
      trackingData.url = url;
    }

    // Save the updated tracking data
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
    const data = await Tracking.find();
    res.json(data);
  } catch (error) {
    console.error('Error fetching tracking data:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
