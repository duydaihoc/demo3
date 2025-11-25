# Test Email Error Handling

## 🧪 Đã cập nhật

✅ Bắt error 550/551/553 (email không tồn tại)
✅ Message rõ ràng: "Email không chính xác hoặc email cá nhân của bạn không đúng"
✅ Tự động reset email field để user nhập lại
✅ Xóa user khỏi database (rollback)

## 🔄 Restart Server

**QUAN TRỌNG:** Bạn cần restart server để áp dụng thay đổi!

```bash
# Dừng server (Ctrl+C) rồi chạy lại
cd backend
npm start
```

## 📝 Test Case

### Test 1: Email không tồn tại

**Input:**
```
Email: duylovemon5@gmail.com (hoặc bất kỳ email fake nào)
```

**Expected Result:**
```
❌ "Email không chính xác hoặc email cá nhân của bạn không đúng. 
    Vui lòng kiểm tra lại địa chỉ email."
```

**Backend Console sẽ hiển thị:**
```
❌ Failed to send verification email:
   Email: duylovemon5@gmail.com
   Error: Invalid email: Email address does not exist or cannot receive messages
   Response Code: 550
```

**Database:**
- User bị XÓA (rollback)
- Có thể đăng ký lại với email khác

### Test 2: Email đúng

**Input:**
```
Email: your-real-email@gmail.com
```

**Expected Result:**
```
✅ "Đăng ký thành công! Vui lòng kiểm tra email để lấy mã xác thực."
→ Chuyển sang form nhập mã OTP
→ Check email → Nhận được mã 6 số
```

## 🔍 Debug

Nếu vẫn không hiển thị đúng message, check:

### 1. Backend Console
```
❌ Failed to send verification email:
   Email: xxx
   Error: ???
   Response Code: ???
```

### 2. Browser Network Tab
- Mở DevTools (F12)
- Tab Network
- Đăng ký với email fake
- Click vào request `/api/auth/register`
- Xem Response:
```json
{
  "message": "Email không chính xác...",
  "emailError": true
}
```

### 3. Frontend Console
Xem có error JavaScript không

## 📱 Kết quả mong đợi trên màn hình

Khi đăng ký với **email không tồn tại** (`duylovemon5@gmail.com`):

```
┌─────────────────────────────────────────┐
│  ❌ Email không chính xác hoặc email   │
│     cá nhân của bạn không đúng.        │
│     Vui lòng kiểm tra lại địa chỉ     │
│     email.                              │
└─────────────────────────────────────────┘

Input Email: [                ] ← Tự động xóa để nhập lại
```

## ✅ Checklist

Trước khi test:
- [ ] Restart backend server
- [ ] Refresh trang frontend (Ctrl+R)
- [ ] Mở DevTools (F12) để xem Network/Console
- [ ] Đảm bảo đã config EMAIL_USER/PASSWORD trong .env

Khi test:
- [ ] Thử email fake → Thấy message lỗi rõ ràng
- [ ] Email field tự động reset
- [ ] Thử email thật → Nhận được OTP
- [ ] Check backend console có log error

## 🎯 Message Final

**Hiện tại:** 
```
"Email không chính xác hoặc email cá nhân của bạn không đúng. 
 Vui lòng kiểm tra lại địa chỉ email."
```

**Nếu muốn thay đổi message:**

Sửa trong `backend/routes/auth.js` (dòng ~52):
```javascript
message: 'Nội dung bạn muốn hiển thị ở đây',
```

## 🐛 Troubleshooting

**Vấn đề:** Message không hiển thị

**Giải pháp:**
1. Restart server backend
2. Hard refresh frontend (Ctrl+Shift+R)
3. Check DevTools Network tab
4. Check backend console log

**Vấn đề:** Email thật cũng báo lỗi

**Giải pháp:**
1. Check .env có đúng không
2. Thử email khác
3. Check Gmail App Password còn hợp lệ
4. Xem backend console log chi tiết

---

**Sau khi restart server, hãy test lại!** 🚀


