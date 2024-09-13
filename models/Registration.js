const mongoose = require('mongoose');

const registrationSchema = new mongoose.Schema({
  domain: String,
  email: String
});

const Registration = mongoose.model('Registration', registrationSchema);

module.exports = Registration;
