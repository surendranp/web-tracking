const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Define the schema for tracking data
const trackingSchema = new mongoose.Schema({
  type: { type: String, required: true },
  url: { type: String, required: true },
  buttonName: String,
  navLinkName: String,
  count: { type: Number, default: 0 },
  timestamp: { type: Date, default: Date.now },
  ip: String,
  sessionId: String // Ensure this field is not unique if not necessary
});

// Create a model for tracking data
const Tracking = mongoose.model('Tracking', trackingSchema);

// POST route to collect tracking data
router.post('/', async (req, res) => {
  try {
    const { type, buttonName, count, url, ip, navLinkName, sessionId } = req.body;

    if (type === 'button_click') {
      await Tracking.findOneAndUpdate(
        { buttonName: buttonName, url: url, ip: ip, sessionId: sessionId },
        { $inc: { count: count }, timestamp: new Date() },
        { new: true, upsert: true } // Create new if not exists
      );
    } else if (type === 'navlink_click') {
      await Tracking.findOneAndUpdate(
        { navLinkName: navLinkName, url: url, ip: ip, sessionId: sessionId },
        { $inc: { count: count }, timestamp: new Date() },
        { new: true, upsert: true } // Create new if not exists
      );
    } else {
      // For other types of data (like pageview)
      const trackingData = new Tracking({ type, buttonName, count, url, timestamp: new Date(), ip, navLinkName, sessionId });
      await trackingData.save();
    }
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
