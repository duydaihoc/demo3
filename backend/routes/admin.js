const express = require('express');
const User = require('../models/User');
const router = express.Router();
const { auth } = require('../middleware/auth');
const Group = require('../models/Group');

// Middleware kiểm tra quyền admin
function isAdmin(req, res, next) {
  // Giả sử token gửi qua header Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'No token provided' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = require('jsonwebtoken').verify(token, 'secretKey');
    if (decoded.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

// Lấy tất cả người dùng
router.get('/users', isAdmin, async (req, res) => {
  try {
    const users = await User.find({}, '-password'); // Không trả về password
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching users' });
  }
});

// Sửa thông tin người dùng
router.put('/users/:id', isAdmin, async (req, res) => {
  try {
    const { name, email, role } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { name, email, role },
      { new: true, runValidators: true }
    );
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Error updating user' });
  }
});

// Xóa người dùng
router.delete('/users/:id', isAdmin, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting user' });
  }
});

// GET /api/admin/groups
// Requires auth and admin role. Returns all groups with owner info and members count.
router.get('/groups', auth, async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden: admin only' });
    }

    const groups = await Group.find({})
      .populate('owner', 'name email')
      .populate('members.user', 'name email')
      .sort({ createdAt: -1 });

    const out = groups.map(g => {
      const obj = g.toObject ? g.toObject() : g;
      // try parse color if stored as JSON string
      if (obj.color && typeof obj.color === 'string') {
        try { obj.color = JSON.parse(obj.color); } catch (e) { /* ignore */ }
      }
      const owner = (obj.owner && (obj.owner.name || obj.owner.email)) ? (obj.owner.name || obj.owner.email) : (obj.owner || null);
      const membersCount = Array.isArray(obj.members) ? obj.members.length : (obj.memberCount || 0);
      return {
        _id: obj._id || obj.id,
        name: obj.name || '',
        owner,
        membersCount,
        createdAt: obj.createdAt || obj.created || null,
        raw: obj
      };
    });

    res.json(out);
  } catch (err) {
    console.error('Admin groups error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
