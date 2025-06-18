const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  message: { type: String, required: true },
  email: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Feedback', feedbackSchema);
