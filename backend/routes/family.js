const express = require('express');
const mongoose = require('mongoose'); // <--- THÊM DÒNG NÀY
const router = express.Router();
const Family = require('../models/family');
const FamilyInvitation = require('../models/FamilyInvitation');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const FamilyTransaction = require('../models/FamilyTransaction');
const Transaction = require('../models/Transaction'); // wallet transactions model
const FamilyBalance = require('../models/FamilyBalance');
const Category = require('../models/Category'); // cần để validate category
const multer = require('multer');
const path = require('path');
const fs = require('fs');

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

// Tạo gia đình mới - mỗi owner chỉ có thể tạo một gia đình với tên đó
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { name, description, color } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Tên gia đình là bắt buộc' });
    }

    // Kiểm tra xem owner đã có gia đình với tên này chưa
    const existingFamily = await Family.findOne({
      name: name.trim(),
      owner: userId
    });

    if (existingFamily) {
      return res.status(400).json({ message: 'Bạn đã có gia đình với tên này rồi' });
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

    // { added: Khởi tạo số dư cho owner ngay khi tạo gia đình }
    await FamilyBalance.updateBalance(newFamily._id, userId, 0, 'income', 'personal');

    // Populate thông tin owner và members
    await newFamily.populate('owner', 'name email');
    await newFamily.populate('members.user', 'name email');

    res.status(201).json(newFamily);
  } catch (error) {
    console.error('Error creating family:', error);
    // Xử lý lỗi duplicate key từ compound index
    if (error.code === 11000) {
      const keyPattern = error.keyPattern || {};
      if (keyPattern.name && keyPattern.owner) {
        return res.status(400).json({ message: 'Bạn đã có gia đình với tên này rồi' });
      }
    }
    res.status(500).json({ message: 'Lỗi máy chủ' });
  }
});

