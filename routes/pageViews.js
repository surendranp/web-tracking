const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Define the schema for each activity
const activitySchema = new mongoose.Schema({
  type: String,
  url: String,
  buttonName: { type: String, default: null },
  linkName: { type: String, default: null },
  count: { type: Number, default: 0 },
  timestamp: Date
});

// Define the schema for tracking data
const trackingSchema = new mongoose.Schema({
  sessionId: { type: String, unique: true },
  activities: [activitySchema], // Embed the activity schema
  sessionStart: Date,
  sessionEnd: Date
});

// Create a model for tracking data
const Tracking = mongoose.model('Tracking', trackingSchema);

// POST route to collect tracking data
router.post('/', async (req, res) => {
  try {
    const { type, sessionId, buttonName, linkName, count, url, timestamp } = req.body;

    if (type === 'session_end') {
      // End session and update session end time
      await Tracking.findOneAndUpdate(
        { sessionId: sessionId },
        { $set: { sessionEnd: timestamp } },
        { new: true }
      );
    } else {
      const activity = {
        type: type,
        url: url,
        buttonName: buttonName || null,
        linkName: linkName || null,
        count: count || null,
        timestamp: timestamp
      };

      const sessionExists = await Tracking.findOne({ sessionId: sessionId });

      if (sessionExists) {
        // Update existing session with new activity
        await Tracking.findOneAndUpdate(
          { sessionId: sessionId },
          { $push: { activities: activity } },
          { new: true }
        );
      } else {
        // Create a new session document
        await Tracking.create({
          sessionId: sessionId,
          activities: [activity],
          sessionStart: timestamp
        });
      }
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
