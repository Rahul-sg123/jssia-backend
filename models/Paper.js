const mongoose = require('mongoose');

const paperSchema = new mongoose.Schema({
  subject: String,
  semester: String,
  description: String,
  files: [
    {
      url: String,
      upvotes: { type: Number, default: 0 },
      downvotes: { type: Number, default: 0 }
    }
  ],
  upvotes: { type: Number, default: 0 },
  downvotes: { type: Number, default: 0 },
  uploadedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Paper', paperSchema);
