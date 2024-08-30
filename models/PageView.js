// models/PageView.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PageViewSchema = new Schema({
  url: { type: String, required: true },
  referrer: { type: String },
  userAgent: { type: String },
  ipAddress: { type: String },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PageView', PageViewSchema);
