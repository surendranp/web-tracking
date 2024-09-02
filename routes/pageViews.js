const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Define the schema for tracking data
const trackingSchema = new mongoose.Schema({
  type: String,
  url: String,
  buttonName: String,
  count: Number,
  timestamp: Date,
  ip: String // Add IP address field
});

// Create a model for tracking data
const Tracking = mongoose.model('Tracking', trackingSchema);

// POST route to collect tracking data
router.post('/', async (req, res) => {
  try {
    const { type, buttonName, count, url, ip } = req.body;

    if (type === 'button_click') {
      // Update the existing record if buttonName and URL match
      const result = await Tracking.findOneAndUpdate(
        { buttonName: buttonName, url: url, ip: ip },
        { $inc: { count: count }, timestamp: new Date() },
        { new: true, upsert: true } // Create new if not exists
      );

      res.status(200).send('Data received');
    } else {
      // For other types of data (like pageview)
      const trackingData = new Tracking({ type, buttonName, count, url, timestamp: new Date(), ip });
      await trackingData.save();
      res.status(200).send('Data received');
    }
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
