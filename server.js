const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Middleware to dynamically switch to the correct database based on domain
const connections = {};  // Store connections for different databases

async function switchDatabase(req, res, next) {
  const { domainName } = req.body;

  if (!domainName) {
    return res.status(400).send('Domain name is required');
  }

  const sanitizedDomain = domainName.replace(/\./g, '_');  // Replace dots in the domain name for DB compatibility
  const dbName = sanitizedDomain;  // Use sanitized domain name as the database name
  const mongoUri = `${process.env.MONGODB_BASE_URI}/${dbName}`;  // Create unique database name per domain

  // Check if the connection for this domain already exists
  if (!connections[dbName]) {
    try {
      const newConnection = await mongoose.createConnection(mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      connections[dbName] = newConnection;  // Store connection for reuse
      console.log(`Connected to database: ${dbName}`);
    } catch (err) {
      console.error('MongoDB connection error:', err);
      return res.status(500).send('Failed to connect to database');
    }
  }

  // Set the connection to use for this request
  req.dbConnection = connections[dbName];
  next();
}

app.use('/api/pageviews', switchDatabase);

// Import and use routes
const pageViews = require('./routes/pageViews');
app.use('/api/pageviews', pageViews);

// Serve the dashboard page
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

// Start the server
app.listen(port, () => console.log(`Server running on port ${port}`));
