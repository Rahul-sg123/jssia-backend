const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const axios    = require('axios');
const FormData = require('form-data');
const sharp    = require('sharp');
const { PDFDocument } = require('pdf-lib');
const Paper    = require('../models/Paper');
const mime     = require('mime-types');
const { v2: cloudinary } = require('cloudinary');

const router = express.Router();

/* ────────── Cloudinary config ────────── */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ────────── Multer storage ────────── */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './uploads/';
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

/* ────────── Upload endpoint ────────── */
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

        // Compress images
        if (['.jpg', '.jpeg', '.png'].includes(ext)) {
          fp = await compressImage(fp, ext);
        }

        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(fp, {
          folder: 'jssia_papers',
          resource_type: 'auto'
        });

        // Delete local file after upload
        fs.unlinkSync(fp);

        saved.push({
          url: result.secure_url, // Cloudinary URL
          upvotes: 0,
          downvotes: 0
        });
      }

      if (!saved.length)
        return res.status(400).json({ success: false, message: 'All files rejected.' });

      const paper = await Paper.create({ subject, semester, description, files: saved });
      res.status(201).json({
        success: true,
        message: '✅ Uploaded to Cloudinary',
        paper
      });

    } catch (e) {
      console.error(e);
      res.status(500).json({ success: false, message: 'Upload failed', error: e.message });
    }
  }
);

module.exports = router;
