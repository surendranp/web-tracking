const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Define the schema for tracking data
const trackingSchema = new mongoose.Schema({
  type: String,
  url: String,
  element: String,
  timestamp: Date
});

// Create a model for tracking data
const Tracking = mongoose.model('Tracking', trackingSchema);

// POST route to collect tracking data
router.post('/', async (req, res) => {
  try {
    const trackingData = new Tracking(req.body);
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
