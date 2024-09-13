const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Schema for storing domain and email
const clientSchema = new mongoose.Schema({
  domain: { type: String, required: true },
  email: { type: String, required: true }
});

const Client = mongoose.model('Client', clientSchema);

// POST route to register domain and email
router.post('/', async (req, res) => {
  try {
    const { domain, email } = req.body;

    if (!domain || !email) {
      console.error('Error: Missing required fields');
      return res.status(400).send('Missing required fields');
    }

    const existingClient = await Client.findOne({ domain });
    if (existingClient) {
      // Update existing client with new email
      existingClient.email = email;
      await existingClient.save();
    } else {
      // Create new client entry
      const newClient = new Client({ domain, email });
      await newClient.save();
    }

    res.status(200).send('Domain and email registered successfully');
  } catch (error) {
    console.error('Error registering domain:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
