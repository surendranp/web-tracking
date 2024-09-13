const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Sanitize keys for safe storage in MongoDB
function sanitizeKey(key) {
  return key.replace(/[.\$]/g, '_');
}

// POST route to collect tracking data
router.post('/', async (req, res) => {
  try {
    const { type, buttonName, linkName, url, ip, sessionId, domain } = req.body;

    if (!type || !url || !ip || !sessionId || !domain) {
      console.error('Error: Missing required fields');
      return res.status(400).send('Missing required fields');
    }

    // Create a dynamic collection name based on the domain
    const collectionName = sanitizeKey(domain); // Sanitize the domain name
    const trackingSchema = new mongoose.Schema({
      type: { type: String, required: true },
      url: { type: String, required: true },
      buttons: { type: Map, of: Number, default: {} },  // Store button click counts
      links: { type: Map, of: Number, default: {} },    // Store link click counts
      pageviews: [String],                              // Track navigation flow
      timestamp: { type: Date, default: Date.now },
      ip: { type: String, required: true },
      sessionId: String,
      duration: Number,
    });

    let Tracking;

    try {
      Tracking = mongoose.model(collectionName);
    } catch (error) {
      Tracking = mongoose.model(collectionName, trackingSchema); // Define model only if it does not already exist
    }

    // Find the document by IP and sessionId
    let trackingData = await Tracking.findOne({ ip, sessionId });

    if (!trackingData) {
      // Create a new document if none exists
      trackingData = new Tracking({
        type,
        url,
        ip,
        sessionId,
        pageviews: [url] // Track the first pageview
      });
    }

    // Update pageviews for navigation flow
    if (type === 'pageview') {
      if (!trackingData.pageviews.includes(url)) {
        trackingData.pageviews.push(url);
      }
    }

    // Track button clicks
    if (type === 'button_click') {
      const sanitizedButtonName = sanitizeKey(buttonName || '');
      trackingData.buttons.set(sanitizedButtonName, (trackingData.buttons.get(sanitizedButtonName) || 0) + 1);
    }

    // Track link clicks
    if (type === 'link_click') {
      const sanitizedLinkName = sanitizeKey(linkName || '');
      trackingData.links.set(sanitizedLinkName, (trackingData.links.get(sanitizedLinkName) || 0) + 1);
    }

    // Save updated tracking data
    await trackingData.save();

    // Send tracking data to the client's email
    // You'll need to add email sending logic here

    res.status(200).send('Data received');
  } catch (error) {
    console.error('Error saving tracking data:', error.message, error);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
