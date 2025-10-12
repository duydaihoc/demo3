const express = require('express');
const router = express.Router();
const Family = require('../models/family');
const FamilyInvitation = require('../models/FamilyInvitation');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Middleware xác thực token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'secretKey', (err, user) => {
    if (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Token verification error:', err.message);
      }
      return res.status(401).json({ message: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Lấy thông tin gia đình của user hiện tại
router.get('/my-family', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    // Tìm gia đình mà user là thành viên
    const family = await Family.findOne({
      'members.user': userId
    }).populate('owner', 'name email').populate('members.user', 'name email');

    if (!family) {
      return res.status(404).json({ message: 'User is not a member of any family' });
    }

    res.json(family);
  } catch (error) {
    console.error('Error fetching user family:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Lấy tất cả gia đình mà user tham gia
router.get('/my-families', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    // Tìm tất cả gia đình mà user là thành viên
    const families = await Family.find({
      'members.user': userId
    }).populate('owner', 'name email').populate('members.user', 'name email').sort({ createdAt: -1 });

    // Phân loại gia đình đã tạo và tham gia
    const ownedFamilies = families.filter(family => 
      family.owner && (family.owner._id || family.owner).toString() === userId.toString()
    );
    
    const joinedFamilies = families.filter(family => 
      family.owner && (family.owner._id || family.owner).toString() !== userId.toString()
    );

    res.json({
      owned: ownedFamilies,
      joined: joinedFamilies,
      total: families.length
    });
  } catch (error) {
    console.error('Error fetching user families:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Tạo gia đình mới - bỏ kiểm tra đã có gia đình
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { name, description, color } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Tên gia đình là bắt buộc' });
    }

    // Tạo gia đình mới
    const newFamily = new Family({
      name: name.trim(),
      description: description?.trim() || '',
      owner: userId,
      members: [{
        user: userId,
        email: req.user.email,
        role: 'owner'
      }],
      color: color ? {
        colors: [color],
        direction: '135deg'
      } : {
        colors: ['#10b981', '#3b82f6'],
        direction: '135deg'
      }
    });

    await newFamily.save();

    // Populate thông tin owner và members
    await newFamily.populate('owner', 'name email');
    await newFamily.populate('members.user', 'name email');

    res.status(201).json(newFamily);
  } catch (error) {
    console.error('Error creating family:', error);
    if (error.code === 11000) {
      res.status(400).json({ message: 'Tên gia đình đã tồn tại' });
    } else {
      res.status(500).json({ message: 'Lỗi máy chủ' });
    }
  }
});

// Lấy danh sách lời mời gia đình
router.get('/invitations', authenticateToken, async (req, res) => {
  try {
    const userEmail = req.user.email;

    const invitations = await FamilyInvitation.find({
      email: userEmail,
      status: 'pending',
      expiresAt: { $gt: new Date() }
    }).populate('family', 'name').populate('invitedBy', 'name email').sort({ createdAt: -1 });

    res.json(invitations);
  } catch (error) {
    console.error('Error fetching invitations:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Tham gia gia đình từ lời mời - bỏ kiểm tra đã có gia đình
router.post('/join/:invitationId', authenticateToken, async (req, res) => {
  try {
    const { invitationId } = req.params;
    const userId = req.user.id || req.user._id;
    const userEmail = req.user.email;

    // Tìm lời mời
    const invitation = await FamilyInvitation.findOne({
      _id: invitationId,
      email: userEmail,
      status: 'pending',
      expiresAt: { $gt: new Date() }
    });

    if (!invitation) {
      return res.status(404).json({ message: 'Lời mời không tìm thấy hoặc đã hết hạn' });
    }

    // Tìm gia đình
    const family = await Family.findById(invitation.family);
    if (!family) {
      return res.status(404).json({ message: 'Gia đình không tìm thấy' });
    }

    // Kiểm tra xem user đã là thành viên chưa
    const isAlreadyMember = family.members.some(m => m.user && m.user.toString() === userId.toString());
    if (isAlreadyMember) {
      return res.status(400).json({ message: 'Bạn đã là thành viên của gia đình này' });
    }

    // Thêm user vào danh sách thành viên
    family.members.push({
      user: userId,
      email: userEmail,
      role: 'member'
    });

    await family.save();

    // Cập nhật trạng thái lời mời
    invitation.status = 'accepted';
    invitation.respondedAt = new Date();
    await invitation.save();

    // Populate thông tin gia đình
    await family.populate('owner', 'name email');
    await family.populate('members.user', 'name email');

    res.json(family);
  } catch (error) {
    console.error('Error joining family:', error);
    res.status(500).json({ message: 'Lỗi máy chủ' });
  }
});

// Từ chối lời mời
router.post('/invitations/:invitationId/decline', authenticateToken, async (req, res) => {
  try {
    const { invitationId } = req.params;
    const userEmail = req.user.email;

    const invitation = await FamilyInvitation.findOneAndUpdate(
      {
        _id: invitationId,
        email: userEmail,
        status: 'pending'
      },
      {
        status: 'declined',
        respondedAt: new Date()
      },
      { new: true }
    );

    if (!invitation) {
      return res.status(404).json({ message: 'Invitation not found' });
    }

    res.json({ message: 'Invitation declined' });
  } catch (error) {
    console.error('Error declining invitation:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Mời thành viên vào gia đình
router.post('/:familyId/invite', authenticateToken, async (req, res) => {
  try {
    const { familyId } = req.params;
    const { email } = req.body;
    const userId = req.user.id || req.user._id;

    if (!email || !email.trim()) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Kiểm tra quyền owner
    const family = await Family.findOne({
      _id: familyId,
      owner: userId
    });

    if (!family) {
      return res.status(403).json({ message: 'Not authorized to invite members' });
    }

    // Kiểm tra xem email đã là thành viên chưa
    const isAlreadyMember = family.members.some(m =>
      (m.user && m.email === email.toLowerCase()) ||
      (m.email && m.email === email.toLowerCase())
    );

    if (isAlreadyMember) {
      return res.status(400).json({ message: 'User is already a member of this family' });
    }

    // Tạo token cho lời mời
    const token = crypto.randomBytes(32).toString('hex');

    // Tạo lời mời
    const invitation = new FamilyInvitation({
      family: familyId,
      invitedBy: userId,
      email: email.toLowerCase().trim(),
      token
    });

    await invitation.save();

    // TODO: Gửi email mời (có thể implement sau)

    res.json({ message: 'Invitation sent successfully' });
  } catch (error) {
    console.error('Error sending invitation:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Lấy thông tin gia đình cụ thể
router.get('/:familyId', authenticateToken, async (req, res) => {
  try {
    const { familyId } = req.params;
    const userId = req.user.id || req.user._id;

    // Tìm gia đình và kiểm tra quyền truy cập
    const family = await Family.findOne({
      _id: familyId,
      'members.user': userId
    }).populate('owner', 'name email').populate('members.user', 'name email');

    if (!family) {
      return res.status(404).json({ message: 'Gia đình không tìm thấy hoặc bạn không có quyền truy cập' });
    }

    res.json(family);
  } catch (error) {
    console.error('Error fetching family:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
