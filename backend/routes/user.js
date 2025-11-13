const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcrypt');

// Middleware để xác thực token (giả sử bạn đã có)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ message: 'Token không tồn tại' });
  
  const jwt = require('jsonwebtoken');
  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) return res.status(403).json({ message: 'Token không hợp lệ' });
    req.user = user;
    next();
  });
};

// GET /api/users/profile - Lấy thông tin người dùng
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id || req.user._id || req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }
    res.json({
      name: user.name,
      email: user.email
    });
  } catch (err) {
    console.error('Error fetching profile:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// PUT /api/users/profile - Cập nhật tên và email
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { name, email } = req.body;
    const userId = req.user.id || req.user._id || req.user.userId;

    // Validate input
    if (!name || !email) {
      return res.status(400).json({ message: 'Tên và email là bắt buộc' });
    }

    // Check if email already exists (excluding current user)
    const existingUser = await User.findOne({ email, _id: { $ne: userId } });
    if (existingUser) {
      return res.status(400).json({ message: 'Email đã được sử dụng' });
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { name, email },
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    // Update localStorage userName if name changed
    res.json({
      message: 'Cập nhật thông tin thành công',
      name: updatedUser.name,
      email: updatedUser.email
    });
  } catch (err) {
    console.error('Error updating profile:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// PUT /api/users/change-password - Đổi mật khẩu
router.put('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.user.id || req.user._id || req.user.userId;

    // Validate input
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'Mật khẩu mới không khớp' });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Mật khẩu hiện tại không đúng' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password
    user.password = hashedPassword;
    await user.save();

    res.json({ message: 'Đổi mật khẩu thành công' });
  } catch (err) {
    console.error('Error changing password:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// GET /api/users/create-test
// Creates or returns a test user
router.get('/create-test', async (req, res) => {
  try {
    let testUser = await User.findOne({ email: 'test@example.com' });
    if (!testUser) {
      testUser = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      });
      console.log('Created test user with ID:', testUser._id);
    } else {
      console.log('Using existing test user with ID:', testUser._id);
    }

    res.json({
      userId: testUser._id,
      name: testUser.name,
      email: testUser.email
    });
  } catch (err) {
    console.error('Error creating test user:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
