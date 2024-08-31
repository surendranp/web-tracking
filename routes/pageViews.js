const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Define the schema for tracking data
const trackingSchema = new mongoose.Schema({
  type: String,
  url: String,
  referrer: String,
  timestamp: Date,
  userAgent: String,
  cookies: String,
  sessionId: String,
  ipAddress: String
});

// Create a model for tracking data
const Tracking = mongoose.model('Tracking', trackingSchema);

// POST route to collect tracking data
router.post('/', async (req, res) => {
  try {
    // Get IP address from request headers
    const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    const trackingData = new Tracking({
      ...req.body,
      ipAddress: ipAddress
    });

    await trackingData.save();
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
