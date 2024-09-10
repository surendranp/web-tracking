const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// MongoDB URI
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error('MongoDB URI is not set.');
  process.exit(1);
}
console.log('MongoDB URI:', mongoUri);

// MongoDB Connection (no deprecated options)
mongoose.connect(mongoUri)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Define schema for tracking data
const trackingSchema = new mongoose.Schema({
  type: { type: String, required: true },
  url: { type: String, required: true },
  buttons: { type: Map, of: Number, default: {} },
  links: { type: Map, of: Number, default: {} },
  menus: { type: Map, of: Number, default: {} },  // Track clicks on nav-links and nav-tabs
  pageviews: [String],  // Store navigation flow (URLs)
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
app.post('/api/pageviews', async (req, res) => {
  try {
    const { type, buttonName, linkName, menuName, url, ip, sessionId } = req.body;

    if (!type || !url || !ip || !sessionId) {
      return res.status(400).send('Missing required fields');
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
        pageviews: [url]  // Track the first pageview
      });
    }

    // Track pageviews for navigation flow
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

    // Track link clicks in body
    if (type === 'link_click') {
      const sanitizedLinkName = sanitizeKey(linkName || '');
      trackingData.links.set(sanitizedLinkName, (trackingData.links.get(sanitizedLinkName) || 0) + 1);
    }

    // Track nav-link/menu clicks and store click counts in 'menus' object
    if (type === 'menu_click') {
      const sanitizedMenuName = sanitizeKey(menuName || '');
      trackingData.menus.set(sanitizedMenuName, (trackingData.menus.get(sanitizedMenuName) || 0) + 1);
    }

    // Save updated tracking data
    await trackingData.save();

    res.status(200).send('Data received');
  } catch (error) {
    console.error('Error saving tracking data:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

// GET route to retrieve all tracking data
app.get('/api/pageviews', async (req, res) => {
  try {
    const data = await Tracking.find();
    res.json(data);
  } catch (error) {
    console.error('Error fetching tracking data:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Serve the dashboard page
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

app.listen(port, () => console.log(`Server running on port ${port}`));
