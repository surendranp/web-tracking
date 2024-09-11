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

// Middleware to dynamically switch database based on domain and create collection
async function switchDatabase(req, res, next) {
  try {
    const { domainName } = req.body;

    if (!domainName) {
      return res.status(400).send('Domain name is required');
    }

    // Sanitize the domain name to use as a collection name
    const sanitizedDomain = domainName.replace(/\./g, '_');
    const mongoUri = `${process.env.MONGODB_BASE_URI}/${sanitizedDomain}`;

    if (!dbConnections[sanitizedDomain]) {
      // Create a new connection if it doesn't exist
      const newConnection = await mongoose.createConnection(mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });

      // Ensure the collection exists by creating a dummy document
      const dummyModel = newConnection.model('Dummy', new mongoose.Schema({}));
      await dummyModel.create({ dummy: 'dummy' }).catch(err => {
        console.log(`Error creating dummy document: ${err}`);
      });

      dbConnections[sanitizedDomain] = newConnection;
      console.log(`Connected to database: ${sanitizedDomain}`);
    }

    // Attach the database connection and collection name to the request object
    req.dbConnection = dbConnections[sanitizedDomain];
    req.collectionName = sanitizedDomain; // Pass collection name based on the domain
    next();
  } catch (error) {
    console.error('Error in switching database:', error);
    res.status(500).send('Database connection error');
  }
}

app.use('/api/pageviews', switchDatabase);

// Import and use routes
const pageViews = require('./routes/pageViews');
app.use('/api/pageviews', pageViews);

// Serve the dashboard page
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

app.listen(port, () => console.log(`Server running on port ${port}`));
