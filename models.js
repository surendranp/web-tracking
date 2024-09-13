// models.js
const mongoose = require('mongoose');

const registrationSchema = new mongoose.Schema({
  domain: String,
  email: String
});

const Registration = mongoose.models.Registration || mongoose.model('Registration', registrationSchema);

module.exports = {
  Registration
};
