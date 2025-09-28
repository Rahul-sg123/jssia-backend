const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const sharp = require('sharp');
const Paper = require('../models/Paper');
const mime = require('mime-types');
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
    const dir = './temp_uploads/';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

/* ────────── Helpers ────────── */
async function compressImage(filePath, ext) {
  const outPath =
    ext === '.png' ? filePath.replace(/\.png$/i, '_compressed.png') : filePath.replace(/(\.\w+)$/, '_compressed.jpg');

  const sharpPipe = sharp(filePath).resize({ width: 1080 });

  ext === '.png'
    ? await sharpPipe.png({ compressionLevel: 9 }).toFile(outPath)
    : await sharpPipe.jpeg({ quality: 70 }).toFile(outPath);

  fs.unlinkSync(filePath); // remove original
  return outPath;
}

/* ────────── Upload Endpoint ────────── */
router.post(
  '/upload',
  upload.array('files'),
  async (req, res) => {
    const { subject, semester, description } = req.body;
    const allFiles = req.files || [];

    if (!allFiles.length) return res.status(400).json({ success: false, message: 'No files uploaded.' });

    try {
      const savedFiles = [];

      for (const file of allFiles) {
        let ext = path.extname(file.originalname).toLowerCase();
        if (!ext) ext = `.${mime.extension(file.mimetype) || ''}`;

        let filePath = file.path;

        console.log(`Processing ${file.originalname} (ext ${ext})`);

        // Optional: nudity check
        if (['.jpg', '.jpeg', '.png'].includes(ext) && process.env.SIGHTENGINE_USER) {
          const form = new FormData();
          form.append('media', fs.createReadStream(filePath));
          form.append('models', 'nudity-2.0');
          form.append('api_user', process.env.SIGHTENGINE_USER);
          form.append('api_secret', process.env.SIGHTENGINE_SECRET);

          const { data } = await axios.post('https://api.sightengine.com/1.0/check.json', form, {
            headers: form.getHeaders(),
          });

          if (data?.nudity?.raw > 0.6) {
            fs.unlinkSync(filePath);
            console.log('Removed nudity file:', file.originalname);
            continue;
          }
        }

        // Compress images
        if (['.jpg', '.jpeg', '.png'].includes(ext)) {
          filePath = await compressImage(filePath, ext);
        }

        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(filePath, {
          folder: 'jssia_papers',
          resource_type: 'auto',
        });

        fs.unlinkSync(filePath); // remove temp file

        savedFiles.push({
          url: result.secure_url,
          upvotes: 0,
          downvotes: 0,
        });
      }

      if (!savedFiles.length) return res.status(400).json({ success: false, message: 'All files rejected.' });

      // Save to MongoDB
      const paper = await Paper.create({ subject, semester, description, files: savedFiles });

      res.status(201).json({ success: true, message: '✅ Uploaded to Cloudinary!', paper });
    } catch (err) {
      console.error('Upload error:', err);
      res.status(500).json({ success: false, message: 'Upload failed', error: err.message });
    }
  }
);

/* ────────── Fetch Papers ────────── */
router.get('/papers', async (req, res) => {
  const { subject, semester } = req.query;

  try {
    const filter = {};
    if (subject) filter.subject = subject.toLowerCase();
    if (semester) filter.semester = semester;

    const papers = await Paper.find(filter).sort({ uploadedAt: -1 });

    res.json(papers);
  } catch (err) {
    console.error('Fetch papers error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch papers', error: err.message });
  }
});

module.exports = router;
