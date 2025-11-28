# Triển khai xác thực Email khi đăng ký

## Tổng quan
Hệ thống đã được cập nhật để yêu cầu xác thực email khi người dùng đăng ký. Quy trình như sau:

1. ✅ Người dùng điền form đăng ký
2. ✅ Hệ thống tạo tài khoản và gửi mã OTP 6 số qua email
3. ✅ Người dùng nhập mã OTP để xác thực
4. ✅ Sau khi xác thực thành công, người dùng có thể đăng nhập

## Các file đã được thay đổi

### Backend

#### 1. `backend/models/User.js`
**Thêm các trường mới:**
- `isVerified`: Boolean - Trạng thái xác thực email
- `verificationCode`: String - Mã OTP 6 số
- `verificationCodeExpiry`: Date - Thời gian hết hạn (10 phút)

#### 2. `backend/config/email.js` (MỚI)
**Chức năng:**
- `generateVerificationCode()`: Tạo mã OTP 6 số ngẫu nhiên
- `sendVerificationEmail()`: Gửi email với template HTML đẹp
- Cấu hình nodemailer với Gmail

#### 3. `backend/routes/auth.js`
**Các route đã cập nhật:**

**POST `/api/auth/register`**
- Tạo tài khoản với `isVerified: false`
- Tạo và lưu mã xác thực
- Gửi email chứa mã OTP
- Trả về `requiresVerification: true`

**POST `/api/auth/verify-email`** (MỚI)
- Body: `{ email, code }`
- Kiểm tra mã OTP và thời gian hết hạn
- Đánh dấu user là verified
- Xóa mã xác thực sau khi verify

**POST `/api/auth/resend-verification`** (MỚI)
- Body: `{ email }`
- Tạo mã OTP mới
- Gửi lại email xác thực

**POST `/api/auth/login`**
- Kiểm tra `isVerified` trước khi cho phép login
- Nếu chưa verified, trả về `requiresVerification: true`

### Frontend

#### 4. `frontend/src/auth/Register.js`
**Thêm states:**
- `showVerification`: Hiển thị form nhập mã OTP
- `verificationCode`: Mã OTP người dùng nhập
- `registeredEmail`: Email đã đăng ký

**Thêm functions:**
- `handleVerification()`: Xử lý xác thực mã OTP
- `handleResendCode()`: Gửi lại mã OTP

**UI Changes:**
- Form đăng ký → Form nhập mã OTP (conditional rendering)
- Input 6 số với validation
- Nút "Gửi lại mã"
- Nút "Quay lại đăng ký"

#### 5. `frontend/src/auth/Login.js`
**Thêm states:**
- `showVerification`: Hiển thị form nhập mã OTP
- `verificationCode`: Mã OTP
- `unverifiedEmail`: Email chưa verified

**Thêm functions:**
- `handleVerification()`: Xác thực từ màn hình login
- `handleResendCode()`: Gửi lại mã

**Logic:**
- Nếu login với email chưa verified → Chuyển sang form xác thực
- Sau khi verify xong → Quay lại form login

#### 6. `frontend/src/auth/Register.css`
**Thêm styles:**
- `.verification-info`: Box thông tin email
- `.email-highlight`: Highlight email address
- `.verification-input`: Input 6 số với letter-spacing
- `.resend-section`: Section gửi lại mã
- `.btn-link`: Button style cho các link
- `.back-section`: Section quay lại

#### 7. `frontend/src/auth/Login.css`
**Thêm styles:** (Giống Register.css)
- Các style cho verification UI

#### 8. `backend/EMAIL_SETUP_GUIDE.md` (MỚI)
Hướng dẫn chi tiết cấu hình email service

## Cấu hình cần thiết

### 1. Cài đặt dependencies
Nodemailer đã có trong package.json, không cần cài thêm.

### 2. Cấu hình Email Service

#### Tạo file `.env` trong thư mục `backend`:
```env
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
```

#### Lấy Gmail App Password:
1. Truy cập: https://myaccount.google.com/security
2. Bật xác thực 2 bước (2FA)
3. Truy cập: https://myaccount.google.com/apppasswords
4. Tạo App Password cho ứng dụng
5. Copy mã 16 ký tự

