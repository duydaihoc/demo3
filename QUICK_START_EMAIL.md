# 🚀 Hướng dẫn nhanh - Kích hoạt Email Verification

## ⚡ Bắt đầu ngay (5 phút)

### Bước 1: Tạo Gmail App Password

1. Mở: https://myaccount.google.com/security
2. Bật "Xác minh 2 bước" (nếu chưa bật)
3. Mở: https://myaccount.google.com/apppasswords
4. Chọn app: **Mail**, device: **Other** → đặt tên: **MoneyWise**
5. Click **Generate** → Copy mã 16 ký tự

### Bước 2: Tạo file .env

Trong thư mục `backend/`, tạo file `.env`:

```env
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=abcd efgh ijkl mnop
```

**Lưu ý:** Thay thế bằng email và App Password của bạn!

### Bước 3: Chạy ứng dụng

```bash
# Terminal 1 - Backend
cd backend
npm start

# Terminal 2 - Frontend  
cd frontend
npm start
```

### Bước 4: Test thử

1. Mở http://localhost:3000/register
2. Đăng ký tài khoản mới
3. Kiểm tra email → Nhận mã 6 số
4. Nhập mã → Hoàn tất!

## ✨ Tính năng mới

- ✅ Gửi mã OTP 6 số qua email
- ✅ Mã hết hạn sau 10 phút
- ✅ Có thể gửi lại mã
- ✅ Email template đẹp mắt
- ✅ Xác thực từ màn hình login
- ✅ UX mượt mà

## 📚 Tài liệu chi tiết

Xem file `EMAIL_VERIFICATION_IMPLEMENTATION.md` để biết thêm chi tiết về:
- Kiến trúc hệ thống
- API endpoints
- Troubleshooting
- Production deployment

## 🔍 Test cases

✅ **Happy path:**
- Đăng ký → Nhận email → Nhập mã → Đăng nhập

❌ **Error cases:**
- Nhập sai mã OTP
- Mã hết hạn
- Gửi lại mã OTP
- Login với email chưa verified

## 🐛 Xử lý lỗi

**"Invalid login" khi gửi email:**
→ Kiểm tra EMAIL_USER và EMAIL_PASSWORD trong .env

**Email không đến:**
→ Kiểm tra spam folder
→ Xem console log backend

**"Cannot find module 'nodemailer'":**
→ Chạy `npm install` trong thư mục backend

## 📧 Email Preview

Email sẽ có dạng:

```
🎉 Chào mừng đến với MoneyWise!

Xin chào [Tên],

Cảm ơn bạn đã đăng ký...

┌─────────────────┐
│  Mã xác thực:   │
│   1 2 3 4 5 6   │
│ (10 phút)       │
└─────────────────┘

⚠️ Không chia sẻ mã này!
```

## 🎯 Next Steps

Sau khi hoàn thành, bạn có thể:
1. Customize email template trong `backend/config/email.js`
2. Thay đổi thời gian hết hạn OTP
3. Thêm rate limiting
4. Deploy lên production

## 💡 Tips

- Sử dụng email riêng cho testing
- Không commit file .env
- Backup App Password
- Test cả spam folder

---

🎉 **Chúc bạn thành công!**






