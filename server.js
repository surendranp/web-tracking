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

// MongoDB Connections Cache
const dbConnections = {};

// Middleware to dynamically switch database based on domain
async function switchDatabase(req, res, next) {
  try {
    const { domainName } = req.body;

    if (!domainName) {
      return res.status(400).send('Domain name is required');
    }

    const sanitizedDomain = domainName.replace(/\./g, '_');  // Sanitize domain for MongoDB naming
    const dbName = sanitizedDomain; // Use sanitized domain name for the database
    const mongoUri = `${process.env.MONGODB_BASE_URI}/${dbName}`;  // Construct MongoDB URI

    if (!dbConnections[dbName]) {
      // Create a new connection if it doesn't exist
      const newConnection = mongoose.createConnection(mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      dbConnections[dbName] = newConnection;
      console.log(`Connected to database: ${dbName}`);
    }

    // Attach the database connection to the request object
    req.dbConnection = dbConnections[dbName];
    next();
  } catch (error) {
    console.error('Error in switching database:', error);
    res.status(500).send('Database connection error');
  }
}

app.use('/api/pageviews', switchDatabase);  // Attach middleware to switch databases

// Import and use routes
const pageViews = require('./routes/pageViews');
app.use('/api/pageviews', pageViews);

// Serve the dashboard page
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

app.listen(port, () => console.log(`Server running on port ${port}`));
