const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Define registration schema and model
const registrationSchema = new mongoose.Schema({
  domain: { type: String, required: true },
  email: { type: String, required: true }
});

const Registration = mongoose.model('Registration', registrationSchema);

// POST route to handle registration
router.post('/', async (req, res) => {
  try {
    const { domain, email } = req.body;

    if (!domain || !email) {
      return res.status(400).send('Domain and email are required');
    }

    const newRegistration = new Registration({ domain, email });
    await newRegistration.save();

    res.status(200).send('Registration successful');
  } catch (error) {
    console.error('Error during registration:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