// Lấy danh sách lời mời gia đình
router.get('/invitations', authenticateToken, async (req, res) => {
  try {
    const userEmail = req.user.email;

    // THAY ĐỔI: Thêm populate cho family để có tên gia đình
    const invitations = await FamilyInvitation.find({
      email: userEmail,
      status: 'pending',
      expiresAt: { $gt: new Date() }
    })
    .populate('family', 'name description color') // THÊM: populate family với nhiều field hơn
    .populate('invitedBy', 'name email')
    .sort({ createdAt: -1 });

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

    // { added: Khởi tạo số dư cho thành viên mới }
    await FamilyBalance.updateBalance(invitation.family, userId, 0, 'income', 'personal');

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

// Mời thành viên mới
router.post('/:familyId/invite', authenticateToken, async (req, res) => {
  try {
    const { familyId } = req.params;
    const { email } = req.body;
    const userId = req.user.id || req.user._id;

    // Kiểm tra xem user có phải là member của gia đình không
    const family = await Family.findOne({
      _id: familyId,
      'members.user': userId
    });

    if (!family) {
      return res.status(403).json({ message: 'Bạn không có quyền mời thành viên vào gia đình này' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Kiểm tra email có tồn tại trong hệ thống không
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (!existingUser) {
      return res.status(400).json({ message: 'Email không tồn tại trong hệ thống' });
    }

    // Kiểm tra xem email đã được mời chưa
    const existingInvitation = await FamilyInvitation.findOne({
      family: familyId,
      email: normalizedEmail,
      status: 'pending'
    });

    if (existingInvitation) {
      return res.status(400).json({ message: 'Email này đã được mời và đang chờ chấp nhận' });
    }

    // Kiểm tra xem email đã là thành viên chưa
    const existingMember = family.members.find(member => 
      member.email && member.email.toLowerCase().trim() === normalizedEmail
    );

    if (existingMember) {
      return res.status(400).json({ message: 'Email này đã là thành viên của gia đình' });
    }

    // Tạo token cho lời mời
    const token = crypto.randomBytes(32).toString('hex');

    // Tạo lời mời
    const invitation = new FamilyInvitation({
      family: familyId,
      invitedBy: userId,
      email: normalizedEmail,
      token: token,
      status: 'pending',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 ngày
    });

    await invitation.save();

    res.json({ message: 'Lời mời đã được gửi thành công' });
  } catch (error) {
    console.error('Error inviting member:', error);
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

// Xóa thành viên khỏi gia đình
router.delete('/:familyId/remove-member', authenticateToken, async (req, res) => {
  try {
    const { familyId } = req.params;
    const { memberId } = req.body;
    const userId = req.user.id || req.user._id;

    // Kiểm tra xem user có phải là owner không
    const family = await Family.findOne({
      _id: familyId,
      owner: userId
    });

    if (!family) {
      return res.status(403).json({ message: 'Bạn không có quyền xóa thành viên' });
    }

    // Kiểm tra memberId không phải là owner
    if (String(family.owner) === String(memberId)) {
      return res.status(400).json({ message: 'Không thể xóa chủ gia đình' });
    }

    // Kiểm tra thành viên có tồn tại trong gia đình
    const memberIndex = family.members.findIndex(member => 
      String(member.user) === String(memberId)
    );

    if (memberIndex === -1) {
      return res.status(404).json({ message: 'Thành viên không tồn tại trong gia đình' });
    }

    // Lấy thông tin member trước khi xóa để lấy email
    const memberToRemove = family.members[memberIndex];
    const memberEmail = memberToRemove.email;

    // Xóa thành viên khỏi danh sách members (bao gồm vai trò familyRole)
    family.members.splice(memberIndex, 1);
    await family.save();

    // Xóa tất cả lời mời liên quan đến thành viên này
    // 1. Lời mời mà thành viên này đã mời (invitedBy = memberId)
    await FamilyInvitation.deleteMany({
      family: familyId,
      invitedBy: memberId
    });

    // 2. Lời mời gửi đến email của thành viên này (email = memberEmail)
    if (memberEmail) {
      await FamilyInvitation.deleteMany({
        family: familyId,
        email: memberEmail.toLowerCase().trim()
      });
    }

    // Xóa tất cả giao dịch của thành viên này và hoàn tác số dư
    // Xóa tất cả giao dịch của thành viên này và hoàn tác số dư
    const transactionsToDelete = await FamilyTransaction.find({ familyId, createdBy: memberId }).select('_id type amount transactionScope linkedTransaction');
    const memberFamilyTxIds = transactionsToDelete.map(t => String(t._id)).filter(Boolean);
    const memberLinkedTxIds = transactionsToDelete.map(t => t.linkedTransaction).filter(Boolean);

    for (const tx of transactionsToDelete) {
      // Hoàn tác số dư: nếu income thì trừ amount, nếu expense thì cộng lại amount
      const updateAmount = tx.type === 'income' ? -tx.amount : tx.amount;
      await FamilyBalance.updateBalance(familyId, memberId, updateAmount, 'income', tx.transactionScope);
    }
    // Xóa FamilyTransaction của member
    await FamilyTransaction.deleteMany({ familyId, createdBy: memberId });

    // Xóa wallet transactions liên quan do member tạo (linkedTransaction hoặc metadata.familyTransactionId)
    await Transaction.deleteMany({
      $or: [
        { _id: { $in: memberLinkedTxIds } },
        { 'metadata.familyTransactionId': { $in: memberFamilyTxIds } },
        { $and: [ { 'metadata.familyId': familyId }, { createdBy: memberId } ] }
      ]
    });

    // { added: Xóa số dư cá nhân của thành viên khỏi FamilyBalance }
    await FamilyBalance.updateOne(
      { familyId },
      { $pull: { memberBalances: { userId: memberId } } }
    );

    res.json({ message: 'Đã xóa thành viên và các giao dịch liên quan' });
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Lấy danh sách lời mời của gia đình
router.get('/:familyId/invitations', authenticateToken, async (req, res) => {
  try {
    const { familyId } = req.params;
    const userId = req.user.id || req.user._id;

    // Kiểm tra quyền truy cập gia đình
    const family = await Family.findOne({
      _id: familyId,
      'members.user': userId
    });

    if (!family) {
      return res.status(404).json({ message: 'Gia đình không tìm thấy hoặc bạn không có quyền truy cập' });
    }

    // Lấy danh sách lời mời
    const invitations = await FamilyInvitation.find({
      family: familyId
    })
    .populate('invitedBy', 'name email')
    .populate('invitedUser', 'name email')
    .sort({ createdAt: -1 });

    res.json(invitations);
  } catch (error) {
    console.error('Error fetching family invitations:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Hủy lời mời
router.delete('/:familyId/invitations/:invitationId', authenticateToken, async (req, res) => {
  try {
    const { familyId, invitationId } = req.params;
    const userId = req.user.id || req.user._id;

    // Kiểm tra xem user có phải là member của gia đình không
    const family = await Family.findOne({
      _id: familyId,
      'members.user': userId
    });

    if (!family) {
      return res.status(403).json({ message: 'Bạn không có quyền hủy lời mời trong gia đình này' });
    }

    // Tìm lời mời
    const invitation = await FamilyInvitation.findOne({
      _id: invitationId,
      family: familyId
    });

    if (!invitation) {
      return res.status(404).json({ message: 'Không tìm thấy lời mời' });
    }

    // Kiểm tra trạng thái lời mời - chỉ cho phép hủy lời mời đang chờ
    if (invitation.status !== 'pending') {
      return res.status(400).json({ message: 'Không thể hủy lời mời đã được xử lý' });
    }

    // Kiểm tra xem user có phải là người mời không
    if (String(invitation.invitedBy) !== String(userId)) {
      return res.status(403).json({ message: 'Bạn chỉ có thể hủy lời mời do mình gửi' });
    }

    // Xóa lời mời
    await FamilyInvitation.findByIdAndDelete(invitationId);

    res.json({ message: 'Lời mời đã được hủy thành công' });
  } catch (error) {
    console.error('Error cancelling invitation:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Cập nhật thông tin gia đình (chỉ owner)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const familyId = req.params.id;
    const { name } = req.body;
    
    // Tìm gia đình và kiểm tra người dùng có phải owner không
    const family = await Family.findById(familyId);
    if (!family) {
      return res.status(404).json({ message: 'Không tìm thấy gia đình' });
    }
    
    // Kiểm tra xem người đang yêu cầu có phải owner không
    if (String(family.owner) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Bạn không có quyền cập nhật gia đình này' });
    }
    
    // Cập nhật thông tin
    family.name = name || family.name;
    
    // Nếu có thay đổi color hoặc description, cập nhật chúng
    if (req.body.color) {
      family.color = req.body.color;
    }
    
    if (req.body.description !== undefined) {
      family.description = req.body.description;
    }
    
    // Lưu thay đổi
    await family.save();
    
    // Trả về dữ liệu đã cập nhật với thông tin owner và members đã populate
    const updatedFamily = await Family.findById(familyId)
      .populate('owner', 'name email')
      .populate('members.user', 'name email');
    
    res.status(200).json(updatedFamily);
  } catch (error) {
    console.error('Error updating family:', error);
    res.status(500).json({ message: 'Lỗi server khi cập nhật gia đình' });
  }
});

// Xóa gia đình (chỉ owner)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const familyId = req.params.id;
    
    // Tìm gia đình và kiểm tra quyền owner
    const family = await Family.findById(familyId);
    if (!family) {
      return res.status(404).json({ message: 'Không tìm thấy gia đình' });
    }
    
    // Kiểm tra quyền owner
    if (String(family.owner) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Bạn không có quyền xóa gia đình này' });
    }
    
    // { added: Xóa tất cả giao dịch của gia đình và các wallet transactions liên quan }
    // Lấy tất cả FamilyTransaction trước để biết các linkedTransaction / ids
    const familyTxs = await FamilyTransaction.find({ familyId }).select('_id linkedTransaction');
    const familyTxIds = familyTxs.map(t => String(t._id)).filter(Boolean);
    const linkedTxIds = familyTxs.map(t => t.linkedTransaction).filter(Boolean);

    // Xóa FamilyTransaction của gia đình
    await FamilyTransaction.deleteMany({ familyId });

    // Xóa tất cả wallet transactions liên quan:
    // - transaction documents có metadata.familyId = familyId
    // - transaction documents có metadata.familyTransactionId trong familyTxIds
    // - transaction documents whose _id matches any linkedTransaction
    const txDeleteFilter = {
      $or: [
        { _id: { $in: linkedTxIds } },
        { 'metadata.familyId': familyId },
        { 'metadata.familyTransactionId': { $in: familyTxIds } }
      ]
    };
    await Transaction.deleteMany(txDeleteFilter);

    // Xóa tất cả lời mời của gia đình
    await FamilyInvitation.deleteMany({ family: familyId });
    
    // Xóa số dư của gia đình
    await FamilyBalance.deleteMany({ familyId });
    
    // Xóa gia đình
    await Family.findByIdAndDelete(familyId);
    
    res.status(200).json({ message: 'Gia đình đã được xóa thành công' });
  } catch (error) {
    console.error('Error deleting family:', error);
    res.status(500).json({ message: 'Lỗi server khi xóa gia đình' });
  }
});

// Rời khỏi gia đình (cho member)
router.post('/:id/leave', authenticateToken, async (req, res) => {
  try {
    const familyId = req.params.id;
    const userId = req.user.id;
    
    // Tìm gia đình
    const family = await Family.findById(familyId);
    if (!family) {
      return res.status(404).json({ message: 'Không tìm thấy gia đình' });
    }
    
    // Kiểm tra người dùng có phải là owner không
    if (String(family.owner) === String(userId)) {
      return res.status(403).json({ 
        message: 'Bạn là chủ sở hữu gia đình này. Không thể rời đi mà phải xóa gia đình hoặc chuyển quyền sở hữu trước.' 
      });
    }
    
    // Kiểm tra xem người dùng có phải là thành viên không
    const memberIndex = family.members.findIndex(
      m => (m.user && String(m.user) === String(userId)) || (m.email === req.user.email)
    );
    
    if (memberIndex === -1) {
      return res.status(404).json({ message: 'Bạn không phải là thành viên của gia đình này' });
    }
    
    // Lấy thông tin member trước khi xóa để lấy email
    const memberToRemove = family.members[memberIndex];
    const memberEmail = memberToRemove.email;

    // Xóa thành viên khỏi danh sách members (bao gồm vai trò familyRole)
    family.members.splice(memberIndex, 1);
    await family.save();

    // { added: Xóa tất cả lời mời liên quan đến thành viên này }
    // 1. Lời mời mà thành viên này đã mời (invitedBy = userId)
    await FamilyInvitation.deleteMany({
      family: familyId,
      invitedBy: userId
    });

    // 2. Lời mời gửi đến email của thành viên này (email = memberEmail)
    if (memberEmail) {
      await FamilyInvitation.deleteMany({
        family: familyId,
        email: memberEmail.toLowerCase().trim()
      });
    }

    // { added: Xóa tất cả giao dịch của thành viên này và hoàn tác số dư }
    const transactionsToDelete = await FamilyTransaction.find({ familyId, createdBy: userId }).select('_id type amount transactionScope linkedTransaction');
    const memberFamilyTxIds = transactionsToDelete.map(t => String(t._id)).filter(Boolean);
    const memberLinkedTxIds = transactionsToDelete.map(t => t.linkedTransaction).filter(Boolean);

    for (const tx of transactionsToDelete) {
      // Hoàn tác số dư: nếu income thì trừ amount, nếu expense thì cộng lại amount
      const updateAmount = tx.type === 'income' ? -tx.amount : tx.amount;
      await FamilyBalance.updateBalance(familyId, userId, updateAmount, 'income', tx.transactionScope);
    }
    // Xóa FamilyTransaction của member
    await FamilyTransaction.deleteMany({ familyId, createdBy: userId });

    // Xóa wallet transactions liên quan do member tạo (linkedTransaction hoặc metadata.familyTransactionId)
    await Transaction.deleteMany({
      $or: [
        { _id: { $in: memberLinkedTxIds } },
        { 'metadata.familyTransactionId': { $in: memberFamilyTxIds } },
        { $and: [ { 'metadata.familyId': familyId }, { createdBy: userId } ] }
      ]
    });

    res.status(200).json({ message: 'Đã rời khỏi gia đình thành công' });
  } catch (error) {
    console.error('Error leaving family:', error);
    res.status(500).json({ message: 'Lỗi server khi rời khỏi gia đình' });
  }
});

// Cập nhật vai trò thành viên gia đình (chỉ owner)
router.put('/:familyId/member/:memberId/role', authenticateToken, async (req, res) => {
  try {
    const { familyId, memberId } = req.params;
    const { familyRole } = req.body;
    const userId = req.user.id || req.user._id;

    // Kiểm tra xem user có phải là owner của gia đình không
    const family = await Family.findOne({
      _id: familyId,
      owner: userId
    });

    if (!family) {
      return res.status(403).json({ message: 'Bạn không phải là chủ gia đình hoặc gia đình không tồn tại' });
    }

    // Tìm thành viên cần cập nhật
    const memberIndex = family.members.findIndex(member => 
      String(member.user) === String(memberId)
    );

    if (memberIndex === -1) {
      return res.status(404).json({ message: 'Thành viên không tồn tại trong gia đình' });
    }

    // Cập nhật familyRole
    family.members[memberIndex].familyRole = familyRole.trim();
    await family.save();

    // Populate thông tin thành viên
    const updatedFamily = await Family.findById(familyId)
      .populate('owner', 'name email')
      .populate('members.user', 'name email');

    res.json(updatedFamily);
  } catch (error) {
    console.error('Error updating member role:', error);
    res.status(500).json({ message: 'Lỗi server khi cập nhật vai trò' });
  }
});

// Cập nhật vai trò của bản thân (cho owner)
router.put('/:familyId/my-role', authenticateToken, async (req, res) => {
  try {
    const { familyId } = req.params;
    const { familyRole } = req.body;
    const userId = req.user.id || req.user._id;

    // Kiểm tra xem user có phải là owner của gia đình không
    const family = await Family.findOne({
      _id: familyId,
      owner: userId
    });

    if (!family) {
      return res.status(403).json({ message: 'Bạn không phải là chủ gia đình hoặc gia đình không tồn tại' });
    }

    // Tìm thành viên là owner
    const ownerMemberIndex = family.members.findIndex(member => 
      String(member.user) === String(userId)
    );

    if (ownerMemberIndex === -1) {
      return res.status(404).json({ message: 'Không tìm thấy thông tin chủ gia đình' });
    }

    // Cập nhật familyRole cho chủ gia đình
    family.members[ownerMemberIndex].familyRole = familyRole.trim();
    await family.save();

    // Populate thông tin thành viên
    const updatedFamily = await Family.findById(familyId)
      .populate('owner', 'name email')
      .populate('members.user', 'name email');

    res.json(updatedFamily);
  } catch (error) {
    console.error('Error updating owner role:', error);
    res.status(500).json({ message: 'Lỗi server khi cập nhật vai trò' });
  }
});

// Thêm schema ngân sách vào Family nếu chưa có (chỉ cần chạy 1 lần khi deploy, ở đây để an toàn)
if (!Family.schema.paths.budgets) {
  Family.schema.add({
    budgets: [{
      category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
      amount: { type: Number, required: true },
      date: { type: Date, required: true },
      note: { type: String, default: '' },
      createdAt: { type: Date, default: Date.now }
    }]
  });
}

// API: Tạo ngân sách cho gia đình
router.post('/:familyId/budget', authenticateToken, async (req, res) => {
  try {
    const { familyId } = req.params;
    const { category, amount, date, note } = req.body;
    const userId = req.user.id || req.user._id;

    // Kiểm tra quyền truy cập
    // Cho phép cả owner và member thêm ngân sách
    const family = await Family.findOne({
      _id: familyId,
      $or: [
        { 'members.user': userId },
        { owner: userId }
      ]
    });
    if (!family) return res.status(403).json({ message: 'Bạn không có quyền với gia đình này' });

    // Validate
    if (!category || !mongoose.Types.ObjectId.isValid(category)) {
      return res.status(400).json({ message: 'Danh mục không hợp lệ' });
    }
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Số tiền phải lớn hơn 0' });
    }
    if (!date) {
      return res.status(400).json({ message: 'Ngày là bắt buộc' });
    }
    const cat = await Category.findById(category);
    if (!cat) return res.status(404).json({ message: 'Không tìm thấy danh mục' });

    // Thêm ngân sách vào mảng budgets
    family.budgets = Array.isArray(family.budgets) ? family.budgets : [];
    family.budgets.push({
      category,
      amount,
      date,
      note: note || '',
      createdAt: new Date()
    });
    await family.save();

    // Populate category cho ngân sách vừa tạo
    const lastBudget = family.budgets[family.budgets.length - 1];
    await Family.populate(lastBudget, { path: 'category', select: 'name icon type' });

    // Attach related transactions for the created budget
    const budgetObj = (lastBudget.toObject && typeof lastBudget.toObject === 'function') ? lastBudget.toObject() : { ...lastBudget };
    const d = new Date(budgetObj.date || Date.now());
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    const catId = budgetObj.category?._id || budgetObj.category;
    const txFilter = { familyId, transactionScope: 'family', type: 'expense', tags: { $ne: 'transfer' }, date: { $gte: start, $lte: end } };
    if (catId) txFilter.category = catId;
    const relatedTxs = await FamilyTransaction.find(txFilter).populate('createdBy', 'name email').populate('category','name icon type').sort({ date: -1 }).lean();
    budgetObj.transactions = relatedTxs || [];

    res.status(201).json(budgetObj);
  } catch (err) {
    console.error('Create family budget error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// API: Lấy danh sách ngân sách của gia đình
router.get('/:familyId/budget', authenticateToken, async (req, res) => {
  try {
    const { familyId } = req.params;
    const userId = req.user.id || req.user._id;

    const family = await Family.findOne({ _id: familyId, 'members.user': userId })
      .populate('budgets.category', 'name icon type');
    if (!family) return res.status(403).json({ message: 'Bạn không có quyền với gia đình này' });

    // Attach related family transactions to each budget (same category, same month)
    const budgetsWithTx = await Promise.all((family.budgets || []).map(async (b) => {
      // convert to plain object to safely attach transactions
      const budgetObj = (b.toObject && typeof b.toObject === 'function') ? b.toObject() : { ...b };
      // determine category id and month range (use budget.date)
      const categoryId = budgetObj.category?._id || budgetObj.category;
      let start = new Date();
      let end = new Date();
      if (budgetObj.date) {
        const d = new Date(budgetObj.date);
        start = new Date(d.getFullYear(), d.getMonth(), 1);
        end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      } else {
        const now = new Date();
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      }

      const txFilter = {
        familyId,
        transactionScope: 'family',
        type: 'expense',
        tags: { $ne: 'transfer' }, // ignore transfer activities
        date: { $gte: start, $lte: end }
      };
      if (categoryId) txFilter.category = categoryId;

      const relatedTxs = await FamilyTransaction.find(txFilter)
        .populate('createdBy', 'name email')
        .populate('category', 'name icon type')
        .sort({ date: -1 })
        .lean();

      budgetObj.transactions = relatedTxs || [];
      return budgetObj;
    }));

    res.json(budgetsWithTx);
  } catch (err) {
    console.error('Get family budgets error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// API: Sửa ngân sách (chỉ cho phép sửa amount và date)
router.put('/:familyId/budget/:budgetId', authenticateToken, async (req, res) => {
  try {
    const { familyId, budgetId } = req.params;
    const { amount, date } = req.body;
    const userId = req.user.id || req.user._id;

    // Kiểm tra quyền truy cập - CHỈ OWNER mới được sửa
    const family = await Family.findOne({
      _id: familyId,
      owner: userId
    });
    if (!family) return res.status(403).json({ message: 'Chỉ chủ gia đình mới có quyền sửa ngân sách' });

    // Tìm budget trong mảng budgets
    const budget = family.budgets.id(budgetId);
    if (!budget) return res.status(404).json({ message: 'Không tìm thấy ngân sách' });

    // Validate amount nếu có
    if (amount !== undefined) {
      if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({ message: 'Số tiền phải lớn hơn 0' });
      }
      budget.amount = Number(amount);
    }

    // Validate date nếu có
    if (date !== undefined) {
      if (!date) {
        return res.status(400).json({ message: 'Ngày không hợp lệ' });
      }
      budget.date = new Date(date);
    }

    await family.save();

    // Populate category cho budget đã update
    await Family.populate(budget, { path: 'category', select: 'name icon type' });

    // Attach related transactions for updated budget
    const budgetObj = (budget.toObject && typeof budget.toObject === 'function') ? budget.toObject() : { ...budget };
    const d = new Date(budgetObj.date || Date.now());
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    const catId = budgetObj.category?._id || budgetObj.category;
    const txFilter = { familyId, transactionScope: 'family', type: 'expense', tags: { $ne: 'transfer' }, date: { $gte: start, $lte: end } };
    if (catId) txFilter.category = catId;
    const relatedTxs = await FamilyTransaction.find(txFilter).populate('createdBy', 'name email').populate('category','name icon type').sort({ date: -1 }).lean();
    budgetObj.transactions = relatedTxs || [];

    res.json(budgetObj);
  } catch (err) {
    console.error('Update family budget error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// API: Xóa ngân sách
router.delete('/:familyId/budget/:budgetId', authenticateToken, async (req, res) => {
  try {
    const { familyId, budgetId } = req.params;
    const userId = req.user.id || req.user._id;

    // Kiểm tra quyền truy cập - CHỈ OWNER mới được xóa
    const family = await Family.findOne({
      _id: familyId,
      owner: userId
    });
    if (!family) return res.status(403).json({ message: 'Chỉ chủ gia đình mới có quyền xóa ngân sách' });

    // Tìm budget trong mảng budgets
    const budget = family.budgets.id(budgetId);
    if (!budget) return res.status(404).json({ message: 'Không tìm thấy ngân sách' });

    // Lưu categoryId trước khi xóa để dùng cho việc xóa lịch sử
    const categoryId = budget.category;

    // Xóa budget khỏi mảng - dùng pull() thay vì remove()
    family.budgets.pull(budgetId);
    
    // NEW: Xóa TẤT CẢ lịch sử ngân sách của category này
    if (Array.isArray(family.budgetHistory) && family.budgetHistory.length > 0) {
      family.budgetHistory = family.budgetHistory.filter(
        h => String(h.category) !== String(categoryId)
      );
    }
    
    await family.save();

    res.json({ 
      message: 'Đã xóa ngân sách và lịch sử thành công',
      deletedBudgetId: budgetId,
      deletedCategoryId: categoryId
    });
  } catch (err) {
    console.error('Delete family budget error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// API: Reset ngân sách (tạo kỳ mới)
router.post('/:familyId/budget/:budgetId/reset', authenticateToken, async (req, res) => {
  try {
    const { familyId, budgetId } = req.params;
    const userId = req.user.id || req.user._id;

    // Kiểm tra quyền - CHỈ OWNER
    const family = await Family.findOne({ _id: familyId, owner: userId });
    if (!family) return res.status(403).json({ message: 'Chỉ chủ gia đình mới có quyền reset ngân sách' });

    // Tìm budget
    const budget = family.budgets.id(budgetId);
    if (!budget) return res.status(404).json({ message: 'Không tìm thấy ngân sách' });

    // Lấy số tiền đã chi tiêu từ giao dịch trong kỳ CŨ
    const categoryId = budget.category;
    const oldBudgetDate = new Date(budget.date);
    const oldStart = new Date(oldBudgetDate.getFullYear(), oldBudgetDate.getMonth(), 1);
    const oldEnd = new Date(oldBudgetDate.getFullYear(), oldBudgetDate.getMonth() + 1, 0, 23, 59, 59, 999);

    const txFilter = {
      familyId,
      transactionScope: 'family',
      type: 'expense',
      tags: { $ne: 'transfer' },
      date: { $gte: oldStart, $lte: oldEnd },
      category: categoryId
    };
    const transactions = await FamilyTransaction.find(txFilter);
    const spent = transactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);

    // Lưu vào lịch sử
    if (!Array.isArray(family.budgetHistory)) family.budgetHistory = [];
    family.budgetHistory.push({
      category: budget.category,
      amount: budget.amount,
      startDate: oldStart,
      endDate: oldEnd,
      spent: spent,
      note: budget.note || '',
      resetAt: new Date()
    });

    // Tính toán ngày hạn KỲ MỚI (tháng tiếp theo)
    const now = new Date();
    const nextMonth = new Date(oldBudgetDate);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    
    // Nếu tháng tiếp theo vẫn < tháng hiện tại → nhảy sang tháng hiện tại
    if (nextMonth < now) {
      nextMonth.setFullYear(now.getFullYear());
      nextMonth.setMonth(now.getMonth());
    }

    // Cập nhật budget với ngày mới (GIỮ LẠI amount và category)
    budget.date = nextMonth;
    budget.lastResetAt = new Date();
    budget.resetCount = (budget.resetCount || 0) + 1;

    await family.save();

    // Populate và trả về budget đã reset
    await Family.populate(budget, { path: 'category', select: 'name icon type' });

    const nextPeriod = {
      startDate: new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 1),
      endDate: new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0, 23, 59, 59, 999)
    };

    res.json({
      message: 'Đã reset ngân sách thành công',
      budget: budget,
      nextPeriod: nextPeriod
    });
  } catch (err) {
    console.error('Reset budget error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// API: Lấy lịch sử ngân sách
router.get('/:familyId/budget-history', authenticateToken, async (req, res) => {
  try {
    const { familyId } = req.params;
    const userId = req.user.id || req.user._id;
    const { categoryId, limit = 10 } = req.query;

    const family = await Family.findOne({ _id: familyId, 'members.user': userId })
      .populate('budgetHistory.category', 'name icon type');
    
    if (!family) return res.status(403).json({ message: 'Bạn không có quyền với gia đình này' });

    let history = family.budgetHistory || [];
    
    // Lọc theo category nếu có
    if (categoryId) {
      history = history.filter(h => String(h.category._id || h.category) === String(categoryId));
    }

    // Sắp xếp theo ngày reset mới nhất
    history = history.sort((a, b) => new Date(b.resetAt) - new Date(a.resetAt));

    // Giới hạn số lượng
    history = history.slice(0, parseInt(limit));

    res.json(history);
  } catch (err) {
    console.error('Get budget history error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// API: Lấy danh sách mua sắm của gia đình
router.get('/:familyId/shopping-list', authenticateToken, async (req, res) => {
  try {
    const { familyId } = req.params;
    const userId = req.user.id || req.user._id;

    // Kiểm tra quyền truy cập - tất cả thành viên đều có thể xem
    const family = await Family.findOne({
      _id: familyId,
      $or: [
        { 'members.user': userId },
        { owner: userId }
      ]
    })
    .populate('shoppingList.createdBy', 'name email')
    .populate('shoppingList.category', 'name icon type');

    if (!family) {
      return res.status(403).json({ message: 'Bạn không có quyền truy cập gia đình này' });
    }

    // Sắp xếp theo ngày tạo mới nhất
    const shoppingList = (family.shoppingList || []).sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );

    // Thêm tên người tạo và thông tin danh mục vào từng item
    const shoppingListWithCreator = shoppingList.map(item => ({
      ...item.toObject(),
      creatorName: item.createdBy?.name || 'Thành viên',
      categoryInfo: item.category ? {
        _id: item.category._id,
        name: item.category.name,
        icon: item.category.icon,
        type: item.category.type
      } : null
    }));

    res.json(shoppingListWithCreator);
  } catch (error) {
    console.error('Error fetching shopping list:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// API: Thêm sản phẩm vào danh sách mua sắm
router.post('/:familyId/shopping-list', authenticateToken, async (req, res) => {
  try {
    const { familyId } = req.params;
    const { name, quantity, notes, category } = req.body; // THÊM: category
    const userId = req.user.id || req.user._id;

    // Validate input
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Tên sản phẩm là bắt buộc' });
    }

    const cleanQuantity = quantity && !isNaN(quantity) && quantity > 0 ? Number(quantity) : 1;

    // THÊM: Validate category nếu có
    if (category && !mongoose.Types.ObjectId.isValid(category)) {
      return res.status(400).json({ message: 'Danh mục không hợp lệ' });
    }

    if (category) {
      const categoryExists = await Category.findById(category);
      if (!categoryExists) {
        return res.status(404).json({ message: 'Danh mục không tồn tại' });
      }
    }

    // Kiểm tra quyền truy cập - tất cả thành viên đều có thể thêm
    const family = await Family.findOne({
      _id: familyId,
      $or: [
        { 'members.user': userId },
        { owner: userId }
      ]
    });

    if (!family) {
      return res.status(403).json({ message: 'Bạn không có quyền truy cập gia đình này' });
    }

    // Tạo item mới
    const newItem = {
      name: name.trim(),
      quantity: cleanQuantity,
      notes: notes?.trim() || '',
      category: category || null, // THÊM: category
      purchased: false,
      createdBy: userId,
      createdAt: new Date()
    };

    // Thêm vào danh sách
    if (!Array.isArray(family.shoppingList)) {
      family.shoppingList = [];
    }
    family.shoppingList.push(newItem);
    await family.save();

    // Lấy item vừa tạo với thông tin người tạo và danh mục
    const createdItem = family.shoppingList[family.shoppingList.length - 1];
    await Family.populate(createdItem, { path: 'createdBy', select: 'name email' });
    await Family.populate(createdItem, { path: 'category', select: 'name icon type' }); // THÊM: populate category

    const responseItem = {
      ...createdItem.toObject(),
      creatorName: createdItem.createdBy?.name || 'Thành viên',
      categoryInfo: createdItem.category ? { // THÊM: categoryInfo
        _id: createdItem.category._id,
        name: createdItem.category.name,
        icon: createdItem.category.icon,
        type: createdItem.category.type
      } : null
    };

    res.status(201).json(responseItem);
  } catch (error) {
    console.error('Error adding shopping item:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// API: Cập nhật sản phẩm trong danh sách mua sắm
router.patch('/:familyId/shopping-list/:itemId', authenticateToken, async (req, res) => {
  try {
    const { familyId, itemId } = req.params;
    const { name, quantity, notes, category, purchased } = req.body;
    const userId = req.user.id || req.user._id;

    // Tìm gia đình
    const family = await Family.findOne({
      _id: familyId,
      $or: [
        { 'members.user': userId },
        { owner: userId }
      ]
    });

    if (!family) {
      return res.status(403).json({ message: 'Bạn không có quyền truy cập gia đình này' });
    }

    // Tìm item trong danh sách
    const item = family.shoppingList.id(itemId);
    if (!item) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
    }

    // THAY ĐỔI: Kiểm tra quyền chỉnh sửa
    const isOwner = String(family.owner) === String(userId);
    const isItemCreator = String(item.createdBy) === String(userId);
    
    // Kiểm tra quyền cho từng loại thay đổi
    if (name !== undefined || quantity !== undefined || notes !== undefined || category !== undefined) {
      // Chỉnh sửa thông tin sản phẩm: Owner có thể sửa tất cả, thành viên chỉ sửa được item của họ
      if (!isOwner && !isItemCreator) {
        return res.status(403).json({ 
          message: 'Bạn chỉ có thể chỉnh sửa những sản phẩm do bạn tạo' 
        });
      }
    }
    
    // Cập nhật trạng thái mua: tất cả thành viên đều có thể thay đổi
    if (purchased !== undefined) {
      item.purchased = Boolean(purchased);
      if (item.purchased) {
        item.purchasedAt = new Date();
        item.purchasedBy = userId;
      } else {
        item.purchasedAt = undefined;
        item.purchasedBy = undefined;
      }
    }

    // Cập nhật thông tin sản phẩm nếu có quyền
    if ((isOwner || isItemCreator) && (name !== undefined || quantity !== undefined || notes !== undefined || category !== undefined)) {
      if (name !== undefined) {
        if (!name.trim()) {
          return res.status(400).json({ message: 'Tên sản phẩm không được để trống' });
        }
        item.name = name.trim();
      }

      if (quantity !== undefined) {
        const cleanQuantity = !isNaN(quantity) && quantity > 0 ? Number(quantity) : 1;
        item.quantity = cleanQuantity;
      }

      if (notes !== undefined) {
        item.notes = notes?.trim() || '';
      }

      // Validate category nếu có thay đổi
      if (category !== undefined) {
        if (category && !mongoose.Types.ObjectId.isValid(category)) {
          return res.status(400).json({ message: 'Danh mục không hợp lệ' });
        }
        
        if (category) {
          const categoryExists = await Category.findById(category);
          if (!categoryExists) {
            return res.status(404).json({ message: 'Danh mục không tồn tại' });
          }
        }
        
        item.category = category || null;
      }
    }

    await family.save();

    // Populate thông tin người tạo và danh mục
    await Family.populate(item, { path: 'createdBy', select: 'name email' });
    await Family.populate(item, { path: 'purchasedBy', select: 'name email' });
    await Family.populate(item, { path: 'category', select: 'name icon type' });

    const responseItem = {
      ...item.toObject(),
      creatorName: item.createdBy?.name || 'Thành viên',
      purchasedByName: item.purchasedBy?.name || null,
      categoryInfo: item.category ? {
        _id: item.category._id,
        name: item.category.name,
        icon: item.category.icon,
        type: item.category.type
      } : null
    };

    res.json(responseItem);
  } catch (error) {
    console.error('Error updating shopping item:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// API: Xóa sản phẩm khỏi danh sách mua sắm
router.delete('/:familyId/shopping-list/:itemId', authenticateToken, async (req, res) => {
  try {
    const { familyId, itemId } = req.params;
    const userId = req.user.id || req.user._id;

    // Tìm gia đình và kiểm tra quyền truy cập
    const family = await Family.findOne({
      _id: familyId,
      $or: [
        { 'members.user': userId },
        { owner: userId }
      ]
    });

    if (!family) {
      return res.status(403).json({ 
        message: 'Bạn không có quyền truy cập gia đình này' 
      });
    }

    // Tìm item trong danh sách
    const item = family.shoppingList.id(itemId);
    if (!item) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
    }

    // THAY ĐỔI: Kiểm tra quyền xóa - chỉ owner hoặc người tạo item
    const isOwner = String(family.owner) === String(userId);
    const isItemCreator = String(item.createdBy) === String(userId);

    if (!isOwner && !isItemCreator) {
      return res.status(403).json({ 
        message: 'Bạn chỉ có thể xóa những sản phẩm do bạn tạo' 
      });
    }

    // Lưu thông tin item trước khi xóa để trả về
    const deletedItemInfo = {
      _id: item._id,
      name: item.name,
      quantity: item.quantity
    };

    // Xóa item khỏi danh sách
    family.shoppingList.pull(itemId);
    await family.save();

    res.json({ 
      message: 'Đã xóa sản phẩm khỏi danh sách thành công',
      deletedItem: deletedItemInfo
    });
  } catch (error) {
    console.error('Error deleting shopping item:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// API: Xóa tất cả sản phẩm đã mua khỏi danh sách
router.delete('/:familyId/shopping-list/purchased/clear', authenticateToken, async (req, res) => {
  try {
    const { familyId } = req.params;
    const userId = req.user.id || req.user._id;

    // Chỉ owner mới có quyền xóa hàng loạt
    const family = await Family.findOne({
      _id: familyId,
      owner: userId
    });

    if (!family) {
      return res.status(403).json({ 
        message: 'Chỉ chủ gia đình mới có thể xóa hàng loạt' 
      });
    }

    // Đếm số sản phẩm đã mua trước khi xóa
    const purchasedCount = family.shoppingList.filter(item => item.purchased).length;

    // Xóa tất cả sản phẩm đã mua
    family.shoppingList = family.shoppingList.filter(item => !item.purchased);
    await family.save();

    res.json({ 
      message: `Đã xóa ${purchasedCount} sản phẩm đã mua khỏi danh sách`,
      deletedCount: purchasedCount
    });
  } catch (error) {
    console.error('Error clearing purchased items:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// API: Lấy danh sách việc cần làm của gia đình
router.get('/:familyId/todo-list', authenticateToken, async (req, res) => {
  try {
    const { familyId } = req.params;
    const userId = req.user.id || req.user._id;

    const family = await Family.findOne({
      _id: familyId,
      $or: [
        { 'members.user': userId },
        { owner: userId }
      ]
    })
    .populate('todoList.createdBy', 'name email')
    .populate('todoList.completedBy', 'name email')
    .populate('todoList.assignedTo', 'name email')
    .populate('todoList.completionStatus.user', 'name email');

    if (!family) {
      return res.status(403).json({ message: 'Bạn không có quyền truy cập gia đình này' });
    }

    const isOwner = String(family.owner) === String(userId);
    let todoList = family.todoList || [];

    // Nếu không phải owner, chỉ lấy những việc được phân công cho mình
    if (!isOwner) {
      todoList = todoList.filter(item => {
        return item.assignedTo && item.assignedTo.some(assignee => 
          String(assignee._id || assignee) === String(userId)
        );
      });
    }

    todoList = todoList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const todoListWithInfo = todoList.map(item => {
      const itemObj = item.toObject();
      const totalAssigned = itemObj.assignedTo ? itemObj.assignedTo.length : 0;
      const completedDetails = itemObj.completionStatus || [];
      const completedMembers = completedDetails.filter(cs => cs.completed).map(cs => cs.user);
      const notCompletedMembers = completedDetails.filter(cs => !cs.completed).map(cs => cs.user);

      // Danh sách thành viên được phân công (object)
      const assignedToObjs = itemObj.assignedTo || [];

      // Tên các thành viên được phân công
      const assignedToNames = assignedToObjs.map(assignee => assignee.name || 'Thành viên');

      // Tên các thành viên đã hoàn thành
      const completedNames = completedDetails.filter(cs => cs.completed && cs.user)
        .map(cs => cs.user.name || 'Thành viên');

      // Tên các thành viên chưa hoàn thành
      const notCompletedNames = completedDetails.filter(cs => !cs.completed && cs.user)
        .map(cs => cs.user.name || 'Thành viên');

      // Nếu là member, lấy danh sách các thành viên được phân công cùng mình
      let assignedPeers = [];
      if (!isOwner && assignedToObjs.length > 1) {
        assignedPeers = assignedToObjs
          .filter(assignee => String(assignee._id || assignee) !== String(userId))
          .map(assignee => assignee.name || 'Thành viên');
      }

      return {
        ...itemObj,
        creatorName: itemObj.createdBy?.name || 'Thành viên',
        completedByName: itemObj.completedBy?.name || null,
        assignedToNames,
        completedNames,
        notCompletedNames,
        assignedPeers,
        canEdit: isOwner || String(itemObj.createdBy?._id || itemObj.createdBy) === String(userId),
        isOwner,
        totalAssigned,
        completedCount: completedNames.length,
        completionPercentage: totalAssigned > 0 ? Math.round((completedNames.length / totalAssigned) * 100) : 0,
        allCompleted: totalAssigned > 0 && completedNames.length === totalAssigned,
        completionDetails: completedDetails
      };
    });

    res.json(todoListWithInfo);
  } catch (error) {
    console.error('Error fetching todo list:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// API: Thêm việc cần làm vào danh sách
router.post('/:familyId/todo-list', authenticateToken, async (req, res) => {
  try {
    const { familyId } = req.params;
    const { title, description, priority, dueDate, assignedTo } = req.body;
    const userId = req.user.id || req.user._id;

    // Validate input
    if (!title || !title.trim()) {
      return res.status(400).json({ message: 'Tiêu đề việc cần làm là bắt buộc' });
    }

    // THAY ĐỔI: Validate assignedTo (có thể là mảng hoặc string)
    let assignedToArray = [];
    if (assignedTo) {
      if (Array.isArray(assignedTo)) {
        // Nếu là mảng, validate từng phần tử
        for (const id of assignedTo) {
          if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Một trong những người được phân công không hợp lệ' });
          }
        }
        assignedToArray = assignedTo;
      } else {
        // Nếu là string, validate và chuyển thành mảng
        if (!mongoose.Types.ObjectId.isValid(assignedTo)) {
          return res.status(400).json({ message: 'Người được phân công không hợp lệ' });
        }
        assignedToArray = [assignedTo];
      }
    }

    // Kiểm tra quyền truy cập - tất cả thành viên đều có thể thêm
    const family = await Family.findOne({
      _id: familyId,
      $or: [
        { 'members.user': userId },
        { owner: userId }
      ]
    });

    if (!family) {
      return res.status(403).json({ message: 'Bạn không có quyền truy cập gia đình này' });
    }

    // SỬA LỖI: Khởi tạo completionStatus cho TẤT CẢ người được phân công với trạng thái false
    const completionStatus = assignedToArray.map(assigneeId => ({
      user: assigneeId,
      completed: false,
      completedAt: null
    }));

    // Tạo item mới
    const newItem = {
      title: title.trim(),
      description: description?.trim() || '',
      priority: priority || 'medium',
      dueDate: dueDate ? new Date(dueDate) : null,
      assignedTo: assignedToArray,
      completionStatus: completionStatus, // Đảm bảo khởi tạo đầy đủ
      completed: false,
      createdBy: userId,
      createdAt: new Date()
    };

    // Thêm vào danh sách
    if (!Array.isArray(family.todoList)) {
      family.todoList = [];
    }
    family.todoList.push(newItem);
    await family.save();

    // Lấy item vừa tạo với thông tin người tạo và người được phân công
    const createdItem = family.todoList[family.todoList.length - 1];
    await Family.populate(createdItem, { path: 'createdBy', select: 'name email' });
    await Family.populate(createdItem, { path: 'assignedTo', select: 'name email' });

    const responseItem = {
      ...createdItem.toObject(),
      creatorName: createdItem.createdBy?.name || 'Thành viên',
      assignedToNames: createdItem.assignedTo ? createdItem.assignedTo.map(assignee => assignee.name || 'Thành viên') : []
    };

    res.status(201).json(responseItem);
  } catch (error) {
    console.error('Error adding todo item:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// API: Cập nhật trạng thái hoàn thành cá nhân
router.patch('/:familyId/todo-list/:itemId/toggle-completion', authenticateToken, async (req, res) => {
  try {
    const { familyId, itemId } = req.params;
    const userId = req.user.id || req.user._id;

    const family = await Family.findOne({
      _id: familyId,
      $or: [
        { 'members.user': userId },
        { owner: userId }
      ]
    });

    if (!family) {
      return res.status(403).json({ message: 'Bạn không có quyền truy cập gia đình này' });
    }

    const item = family.todoList.id(itemId);
    if (!item) {
      return res.status(404).json({ message: 'Không tìm thấy việc cần làm' });
    }

    // LOGIC CHUẨN: quá hạn từ ngày sau ngày đến hạn (dueDate + 1 ngày)
    let expired = false;
    if (item.dueDate) {
      const effectiveDue = new Date(new Date(item.dueDate).getTime() + 24 * 60 * 60 * 1000);
      if (effectiveDue <= new Date()) expired = true;
    }
    if (item.isExpired || expired) {
      return res.status(400).json({ message: 'Công việc đã quá hạn, không thể thay đổi trạng thái hoàn thành' });
    }

    // SỬA LỖI: Kiểm tra xem user có phải là người được phân công không
    const isAssignedTo = item.assignedTo && item.assignedTo.some(assignee => 
      String(assignee._id || assignee) === String(userId)
    );

    // Nếu user không được phân công, không cho phép toggle
    if (!isAssignedTo) {
      return res.status(403).json({ message: 'Bạn không được phân công làm công việc này' });
    }

    // SỬA LỖI MỚI: Khởi tạo completionStatus nếu chưa có
    if (!Array.isArray(item.completionStatus)) {
      item.completionStatus = [];
    }

    // SỬA LỖI MỚI: Đảm bảo tất cả người trong assignedTo đều có entry trong completionStatus
    item.assignedTo.forEach(assignee => {
      const assigneeId = String(assignee._id || assignee);
      const hasEntry = item.completionStatus.some(cs => String(cs.user) === assigneeId);
      
      if (!hasEntry) {
        // Nếu chưa có entry, tạo mới với trạng thái chưa hoàn thành
        item.completionStatus.push({
          user: assigneeId,
          completed: false,
          completedAt: null
        });
      }
    });

    // Tìm completion status của user hiện tại
    let userCompletion = item.completionStatus.find(s => String(s.user) === String(userId));

    if (!userCompletion) {
      // Nếu vẫn chưa có (edge case), tạo mới
      userCompletion = {
        user: userId,
        completed: false,
        completedAt: null
      };
      item.completionStatus.push(userCompletion);
    }

    // Toggle trạng thái - SỬA LỖI: Cho phép toggle độc lập
    userCompletion.completed = !userCompletion.completed;
    userCompletion.completedAt = userCompletion.completed ? new Date() : null;

    // Cập nhật trạng thái tổng thể - CHỈ DỰA TRÊN ASSIGNEDTO
    const totalAssigned = item.assignedTo.length;
    const completedCount = item.completionStatus.filter(cs => {
      // Chỉ đếm những người trong assignedTo
      const isInAssignedTo = item.assignedTo.some(a => String(a._id || a) === String(cs.user));
      return cs.completed && isInAssignedTo;
    }).length;
    
    item.completed = completedCount === totalAssigned && totalAssigned > 0;
    item.completedAt = item.completed ? new Date() : null;
    // SỬA LỖI: Chỉ set completedBy khi tất cả hoàn thành
    item.completedBy = item.completed ? userId : null;

    await family.save();

    res.json({ message: 'Cập nhật trạng thái thành công' });
  } catch (error) {
    console.error('Error toggling completion:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

// Helper function để kiểm tra và cập nhật trạng thái expired
const updateExpiredTasks = async (family) => {
  const now = new Date();
  let hasUpdates = false;
  
  family.todoList.forEach(task => {
    if (task.dueDate && !task.completed && !task.isExpired) {
      // LOGIC CHUẨN: quá hạn từ ngày sau ngày đến hạn (dueDate + 1 ngày)
      const effectiveDue = new Date(new Date(task.dueDate).getTime() + 24 * 60 * 60 * 1000);
      if (effectiveDue <= now) {
        task.isExpired = true;
        hasUpdates = true;
      }
    }
  });
  
  if (hasUpdates) {
    await family.save();
  }
  
  return family;
};

// PATCH /api/family/:familyId/todo-list/:taskId - Cập nhật thông tin công việc
router.patch('/:familyId/todo-list/:taskId', authenticateToken, async (req, res) => {
  try {
    const { familyId, taskId } = req.params;
    const userId = req.user.id || req.user._id;
    const { title, description, priority, dueDate, assignedTo, completed } = req.body;

    // Tìm gia đình
    const family = await Family.findOne({
      _id: familyId,
      $or: [
        { 'members.user': userId },
        { owner: userId }
      ]
    });

    if (!family) {
      return res.status(403).json({ message: 'Bạn không có quyền truy cập gia đình này' });
    }

    // Tìm task trong danh sách
    const task = family.todoList.id(taskId);
    if (!task) {
      return res.status(404).json({ message: 'Không tìm thấy công việc' });
    }

    // Kiểm tra quyền chỉnh sửa phân biệt theo loại thao tác
    const isOwner = String(family.owner) === String(userId);
    const isItemCreator = String(task.createdBy) === String(userId);
    const isAssignedTo = task.assignedTo && task.assignedTo.some(assignee => 
      String(assignee._id || assignee) === String(userId)
    );

    // Kiểm tra quyền cho việc cập nhật trạng thái hoàn thành
    if (completed !== undefined) {
      // Owner, người tạo, hoặc người được phân công đều có thể cập nhật trạng thái
      if (!isOwner && !isItemCreator && !isAssignedTo) {
        return res.status(403).json({ 
          message: 'Bạn chỉ có thể cập nhật trạng thái của công việc được phân công cho bạn hoặc do bạn tạo' 
        });
      }
      
      const wasCompleted = task.completed;
      task.completed = Boolean(completed);
      
      if (task.completed && !wasCompleted) {
        task.completedAt = new Date();
        task.completedBy = userId;
      } else if (!task.completed && wasCompleted) {
        task.completedAt = undefined;
        task.completedBy = undefined;
      }
    }

    // Kiểm tra quyền cho việc chỉnh sửa thông tin công việc
    if (title !== undefined || description !== undefined || priority !== undefined || 
        dueDate !== undefined || assignedTo !== undefined) {
      
      // Chỉ owner hoặc người tạo mới được sửa thông tin công việc
      if (!isOwner && !isItemCreator) {
        return res.status(403).json({ 
          message: 'Bạn chỉ có thể chỉnh sửa thông tin của những công việc do bạn tạo' 
        });
      }

      // Xử lý cập nhật assignedTo
      if (assignedTo !== undefined) {
        let assignedToArray = [];
        
        // Xử lý assignedTo: có thể là null, [], hoặc mảng các ID
        if (assignedTo && Array.isArray(assignedTo) && assignedTo.length > 0) {
          // Validate từng phần tử trong mảng
          for (const id of assignedTo) {
            if (!mongoose.Types.ObjectId.isValid(id)) {
              return res.status(400).json({ message: 'Một trong những người được phân công không hợp lệ' });
            }
          }
          assignedToArray = assignedTo;

          // Kiểm tra tất cả assignedTo có phải là thành viên gia đình không
          for (const assigneeId of assignedToArray) {
            const isValidMember = family.members.some(member => 
              String(member.user) === String(assigneeId)
            ) || String(family.owner) === String(assigneeId);

            if (!isValidMember) {
              return res.status(400).json({ message: 'Tất cả người được phân công phải là thành viên của gia đình' });
            }
          }
        }
        // Nếu assignedTo là null hoặc mảng rỗng thì assignedToArray = []
        
        // Cập nhật assignedTo
        task.assignedTo = assignedToArray;

        // Cập nhật completionStatus: giữ lại status của những người vẫn được assign, thêm mới cho người mới
        const existingCompletions = task.completionStatus || [];
        const newCompletions = [];

        assignedToArray.forEach(assigneeId => {
          const existingCompletion = existingCompletions.find(cs => 
            String(cs.user) === String(assigneeId)
          );
          
          if (existingCompletion) {
            // Giữ lại status cũ
            newCompletions.push(existingCompletion);
          } else {
            // Thêm mới cho người mới được assign
            newCompletions.push({
              user: assigneeId,
              completed: false
            });
          }
        });

        task.completionStatus = newCompletions;

        // Tính lại completion status tổng thể
        const totalAssigned = assignedToArray.length;
        const completedCount = newCompletions.filter(cs => cs.completed).length;
        const allCompleted = totalAssigned > 0 && completedCount === totalAssigned;

        // Cập nhật trạng thái completed tổng thể
        task.completed = allCompleted;
        if (!allCompleted) {
          task.completedAt = undefined;
          task.completedBy = undefined;
        }
      }

      // Cập nhật thông tin việc cần làm
      if (title !== undefined) {
        if (!title.trim()) {
          return res.status(400).json({ message: 'Tiêu đề không được để trống' });
        }
        task.title = title.trim();
      }

      if (description !== undefined) {
        task.description = description?.trim() || '';
      }

      if (priority !== undefined) {
        if (!['low', 'medium', 'high'].includes(priority)) {
          return res.status(400).json({ message: 'Mức độ ưu tiên không hợp lệ' });
        }
        task.priority = priority;
      }

      if (dueDate !== undefined) {
        task.dueDate = dueDate ? new Date(dueDate) : null;
      }
    }

    await family.save();

    // Populate thông tin người tạo, người hoàn thành và người được phân công
    await Family.populate(task, { path: 'createdBy', select: 'name email' });
    await Family.populate(task, { path: 'completedBy', select: 'name email' });
    await Family.populate(task, { path: 'assignedTo', select: 'name email' });
    await Family.populate(task, { path: 'completionStatus.user', select: 'name email' });

    // Tính toán lại các thông số cho response (SỬA LỖI: định nghĩa lại totalAssigned)
    const totalAssigned = task.assignedTo ? task.assignedTo.length : 0;
    const completedCount = task.completionStatus ? task.completionStatus.filter(cs => cs.completed).length : 0;

    const responseItem = {
      ...task.toObject(),
      creatorName: task.createdBy?.name || 'Thành viên',
      completedByName: task.completedBy?.name || null,
      assignedToNames: task.assignedTo ? task.assignedTo.map(assignee => assignee.name || 'Thành viên') : [],
      totalAssigned,
      completedCount,
      completionPercentage: totalAssigned > 0 ? Math.round((completedCount / totalAssigned) * 100) : 0,
      allCompleted: totalAssigned > 0 && completedCount === totalAssigned,
      completionDetails: task.completionStatus || []
    };

    res.json(responseItem);
  } catch (error) {
    console.error('Error updating todo item:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// API: Xóa việc cần làm khỏi danh sách
router.delete('/:familyId/todo-list/:itemId', authenticateToken, async (req, res) => {
  try {
    const { familyId, itemId } = req.params;
    const userId = req.user.id || req.user._id;

    // Tìm gia đình và kiểm tra quyền truy cập
    const family = await Family.findOne({
      _id: familyId,
      $or: [
        { 'members.user': userId },
        { owner: userId }
      ]
    });

    if (!family) {
      return res.status(403).json({ 
        message: 'Bạn không có quyền truy cập gia đình này' 
      });
    }

    // Tìm item trong danh sách
    const item = family.todoList.id(itemId);
    if (!item) {
      return res.status(404).json({ message: 'Không tìm thấy việc cần làm' });
    }

    // Kiểm tra quyền xóa - chỉ owner hoặc người tạo item
    const isOwner = String(family.owner) === String(userId);
    const isItemCreator = String(item.createdBy) === String(userId);

    if (!isOwner && !isItemCreator) {
      return res.status(403).json({ 
        message: 'Bạn chỉ có thể xóa những việc cần làm do bạn tạo' 
      });
    }

    // Lưu thông tin item trước khi xóa để trả về
    const deletedItemInfo = {
      _id: item._id,
      title: item.title,
      description: item.description
    };

    // Xóa item khỏi danh sách
    family.todoList.pull(itemId);
    await family.save();

    res.json({ 
      message: 'Đã xóa việc cần làm thành công',
      deletedItem: deletedItemInfo
    });
  } catch (error) {
    console.error('Error deleting todo item:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Cấu hình multer cho upload hình ảnh hóa đơn
const receiptStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../uploads/receipts');
    // Tạo thư mục nếu chưa tồn tại
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Tạo tên file unique với timestamp và random string
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `receipt-${uniqueSuffix}${ext}`);
  }
});

// File filter cho hình ảnh
const receiptFileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Chỉ cho phép upload file hình ảnh (JPEG, PNG, GIF, WebP)'), false);
  }
};

const uploadReceipt = multer({
  storage: receiptStorage,
  fileFilter: receiptFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// API: Upload hình ảnh hóa đơn
router.post('/:familyId/receipt-images', authenticateToken, uploadReceipt.single('receiptImage'), async (req, res) => {
  try {
    const { familyId } = req.params;
    const userId = req.user.id || req.user._id;
    const { description, amount, date, category, tags, linkedTransactionId } = req.body;

    // Kiểm tra quyền truy cập gia đình
    const family = await Family.findOne({
      _id: familyId,
      $or: [
        { 'members.user': userId },
        { owner: userId }
      ]
    });

    if (!family) {
      return res.status(403).json({ message: 'Bạn không có quyền truy cập gia đình này' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Vui lòng chọn file hình ảnh để upload' });
    }

    // Validate category nếu có
    if (category && !mongoose.Types.ObjectId.isValid(category)) {
      return res.status(400).json({ message: 'ID danh mục không hợp lệ' });
    }

    if (category) {
      const categoryExists = await Category.findById(category);
      if (!categoryExists) {
        return res.status(404).json({ message: 'Danh mục không tồn tại' });
      }
    }

    // THÊM: Validate linkedTransaction nếu có - kiểm tra xem giao dịch đã được liên kết chưa
    if (linkedTransactionId && !mongoose.Types.ObjectId.isValid(linkedTransactionId)) {
      return res.status(400).json({ message: 'ID giao dịch liên kết không hợp lệ' });
    }

    if (linkedTransactionId) {
      const transactionExists = await FamilyTransaction.findOne({
        _id: linkedTransactionId,
        familyId: familyId
      });
      if (!transactionExists) {
        return res.status(404).json({ message: 'Giao dịch liên kết không tồn tại' });
      }

      // THÊM: Kiểm tra xem giao dịch này đã được liên kết với ảnh hóa đơn khác chưa
      const existingReceipt = family.receiptImages.find(img => 
        img.linkedTransaction && String(img.linkedTransaction) === String(linkedTransactionId)
      );

      if (existingReceipt) {
        return res.status(400).json({ 
          message: 'Giao dịch này đã được liên kết với một ảnh hóa đơn khác. Mỗi giao dịch chỉ có thể liên kết với một ảnh hóa đơn.',
          existingReceiptId: existingReceipt._id
        });
      }
    }

    // Tạo receipt image object
    const receiptImage = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: req.file.path,
      mimetype: req.file.mimetype,
      size: req.file.size,
      description: description?.trim() || '',
      amount: amount ? Number(amount) : null,
      date: date ? new Date(date) : new Date(),
      category: category || null,
      tags: tags ? JSON.parse(tags) : [],
      linkedTransaction: linkedTransactionId || null,
      uploadedBy: userId,
      uploadedAt: new Date(),
      isVerified: false
    };

    // Thêm vào mảng receiptImages của family
    if (!Array.isArray(family.receiptImages)) {
      family.receiptImages = [];
    }
    family.receiptImages.push(receiptImage);
    await family.save();

    // Populate thông tin người upload và category
    const createdReceipt = family.receiptImages[family.receiptImages.length - 1];
    await Family.populate(createdReceipt, { path: 'uploadedBy', select: 'name email' });
    await Family.populate(createdReceipt, { path: 'category', select: 'name icon type' });
    await Family.populate(createdReceipt, { path: 'linkedTransaction', select: 'description amount type date' });

    res.status(201).json({
      message: 'Upload hình ảnh hóa đơn thành công',
      receiptImage: createdReceipt
    });
  } catch (error) {
    console.error('Error uploading receipt image:', error);
    
    // Xóa file đã upload nếu có lỗi
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting uploaded file:', unlinkError);
      }
    }
    
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// API: Lấy danh sách hình ảnh hóa đơn của gia đình
router.get('/:familyId/receipt-images', authenticateToken, async (req, res) => {
  try {
    const { familyId } = req.params;
    const userId = req.user.id || req.user._id;
    const { limit = 20, page = 1, isVerified, category, startDate, endDate } = req.query;

    // Kiểm tra quyền truy cập
    const family = await Family.findOne({
      _id: familyId,
      $or: [
        { 'members.user': userId },
        { owner: userId }
      ]
    })
    .populate('receiptImages.uploadedBy', 'name email')
    .populate('receiptImages.verifiedBy', 'name email')
    .populate('receiptImages.category', 'name icon type')
    .populate('receiptImages.linkedTransaction', 'description amount type date');

    if (!family) {
      return res.status(403).json({ message: 'Bạn không có quyền truy cập gia đình này' });
    }

    let receiptImages = family.receiptImages || [];

    // Áp dụng các filter
    if (isVerified !== undefined) {
      receiptImages = receiptImages.filter(img => img.isVerified === (isVerified === 'true'));
    }

    if (category) {
      receiptImages = receiptImages.filter(img => 
        img.category && String(img.category._id || img.category) === String(category)
      );
    }

    if (startDate || endDate) {
      receiptImages = receiptImages.filter(img => {
        const imgDate = new Date(img.date || img.uploadedAt);
        if (startDate && imgDate < new Date(startDate)) return false;
        if (endDate && imgDate > new Date(endDate)) return false;
        return true;
      });
    }

    // Sắp xếp theo ngày upload mới nhất
    receiptImages = receiptImages.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

    // Phân trang
    const totalItems = receiptImages.length;
    const totalPages = Math.ceil(totalItems / parseInt(limit));
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedImages = receiptImages.slice(skip, skip + parseInt(limit));

    // Thêm URL để xem hình ảnh
    const imagesWithUrls = paginatedImages.map(img => ({
      ...img.toObject(),
      imageUrl: `http://localhost:5000/uploads/receipts/${img.filename}`, // URL trực tiếp đến file
      uploaderName: img.uploadedBy?.name || 'Thành viên',
      verifierName: img.verifiedBy?.name || null,
      categoryInfo: img.category ? {
        _id: img.category._id,
        name: img.category.name,
        icon: img.category.icon,
        type: img.category.type
      } : null
    }));

    res.json({
      receiptImages: imagesWithUrls,
      pagination: {
        totalItems,
        totalPages,
        currentPage: parseInt(page),
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching receipt images:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// API: Xem hình ảnh hóa đơn - GIỮ NGUYÊN API NÀY NHƯNG KHÔNG CẦN DÙNG
router.get('/:familyId/receipt-images/:imageId/view', authenticateToken, async (req, res) => {
  try {
    const { familyId, imageId } = req.params;
    const userId = req.user.id || req.user._id;

    // Kiểm tra quyền truy cập
    const family = await Family.findOne({
      _id: familyId,
      $or: [
        { 'members.user': userId },
        { owner: userId }
      ]
    });

    if (!family) {
      return res.status(403).json({ message: 'Bạn không có quyền truy cập gia đình này' });
    }

    // Tìm hình ảnh
    const receiptImage = family.receiptImages.id(imageId);
    if (!receiptImage) {
      return res.status(404).json({ message: 'Không tìm thấy hình ảnh hóa đơn' });
    }

    // Kiểm tra file có tồn tại không
    if (!fs.existsSync(receiptImage.path)) {
      return res.status(404).json({ message: 'File hình ảnh không tồn tại' });
    }

    // Trả về file hình ảnh
    res.setHeader('Content-Type', receiptImage.mimetype);
    res.setHeader('Content-Disposition', `inline; filename="${receiptImage.originalName}"`);
    res.sendFile(path.resolve(receiptImage.path));
  } catch (error) {
    console.error('Error viewing receipt image:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// API: Cập nhật thông tin hình ảnh hóa đơn
router.patch('/:familyId/receipt-images/:imageId', authenticateToken, async (req, res) => {
  try {
    const { familyId, imageId } = req.params;
    const userId = req.user.id || req.user._id;
    const { description, amount, date, category, tags } = req.body;

    // Kiểm tra quyền truy cập
    const family = await Family.findOne({
      _id: familyId,
      $or: [
        { 'members.user': userId },
        { owner: userId }
      ]
    });

    if (!family) {
      return res.status(403).json({ message: 'Bạn không có quyền truy cập gia đình này' });
    }

    // Tìm hình ảnh
    const receiptImage = family.receiptImages.id(imageId);
    if (!receiptImage) {
      return res.status(404).json({ message: 'Không tìm thấy hình ảnh hóa đơn' });
    }

    // SỬA: Kiểm tra quyền chỉnh sửa - OWNER hoặc người upload
    const isOwner = String(family.owner) === String(userId);
    const isUploader = String(receiptImage.uploadedBy) === String(userId);

    if (!isOwner && !isUploader) {
      return res.status(403).json({ 
        message: 'Chỉ chủ gia đình hoặc người upload mới có thể chỉnh sửa hình ảnh hóa đơn này' 
      });
    }

    // Validate category nếu có
    if (category !== undefined) {
      if (category && !mongoose.Types.ObjectId.isValid(category)) {
        return res.status(400).json({ message: 'ID danh mục không hợp lệ' });
      }

      if (category) {
        const categoryExists = await Category.findById(category);
        if (!categoryExists) {
          return res.status(404).json({ message: 'Danh mục không tồn tại' });
        }
      }
      
      receiptImage.category = category || null;
    }

    // Cập nhật thông tin
    if (description !== undefined) {
      receiptImage.description = description?.trim() || '';
    }

    if (amount !== undefined) {
      receiptImage.amount = amount ? Number(amount) : null;
    }

    if (date !== undefined) {
      receiptImage.date = date ? new Date(date) : receiptImage.date;
    }

    if (tags !== undefined) {
      receiptImage.tags = Array.isArray(tags) ? tags : [];
    }

    await family.save();

    // Populate và trả về
    await Family.populate(receiptImage, { path: 'uploadedBy', select: 'name email' });
    await Family.populate(receiptImage, { path: 'category', select: 'name icon type' });
    await Family.populate(receiptImage, { path: 'linkedTransaction', select: 'description amount type date' });

    res.json({
      message: 'Cập nhật thông tin hình ảnh hóa đơn thành công',
      receiptImage: receiptImage
    });
  } catch (error) {
    console.error('Error updating receipt image:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// API: Xác minh hình ảnh hóa đơn (chỉ owner)
router.patch('/:familyId/receipt-images/:imageId/verify', authenticateToken, async (req, res) => {
  try {
    const { familyId, imageId } = req.params;
    const userId = req.user.id || req.user._id;
    const { isVerified } = req.body;

    // Kiểm tra quyền owner
    const family = await Family.findOne({
      _id: familyId,
      owner: userId
    });

    if (!family) {
      return res.status(403).json({ message: 'Chỉ chủ gia đình mới có thể xác minh hóa đơn' });
    }

    // Tìm hình ảnh
    const receiptImage = family.receiptImages.id(imageId);
    if (!receiptImage) {
      return res.status(404).json({ message: 'Không tìm thấy hình ảnh hóa đơn' });
    }

    // Cập nhật trạng thái xác minh
    receiptImage.isVerified = Boolean(isVerified);
    if (receiptImage.isVerified) {
      receiptImage.verifiedBy = userId;
      receiptImage.verifiedAt = new Date();
    } else {
      receiptImage.verifiedBy = undefined;
      receiptImage.verifiedAt = undefined;
    }

    await family.save();

    // Populate và trả về
    await Family.populate(receiptImage, { path: 'uploadedBy', select: 'name email' });
    await Family.populate(receiptImage, { path: 'verifiedBy', select: 'name email' });
    await Family.populate(receiptImage, { path: 'category', select: 'name icon type' });

    res.json({
      message: `Hình ảnh hóa đơn đã được ${isVerified ? 'xác minh' : 'bỏ xác minh'}`,
      receiptImage: receiptImage
    });
  } catch (error) {
    console.error('Error verifying receipt image:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// API: Xóa hình ảnh hóa đơn
router.delete('/:familyId/receipt-images/:imageId', authenticateToken, async (req, res) => {
  try {
    const { familyId, imageId } = req.params;
    const userId = req.user.id || req.user._id;

    // Kiểm tra quyền truy cập
    const family = await Family.findOne({
      _id: familyId,
      $or: [
        { 'members.user': userId },
        { owner: userId }
      ]
    });

    if (!family) {
      return res.status(403).json({ message: 'Bạn không có quyền truy cập gia đình này' });
    }

    // Tìm hình ảnh
    const receiptImage = family.receiptImages.id(imageId);
    if (!receiptImage) {
      return res.status(404).json({ message: 'Không tìm thấy hình ảnh hóa đơn' });
    }

    // Kiểm tra quyền xóa
    const isOwner = String(family.owner) === String(userId);
    const isUploader = String(receiptImage.uploadedBy) === String(userId);

    if (!isOwner && !isUploader) {
      return res.status(403).json({ 
        message: 'Bạn chỉ có thể xóa hình ảnh hóa đơn do bạn upload' 
      });
    }

    // Lưu thông tin file để xóa
    const filePath = receiptImage.path;
    const imageInfo = {
      _id: receiptImage._id,
      originalName: receiptImage.originalName,
      description: receiptImage.description
    };

    // Xóa khỏi database
    family.receiptImages.pull(imageId);
    await family.save();

    // Xóa file vật lý
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (fileError) {
      console.error('Error deleting physical file:', fileError);
      // Không throw error vì database đã được cập nhật
    }

    res.json({
      message: 'Xóa hình ảnh hóa đơn thành công',
      deletedImage: imageInfo
    });
  } catch (error) {
    console.error('Error deleting receipt image:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// API: Liên kết hình ảnh hóa đơn với giao dịch
router.patch('/:familyId/receipt-images/:imageId/link-transaction', authenticateToken, async (req, res) => {
  try {
    const { familyId, imageId } = req.params;
    const userId = req.user.id || req.user._id;
    const { transactionId } = req.body;

    if (!transactionId) {
      return res.status(400).json({ message: 'ID giao dịch là bắt buộc' });
    }

    // Kiểm tra quyền truy cập
    const family = await Family.findOne({
      _id: familyId,
      $or: [
        { 'members.user': userId },
        { owner: userId }
      ]
    });

    if (!family) {
      return res.status(403).json({ message: 'Bạn không có quyền truy cập gia đình này' });
    }

    // Tìm hình ảnh
    const receiptImage = family.receiptImages.id(imageId);
    if (!receiptImage) {
      return res.status(404).json({ message: 'Không tìm thấy hình ảnh hóa đơn' });
    }

    // Kiểm tra giao dịch có tồn tại không
    const transaction = await FamilyTransaction.findOne({
      _id: transactionId,
      familyId: familyId
    });

    if (!transaction) {
      return res.status(404).json({ message: 'Giao dịch không tồn tại trong gia đình này' });
    }

    // THÊM: Kiểm tra xem giao dịch này đã được liên kết với ảnh hóa đơn khác chưa
    const existingReceipt = family.receiptImages.find(img => 
      img.linkedTransaction && 
      String(img.linkedTransaction) === String(transactionId) &&
      String(img._id) !== String(imageId) // Bỏ qua ảnh hiện tại
    );

    if (existingReceipt) {
      return res.status(400).json({ 
        message: 'Giao dịch này đã được liên kết với một ảnh hóa đơn khác. Mỗi giao dịch chỉ có thể liên kết với một ảnh hóa đơn.',
        existingReceiptId: existingReceipt._id
      });
    }

    // SỬA: Kiểm tra quyền chỉnh sửa - OWNER hoặc người upload
    const isOwner = String(family.owner) === String(userId);
    const isUploader = String(receiptImage.uploadedBy) === String(userId);

    if (!isOwner && !isUploader) {
      return res.status(403).json({ 
        message: 'Chỉ chủ gia đình hoặc người upload mới có thể liên kết hình ảnh hóa đơn này' 
      });
    }

    // Liên kết với giao dịch
    receiptImage.linkedTransaction = transactionId;
    await family.save();

    // Populate và trả về
    await Family.populate(receiptImage, { path: 'linkedTransaction', select: 'description amount type date' });

    res.json({
      message: 'Liên kết hình ảnh hóa đơn với giao dịch thành công',
      receiptImage: receiptImage
    });
  } catch (error) {
    console.error('Error linking receipt to transaction:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// API: Hủy liên kết hình ảnh hóa đơn với giao dịch
router.patch('/:familyId/receipt-images/:imageId/unlink-transaction', authenticateToken, async (req, res) => {
  try {
    const { familyId, imageId } = req.params;
    const userId = req.user.id || req.user._id;

    // Kiểm tra quyền truy cập
    const family = await Family.findOne({
      _id: familyId,
      $or: [
        { 'members.user': userId },
        { owner: userId }
      ]
    });

    if (!family) {
      return res.status(403).json({ message: 'Bạn không có quyền truy cập gia đình này' });
    }

    // Tìm hình ảnh
    const receiptImage = family.receiptImages.id(imageId);
    if (!receiptImage) {
      return res.status(404).json({ message: 'Không tìm thấy hình ảnh hóa đơn' });
    }

    // SỬA: Kiểm tra quyền chỉnh sửa - OWNER hoặc người upload
    const isOwner = String(family.owner) === String(userId);
    const isUploader = String(receiptImage.uploadedBy) === String(userId);

    if (!isOwner && !isUploader) {
      return res.status(403).json({ 
        message: 'Chỉ chủ gia đình hoặc người upload mới có thể hủy liên kết hình ảnh hóa đơn này' 
      });
    }

    // Hủy liên kết
    receiptImage.linkedTransaction = null;
    await family.save();

    res.json({
      message: 'Hủy liên kết hình ảnh hóa đơn với giao dịch thành công',
      receiptImage: receiptImage
    });
  } catch (error) {
    console.error('Error unlinking receipt from transaction:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// API: Tìm kiếm hình ảnh hóa đơn
router.get('/:familyId/receipt-images/search', authenticateToken, async (req, res) => {
  try {
    const { familyId } = req.params;
    const userId = req.user.id || req.user._id;
    const { q, minAmount, maxAmount, tags, isVerified } = req.query;

    // Kiểm tra quyền truy cập
    const family = await Family.findOne({
      _id: familyId,
      $or: [
        { 'members.user': userId },
        { owner: userId }
      ]
    })
    .populate('receiptImages.uploadedBy', 'name email')
    .populate('receiptImages.category', 'name icon type')
    .populate('receiptImages.linkedTransaction', 'description amount type date');

    if (!family) {
      return res.status(403).json({ message: 'Bạn không có quyền truy cập gia đình này' });
    }

    let receiptImages = family.receiptImages || [];

    // Tìm kiếm theo từ khóa
    if (q) {
      const searchTerm = q.toLowerCase();
      receiptImages = receiptImages.filter(img => 
        (img.description && img.description.toLowerCase().includes(searchTerm)) ||
        (img.originalName && img.originalName.toLowerCase().includes(searchTerm)) ||
        (img.metadata && img.metadata.vendor && img.metadata.vendor.toLowerCase().includes(searchTerm))
      );
    }

    // Lọc theo số tiền
    if (minAmount || maxAmount) {
      receiptImages = receiptImages.filter(img => {
        const amount = img.amount || img.metadata?.totalAmount || 0;
        if (minAmount && amount < Number(minAmount)) return false;
        if (maxAmount && amount > Number(maxAmount)) return false;
        return true;
      });
    }

    // Lọc theo tags
    if (tags) {
      const searchTags = tags.split(',').map(tag => tag.trim().toLowerCase());
      receiptImages = receiptImages.filter(img => 
        img.tags && img.tags.some(tag => 
          searchTags.includes(tag.toLowerCase())
        )
      );
    }

    // Lọc theo trạng thái xác minh
    if (isVerified !== undefined) {
      receiptImages = receiptImages.filter(img => 
        img.isVerified === (isVerified === 'true')
      );
    }

    // Sắp xếp theo ngày upload mới nhất
    receiptImages = receiptImages.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

    // Thêm URL để xem hình ảnh - SỬA LẠI PHẦN NÀY
    const imagesWithUrls = receiptImages.map(img => ({
      ...img.toObject(),
      imageUrl: `/api/family/${familyId}/receipt-images/${img._id}/view`,
      uploaderName: img.uploadedBy?.name || 'Thành viên'
    }));

    res.json({
      receiptImages: imagesWithUrls,
      totalResults: imagesWithUrls.length,
      searchQuery: { q, minAmount, maxAmount, tags, isVerified }
    });
  } catch (error) {
    console.error('Error searching receipt images:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
