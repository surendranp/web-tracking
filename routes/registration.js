const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

router.post('/', async (req, res) => {
  try {
    const { domain, email } = req.body;
    if (!domain || !email) {
      return res.status(400).send('Domain and email are required');
    }

    // Sanitize domain for collection name
    const sanitizedDomain = domain.replace(/[.\$]/g, '_');

    // Create a model for client registrations
    const clientSchema = new mongoose.Schema({
      domain: { type: String, required: true },
      email: { type: String, required: true }
    });

    const Client = mongoose.model('Client', clientSchema);

    // Check if domain is already registered
    const existingClient = await Client.findOne({ domain });
    if (existingClient) {
      return res.status(400).send('Domain is already registered');
    }

    // Save new client registration
    const newClient = new Client({ domain, email });
    await newClient.save();

    res.status(200).send('Registration successful');
  } catch (error) {
    console.error('Error registering domain:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
