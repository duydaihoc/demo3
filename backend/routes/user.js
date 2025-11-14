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

// GET /api/users/statistics - Lấy thống kê người dùng
router.get('/statistics', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id || req.user.userId;
    const mongoose = require('mongoose');
    const Wallet = mongoose.model('Wallet');
    const Group = mongoose.model('Group');
    const Family = mongoose.model('Family');
    const Transaction = mongoose.model('Transaction');
    const GroupTransaction = mongoose.model('GroupTransaction');
    const FamilyTransaction = mongoose.model('FamilyTransaction');

    // Lấy thông tin user để lấy createdAt và đếm friends
    const user = await User.findById(userId).select('createdAt friends email');
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    // 1. Đếm số ví
    const walletCount = await Wallet.countDocuments({ owner: userId });

    // 2. Đếm số nhóm (tạo và tham gia)
    const createdGroups = await Group.countDocuments({ owner: userId });
    const joinedGroups = await Group.countDocuments({
      'members.user': userId,
      owner: { $ne: userId }
    });

    // 3. Đếm số gia đình (tạo và tham gia)
    const createdFamilies = await Family.countDocuments({ owner: userId });
    const joinedFamilies = await Family.countDocuments({
      'members.user': userId,
      owner: { $ne: userId }
    });

    // 4. Đếm giao dịch cá nhân THUẦN TÚY
    const userWallets = await Wallet.find({ owner: userId }).select('_id');
    const walletIds = userWallets.map(w => w._id);
    
    const personalTransactions = await Transaction.countDocuments({
      wallet: { $in: walletIds },
      $and: [
        { 'metadata.familyId': { $exists: false } },
        { 'metadata.familyTransactionId': { $exists: false } }
      ]
    });

    // 5. Đếm giao dịch nhóm
    const allUserCreatedTxs = await GroupTransaction.find({
      $or: [
        { createdBy: userId },
        { createdBy: new mongoose.Types.ObjectId(userId) },
        { 'createdBy._id': userId },
        { 'createdBy._id': new mongoose.Types.ObjectId(userId) },
        { createdBy: { $eq: userId } },
        { createdBy: { $eq: new mongoose.Types.ObjectId(userId) } }
      ]
    }).select('_id transactionType createdBy payer participants').lean();
    
    const allGroupTxs = allUserCreatedTxs.filter(tx => {
      if (!tx.createdBy) return false;
      
      if (typeof tx.createdBy === 'string' || tx.createdBy instanceof mongoose.Types.ObjectId) {
        return String(tx.createdBy) === String(userId);
      }
      
      if (tx.createdBy._id) {
        return String(tx.createdBy._id) === String(userId);
      }
      
      if (Array.isArray(tx.createdBy)) {
        return tx.createdBy.some(id => String(id) === String(userId));
      }
      
      return false;
    });

    const uniqueGroupTxMap = new Map();
    allGroupTxs.forEach(tx => {
      const key = String(tx._id);
      if (!uniqueGroupTxMap.has(key)) {
        uniqueGroupTxMap.set(key, tx);
      }
    });

    const uniqueGroupTxs = Array.from(uniqueGroupTxMap.values());
    const groupTransactions = uniqueGroupTxs.length;

    const groupTxByType = {
      payer_single: 0,
      payer_for_others: 0,
      equal_split: 0,
      percentage_split: 0
    };

    uniqueGroupTxs.forEach(tx => {
      const type = tx.transactionType || 'equal_split';
      if (groupTxByType.hasOwnProperty(type)) {
        groupTxByType[type]++;
      }
    });

    // 6. Đếm giao dịch gia đình
    const userFamilies = await Family.find({
      $or: [
        { owner: userId },
        { 'members.user': userId }
      ]
    }).select('_id');
    
    const familyIds = userFamilies.map(f => f._id);

    const familyTransferTransactions = await FamilyTransaction.countDocuments({
      familyId: { $in: familyIds },
      createdBy: userId,
      tags: 'transfer'
    });

    const familyPersonalTransactions = await FamilyTransaction.countDocuments({
      familyId: { $in: familyIds },
      createdBy: userId,
      transactionScope: 'personal',
      tags: { $ne: 'transfer' }
    });

    const familyFundTransactions = await FamilyTransaction.countDocuments({
      familyId: { $in: familyIds },
      createdBy: userId,
      transactionScope: 'family',
      tags: { $ne: 'transfer' }
    });

    const totalFamilyTransactions = familyTransferTransactions + familyPersonalTransactions + familyFundTransactions;

    // Tính số ngày đã tạo tài khoản
    const accountAge = {
      createdAt: user.createdAt,
      days: Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    };

    // Đếm số bạn bè
    const friendsCount = Array.isArray(user.friends) ? user.friends.length : 0;

    res.json({
      account: {
        createdAt: accountAge.createdAt,
        age: accountAge.days,
        friends: friendsCount
      },
      wallets: walletCount,
      groups: {
        created: createdGroups,
        joined: joinedGroups,
        total: createdGroups + joinedGroups
      },
      families: {
        created: createdFamilies,
        joined: joinedFamilies,
        total: createdFamilies + joinedFamilies
      },
      transactions: {
        personal: personalTransactions,
        group: groupTransactions,
        groupByType: groupTxByType,
        family: {
          transfer: familyTransferTransactions,
          personal: familyPersonalTransactions,
          fund: familyFundTransactions,
          total: totalFamilyTransactions
        },
        total: personalTransactions + groupTransactions + totalFamilyTransactions
      }
    });
  } catch (err) {
    console.error('Error fetching user statistics:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

module.exports = router;
