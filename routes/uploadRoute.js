const express = require('express');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const axios = require('axios');
const FormData = require('form-data');
const Paper = require('../models/Paper');

const router = express.Router();

/* ────────── Cloudinary Config ────────── */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ────────── Multer Storage (Cloudinary) ────────── */
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    let folder = 'jssia_papers';
    let format = undefined;

    if (file.mimetype.includes('pdf')) format = 'pdf';
    else if (file.mimetype.includes('png')) format = 'png';
    else if (file.mimetype.includes('jpeg') || file.mimetype.includes('jpg'))
      format = 'jpg';

    return {
      folder,
      resource_type: file.mimetype.includes('pdf') ? 'raw' : 'auto', // PDFs = raw, images = auto
      format,
      public_id: Date.now() + '-' + file.originalname,
      transformation: file.mimetype.startsWith('image/')
        ? [{ width: 1080, crop: 'limit', quality: 'auto' }]
        : [],
    };
  },
});

const upload = multer({ storage });

/* ────────── Upload Endpoint ────────── */
router.post('/upload', upload.array('files'), async (req, res) => {
  const { subject, semester, description } = req.body;
  const allFiles = req.files || [];

  if (!allFiles.length)
    return res.status(400).json({ success: false, message: 'No files uploaded.' });

  try {
    const saved = [];

    for (const f of allFiles) {
      console.log(`🔍 Uploaded to Cloudinary: ${f.originalname} (${f.mimetype})`);

      // Nudity check for images only
      if (f.mimetype.startsWith('image/')) {
        const form = new FormData();
        form.append('media', f.path); // Cloudinary URL
        form.append('models', 'nudity-2.0');
        form.append('api_user', process.env.SIGHTENGINE_USER);
        form.append('api_secret', process.env.SIGHTENGINE_SECRET);

        const { data } = await axios.post('https://api.sightengine.com/1.0/check.json', form, {
          headers: form.getHeaders(),
        });

        if (data?.nudity?.raw > 0.6) {
          console.log('🚫 Removed (nudity):', f.originalname);
          // Delete from Cloudinary
          await cloudinary.uploader.destroy(f.filename, { resource_type: 'image' });
          continue; // skip saving this file
        }
      }

      // Save file info for MongoDB
      saved.push({
        url: f.path || f.secure_url, // Cloudinary URL
        filename: f.filename,
        upvotes: 0,
        downvotes: 0,
      });
    }

    if (!saved.length)
      return res.status(400).json({ success: false, message: 'All files rejected.' });

    // Save paper document to MongoDB
    const paper = await Paper.create({
      subject,
      semester,
      description,
      files: saved,
    });

    res.status(201).json({ success: true, paper });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Upload failed', error: e.message });
  }
});

module.exports = router;
