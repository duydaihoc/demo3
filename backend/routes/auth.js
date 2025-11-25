const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth } = require('../middleware/auth'); // THÊM: import auth middleware
const { generateVerificationCode, sendVerificationEmail, sendPasswordResetEmail } = require('../config/email');
const router = express.Router();

// Register route - Gửi mã xác thực qua email
router.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  try {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        message: 'Email không đúng định dạng. Vui lòng nhập email hợp lệ.' 
      });
    }
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        message: 'Email này đã được sử dụng. Vui lòng sử dụng email khác hoặc đăng nhập nếu đây là tài khoản của bạn.',
        emailExists: true
      });
    }
    
    const userRole = role || 'user';
    const isAdmin = userRole === 'admin';
    
    // Hash mật khẩu
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Admin không cần verification
    if (isAdmin) {
      const newUser = new User({ 
        name, 
        email, 
        password: hashedPassword, 
        role: userRole,
        isVerified: true  // Admin tự động verified
      });
      
      await newUser.save();
      
      return res.status(201).json({ 
        message: 'Đăng ký Admin thành công!',
        requiresVerification: false
      });
    }
    
    // User thường cần verification
    const verificationCode = generateVerificationCode();
    const verificationCodeExpiry = new Date(Date.now() + 10 * 60 * 1000); // Hết hạn sau 10 phút
    
    // Tạo user mới nhưng chưa verified
    const newUser = new User({ 
      name, 
      email, 
      password: hashedPassword, 
      role: userRole,
      isVerified: false,
      verificationCode,
      verificationCodeExpiry
    });
    
    await newUser.save();
    
    // Gửi email xác thực
    const emailResult = await sendVerificationEmail(email, name, verificationCode);
    
    if (!emailResult.success) {
      // Xóa user vừa tạo nếu không gửi được email
      await User.findByIdAndDelete(newUser._id);
      
      console.error('❌ Failed to send verification email:');
      console.error('   Email:', email);
      console.error('   Error:', emailResult.error);
      console.error('   Response Code:', emailResult.responseCode);
      console.error('   Original Error:', emailResult.originalError);
      
      // Phân biệt loại lỗi
      // Error 550/551/553: Email không tồn tại (Gmail: "550 5.1.1 No such user")
      if (emailResult.responseCode === 550 || 
          emailResult.responseCode === 551 || 
          emailResult.responseCode === 553 ||
          (emailResult.error && (
            emailResult.error.includes('Invalid email') || 
            emailResult.error.includes('does not exist') ||
            emailResult.error.includes('No such user')
          ))) {
        console.log('🔴 Detected: Email không tồn tại (550 error)');
        return res.status(400).json({ 
          message: '❌ Email không chính xác hoặc email cá nhân của bạn không đúng. Vui lòng kiểm tra lại địa chỉ email. (Lỗi: Email không tồn tại)',
          emailError: true,
          errorCode: emailResult.responseCode || 550
        });
      }
      
      if (emailResult.error && (emailResult.error.includes('Invalid login') || emailResult.error.includes('Authentication'))) {
        return res.status(500).json({ 
          message: 'Hệ thống email chưa được cấu hình. Vui lòng liên hệ admin.',
          configError: true
        });
      }
      
      return res.status(500).json({ 
        message: 'Không thể gửi email xác thực. Vui lòng thử lại sau hoặc liên hệ admin.',
        emailError: true
      });
    }
    
    res.status(201).json({ 
      message: 'Đăng ký thành công! Vui lòng kiểm tra email để lấy mã xác thực.',
      requiresVerification: true,
      email: email
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Đăng ký thất bại', error: error.message });
  }
});

// Verify email route
router.post('/verify-email', async (req, res) => {
  const { email, code } = req.body;
  try {
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({ message: 'Người dùng không tồn tại' });
    }
    
    if (user.isVerified) {
      return res.status(400).json({ message: 'Email đã được xác thực' });
    }
    
    // Kiểm tra mã xác thực
    if (user.verificationCode !== code) {
      return res.status(400).json({ message: 'Mã xác thực không đúng' });
    }
    
    // Kiểm tra mã đã hết hạn chưa
    if (new Date() > user.verificationCodeExpiry) {
      return res.status(400).json({ message: 'Mã xác thực đã hết hạn' });
    }
    
    // Xác thực thành công
    user.isVerified = true;
    user.verificationCode = undefined;
    user.verificationCodeExpiry = undefined;
    await user.save();
    
    res.json({ 
      message: 'Xác thực email thành công! Bạn có thể đăng nhập ngay.',
      success: true
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ message: 'Xác thực thất bại', error: error.message });
  }
});

// Resend verification code
router.post('/resend-verification', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({ message: 'Người dùng không tồn tại' });
    }
    
    if (user.isVerified) {
      return res.status(400).json({ message: 'Email đã được xác thực' });
    }
    
    // Tạo mã xác thực mới
    const verificationCode = generateVerificationCode();
    const verificationCodeExpiry = new Date(Date.now() + 10 * 60 * 1000);
    
    user.verificationCode = verificationCode;
    user.verificationCodeExpiry = verificationCodeExpiry;
    await user.save();
    
    // Gửi email
    const emailResult = await sendVerificationEmail(email, user.name, verificationCode);
    
    if (!emailResult.success) {
      return res.status(500).json({ message: 'Không thể gửi email. Vui lòng thử lại.' });
    }
    
    res.json({ 
      message: 'Mã xác thực mới đã được gửi đến email của bạn.',
      success: true
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ message: 'Gửi lại mã thất bại', error: error.message });
  }
});

