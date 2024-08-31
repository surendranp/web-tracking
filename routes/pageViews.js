const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Define the schema for tracking data
const trackingSchema = new mongoose.Schema({
  type: String,
  sessionId: String,
  url: String,
  buttonName: String,
  linkName: String,
  count: Number,
  timestamp: Date
});

// Create a model for tracking data
const Tracking = mongoose.model('Tracking', trackingSchema);

// POST route to collect tracking data
router.post('/', async (req, res) => {
  try {
    const { type, sessionId, buttonName, linkName, count, url } = req.body;

    if (type === 'button_click') {
      // Update the existing record if buttonName and URL match
      await Tracking.findOneAndUpdate(
        { sessionId: sessionId, buttonName: buttonName, url: url },
        { $inc: { count: count }, timestamp: new Date() },
        { new: true, upsert: true } // Create new if not exists
      );
    } else if (type === 'navbar_link_click') {
      // Track navbar link click events
      const trackingData = new Tracking(req.body);
      await trackingData.save();
    } else {
      // For other types of data (like pageview, session_end)
      const trackingData = new Tracking(req.body);
      await trackingData.save();
    }

    res.status(200).send('Data received');
  } catch (error) {
    console.error('Error saving tracking data:', error);
    res.status(500).send('Internal Server Error');
  }
});

// GET route to retrieve all tracking data
router.get('/', async (req, res) => {
  try {
    const data = await Tracking.find();
    res.json(data);
  } catch (error) {
    console.error('Error fetching tracking data:', error);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
