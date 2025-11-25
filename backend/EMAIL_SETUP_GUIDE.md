# Hướng dẫn cấu hình Email cho tính năng xác thực

## Tổng quan
Hệ thống sử dụng nodemailer để gửi email xác thực khi người dùng đăng ký. Mã OTP 6 số sẽ được gửi đến email người dùng và có hiệu lực trong 10 phút.

## Cấu hình sử dụng Gmail (Khuyến nghị)

### Bước 1: Bật xác thực 2 bước (2FA)
1. Truy cập: https://myaccount.google.com/security
2. Tìm "Xác minh 2 bước" và bật tính năng này

### Bước 2: Tạo App Password
1. Truy cập: https://myaccount.google.com/apppasswords
2. Chọn "Mail" và "Other (Custom name)"
3. Đặt tên (ví dụ: "MoneyWise App")
4. Click "Generate"
5. Copy mã 16 ký tự được tạo ra

### Bước 3: Cấu hình biến môi trường
Tạo file `.env` trong thư mục `backend` với nội dung:

```env
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-16-character-app-password
```

**Lưu ý:** 
- Thay `your-email@gmail.com` bằng email Gmail của bạn
- Thay `your-16-character-app-password` bằng App Password vừa tạo
- KHÔNG dùng mật khẩu Gmail thông thường!
- **CHỈ CẦN 2 DÒNG NÀY** nếu dùng Gmail!

## Cấu hình sử dụng SMTP khác (TÙY CHỌN)

> ⚠️ **Lưu ý:** Phần này chỉ cần nếu bạn KHÔNG dùng Gmail. Chọn 1 trong các phương pháp dưới đây thay cho Gmail.

### Outlook/Hotmail
```env
EMAIL_SERVICE=hotmail
EMAIL_USER=your-email@outlook.com
EMAIL_PASSWORD=your-password
```

### SendGrid
```env
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USER=apikey
EMAIL_PASSWORD=your-sendgrid-api-key
```

### Custom SMTP
```env
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_USER=your-email@example.com
EMAIL_PASSWORD=your-password
```

## Cách kiểm tra

1. Khởi động server: `npm start`
2. Đăng ký tài khoản mới
3. Kiểm tra email để nhận mã OTP
4. Nhập mã OTP để xác thực

## Xử lý lỗi thường gặp

### Lỗi: "Invalid login"
- Kiểm tra EMAIL_USER và EMAIL_PASSWORD
- Đảm bảo đã bật 2FA và tạo App Password

### Lỗi: "Connection timeout"
- Kiểm tra kết nối internet
- Thử port khác (465 thay vì 587)

### Email không được gửi
- Kiểm tra spam folder
- Kiểm tra console log để xem lỗi chi tiết
- Xác nhận Gmail không bị giới hạn gửi email

## Tùy chỉnh template email

File: `backend/config/email.js`

Bạn có thể tùy chỉnh:
- Thời gian hết hạn mã OTP (mặc định: 10 phút)
- Template HTML của email
- Thông tin người gửi

## Bảo mật

⚠️ **Quan trọng:**
- KHÔNG commit file `.env` lên Git
- KHÔNG chia sẻ App Password
- Xóa App Password khi không dùng nữa
- Sử dụng biến môi trường trên production

## Môi trường Production

Với Heroku:
```bash
heroku config:set EMAIL_USER=your-email@gmail.com
heroku config:set EMAIL_PASSWORD=your-app-password
```

Với Vercel/Netlify:
- Thêm biến môi trường trong dashboard
- Redeploy sau khi thêm biến

## Liên hệ hỗ trợ

Nếu gặp vấn đề, kiểm tra:
1. Console log trong terminal
2. Network tab trong browser DevTools
3. Email service dashboard (nếu dùng SendGrid, etc.)

