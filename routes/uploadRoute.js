const express  = require('express');
const multer   = require('multer');
const fs       = require('fs');
const path     = require('path');
const Paper    = require('../models/Paper');
const sharp    = require('sharp');
const { v2: cloudinary } = require('cloudinary');

const router = express.Router();

/* ────────── Cloudinary Config ────────── */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ────────── Multer Storage ────────── */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './uploads/';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

/* ────────── Compress Image ────────── */
async function compressImage(filePath) {
  const outPath = filePath.replace(/(\.\w+)$/, '_compressed$1');
  await sharp(filePath)
    .resize({ width: 1080 })
    .toFile(outPath);
  fs.unlinkSync(filePath); // delete original
  return outPath;
}

/* ────────── Upload Endpoint ────────── */
router.post('/upload', upload.array('files'), async (req, res) => {
  const { subject, semester, description } = req.body;
  const files = req.files;

  if (!files || !files.length)
    return res.status(400).json({ success: false, message: 'No files uploaded.' });

  try {
    const saved = [];

    for (const file of files) {
      let filePath = file.path;

      // compress images if jpg/png
      if (file.mimetype.startsWith('image/')) {
        filePath = await compressImage(filePath);
      }

      // upload to Cloudinary
      const result = await cloudinary.uploader.upload(filePath, {
        folder: 'jssia_papers',
        resource_type: 'auto',
      });

      fs.unlinkSync(filePath); // delete compressed file

      saved.push({
        url: result.secure_url, // <-- Cloudinary URL
        upvotes: 0,
        downvotes: 0,
      });
    }

    const paper = await Paper.create({ subject, semester, description, files: saved });

    res.status(201).json({
      success: true,
      message: '✅ Uploaded to Cloudinary',
      paper,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Upload failed', error: err.message });
  }
});

module.exports = router;
