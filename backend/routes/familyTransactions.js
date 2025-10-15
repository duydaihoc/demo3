const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const FamilyTransaction = require('../models/FamilyTransaction');
const Family = require('../models/family');
const Category = require('../models/Category');
const FamilyBalance = require('../models/FamilyBalance');
const User = require('../models/User'); // Thêm import User model

// Middleware xác thực token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'secretKey', (err, user) => {
    if (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Middleware kiểm tra quyền thành viên gia đình
const isFamilyMember = async (req, res, next) => {
  try {
    const familyId = req.params.familyId || req.body.familyId;
    if (!familyId) {
      return res.status(400).json({ message: 'Family ID is required' });
    }

    const userId = req.user.id || req.user._id;
    const family = await Family.findById(familyId);

    if (!family) {
      return res.status(404).json({ message: 'Family not found' });
    }

    // Kiểm tra user là owner hoặc member
    const isMember = family.members.some(member => 
      (member.user && String(member.user) === String(userId)) || 
      (member.email && member.email === req.user.email)
    );
    const isOwner = String(family.owner) === String(userId);

    if (!isMember && !isOwner) {
      return res.status(403).json({ message: 'You are not a member of this family' });
    }

    req.family = family;
    next();
  } catch (error) {
    console.error('Error checking family membership:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/family/:familyId/transactions - Lấy tất cả giao dịch của một gia đình
router.get('/:familyId/transactions', authenticateToken, isFamilyMember, async (req, res) => {
  try {
    const { familyId } = req.params;
    const { 
      limit = 20, 
      page = 1, 
      type, 
      startDate, 
      endDate, 
      category, 
      sort = 'date',
      order = 'desc',
      transactionScope
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Xây dựng query filter
    const filter = { familyId };
    
    if (type) filter.type = type;
    if (category) filter.category = category;
    if (transactionScope) filter.transactionScope = transactionScope;
    
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }
    
    // Thực hiện query với phân trang và sort
    const sortOption = {};
    sortOption[sort] = order === 'asc' ? 1 : -1;
    
    const transactions = await FamilyTransaction.find(filter)
      .populate('category', 'name icon type')
      .populate('createdBy', 'name email')
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit));
    
    // Thêm thông tin vai trò và tên cho từng giao dịch
    const family = await Family.findById(familyId);
    const transactionsWithRoles = transactions.map(tx => {
      const txObj = tx.toObject();
      
      // Lấy thông tin người tạo
      const creatorId = txObj.createdBy?._id || txObj.createdBy;
      const creatorEmail = txObj.createdBy?.email;
      const creatorName = txObj.createdBy?.name || '';
      
      // Tìm vai trò của người tạo trong gia đình
      let creatorRole = '';
      if (family?.members) {
        const member = family.members.find(m => {
          // So sánh theo user ID
          if (m.user && creatorId && String(m.user) === String(creatorId)) {
            return true;
          }
          // So sánh theo email nếu không có user ID
          if (m.email && creatorEmail && m.email.toLowerCase() === creatorEmail.toLowerCase()) {
            return true;
          }
          return false;
        });
        
        if (member) {
          creatorRole = member.familyRole || '';
        }
      }
      
      // Thêm thông tin vào transaction object
      txObj.creatorName = creatorName;
      txObj.creatorRole = creatorRole;
      
      return txObj;
    });
    
    // Đếm tổng số giao dịch để phân trang
    const totalCount = await FamilyTransaction.countDocuments(filter);
    
    res.json({
      transactions: transactionsWithRoles,
      pagination: {
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        currentPage: parseInt(page),
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching family transactions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/family/transactions/:id - Lấy chi tiết một giao dịch
router.get('/transactions/:id', authenticateToken, async (req, res) => {
  try {
    const transaction = await FamilyTransaction.findById(req.params.id)
      .populate('category', 'name icon type')
      .populate('createdBy', 'name email')
      .populate('familyId', 'name');
    
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    
    // Kiểm tra quyền truy cập
    const familyId = transaction.familyId._id || transaction.familyId;
    const family = await Family.findById(familyId);
    
    if (!family) {
      return res.status(404).json({ message: 'Family not found' });
    }
    
    const userId = req.user.id || req.user._id;
    const isMember = family.members.some(member => 
      (member.user && String(member.user) === String(userId)) || 
      (member.email && member.email === req.user.email)
    );
    
    if (!isMember && String(family.owner) !== String(userId)) {
      return res.status(403).json({ message: 'You do not have permission to view this transaction' });
    }
    
    // Thêm thông tin vai trò và tên
    const txObj = transaction.toObject();
    const creatorId = txObj.createdBy?._id || txObj.createdBy;
    const creatorEmail = txObj.createdBy?.email;
    const creatorName = txObj.createdBy?.name || '';
    
    let creatorRole = '';
    if (family?.members) {
      const member = family.members.find(m => {
        if (m.user && creatorId && String(m.user) === String(creatorId)) {
          return true;
        }
        if (m.email && creatorEmail && m.email.toLowerCase() === creatorEmail.toLowerCase()) {
          return true;
        }
        return false;
      });
      
      if (member) {
        creatorRole = member.familyRole || '';
      }
    }
    
    txObj.creatorName = creatorName;
    txObj.creatorRole = creatorRole;
    
    res.json(txObj);
  } catch (error) {
    console.error('Error fetching transaction details:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/family/transactions - Tạo giao dịch mới
router.post('/transactions', authenticateToken, async (req, res) => {
  try {
    const { 
      familyId, 
      type, 
      amount, 
      category, 
      description, 
      transactionScope, 
      date,
      tags = []
    } = req.body;
    
    if (!familyId || !type || !amount || !category) {
      return res.status(400).json({ message: 'Missing required fields: familyId, type, amount, category' });
    }
    
    // Kiểm tra quyền
    const family = await Family.findById(familyId);
    if (!family) {
      return res.status(404).json({ message: 'Family not found' });
    }
    
    const userId = req.user.id || req.user._id;
    const isMember = family.members.some(member => 
      (member.user && String(member.user) === String(userId)) || 
      (member.email && member.email === req.user.email)
    );
    
    if (!isMember && String(family.owner) !== String(userId)) {
      return res.status(403).json({ message: 'You do not have permission to create transactions for this family' });
    }
    
    // Kiểm tra category có hợp lệ
    const categoryObj = await Category.findById(category);
    if (!categoryObj) {
      return res.status(404).json({ message: 'Category not found' });
    }
    
    // Kiểm tra số dư nếu là giao dịch chi tiêu
    if (type === 'expense') {
      const balance = await FamilyBalance.getBalance(familyId);
      
      if (transactionScope === 'family' && balance.familyBalance < amount) {
        return res.status(400).json({ message: 'Số dư gia đình không đủ để thực hiện giao dịch này' });
      } 
      
      if (transactionScope === 'personal') {
        // Cải thiện việc tìm kiếm memberBalance - so sánh cả ID và email
        const memberBalance = balance.memberBalances.find(m => 
          String(m.userId) === String(userId) || 
          (m.userEmail && m.userEmail.toLowerCase() === req.user.email.toLowerCase())
        );
        
        console.log("User ID:", userId);
        console.log("User Email:", req.user.email);
        console.log("Available Balances:", balance.memberBalances.map(m => ({
          userId: m.userId,
          userEmail: m.userEmail,
          balance: m.balance
        })));
        
        if (!memberBalance || memberBalance.balance < amount) {
          const currentBalance = memberBalance ? memberBalance.balance : 0;
          return res.status(400).json({ 
            message: `Số dư cá nhân không đủ để thực hiện giao dịch này. Số dư hiện tại: ${currentBalance}` 
          });
        }
      }
    }
    
    // Tạo transaction mới
    const transaction = new FamilyTransaction({
      familyId,
      type,
      amount,
      category,
      description: description || '',
      transactionScope: transactionScope || 'family',
      date: date || new Date(),
      createdBy: userId,
      creatorName: req.user.name || '',
      tags: tags
    });
    
    await transaction.save();
    
    // Cập nhật số dư
    await FamilyBalance.updateBalance(
      familyId,
      userId,
      amount,
      type,
      transactionScope || 'family'
    );
    
    // Populate và trả về
    await transaction.populate('category', 'name icon type');
    await transaction.populate('createdBy', 'name email');
    
    res.status(201).json(transaction);
  } catch (error) {
    console.error('Error creating family transaction:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/family/transactions/:id - Cập nhật giao dịch
router.put('/transactions/:id', authenticateToken, async (req, res) => {
  try {
    const { 
      type, 
      amount, 
      category, 
      description, 
      transactionScope, 
      date,
      tags
    } = req.body;
    
    // Tìm và kiểm tra quyền
    const transaction = await FamilyTransaction.findById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    
    const userId = req.user.id || req.user._id;
    
    // Chỉ người tạo hoặc owner mới được sửa
    if (String(transaction.createdBy) !== String(userId)) {
      const family = await Family.findById(transaction.familyId);
      if (!family || String(family.owner) !== String(userId)) {
        return res.status(403).json({ message: 'You do not have permission to update this transaction' });
      }
    }

    // Lưu trữ giá trị cũ để tính toán sự thay đổi số dư
    const oldType = transaction.type;
    const oldAmount = transaction.amount;
    const oldTransactionScope = transaction.transactionScope;
    
    // Xác định giá trị mới
    const newType = type || oldType;
    const newAmount = amount || oldAmount;
    const newTransactionScope = transactionScope || oldTransactionScope;
    
    // Tính toán sự thay đổi số dư
    // oldBalanceChange: số tiền mà giao dịch cũ đã thay đổi số dư (income: +amount, expense: -amount)
    const oldBalanceChange = oldType === 'income' ? oldAmount : -oldAmount;
    // newBalanceChange: số tiền mà giao dịch mới sẽ thay đổi số dư
    const newBalanceChange = newType === 'income' ? newAmount : -newAmount;
    // balanceDifference: sự khác biệt cần cập nhật (new - old)
    const balanceDifference = newBalanceChange - oldBalanceChange;
    
    // Nếu có sự thay đổi số dư, cập nhật
    if (balanceDifference !== 0) {
      // Nếu balanceDifference âm, nghĩa là cần trừ thêm từ số dư, cần kiểm tra trước
      if (balanceDifference < 0) {
        const balance = await FamilyBalance.getBalance(transaction.familyId);
        const amountNeeded = Math.abs(balanceDifference);
        
        if (newTransactionScope === 'family') {
          if (balance.familyBalance < amountNeeded) {
            return res.status(400).json({ message: 'Số dư gia đình không đủ để thực hiện giao dịch này' });
          }
        } else {
          const memberBalance = balance.memberBalances.find(m => String(m.userId) === String(userId));
          if (!memberBalance || memberBalance.balance < amountNeeded) {
            return res.status(400).json({ message: 'Số dư cá nhân không đủ để thực hiện giao dịch này' });
          }
        }
      }
      
      // Cập nhật số dư theo sự khác biệt
      if (newTransactionScope === 'family') {
        await FamilyBalance.updateBalance(transaction.familyId, userId, balanceDifference, 'income', 'family');
      } else {
        await FamilyBalance.updateBalance(transaction.familyId, userId, balanceDifference, 'income', 'personal');
      }
    }
    
    // Cập nhật các trường giao dịch
    if (type) transaction.type = type;
    if (amount) transaction.amount = amount;
    if (category) {
      const categoryObj = await Category.findById(category);
      if (!categoryObj) {
        return res.status(404).json({ message: 'Category not found' });
      }
      transaction.category = category;
    }
    if (description !== undefined) transaction.description = description;
    if (transactionScope) transaction.transactionScope = transactionScope;
    if (date) transaction.date = date;
    if (tags) transaction.tags = tags;
    
    // Lưu giao dịch đã cập nhật
    await transaction.save();
    
    // Populate và trả về
    await transaction.populate('category', 'name icon type');
    await transaction.populate('createdBy', 'name email');
    
    res.json(transaction);
  } catch (error) {
    console.error('Error updating transaction:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/family/transactions/:id - Xóa giao dịch
router.delete('/transactions/:id', authenticateToken, async (req, res) => {
  try {
    const transaction = await FamilyTransaction.findById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    
    const userId = req.user.id || req.user._id;
    
    // Chỉ người tạo hoặc owner mới được xóa
    if (String(transaction.createdBy) !== String(userId)) {
      const family = await Family.findById(transaction.familyId);
      if (!family || String(family.owner) !== String(userId)) {
        return res.status(403).json({ message: 'You do not have permission to delete this transaction' });
      }
    }
    
    // Hoàn tác số dư của giao dịch này
    const updateAmount = transaction.type === 'income' ? -transaction.amount : transaction.amount; // Đảo ngược để hoàn tác
    
    if (transaction.transactionScope === 'family') {
      await FamilyBalance.updateBalance(transaction.familyId, userId, updateAmount, 'income', 'family');
    } else {
      await FamilyBalance.updateBalance(transaction.familyId, userId, updateAmount, 'income', 'personal');
    }
    
    // Xóa giao dịch
    await FamilyTransaction.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Transaction deleted successfully' });
  } catch (error) {
    console.error('Error deleting transaction:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/family/:familyId/balance - Lấy số dư của gia đình
router.get('/:familyId/balance', authenticateToken, isFamilyMember, async (req, res) => {
  try {
    const { familyId } = req.params;
    
    const balance = await FamilyBalance.getBalance(familyId);
     
    // Lấy thông tin bổ sung về thành viên
    if (balance.memberBalances && balance.memberBalances.length > 0) {
      for (const member of balance.memberBalances) {
        if (member.userId && !member.userName) {
          try {
            const user = await User.findById(member.userId, 'name email');
            if (user) {
              member.userName = user.name;
              member.userEmail = user.email;
            }
          } catch (e) {
            console.error(`Error fetching user ${member.userId}:`, e);
          }
        }
      }
      
      await balance.save();
    }
    
    res.json(balance);
  } catch (error) {
    console.error('Error fetching family balance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/family/:familyId/transactions/summary - Lấy báo cáo tổng hợp theo danh mục
router.get('/:familyId/transactions/summary', authenticateToken, isFamilyMember, async (req, res) => {
  try {
    const { familyId } = req.params;
    const { startDate, endDate, type = 'expense' } = req.query;
    
    // Ngày bắt đầu và kết thúc mặc định là tháng hiện tại
    const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = endDate ? new Date(endDate) : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
    
    const summary = await FamilyTransaction.getCategorySummary(familyId, start, end, type);
    
    // Tính tổng
    const totalAmount = summary.reduce((acc, item) => acc + item.totalAmount, 0);
    
    res.json({
      summary,
      totalAmount,
      period: {
        startDate: start,
        endDate: end
      }
    });
  } catch (error) {
    console.error('Error generating transaction summary:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/family/:familyId/transactions/monthly/:year/:month - Lấy giao dịch theo tháng
router.get('/:familyId/transactions/monthly/:year/:month', authenticateToken, isFamilyMember, async (req, res) => {
  try {
    const { familyId, year, month } = req.params;
    
    const transactions = await FamilyTransaction.getMonthlyTransactions(familyId, parseInt(year), parseInt(month));
     
    // Tính tổng thu và chi
    const income = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
      
    const expense = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    
    res.json({
      transactions,
      summary: {
        income,
        expense,
        balance: income - expense
      }
    });
  } catch (error) {
    console.error('Error fetching monthly transactions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
