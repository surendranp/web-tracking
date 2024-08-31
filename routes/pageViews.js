const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Define the schema for tracking data
const trackingSchema = new mongoose.Schema({
  sessionId: String,
  activities: [
    {
      type: String,
      url: String,
      buttonName: String,
      linkName: String,
      count: Number,
      timestamp: Date
    }
  ]
});

// Create a model for tracking data
const Tracking = mongoose.model('Tracking', trackingSchema);

// POST route to collect tracking data
router.post('/', async (req, res) => {
  try {
    const { type, sessionId, buttonName, linkName, count, url, timestamp } = req.body;

    // Create the activity object
    const activity = {
      type,
      url,
      timestamp: new Date(timestamp)
    };

    if (type === 'button_click') {
      activity.buttonName = buttonName;
      activity.count = count;
    } else if (type === 'navbar_click') {
      activity.linkName = linkName;
    }

    // Update the session document, or create a new one if it doesn't exist
    await Tracking.findOneAndUpdate(
      { sessionId: sessionId },
      { $push: { activities: activity } },
      { upsert: true, new: true }
    );

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
