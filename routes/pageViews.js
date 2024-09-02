const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Define the schema for tracking data
const trackingSchema = new mongoose.Schema({
  ip: { type: String, required: true },
  duration: Number,
  type: { type: String, required: true },
  url: { type: String, required: true },
  navLinkClicks: { type: Map, of: Number, default: {} },
  buttonClicks: { type: Map, of: Number, default: {} },
  timestamp: { type: Date, default: Date.now },
  sessionId: String
});

// Create a model for tracking data
const Tracking = mongoose.model('Tracking', trackingSchema);

// POST route to collect tracking data
router.post('/', async (req, res) => {
  try {
    const { type, buttonName, navLinkName, url, ip, sessionId } = req.body;

    // Initialize the update object
    const update = {};

    if (type === 'button_click' && buttonName) {
      // Construct the field to be updated in MongoDB
      update[`buttonClicks.${buttonName}`] = 1;
    } else if (type === 'navlink_click' && navLinkName) {
      // Construct the field to be updated in MongoDB
      update[`navLinkClicks.${navLinkName}`] = 1;
    }

    // Update the database, incrementing the click count and updating the timestamp
    await Tracking.findOneAndUpdate(
      { ip: ip, sessionId: sessionId, url: url },
      {
        $inc: update,
        $set: { timestamp: new Date() }
      },
      { new: true, upsert: true }
    );

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
