const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
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

/* ────────── Multer Storage (temporary local) ────────── */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './temp_uploads/';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

/* ────────── Helpers ────────── */
async function compressImage(filePath, ext) {
  const outPath = ext === '.png'
    ? filePath.replace(/\.png$/i, '_compressed.png')
    : filePath.replace(/(\.\w+)$/, '_compressed.jpg');

  const original = fs.statSync(filePath).size;
  const sharpPipe = sharp(filePath).resize({ width: 1080 });

  ext === '.png'
    ? await sharpPipe.png({ compressionLevel: 9 }).toFile(outPath)
    : await sharpPipe.jpeg({ quality: 70 }).toFile(outPath);

  const compressed = fs.statSync(outPath).size;
  fs.unlinkSync(filePath);
  return outPath;
}

/* ────────── Upload Endpoint ────────── */
router.post(
  '/upload',
  upload.fields([{ name: 'files' }, { name: 'file' }]),
  async (req, res) => {
    const { subject, semester, description } = req.body;
    const allFiles = [...(req.files?.files || []), ...(req.files?.file || [])];

    if (!allFiles.length)
      return res.status(400).json({ success: false, message: 'No files uploaded.' });

    try {
      const saved = [];

      for (const f of allFiles) {
        let ext = path.extname(f.originalname).toLowerCase();
        if (!ext) ext = `.${mime.extension(f.mimetype) || ''}`;
        let fp = f.path;

        console.log(`🔍 Processing ${f.originalname} (ext ${ext}, mime ${f.mimetype})`);

        // Nudity check for images
        if (['.jpg', '.jpeg', '.png'].includes(ext)) {
          const form = new FormData();
          form.append('media', fs.createReadStream(fp));
          form.append('models', 'nudity-2.0');
          form.append('api_user', process.env.SIGHTENGINE_USER);
          form.append('api_secret', process.env.SIGHTENGINE_SECRET);

          const { data } = await axios.post(
            'https://api.sightengine.com/1.0/check.json',
            form,
            { headers: form.getHeaders() }
          );

          if (data?.nudity?.raw > 0.6) {
            fs.unlinkSync(fp);
            console.log('🚫 Removed (nudity):', f.originalname);
            continue;
          }
        }

        // Compress images only
        if (['.jpg', '.jpeg', '.png'].includes(ext)) {
          fp = await compressImage(fp, ext);
        }

        // Upload to Cloudinary
        const uploadResult = await cloudinary.uploader.upload(fp, {
          folder: 'jssia_papers',
          resource_type: 'auto'
        });

        // Remove local temp file
        fs.unlinkSync(fp);

        saved.push({
          url: uploadResult.secure_url,
          upvotes: 0,
          downvotes: 0
        });
      }

      if (!saved.length)
        return res.status(400).json({ success: false, message: 'All files rejected.' });

      // Save to MongoDB
      const paper = await Paper.create({ subject, semester, description, files: saved });
      res.status(201).json({ success: true, paper, message: '✅ Uploaded to Cloudinary' });

    } catch (e) {
      console.error(e);
      res.status(500).json({ success: false, message: 'Upload failed', error: e.message });
    }
  }
);

module.exports = router;
