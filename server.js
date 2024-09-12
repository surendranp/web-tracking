const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

// Function to get the MongoDB URI dynamically based on the domain name
function getMongoDbUriForDomain(domainName) {
  const sanitizedDomain = domainName.replace(/\./g, '_');  // Sanitize the domain name to make it compatible for database naming
  const baseUri = process.env.BASE_MONGO_URI;
  return `${baseUri}/${sanitizedDomain}?retryWrites=true&w=majority`;
}

// Middleware to dynamically connect to the correct MongoDB database based on the domain
app.use(async (req, res, next) => {
  const domainName = req.body.domainName;
  
  if (!domainName) {
    return res.status(400).send('Domain name is required');
  }
  
  const mongoUri = getMongoDbUriForDomain(domainName);
  
  if (!mongoose.connections.some(conn => conn.name === domainName)) {
    try {
      await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
      console.log(`Connected to database: ${domainName}`);
    } catch (err) {
      console.error('MongoDB connection error:', err);
      return res.status(500).send('Failed to connect to the database');
    }
  }
  
  next();
});

// Import and use routes
const pageViews = require('./routes/pageViews');
app.use('/api/pageviews', pageViews);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Serve the dashboard page
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

app.listen(port, () => console.log(`Server running on port ${port}`));
