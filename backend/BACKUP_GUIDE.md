# 📦 Hướng dẫn Backup & Restore MongoDB

## 🚀 Cài đặt MongoDB Database Tools

### Windows
1. Tải về: https://www.mongodb.com/try/download/database-tools
2. Giải nén và thêm vào PATH
3. Kiểm tra: `mongodump --version`

### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install mongodb-database-tools
```

### macOS
```bash
brew install mongodb-database-tools
```

---

## 📝 Cách 1: Sử dụng npm scripts (Khuyến nghị)

### Tạo backup
```bash
npm run backup
```

**Kết quả:**
- Tạo folder `backups/` nếu chưa có
- Backup toàn bộ database
- Tự động xóa backup cũ (giữ lại 7 backup gần nhất)
- Hiển thị thống kê kích thước

**Ví dụ output:**
```
🚀 Bắt đầu backup MongoDB...
📦 Database: expense_tracker
📁 Đường dẫn: D:\demo3\backend\backups\backup_expense_tracker_2025-10-21T07-30-00
✅ Backup thành công!
💾 Kích thước: 12.5 MB
📄 Số files: 48
```

### Khôi phục backup
```bash
npm run restore
```

**Hỏi chọn backup:**
```
📦 Danh sách backups:

1. backup_expense_tracker_2025-10-21T07-30-00
   📅 21/10/2025, 14:30:00

2. backup_expense_tracker_2025-10-20T10-15-00
   📅 20/10/2025, 17:15:00

🔢 Chọn backup (1-2):
```

**Hoặc restore trực tiếp:**
```bash
npm run restore 1
```

---

## 📝 Cách 2: Sử dụng API (Admin only)

### Lấy danh sách backups
```http
GET /api/backup/list
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
  "backups": [
    {
      "name": "backup_expense_tracker_2025-10-21T07-30-00",
      "size": 13107200,
      "createdAt": "2025-10-21T07:30:00.000Z",
      "files": 48
    }
  ]
}
```

### Tạo backup mới
```http
POST /api/backup/create
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
  "message": "Backup thành công",
  "backup": {
    "name": "backup_expense_tracker_2025-10-21T07-30-00",
    "path": "D:\\demo3\\backend\\backups\\backup_expense_tracker_2025-10-21T07-30-00",
    "size": 13107200,
    "files": 48,
    "createdAt": "2025-10-21T07:30:00.000Z"
  }
}
```

### Xóa backup
```http
DELETE /api/backup/backup_expense_tracker_2025-10-21T07-30-00
Authorization: Bearer <admin_token>
```

---

## 📝 Cách 3: Lệnh thủ công

### Backup thủ công
```bash
mongodump --uri="mongodb://localhost:27017/expense_tracker" --out="./backups/manual_backup"
```

### Restore thủ công
```bash
mongorestore --uri="mongodb://localhost:27017/expense_tracker" --drop "./backups/manual_backup/expense_tracker"
```

---

## ⏰ Tự động backup theo lịch

### Windows Task Scheduler
1. Mở Task Scheduler
2. Create Task → Actions → New
3. Program: `npm`
4. Arguments: `run backup`
5. Start in: `D:\demo3\backend`
6. Triggers: Hàng ngày lúc 2:00 AM

### Linux Cron Job
```bash
# Mở crontab
crontab -e

# Thêm dòng này (backup mỗi ngày 2:00 AM)
0 2 * * * cd /path/to/demo3/backend && npm run backup >> /var/log/mongodb-backup.log 2>&1
```

### macOS Launchd
Tạo file `~/Library/LaunchAgents/com.mongodb.backup.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.mongodb.backup</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/npm</string>
        <string>run</string>
        <string>backup</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/path/to/demo3/backend</string>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>2</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.mongodb.backup.plist
```

---

## 📂 Cấu trúc folder backup

```
backend/
├── backups/
│   ├── backup_expense_tracker_2025-10-21T07-30-00/
│   │   └── expense_tracker/
│   │       ├── users.bson
│   │       ├── users.metadata.json
│   │       ├── transactions.bson
│   │       ├── transactions.metadata.json
│   │       └── ...
│   ├── backup_expense_tracker_2025-10-20T10-15-00/
│   └── backup_expense_tracker_2025-10-19T08-00-00/
└── scripts/
    ├── backup-mongodb.js
    └── restore-mongodb.js
```

---

## ⚙️ Cấu hình

### Số lượng backup giữ lại
**Script:** Sửa trong `scripts/backup-mongodb.js`
```javascript
cleanOldBackups(BACKUP_DIR, 7); // Giữ 7 backup
```

**API:** Sửa trong `routes/backup.js`
```javascript
cleanOldBackups(BACKUP_DIR, 10); // Giữ 10 backup
```

### Thay đổi đường dẫn backup
Sửa trong scripts:
```javascript
const BACKUP_DIR = path.join(__dirname, '..', 'my-custom-backups');
```

---

## 🔒 Bảo mật

1. ✅ **API backup chỉ cho admin**
   - Middleware `requireAdmin` đã được áp dụng
   
2. ✅ **Gitignore backups**
   - Thêm `/backups/` vào `.gitignore`
   
3. ✅ **Lưu backup ở nơi an toàn**
   - Cloud storage (Google Drive, Dropbox)
   - External drive
   - Network storage (NAS)

---

## 🆘 Troubleshooting

### Lỗi: "mongodump: command not found"
**Giải pháp:** Cài đặt MongoDB Database Tools (xem phần đầu)

### Lỗi: "Failed to connect"
**Giải pháp:** 
- Kiểm tra MongoDB server đang chạy
- Kiểm tra MONGO_URI trong `.env`

### Backup quá lớn
**Giải pháp:**
- Xóa dữ liệu test cũ
- Giảm số lượng backup giữ lại
- Nén backup (zip/tar.gz)

---

## 💡 Best Practices

1. ✅ **Backup thường xuyên**
   - Tối thiểu: 1 lần/ngày
   - Khuyến nghị: Trước mỗi deployment

2. ✅ **Test restore định kỳ**
   - Đảm bảo backup hoạt động
   - 1 lần/tháng

3. ✅ **Multiple backup locations**
   - Local + Cloud
   - Tối thiểu 3-2-1 rule:
     - 3 bản backup
     - 2 loại storage khác nhau
     - 1 bản offsite

4. ✅ **Monitor backup**
   - Log kết quả backup
   - Alert nếu backup fail

---

## 📊 Ví dụ production script

```javascript
// backup-production.js
const { exec } = require('child_process');
const AWS = require('aws-sdk');

// 1. Backup local
exec('npm run backup', (err) => {
  if (err) {
    // Send alert email/Slack
    return;
  }
  
  // 2. Upload to S3
  const s3 = new AWS.S3();
  s3.upload({
    Bucket: 'my-backups',
    Key: `backup-${Date.now()}.tar.gz`,
    Body: fs.createReadStream('./backups/latest.tar.gz')
  }, (err) => {
    if (err) {
      // Send alert
    } else {
      // Success notification
    }
  });
});
```

---

Cần thêm hỗ trợ? Tham khảo: https://www.mongodb.com/docs/database-tools/
