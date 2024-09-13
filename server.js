const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// MongoDB URI
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error('MongoDB URI is not set.');
  process.exit(1);
}
console.log('MongoDB URI:', mongoUri);

// MongoDB Connection
mongoose.connect(mongoUri)
  .then(() => console.log('MongoDB connected'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Import and use routes
const pageViews = require('./routes/pageViews');
app.use('/api/pageviews', pageViews);

// Serve the dashboard page
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

// Route to handle client registration
app.post('/api/register', async (req, res) => {
  const { domain, email } = req.body;

  if (!domain || !email) {
    return res.status(400).send('Domain and email are required.');
  }

  const sanitizedDomain = domain.replace(/[.\$]/g, '_');

  const emailSchema = new mongoose.Schema({
    domain: { type: String, required: true },
    email: { type: String, required: true },
  });

  try {
    Email = mongoose.model('Email', emailSchema);
  } catch (error) {
    Email = mongoose.model('Email', emailSchema); // Define model only if it does not already exist
  }

  const existingEntry = await Email.findOne({ domain });

  if (existingEntry) {
    existingEntry.email = email;
    await existingEntry.save();
  } else {
    const newEntry = new Email({ domain, email });
    await newEntry.save();
  }

  res.status(200).send('Domain and email registered successfully.');
});

app.listen(port, () => console.log(`Server running on port ${port}`));
