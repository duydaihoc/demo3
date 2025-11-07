const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth } = require('../middleware/auth'); // THÊM: import auth middleware
const router = express.Router();

// Register route
router.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ name, email, password: hashedPassword, role: role || 'user' });
    await newUser.save();
    res.status(201).json({ message: 'Đăng ký thành công!', name: newUser.name, role: newUser.role });
  } catch (error) {
    res.status(500).json({ message: 'Registration failed', error: error.message });
  }
});

// Login route
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'đăng nhập lại Email đã sai hoặc mật khẩu' });
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
      isNewUser: user.isNewUser, // THÊM: gửi flag isNewUser
      hasSeenTour: user.hasSeenTour, // THÊM: gửi flag hasSeenTour
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

module.exports = router;
