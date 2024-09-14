const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Utility function to sanitize domain for MongoDB collection names
function sanitizeDomain(domain) {
  return domain.replace(/[.\$\/:]/g, '_');
}

// Define schema once and use it across the application
const trackingSchema = new mongoose.Schema({
  type: { type: String, required: true },
  url: { type: String, required: true },
  buttons: { type: Map, of: Number, default: {} },
  links: { type: Map, of: Number, default: {} },
  pageviews: [String],
  timestamp: { type: Date, default: Date.now },
  ip: { type: String, required: true },
  sessionId: String,
  duration: Number,
});

// POST route to collect tracking data
router.post('/', async (req, res) => {
  try {
    const { type, buttonName, linkName, url, ip, sessionId, domain } = req.body;

    if (!type || !url || !ip || !sessionId || !domain) {
      console.error('Error: Missing required fields');
      return res.status(400).send('Missing required fields');
    }

    // Sanitize domain for consistency
    const sanitizedDomain = sanitizeDomain(domain);

    // Avoid recompiling the model if it already exists
    let TrackingModel;
    if (mongoose.models[sanitizedDomain]) {
      TrackingModel = mongoose.model(sanitizedDomain);
    } else {
      TrackingModel = mongoose.model(sanitizedDomain, trackingSchema, sanitizedDomain);
    }

    // Find or create a document for the current session and IP
    let trackingData = await TrackingModel.findOne({ ip, sessionId });

    if (!trackingData) {
      // Create new document if none exists
      trackingData = new TrackingModel({
        type,
        url,
        ip,
        sessionId,
        pageviews: [url]
      });
    }

    // Update data based on the event type
    if (type === 'pageview') {
      if (!trackingData.pageviews.includes(url)) {
        trackingData.pageviews.push(url);
      }
    } else if (type === 'button_click') {
      const sanitizedButtonName = buttonName ? buttonName.replace(/[.\$]/g, '_') : 'Unnamed Button';
      trackingData.buttons.set(sanitizedButtonName, (trackingData.buttons.get(sanitizedButtonName) || 0) + 1);
    } else if (type === 'link_click') {
      const sanitizedLinkName = linkName ? linkName.replace(/[.\$]/g, '_') : 'Unnamed Link';
      trackingData.links.set(sanitizedLinkName, (trackingData.links.get(sanitizedLinkName) || 0) + 1);
    }

    // Save updated tracking data
    await trackingData.save();

    res.status(200).send('Tracking data stored successfully');
  } catch (error) {
    console.error('Error saving tracking data:', error);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
