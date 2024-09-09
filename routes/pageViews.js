const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Define the schema for tracking data
const trackingSchema = new mongoose.Schema({
  type: { type: String, required: true },
  url: { type: String, required: true },
  buttonClicks: { type: Map, of: Number, default: {} },
  navLinkClicks: { type: Map, of: Number, default: {} },
  timestamp: { type: Date, default: Date.now },
  ip: { type: String, required: true },
  sessionId: String,
  duration: Number,
});

// Create a model for tracking data
const Tracking = mongoose.model('Tracking', trackingSchema);

// POST route to collect tracking data
router.post('/', async (req, res) => {
  try {
    const { type, buttonName, navLinkName, url, ip, sessionId } = req.body;

    if (!type || !url || !ip || !sessionId) {
      return res.status(400).send('Missing required fields');
    }

    let trackingData = await Tracking.findOne({ ip, sessionId });

    if (!trackingData) {
      trackingData = new Tracking({ type, url, ip, sessionId });
    }

    if (type === 'button_click') {
      trackingData.buttonClicks.set(buttonName, (trackingData.buttonClicks.get(buttonName) || 0) + 1);
    } else if (type === 'navlink_click') {
      trackingData.navLinkClicks.set(navLinkName, (trackingData.navLinkClicks.get(navLinkName) || 0) + 1);
    } else if (type === 'pageview') {
      trackingData.url = url;
    }

    await trackingData.save();

    res.status(200).send('Data received');
  } catch (error) {
    console.error('Error saving tracking data:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

// GET route to retrieve tracking data with pagination and filtering
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const typeFilter = req.query.type || '';

    const query = typeFilter ? { type: typeFilter } : {};
    const totalItems = await Tracking.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limit);

    const data = await Tracking.find(query)
      .skip((page - 1) * limit)
      .limit(limit);

    // Prepare data for chart
    const chartData = {
      labels: [],
      values: []
    };

    // Prepare data for displaying
    const displayData = data.map(item => ({
      type: item.type,
      url: item.url,
      timestamp: item.timestamp,
      buttonClicks: item.buttonClicks ? Array.from(item.buttonClicks.entries()) : [],
      navLinkClicks: item.navLinkClicks ? Array.from(item.navLinkClicks.entries()) : []
    }));

    displayData.forEach(item => {
      if (item.type === 'button_click') {
        item.buttonClicks.forEach(([buttonName, count]) => {
          chartData.labels.push(buttonName);
          chartData.values.push(count);
        });
      } else if (item.type === 'navlink_click') {
        item.navLinkClicks.forEach(([navLinkName, count]) => {
          chartData.labels.push(navLinkName);
          chartData.values.push(count);
        });
      }
    });

    res.json({
      items: displayData,
      page,
      totalPages,
      chartData
    });
  } catch (error) {
    console.error('Error fetching tracking data:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
