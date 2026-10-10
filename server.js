const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'study-files.json');
for (const dir of [UPLOAD_DIR, DATA_DIR]) fs.mkdirSync(dir, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]', 'utf8');

function readFiles() {
  try { const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); return Array.isArray(data) ? data : []; }
  catch { return []; }
}
function writeFiles(files) { fs.writeFileSync(DB_FILE, JSON.stringify(files, null, 2), 'utf8'); }
function safeName(name) { return path.basename(String(name || 'tep-tai-len')).replace(/[\r\n]/g, '_').slice(0, 240) || 'tep-tai-len'; }

// Files are written to disk, not browser localStorage. No app-level fileSize cap is set;
// actual capacity is limited by available disk space, filesystem and hosting-provider rules.
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(safeName(file.originalname)).slice(0, 20);
    cb(null, crypto.randomUUID() + ext);
  }
});
const upload = multer({ storage });

app.use(express.static(path.join(ROOT, 'public')));
app.get('/api/study-files', (_req, res) => {
  const files = readFiles().map(f => ({ ...f, downloadUrl: `/api/study-files/${encodeURIComponent(f.id)}/download` }));
  res.json(files.sort((a, b) => new Date(b.at) - new Date(a.at)));
});
app.post('/api/study-files', (req, res) => {
  upload.single('file')(req, res, err => {
    if (err) return res.status(400).json({ error: 'Tải tệp thất bại: ' + err.message });
    try {
      if (!req.file) return res.status(400).json({ error: 'Bạn chưa chọn tệp.' });
      const title = String(req.body.title || '').trim();
      if (!title) { fs.rmSync(req.file.path, { force: true }); return res.status(400).json({ error: 'Vui lòng nhập tên tài liệu.' }); }
      const record = {
        id: crypto.randomUUID(), title: title.slice(0, 300), fileName: safeName(req.file.originalname),
        storageName: req.file.filename, type: req.file.mimetype || 'application/octet-stream',
        size: req.file.size, by: String(req.body.by || 'Thành viên').slice(0, 120), at: new Date().toISOString()
      };
      const files = readFiles(); files.unshift(record); writeFiles(files);
      res.status(201).json({ ...record, downloadUrl: `/api/study-files/${encodeURIComponent(record.id)}/download` });
    } catch (e) {
      if (req.file) fs.rmSync(req.file.path, { force: true });
      res.status(500).json({ error: 'Lỗi lưu thông tin tệp trên máy chủ.' });
    }
  });
});
app.get('/api/study-files/:id/download', (req, res) => {
  const file = readFiles().find(f => f.id === req.params.id);
  if (!file) return res.status(404).send('Không tìm thấy tệp.');
  const diskPath = path.join(UPLOAD_DIR, path.basename(file.storageName));
  if (!fs.existsSync(diskPath)) return res.status(404).send('Tệp không còn trên máy chủ.');
  res.download(diskPath, file.fileName);
});
app.delete('/api/study-files/:id', (req, res) => {
  const files = readFiles();
  const file = files.find(f => f.id === req.params.id);
  if (!file) return res.status(404).json({ error: 'Không tìm thấy tài liệu.' });
  const diskPath = path.join(UPLOAD_DIR, path.basename(file.storageName));
  fs.rmSync(diskPath, { force: true });
  writeFiles(files.filter(f => f.id !== file.id));
  res.json({ ok: true });
});
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.listen(PORT, '0.0.0.0', () => {
  console.log(`ClassTools đang chạy: http://localhost:${PORT}`);
  console.log('Tệp tải lên được lưu trong thư mục uploads/.');
});
