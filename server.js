const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

// Function to dynamically generate the MongoDB URI based on the domain
function getMongoDbUriForDomain(domainName) {
  const sanitizedDomain = domainName.replace(/\./g, '_');  // Replace dots with underscores for DB name compatibility
  const baseUri = process.env.BASE_MONGO_URI;
  return `${baseUri}/${sanitizedDomain}?retryWrites=true&w=majority`;
}

// Middleware to dynamically connect to the appropriate MongoDB database based on the domain
async function connectToDomainDatabase(req, res, next) {
  const { domainName } = req.body;

  if (!domainName) {
    return res.status(400).send('Domain name is required');
  }

  const mongoUri = getMongoDbUriForDomain(domainName);

  try {
    // If the connection for this domain does not already exist, create it
    if (!mongoose.connections.some(conn => conn.name === domainName)) {
      await mongoose.createConnection(mongoUri);
      console.log(`Connected to database: ${domainName}`);
    }
  } catch (err) {
    console.error('MongoDB connection error:', err);
    return res.status(500).send('Failed to connect to the database');
  }

  next();
}

// Apply the connection middleware to all routes that need database interaction
app.use('/api/pageviews', connectToDomainDatabase);

// Define your routes
const pageViews = require('./routes/pageViews');
app.use('/api/pageviews', pageViews);

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