// Login route - Kiểm tra email verified
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng' });
    }
    
    // Bypass verification cho:
    // 1. Admin (role === 'admin')
    // 2. User đã verified (isVerified === true)
    // 3. User cũ (isVerified === false NHƯNG không có verificationCode - tạo trước khi có feature)
    
    const isOldUser = !user.isVerified && !user.verificationCode;
    const isAdmin = user.role === 'admin';
    const isVerified = user.isVerified === true;
    
    // Chỉ yêu cầu verification nếu: chưa verified + không phải admin + không phải user cũ
    if (!isVerified && !isAdmin && !isOldUser) {
      return res.status(403).json({ 
        message: 'Email chưa được xác thực. Vui lòng kiểm tra email và nhập mã xác thực.',
        requiresVerification: true,
        email: user.email
      });
    }
    
    const token = jwt.sign(
      { 
        id: user._id,
        email: user.email, 
        role: user.role 
      }, 
      'secretKey', 
      { expiresIn: '1h' }
    );
    res.json({ 
      token, 
      userId: user._id,
      name: user.name, 
      role: user.role,
      isNewUser: user.isNewUser,
      hasSeenTour: user.hasSeenTour,
      message: 'Đăng nhập thành công!' 
    });
  } catch (error) {
    res.status(500).json({ message: 'Login failed', error: error.message });
  }
});

// THÊM: Route để đánh dấu user đã xem tour
router.post('/mark-tour-seen', auth, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { 
        hasSeenTour: true,
        isNewUser: false // Không còn là user mới sau khi đã xem tour
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ 
      message: 'Tour marked as seen',
      hasSeenTour: user.hasSeenTour,
      isNewUser: user.isNewUser
    });
  } catch (error) {
    console.error('Error marking tour as seen:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Forgot password route - Gửi mã reset password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        message: 'Email không đúng định dạng. Vui lòng nhập email hợp lệ.' 
      });
    }
    
    const user = await User.findOne({ email });
    if (!user) {
      // Báo lỗi nếu email không tồn tại trong hệ thống
      return res.status(404).json({ 
        message: 'Email không tồn tại trong hệ thống. Vui lòng kiểm tra lại email hoặc đăng ký tài khoản mới.',
        emailNotFound: true
      });
    }
    
    // Tạo mã reset password
    const resetCode = generateVerificationCode();
    const resetCodeExpiry = new Date(Date.now() + 10 * 60 * 1000); // Hết hạn sau 10 phút
    
    // Lưu mã vào database
    user.resetPasswordCode = resetCode;
    user.resetPasswordCodeExpiry = resetCodeExpiry;
    await user.save();
    
    // Gửi email
    const emailResult = await sendPasswordResetEmail(email, user.name, resetCode);
    
    if (!emailResult.success) {
      // Xóa mã nếu không gửi được email
      user.resetPasswordCode = undefined;
      user.resetPasswordCodeExpiry = undefined;
      await user.save();
      
      if (emailResult.responseCode === 550 || 
          emailResult.responseCode === 551 || 
          emailResult.responseCode === 553 ||
          (emailResult.error && (
            emailResult.error.includes('Invalid email') || 
            emailResult.error.includes('does not exist') ||
            emailResult.error.includes('No such user')
          ))) {
        return res.status(400).json({ 
          message: 'Email không chính xác hoặc không thể nhận email. Vui lòng kiểm tra lại địa chỉ email.',
          emailError: true
        });
      }
      
      return res.status(500).json({ 
        message: 'Không thể gửi email. Vui lòng thử lại sau hoặc liên hệ admin.',
        emailError: true
      });
    }
    
    res.status(200).json({ 
      message: 'Mã đặt lại mật khẩu đã được gửi đến email của bạn. Vui lòng kiểm tra email.',
      success: true,
      email: email
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Lỗi server. Vui lòng thử lại sau.', error: error.message });
  }
});

// Reset password route - Xác thực mã và đặt mật khẩu mới
router.post('/reset-password', async (req, res) => {
  const { email, code, newPassword } = req.body;
  try {
    // Validate input
    if (!email || !code || !newPassword) {
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin.' });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Email không đúng định dạng.' });
    }
    
    // Validate password length
    if (!newPassword || newPassword.length < 1) {
      return res.status(400).json({ message: 'Mật khẩu không được để trống.' });
    }
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'Người dùng không tồn tại.' });
    }
    
    // Kiểm tra mã reset password
    if (!user.resetPasswordCode || user.resetPasswordCode !== code) {
      return res.status(400).json({ message: 'Mã xác thực không đúng.' });
    }
    
    // Kiểm tra mã đã hết hạn chưa
    if (!user.resetPasswordCodeExpiry || new Date() > user.resetPasswordCodeExpiry) {
      return res.status(400).json({ message: 'Mã xác thực đã hết hạn. Vui lòng yêu cầu mã mới.' });
    }
    
    // Hash mật khẩu mới
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Cập nhật mật khẩu và xóa mã reset
    user.password = hashedPassword;
    user.resetPasswordCode = undefined;
    user.resetPasswordCodeExpiry = undefined;
    await user.save();
    
    res.json({ 
      message: 'Đặt lại mật khẩu thành công! Bạn có thể đăng nhập với mật khẩu mới.',
      success: true
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Đặt lại mật khẩu thất bại', error: error.message });
  }
});

module.exports = router;