Xem chi tiết trong file `backend/EMAIL_SETUP_GUIDE.md`

### 3. Load environment variables

Thêm vào đầu `backend/server.js` (nếu chưa có):
```javascript
require('dotenv').config();
```

## Cách sử dụng

### Người dùng đăng ký mới:
1. Điền form đăng ký → Submit
2. Màn hình chuyển sang form nhập mã OTP
3. Kiểm tra email để lấy mã 6 số
4. Nhập mã → Xác thực
5. Chuyển sang trang login
6. Đăng nhập bình thường

### Người dùng quên xác thực:
1. Thử đăng nhập
2. Hệ thống phát hiện email chưa verified
3. Tự động hiển thị form nhập mã OTP
4. Nhập mã hoặc gửi lại mã mới
5. Sau khi verify → Đăng nhập lại

## Tính năng

✅ Mã OTP 6 số ngẫu nhiên
✅ Hết hạn sau 10 phút
✅ Email template đẹp với HTML/CSS
✅ Gửi lại mã OTP
✅ Validation input 6 số
✅ UX mượt mà với conditional rendering
✅ Xử lý lỗi đầy đủ
✅ Responsive design
✅ Loading states
✅ Success/Error notifications

## API Endpoints

### 1. Đăng ký
```
POST /api/auth/register
Body: { name, email, password }
Response: { 
  message, 
  requiresVerification: true,
  email 
}
```

### 2. Xác thực email
```
POST /api/auth/verify-email
Body: { email, code }
Response: { 
  message, 
  success: true 
}
```

### 3. Gửi lại mã
```
POST /api/auth/resend-verification
Body: { email }
Response: { 
  message, 
  success: true 
}
```

### 4. Đăng nhập
```
POST /api/auth/login
Body: { email, password }
Response: 
  - Nếu chưa verified: { 
      message, 
      requiresVerification: true,
      email 
    }
  - Nếu đã verified: { 
      token, 
      userId, 
      name, 
      role, 
      message 
    }
```

## Kiểm tra

### Test flow hoàn chỉnh:
1. Start backend: `cd backend && npm start`
2. Start frontend: `cd frontend && npm start`
3. Đăng ký tài khoản mới
4. Kiểm tra email
5. Nhập mã OTP
6. Đăng nhập

### Test edge cases:
- ❌ Nhập sai mã OTP
- ❌ Mã OTP hết hạn (đợi 10 phút)
- ✅ Gửi lại mã
- ✅ Quay lại đăng ký
- ❌ Login với email chưa verify
- ✅ Verify từ login screen

## Bảo mật

🔒 **Các biện pháp bảo mật:**
- Mã OTP hết hạn sau 10 phút
- Mã được xóa sau khi verify thành công
- Email chỉ gửi đến địa chỉ đã đăng ký
- Validation cả frontend và backend
- Rate limiting có thể thêm để chống spam

## Lưu ý Production

⚠️ **Trước khi deploy:**
1. Thêm biến môi trường EMAIL_USER và EMAIL_PASSWORD
2. Sử dụng email service chuyên nghiệp (SendGrid, AWS SES)
3. Thêm rate limiting cho các endpoint
4. Monitor email delivery rate
5. Xử lý queue cho email (nếu traffic cao)
6. Thêm retry logic cho email failures

## Troubleshooting

**Email không được gửi:**
- Kiểm tra .env file
- Kiểm tra App Password
- Xem console log lỗi
- Kiểm tra spam folder

**Mã OTP không đúng:**
- Đảm bảo không có khoảng trắng
- Kiểm tra chưa hết hạn
- Thử gửi lại mã mới

**Cannot find module 'nodemailer':**
- Chạy `npm install` trong backend

## Next Steps (Optional)

Các cải tiến có thể thêm:
- 📧 Email forgot password với OTP
- 📧 Email thông báo login từ thiết bị mới
- 📧 Email hàng tuần tổng kết chi tiêu
- 🔐 Rate limiting cho resend OTP
- 📊 Dashboard admin xem email delivery status
- 🎨 Customizable email templates










