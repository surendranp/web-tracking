// routes/pageViews.js
const express = require('express');
const router = express.Router();
const PageView = require('../models/PageView');

// POST route to track pageviews
router.post('/track', async (req, res) => {
  const { url, referrer, userAgent, ipAddress } = req.body;

  const pageView = new PageView({ url, referrer, userAgent, ipAddress });

  try {
    await pageView.save();
    res.status(201).json(pageView);
  } catch (error) {
    res.status(500).json({ error: 'Error saving data' });
  }
});

// GET route to fetch pageviews
router.get('/data', async (req, res) => {
  try {
    const pageViews = await PageView.find().sort({ timestamp: -1 }).limit(100); // Adjust limit as needed
    res.status(200).json(pageViews);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching data' });
  }
});

module.exports = router;
