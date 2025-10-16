const express = require('express');
const router = express.Router();
const Family = require('../models/family');
const FamilyInvitation = require('../models/FamilyInvitation');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const FamilyTransaction = require('../models/FamilyTransaction');
const FamilyBalance = require('../models/FamilyBalance');

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

    // { added: Khởi tạo số dư cho owner ngay khi tạo gia đình }
    await FamilyBalance.updateBalance(newFamily._id, userId, 0, 'income', 'personal');

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
    const transactionsToDelete = await FamilyTransaction.find({ familyId, createdBy: memberId });
    for (const tx of transactionsToDelete) {
      // Hoàn tác số dư: nếu income thì trừ amount, nếu expense thì cộng lại amount
      const updateAmount = tx.type === 'income' ? -tx.amount : tx.amount;
      await FamilyBalance.updateBalance(familyId, memberId, updateAmount, 'income', tx.transactionScope);
    }
    // Xóa tất cả giao dịch của thành viên
    await FamilyTransaction.deleteMany({ familyId, createdBy: memberId });

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
    
    // { added: Xóa tất cả dữ liệu liên quan đến gia đình }
    // Xóa tất cả giao dịch của gia đình
    await FamilyTransaction.deleteMany({ familyId });
    
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
    const transactionsToDelete = await FamilyTransaction.find({ familyId, createdBy: userId });
    for (const tx of transactionsToDelete) {
      // Hoàn tác số dư: nếu income thì trừ amount, nếu expense thì cộng lại amount
      const updateAmount = tx.type === 'income' ? -tx.amount : tx.amount;
      await FamilyBalance.updateBalance(familyId, userId, updateAmount, 'income', tx.transactionScope);
    }
    // Xóa tất cả giao dịch của thành viên
    await FamilyTransaction.deleteMany({ familyId, createdBy: userId });

    // { added: Xóa số dư cá nhân của thành viên khỏi FamilyBalance }
    await FamilyBalance.updateOne(
      { familyId },
      { $pull: { memberBalances: { userId: userId } } }
    );

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

module.exports = router;
