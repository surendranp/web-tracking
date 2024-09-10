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
  sessionId: { type: String, index: true } // Ensure this field is indexed but not unique if not necessary
});

// Create a model for tracking data
const Tracking = mongoose.model('Tracking', trackingSchema);

// POST route to collect tracking data
router.post('/', async (req, res) => {
  try {
    const { type, buttonName, count, url, ip, navLinkName, sessionId } = req.body;

    const updateData = { $inc: { count: count }, timestamp: new Date() };

    if (type === 'button_click') {
      await Tracking.findOneAndUpdate(
        { buttonName, url, ip, sessionId },
        updateData,
        { new: true, upsert: true }
      );
    } else if (type === 'navlink_click') {
      await Tracking.findOneAndUpdate(
        { navLinkName, url, ip, sessionId },
        updateData,
        { new: true, upsert: true }
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
