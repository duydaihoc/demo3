const express = require('express');
const router = express.Router();
const Support = require('../models/Support');
const { auth } = require('../middleware/auth');

// POST /api/support - Tạo hỗ trợ mới
router.post('/', async (req, res) => {
  try {
    const { email, name, message, personalInfo } = req.body;

    // Validation
    if (!email || !email.trim()) {
      return res.status(400).json({ message: 'Email là bắt buộc' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ message: 'Email không hợp lệ' });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Tên người dùng là bắt buộc' });
    }

    // Lấy userId từ token nếu có
    let userId = null;
    try {
      const authHeader = req.headers.authorization;
      if (authHeader) {
        const token = authHeader.split(' ')[1];
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, 'secretKey');
        userId = decoded.id;
      }
    } catch (err) {
      // Không có token hoặc token không hợp lệ - không sao, vẫn cho phép hỗ trợ
    }

    // Tạo hỗ trợ mới
    const { type, featureCategories } = req.body;
    const support = new Support({
      user: userId,
      email: email.trim(),
      name: name.trim(),
      message: message ? message.trim() : '',
      type: type || 'support',
      featureCategories: featureCategories || [],
      personalInfo: personalInfo || {}
    });

    await support.save();

    res.status(201).json({
      success: true,
      message: 'Cảm ơn bạn đã hỗ trợ! Chúng tôi sẽ liên hệ với bạn sớm nhất có thể.',
      support: support
    });
  } catch (error) {
    console.error('Support route error:', error);
    res.status(500).json({
      success: false,
      message: 'Đã xảy ra lỗi. Vui lòng thử lại sau.',
    });
  }
});

// GET /api/support - Lấy danh sách hỗ trợ (chỉ admin)
router.get('/', auth, async (req, res) => {
  try {
    // Kiểm tra quyền admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Chỉ admin mới có quyền xem hỗ trợ' });
    }

    const { page = 1, limit = 20, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Tạo query
    const query = {};
    if (status) {
      query.status = status;
    }

    // Lấy hỗ trợ với populate user
    const supports = await Support.find(query)
      .populate('user', 'name email')
      .populate('reviewedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Support.countDocuments(query);

    res.json({
      success: true,
      data: supports,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('Get supports error:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
});

// PUT /api/support/:id - Cập nhật trạng thái hỗ trợ (chỉ admin)
router.put('/:id', auth, async (req, res) => {
  try {
    // Kiểm tra quyền admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Chỉ admin mới có quyền cập nhật hỗ trợ' });
    }

    const { status } = req.body;

    const support = await Support.findById(req.params.id);
    if (!support) {
      return res.status(404).json({ message: 'Không tìm thấy hỗ trợ' });
    }

    if (status) {
      support.status = status;
      if (status !== 'pending') {
        support.reviewedAt = new Date();
        support.reviewedBy = req.user.id;
      }
    }

    await support.save();

    res.json({
      success: true,
      message: 'Cập nhật trạng thái thành công',
      support: support
    });
  } catch (error) {
    console.error('Update support error:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
});

module.exports = router;

