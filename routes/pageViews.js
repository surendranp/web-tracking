const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Define schema for tracking data
const pageViewSchema = new mongoose.Schema({
  type: String,
  url: String,
  buttonName: String,
  linkName: String,
  ip: String,
  sessionId: String,
  timestamp: Date
});

router.post('/', async (req, res) => {
  const { type, url, buttonName, linkName, ip, sessionId, timestamp } = req.body;

  // Use the domain-based connection
  const TrackingModel = mongoose.connection.model('Tracking', pageViewSchema);

  try {
    const trackingData = new TrackingModel({
      type,
      url,
      buttonName,
      linkName,
      ip,
      sessionId,
      timestamp
    });
    await trackingData.save();
    res.status(200).send('Tracking data saved successfully');
  } catch (error) {
    console.error('Error saving tracking data:', error.message);
    res.status(500).send('Error saving tracking data');
  }
});

module.exports = router;
