const mongoose = require('mongoose');

const registrationSchema = new mongoose.Schema({
  domain: String,
  email: String
});

module.exports = mongoose.model('Registration', registrationSchema);
