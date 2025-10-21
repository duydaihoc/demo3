const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { auth } = require('../middleware/auth');

// BACKUP_DIR
const BACKUP_DIR = path.join(__dirname, '..', 'backups');

// Chỉ admin mới có thể backup/restore
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Chỉ admin mới có quyền này' });
  }
  next();
};

// GET /api/backup/list - Lấy danh sách backups
router.get('/list', auth, requireAdmin, (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      return res.json({ backups: [] });
    }

    const backups = fs.readdirSync(BACKUP_DIR)
      .filter(file => file.startsWith('backup_'))
      .map(file => {
        const filePath = path.join(BACKUP_DIR, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          size: getDirectorySize(filePath).size,
          createdAt: stats.mtime,
          files: getDirectorySize(filePath).files
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);

    res.json({ backups });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy danh sách backup', error: error.message });
  }
});

// POST /api/backup/create - Tạo backup mới
router.post('/create', auth, requireAdmin, (req, res) => {
  try {
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/expense_tracker';
    const dbName = MONGO_URI.split('/').pop().split('?')[0];

    // Tạo folder backups nếu chưa có
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    // Tạo tên file backup với timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupPath = path.join(BACKUP_DIR, `backup_${dbName}_${timestamp}`);

    // Lệnh mongodump
    const command = `mongodump --uri="${MONGO_URI}" --out="${backupPath}"`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        return res.status(500).json({ 
          message: 'Lỗi khi backup', 
          error: error.message,
          hint: 'Đảm bảo MongoDB tools đã được cài đặt'
        });
      }

      // Thống kê kích thước backup
      const stats = getDirectorySize(backupPath);

      res.json({
        message: 'Backup thành công',
        backup: {
          name: `backup_${dbName}_${timestamp}`,
          path: backupPath,
          size: stats.size,
          files: stats.files,
          createdAt: new Date()
        }
      });

      // Tự động xóa backup cũ (giữ lại 10 backup gần nhất)
      setTimeout(() => cleanOldBackups(BACKUP_DIR, 10), 1000);
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi tạo backup', error: error.message });
  }
});

// DELETE /api/backup/:name - Xóa backup
router.delete('/:name', auth, requireAdmin, (req, res) => {
  try {
    const { name } = req.params;
    const backupPath = path.join(BACKUP_DIR, name);

    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ message: 'Backup không tồn tại' });
    }

    fs.rmSync(backupPath, { recursive: true, force: true });
    res.json({ message: 'Đã xóa backup thành công', name });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi xóa backup', error: error.message });
  }
});

// Helper functions
function getDirectorySize(dirPath) {
  let totalSize = 0;
  let fileCount = 0;

  function traverse(currentPath) {
    const files = fs.readdirSync(currentPath);
    
    for (const file of files) {
      const filePath = path.join(currentPath, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        traverse(filePath);
      } else {
        totalSize += stats.size;
        fileCount++;
      }
    }
  }

  traverse(dirPath);
  return { size: totalSize, files: fileCount };
}

function cleanOldBackups(backupDir, keepCount = 10) {
  try {
    const backups = fs.readdirSync(backupDir)
      .filter(file => file.startsWith('backup_'))
      .map(file => ({
        name: file,
        path: path.join(backupDir, file),
        time: fs.statSync(path.join(backupDir, file)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);

    if (backups.length > keepCount) {
      const toDelete = backups.slice(keepCount);
      toDelete.forEach(backup => {
        fs.rmSync(backup.path, { recursive: true, force: true });
      });
    }
  } catch (err) {
    console.error('Lỗi khi xóa backup cũ:', err.message);
  }
}

module.exports = router;
