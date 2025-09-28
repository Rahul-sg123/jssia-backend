require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const cloudinary = require('cloudinary').v2;

const Feedback = require('./models/Feedback');
const Subject = require('./models/Subject');
const Paper = require('./models/Paper');
const subjectRoutes = require('./routes/subjectRoutes');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 5000;

/* ------------------------  ⛑️  MIDDLEWARE  ------------------------ */
app.use(cors({
  origin: ['http://localhost:3000', 'https://jssia.vercel.app'],
  credentials: true,
}));
app.options('*', cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/* ------------------------  ☁️  Cloudinary Config ------------------------ */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ------------------------  📦  MULTER STORAGE ------------------------ */
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

/* ------------------------  🔗  ROUTES ------------------------ */
app.use('/admin', adminRoutes);
app.use('/api/subjects', subjectRoutes);
app.get('/', (req, res) => res.send('✅ JSS IA Backend is live!'));

/* ------------------------  📄  UPLOAD PAPER ------------------------ */
app.post('/upload', upload.array('files'), async (req, res) => {
  const { semester, description } = req.body;
  const subject = req.body.subject?.trim().toLowerCase();

  if (!req.files?.length)
    return res.status(400).json({ success: false, message: 'No files uploaded.' });

  try {
    const filesArr = [];

    for (const file of req.files) {
      const ext = path.extname(file.originalname).toLowerCase();
      let inputPath = file.path;

      // Compress images
      if (['.jpg', '.jpeg', '.png'].includes(ext)) {
        const tmp = inputPath.replace(ext, `_tmp${ext}`);
        await sharp(inputPath)
          .resize({ width: 1200 })
          .jpeg({ quality: 70 })
          .toFile(tmp);

        const beforeSize = fs.statSync(inputPath).size;
        const afterSize = fs.statSync(tmp).size;
        if (afterSize < beforeSize) fs.renameSync(tmp, inputPath);
        else fs.unlinkSync(tmp);
      }

      // Upload to Cloudinary
      const cloudRes = await cloudinary.uploader.upload(inputPath, {
        resource_type: ext === '.pdf' ? 'raw' : 'image',
        folder: `jssia/${subject || 'misc'}`,
      });

      fs.unlinkSync(inputPath);

      filesArr.push({
        url: cloudRes.secure_url,
        upvotes: 0,
        downvotes: 0,
      });
    }

    const paper = await Paper.create({
      semester: semester.toString(),
      subject,
      description,
      files: filesArr,
    });

    res.status(201).json({
      success: true,
      message: '✅ Uploaded to Cloudinary!',
      paper,
    });
  } catch (err) {
    console.error('❌ Upload error:', err);
    res.status(500).json({ success: false, message: '❌ Upload failed', error: err.message });
  }
});

/* ------------------------  FETCH PAPERS ------------------------ */
app.get('/papers', async (req, res) => {
  const { subject, semester } = req.query;
  try {
    const filter = {};
    if (subject) filter.subject = subject.toLowerCase();
    if (semester) filter.semester = semester.toString();

    const papers = await Paper.find(filter).sort({ uploadedAt: -1 });

    // Filter out files with >=3 downvotes
    const visible = papers
      .map(p => ({ ...p.toObject(), files: p.files.filter(f => f.downvotes < 3) }))
      .filter(p => p.files.length);

    console.log(`📄 Returning ${visible.length} papers`);
    res.json(visible);
  } catch (err) {
    console.error('Fetch papers error:', err);
    res.status(500).json({ message: 'Error fetching papers', error: err.message });
  }
});

/* ------------------------  VOTING ------------------------ */
app.put('/papers/:paperId/files/:index/upvote', async (req, res) => {
  try {
    const paper = await Paper.findById(req.params.paperId);
    if (!paper) return res.status(404).json({ message: 'Paper not found' });

    const i = Number(req.params.index);
    if (!paper.files[i]) return res.status(404).json({ message: 'File not found' });

    paper.files[i].upvotes += 1;
    await paper.save();
    res.json({ message: 'File upvoted', file: paper.files[i] });
  } catch (err) {
    res.status(500).json({ message: 'Failed to upvote', error: err.message });
  }
});

app.put('/papers/:paperId/files/:index/downvote', async (req, res) => {
  try {
    const paper = await Paper.findById(req.params.paperId);
    if (!paper) return res.status(404).json({ message: 'Paper not found' });

    const i = Number(req.params.index);
    if (!paper.files[i]) return res.status(404).json({ message: 'File not found' });

    paper.files[i].downvotes += 1;
    await paper.save();
    res.json({ message: 'File downvoted', file: paper.files[i] });
  } catch (err) {
    res.status(500).json({ message: 'Failed to downvote', error: err.message });
  }
});

/* ------------------------  FEEDBACK ------------------------ */
app.post('/api/feedback', async (req, res) => {
  const { message, email } = req.body;
  if (!message) return res.status(400).json({ success: false, message: 'Message is required' });

  try {
    const fb = await Feedback.create({ message, email });
    res.status(201).json({ success: true, message: 'Feedback submitted', feedback: fb });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error submitting feedback', error: err.message });
  }
});

/* ------------------------  DATABASE ------------------------ */
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    app.listen(PORT, () => console.log(`🚀 Backend ready on http://localhost:${PORT}`));
  })
  .catch(err => console.error('❌ MongoDB connection error:', err));
