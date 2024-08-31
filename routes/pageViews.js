const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Define the schema for tracking data
const activitySchema = new mongoose.Schema({
  type: String,
  url: String,
  buttonName: { type: String, default: null },
  linkName: { type: String, default: null },
  count: { type: Number, default: 0 },
  timestamp: Date
});

const trackingSchema = new mongoose.Schema({
  sessionId: String,
  activities: [activitySchema], // Use activitySchema to define the structure of each activity
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
        { $set: { sessionEnd: new Date(timestamp) } },
        { new: true }
      );
    } else {
      const activity = {
        type: type,
        url: url,
        buttonName: buttonName || null,
        linkName: linkName || null,
        count: count || 0,
        timestamp: new Date(timestamp)
      };

      if (type === 'button_click') {
        // Find and update or insert the activity
        await Tracking.findOneAndUpdate(
          { sessionId: sessionId, 'activities.buttonName': buttonName },
          { $inc: { 'activities.$.count': count } },
          { new: true, upsert: true }
        );
      } else {
        // Upsert (update or insert) the document for other activities
        await Tracking.findOneAndUpdate(
          { sessionId: sessionId },
          { 
            $setOnInsert: { sessionStart: new Date(timestamp) }, // Set session start if document is new
            $push: { activities: activity } 
          },
          { new: true, upsert: true }
        );
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
