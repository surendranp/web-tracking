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
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error('MongoDB URI is not set.');
  process.exit(1);
}
console.log('MongoDB URI:', mongoUri);

// MongoDB Connection
mongoose.connect(mongoUri)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Dynamically create and use collections based on domain names
const getCollection = (domain) => {
  const sanitizedDomain = domain.replace(/[.\$]/g, '_'); // Sanitize domain for MongoDB collection name
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
  return mongoose.model(sanitizedDomain, trackingSchema);
};

// Route to handle tracking data
app.post('/api/track', async (req, res) => {
  try {
    const { domain, type, buttonName, linkName, url, ip, sessionId } = req.body;

    if (!domain || !type || !url || !ip || !sessionId) {
      return res.status(400).send('Missing required fields');
    }

    const Tracking = getCollection(domain);

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
      const sanitizedButtonName = buttonName.replace(/[.\$]/g, '_');
      trackingData.buttons.set(sanitizedButtonName, (trackingData.buttons.get(sanitizedButtonName) || 0) + 1);
    }

    // Track link clicks
    if (type === 'link_click') {
      const sanitizedLinkName = linkName.replace(/[.\$]/g, '_');
      trackingData.links.set(sanitizedLinkName, (trackingData.links.get(sanitizedLinkName) || 0) + 1);
    }

    // Save updated tracking data
    await trackingData.save();

    res.status(200).send('Data received');
  } catch (error) {
    console.error('Error saving tracking data:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

// Serve the dashboard page
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

app.listen(port, () => console.log(`Server running on port ${port}`));
