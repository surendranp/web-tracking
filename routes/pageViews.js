const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Define the schema for tracking data
const trackingSchema = new mongoose.Schema({
  ip: { type: String, required: true, unique: true },
  duration: { type: Number, default: 0 }, // Track total time spent
  type: String,
  url: String,
  navLinks: {
    type: Map,
    of: Number // Store navLinkName as key and count as value
  },
  buttons: {
    type: Map,
    of: Number // Store buttonName as key and count as value
  },
  timestamp: { type: Date, default: Date.now }
});

// Create a model for tracking data
const Tracking = mongoose.model('Tracking', trackingSchema);

// POST route to collect tracking data
router.post('/', async (req, res) => {
  try {
    const { type, buttonName, url, ip, navLinkName, duration } = req.body;

    // Find or create the tracking document by IP
    const tracking = await Tracking.findOneAndUpdate(
      { ip: ip },
      {
        $setOnInsert: { ip: ip, type: type, url: url, duration: duration },
        $set: { timestamp: new Date() }
      },
      { new: true, upsert: true }
    );

    if (type === 'button_click' && buttonName) {
      tracking.buttons.set(buttonName, (tracking.buttons.get(buttonName) || 0) + 1);
    }

    if (type === 'navlink_click' && navLinkName) {
      tracking.navLinks.set(navLinkName, (tracking.navLinks.get(navLinkName) || 0) + 1);
    }

    await tracking.save();
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
