const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Define schema for client registration
const clientSchema = new mongoose.Schema({
  domain: { type: String, required: true, unique: true },
  email: { type: String, required: true }
});

const Client = mongoose.model('Client', clientSchema);

// POST route to register domain and email
router.post('/', async (req, res) => {
  try {
    const { domain, email } = req.body;

    if (!domain || !email) {
      return res.status(400).send('Domain and email are required');
    }

    const client = new Client({ domain, email });
    await client.save();

    res.status(200).send('Registration successful');
  } catch (error) {
    console.error('Error registering domain:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
