const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Cấu hình restore
const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/expense_tracker';

// Lấy database name từ URI
const dbName = MONGO_URI.split('/').pop().split('?')[0];

// Kiểm tra folder backups
if (!fs.existsSync(BACKUP_DIR)) {
  console.error('❌ Không tìm thấy folder backups!');
  console.error(`📁 Đường dẫn: ${BACKUP_DIR}`);
  process.exit(1);
}

// Lấy danh sách backups
const backups = fs.readdirSync(BACKUP_DIR)
  .filter(file => file.startsWith('backup_'))
  .map(file => ({
    name: file,
    path: path.join(BACKUP_DIR, file),
    time: fs.statSync(path.join(BACKUP_DIR, file)).mtime
  }))
  .sort((a, b) => b.time - a.time);

if (backups.length === 0) {
  console.error('❌ Không có backup nào!');
  console.error('💡 Chạy: npm run backup để tạo backup');
  process.exit(1);
}

// Hiển thị danh sách backups
console.log('📦 Danh sách backups:\n');
backups.forEach((backup, index) => {
  const date = backup.time.toLocaleString('vi-VN');
  console.log(`${index + 1}. ${backup.name}`);
  console.log(`   📅 ${date}\n`);
});

// Lấy tham số từ command line hoặc prompt
const backupIndex = process.argv[2] ? parseInt(process.argv[2]) - 1 : null;

if (backupIndex !== null && backupIndex >= 0 && backupIndex < backups.length) {
  // Restore ngay nếu có tham số
  restoreBackup(backups[backupIndex]);
} else {
  // Hỏi user chọn backup
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question(`\n🔢 Chọn backup (1-${backups.length}) hoặc nhấn Ctrl+C để hủy: `, (answer) => {
    const index = parseInt(answer) - 1;
    rl.close();

    if (isNaN(index) || index < 0 || index >= backups.length) {
      console.error('❌ Lựa chọn không hợp lệ!');
      process.exit(1);
    }

    restoreBackup(backups[index]);
  });
}

function restoreBackup(backup) {
  console.log(`\n🔄 Bắt đầu restore từ: ${backup.name}`);
  console.log(`⚠️  Cảnh báo: Dữ liệu hiện tại sẽ bị ghi đè!\n`);

  const backupDbPath = path.join(backup.path, dbName);
  
  // Kiểm tra backup có tồn tại không
  if (!fs.existsSync(backupDbPath)) {
    console.error('❌ Không tìm thấy dữ liệu backup!');
    console.error(`📁 Đường dẫn: ${backupDbPath}`);
    process.exit(1);
  }

  // Lệnh mongorestore (drop database trước khi restore)
  const command = `mongorestore --uri="${MONGO_URI}" --drop "${backupDbPath}"`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Lỗi khi restore:', error.message);
      console.error('💡 Đảm bảo MongoDB tools đã được cài đặt');
      return;
    }

    if (stderr) {
      console.log('⚠️  Warning:', stderr);
    }

    console.log('\n✅ Restore thành công!');
    console.log(`📦 Database: ${dbName}`);
    console.log(`📁 Từ: ${backup.name}`);
    console.log(`📅 Ngày tạo: ${backup.time.toLocaleString('vi-VN')}`);
  });
}
