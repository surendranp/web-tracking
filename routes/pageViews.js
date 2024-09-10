const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Define schema for tracking data
const trackingSchema = new mongoose.Schema({
  type: { type: String, required: true },
  url: { type: String, required: true },
  buttons: { type: Map, of: Number, default: {} },  // Store button click counts
  links: { type: Map, of: Number, default: {} },    // Store link click counts
  menus: { type: Map, of: Number, default: {} },    // Store menu/nav click counts
  pageviews: [String],                              // Track navigation flow
  timestamp: { type: Date, default: Date.now },
  ip: { type: String, required: true },
  sessionId: String,
  duration: Number,
});

// Create model
const Tracking = mongoose.model('Tracking', trackingSchema);

// Sanitize keys for safe storage in MongoDB
function sanitizeKey(key) {
  return key.replace(/[.\$]/g, '_');
}

// POST route to collect tracking data
router.post('/', async (req, res) => {
  try {
    const { type, buttonName, linkName, menuName, url, ip, sessionId } = req.body;

    if (!type || !url || !ip || !sessionId) {
      return res.status(400).send('Missing required fields');
    }

    // Find the document by IP and sessionId
    let trackingData = await Tracking.findOne({ ip, sessionId });

    if (!trackingData) {
      trackingData = new Tracking({
        url,
        ip,
        sessionId,
        pageviews: [url] // Track the first pageview
      });
    }

    if (type === 'pageview') {
      if (!trackingData.pageviews.includes(url)) {
        trackingData.pageviews.push(url);
      }
    } else if (type === 'button_click') {
      const sanitizedButtonName = sanitizeKey(buttonName || '');
      trackingData.buttons.set(sanitizedButtonName, (trackingData.buttons.get(sanitizedButtonName) || 0) + 1);
    } else if (type === 'link_click') {
      const sanitizedLinkName = sanitizeKey(linkName || '');
      trackingData.links.set(sanitizedLinkName, (trackingData.links.get(sanitizedLinkName) || 0) + 1);
    } else if (type === 'menu_click') {
      const sanitizedMenuName = sanitizeKey(menuName || '');
      trackingData.menus.set(sanitizedMenuName, (trackingData.menus.get(sanitizedMenuName) || 0) + 1);
    }

    // Save the updated tracking data
    await trackingData.save();

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
