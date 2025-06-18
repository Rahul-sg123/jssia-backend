// routes/subjectRoutes.js
const express = require('express');
const router = express.Router();
const Subject = require('../models/Subject');

// GET all subjects
router.get('/', async (req, res) => {
  try {
    const subjects = await Subject.find().sort({ name: 1 });
    res.json({ subjects });
  } catch (err) {
    res.status(500).json({ message: 'Failed to get subjects' });
  }
});

// POST add new subject
router.post('/', async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Subject name is required' });
  }
  try {
    const subject = new Subject({ name: name.trim() });
    await subject.save();
    res.status(201).json({ message: 'Subject added', subject });
  } catch (err) {
    if (err.code === 11000) {
      res.status(400).json({ message: 'Subject already exists' });
    } else {
      res.status(500).json({ message: 'Failed to add subject', error: err.message });
    }
  }
});

module.exports = router;
