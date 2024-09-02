// pageViews.js

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

// POST route to collect tracking data
router.post('/', async (req, res) => {
  try {
    const { type, buttonName, count, url, ip, navLinkName, sessionId, duration } = req.body;

    // Ensure count is a valid number
    const validCount = parseInt(count, 10) || 0;

    // Find the document by IP address
    let trackingData = await Tracking.findOne({ ip: ip });

    if (!trackingData) {
      // If no document exists, create a new one
      trackingData = new Tracking({
        type,
        url,
        ip,
        sessionId,
        duration,
      });
    }

    if (type === 'button_click') {
      // Update button click count
      trackingData.buttonClicks.set(buttonName, (trackingData.buttonClicks.get(buttonName) || 0) + validCount);
    } else if (type === 'navlink_click') {
      // Update navlink click count
      trackingData.navLinkClicks.set(navLinkName, (trackingData.navLinkClicks.get(navLinkName) || 0) + validCount);
    } else if (type === 'pageview') {
      // Update the URL if it's a pageview
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
