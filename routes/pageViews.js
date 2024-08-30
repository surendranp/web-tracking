// routes/pageViews.js
const express = require('express');
const router = express.Router();
const PageView = require('../models/PageView');

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

module.exports = router;
