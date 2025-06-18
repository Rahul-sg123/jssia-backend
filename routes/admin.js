const express = require('express');
const fs = require('fs');
const path = require('path');
const Paper = require('../models/Paper');

const router = express.Router();

// 🔒 Hardcoded admin credentials (for demo only — use env vars in production)
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'rahul@123';

// ✅ Auth middleware
function authMiddleware(req, res, next) {
  const { username, password } = req.headers;
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// 📄 GET all papers (admin dashboard)
router.get('/papers', authMiddleware, async (req, res) => {
  try {
    const papers = await Paper.find().sort({ createdAt: -1 });
    res.json(papers);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch papers', details: err.message });
  }
});

// ❌ DELETE paper by ID (including all attached files)
router.delete('/papers/:id', authMiddleware, async (req, res) => {
  try {
    const paper = await Paper.findById(req.params.id);
    if (!paper) return res.status(404).json({ error: 'Paper not found' });

    // 🔁 Delete all files related to the paper
    for (const file of paper.files) {
      const filePath = path.join(__dirname, '..', 'uploads', path.basename(file.url));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await paper.deleteOne();
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete paper', details: err.message });
  }
});

module.exports = router;
