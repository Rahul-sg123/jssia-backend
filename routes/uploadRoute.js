const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const axios    = require('axios');
const FormData = require('form-data');
const sharp    = require('sharp');
const Paper    = require('../models/Paper');
const mime     = require('mime-types');

const router = express.Router();

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

/* ────────── Image compression ────────── */
async function compressImage(filePath, ext) {
  const outPath = ext === '.png'
    ? filePath.replace(/\.png$/i, '_compressed.png')
    : filePath.replace(/(\.\w+)$/, '_compressed.jpg');

  const original = fs.statSync(filePath).size;
  const pipe = sharp(filePath).resize({ width: 1080 });

  ext === '.png'
    ? await pipe.png({ compressionLevel: 9 }).toFile(outPath)
    : await pipe.jpeg({ quality: 70 }).toFile(outPath);

  const compressed = fs.statSync(outPath).size;
  console.log(`🖼️  ${path.basename(filePath)} | ${original} → ${compressed} bytes`);
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

    if (!allFiles.length) {
      return res.status(400).json({ success: false, message: 'No files uploaded.' });
    }

    try {
      const saved = [];

      for (const f of allFiles) {
        let ext = path.extname(f.originalname).toLowerCase();
        if (!ext) ext = `.${mime.extension(f.mimetype) || ''}`;
        let fp  = f.path;

        console.log(`🔍 Processing ${f.originalname} (ext ${ext}, mime ${f.mimetype})`);

        /* ── Nudity check for images ── */
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

        /* ── Compress only images ── */
        if (['.jpg', '.jpeg', '.png'].includes(ext)) {
          console.log('📦 Compressing image…');
          fp = await compressImage(fp, ext);
        } else if (ext === '.pdf') {
          console.log('ℹ️  Skipping PDF compression (stored as‑is)');
        } else {
          console.log('ℹ️  Keeping original:', f.originalname);
        }

        saved.push({
          url: fp.replace(/^\.?\/?uploads[\\/]/, '/uploads/'),
          upvotes: 0,
          downvotes: 0
        });
      }

      if (!saved.length) {
        return res.status(400).json({ success: false, message: 'All files rejected.' });
      }

      const paper = await Paper.create({ subject, semester, description, files: saved });
      res.status(201).json({ success: true, paper });

    } catch (e) {
      console.error(e);
      res.status(500).json({ success: false, message: 'Upload failed', error: e.message });
    }
  }
);

module.exports = router;
