const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Cấu hình backup
const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/expense_tracker';

// Lấy database name từ URI
const dbName = MONGO_URI.split('/').pop().split('?')[0];

// Tạo folder backups nếu chưa có
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  console.log(`✅ Đã tạo folder: ${BACKUP_DIR}`);
}

// Tạo tên file backup với timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
const backupPath = path.join(BACKUP_DIR, `backup_${dbName}_${timestamp}`);

console.log('🚀 Bắt đầu backup MongoDB...');
console.log(`📦 Database: ${dbName}`);
console.log(`📁 Đường dẫn: ${backupPath}`);

// Lệnh mongodump
const command = `mongodump --uri="${MONGO_URI}" --out="${backupPath}"`;

exec(command, (error, stdout, stderr) => {
  if (error) {
    console.error('❌ Lỗi khi backup:', error.message);
    console.error('💡 Đảm bảo MongoDB tools đã được cài đặt:');
    console.error('   - Windows: https://www.mongodb.com/try/download/database-tools');
    console.error('   - Linux: sudo apt install mongodb-database-tools');
    console.error('   - Mac: brew install mongodb-database-tools');
    return;
  }

  if (stderr) {
    console.log('⚠️  Warning:', stderr);
  }

  console.log('✅ Backup thành công!');
  console.log(`📂 Vị trí: ${backupPath}`);
  
  // Thống kê kích thước backup
  try {
    const stats = getDirectorySize(backupPath);
    console.log(`💾 Kích thước: ${formatBytes(stats.size)}`);
    console.log(`📄 Số files: ${stats.files}`);
  } catch (err) {
    console.error('Không thể lấy thông tin backup:', err.message);
  }

  // Tự động xóa backup cũ (giữ lại 7 backup gần nhất)
  cleanOldBackups(BACKUP_DIR, 7);
});

// Helper: Tính kích thước folder
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

// Helper: Format bytes
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Helper: Xóa backup cũ
function cleanOldBackups(backupDir, keepCount = 7) {
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
      console.log(`\n🗑️  Xóa ${toDelete.length} backup cũ...`);
      
      toDelete.forEach(backup => {
        fs.rmSync(backup.path, { recursive: true, force: true });
        console.log(`   ✓ Đã xóa: ${backup.name}`);
      });
    }
  } catch (err) {
    console.error('Lỗi khi xóa backup cũ:', err.message);
  }
}
