const express = require('express');
const router = express.Router();
const Tracking = require('../public/tracking'); // Adjust the path to your model

// POST route to collect tracking data
router.post('/', async (req, res) => {
  try {
    const { type, buttonName, navLinkName, url, ip, sessionId } = req.body;

    // Prepare update object
    const update = {};
    if (type === 'button_click' && buttonName) {
      update[`buttonClicks.${buttonName}`] = (update[`buttonClicks.${buttonName}`] || 0) + 1;
    } else if (type === 'navlink_click' && navLinkName) {
      update[`navLinkClicks.${navLinkName}`] = (update[`navLinkClicks.${navLinkName}`] || 0) + 1;
    }

    // Find or create the document
    const result = await Tracking.findOneAndUpdate(
      { ip, sessionId, url },
      { $inc: update, $set: { timestamp: new Date() } },
      { new: true, upsert: true }
    );

    console.log('Data updated:', result);
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
