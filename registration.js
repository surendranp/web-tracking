const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Define schema and model for registrations
const registrationSchema = new mongoose.Schema({
  domain: { type: String, required: true },
  email: { type: String, required: true }
});

const Registration = mongoose.model('Registration', registrationSchema);

// POST route to register domain and email
router.post('/', async (req, res) => {
  try {
    const { domain, email } = req.body;

    if (!domain || !email) {
      return res.status(400).send('Domain and email are required');
    }

    // Check if the domain already exists
    const existingRegistration = await Registration.findOne({ domain });
    if (existingRegistration) {
      return res.status(400).send('Domain is already registered');
    }

    // Save the registration
    const newRegistration = new Registration({ domain, email });
    await newRegistration.save();

    res.status(200).send('Registration successful');
  } catch (error) {
    console.error('Error registering domain:', error.message, error);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
