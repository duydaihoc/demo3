const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const FamilyTransaction = require('../models/FamilyTransaction');
const Family = require('../models/family');
const Category = require('../models/Category');
const FamilyBalance = require('../models/FamilyBalance');
const User = require('../models/User'); // Thêm import User model
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');

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
      transactionScope,
      excludeActivities, // new/existing
      includeActivities // NEW: include only transfer activities
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Xây dựng query filter
    const filter = { familyId };
    
    // giữ các filter cụ thể nếu client truyền
    if (type) filter.type = type;
    if (category) filter.category = category;

    // Nếu client truyền transactionScope thì tôn trọng
    if (transactionScope) {
      filter.transactionScope = transactionScope;
      // Khi query với transactionScope=personal, owner có thể xem tất cả personal transactions của các thành viên
      // Không cần giới hạn createdBy vì đã filter theo transactionScope=personal
      // Chỉ lấy personal transactions, không lấy family transactions
    } else {
      // Nếu không có transactionScope, mặc định lấy family + personal của user hiện tại
      const userId = req.user.id || req.user._id;
      filter.$or = [
        { transactionScope: 'family' },
        { transactionScope: 'personal', createdBy: userId }
      ];
    }

    // Nếu client muốn CHỈ LẤY các hoạt động nạp/rút (tag 'transfer'), dùng includeActivities=true
    if (includeActivities === 'true' || includeActivities === '1') {
      // match documents where tags array contains 'transfer'
      filter.tags = 'transfer';
    } else if (excludeActivities === 'true' || excludeActivities === '1') {
      // exclude transfer activities
      filter.tags = { $ne: 'transfer' };
    }

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
      .populate('linkedWallet', 'name currency')
      .populate('linkedTransaction', 'amount type date')
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
    )
    
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
      tags = [],
      walletId  // Thêm walletId để tự động link với ví
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
    
    // Kiểm tra wallet - BẮT BUỘC cho giao dịch cá nhân
    let wallet = null;
    if (transactionScope === 'personal') {
      if (!walletId) {
        return res.status(400).json({ 
          message: 'Giao dịch cá nhân phải có ví liên kết. Vui lòng chọn ví trước khi tạo giao dịch.' 
        });
      }
      
      wallet = await Wallet.findById(walletId);
      if (!wallet) {
        return res.status(404).json({ message: 'Ví không tồn tại' });
      }
      
      // Kiểm tra wallet có thuộc về user không
      if (String(wallet.owner) !== String(userId)) {
        return res.status(403).json({ message: 'Bạn không có quyền sử dụng ví này' });
      }
    }
    
    // Kiểm tra số dư nếu là giao dịch chi tiêu
    if (type === 'expense') {
      if (transactionScope === 'family') {
        const balance = await FamilyBalance.getBalance(familyId);
        if (balance.familyBalance < amount) {
          return res.status(400).json({ 
            message: `Số dư gia đình không đủ. Hiện tại: ${balance.familyBalance}₫` 
          });
        }
      } else if (transactionScope === 'personal') {
        // Kiểm tra số dư VÍ (initialBalance đã được cập nhật)
        const walletBalance = wallet.initialBalance || 0;
        
        if (walletBalance < amount) {
          return res.status(400).json({ 
            message: `Số dư ví không đủ. Hiện tại: ${walletBalance}₫` 
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
    
    // Nếu có wallet và là giao dịch personal, tự động tạo wallet transaction
    if (wallet && transactionScope === 'personal') {
      try {
        // Tạo transaction trong ví
        // Gắn metadata để frontend biết đây là giao dịch gia đình nhưng thuộc scope "personal"
        const walletTransaction = new Transaction({
          wallet: walletId,
          type: type,
          amount: amount,
          category: category,
          description: description || '',
          date: date || new Date(),
          tags: tags,
          metadata: {
            source: 'family_personal',
            familyId,
            familyName: req.family?.name || '',
            familyTransactionId: transaction._id
          }
        });
        
        await walletTransaction.save();
        
        // Link wallet transaction với family transaction
        transaction.linkedWallet = walletId;
        transaction.linkedTransaction = walletTransaction._id;
        transaction.isLinkedToWallet = true;
        await transaction.save();
        
        // Cập nhật initialBalance của wallet trực tiếp
        if (type === 'income') {
          wallet.initialBalance += amount;
        } else if (type === 'expense') {
          wallet.initialBalance -= amount;
        }
        await wallet.save();
        
        const walletBalance = wallet.initialBalance;
        
        // Update family balance với số dư wallet THỰC TẾ
        let familyBalance = await FamilyBalance.findOne({ familyId });
        if (!familyBalance) {
          familyBalance = new FamilyBalance({
            familyId,
            familyBalance: 0,
            memberBalances: []
          });
        }
        
        const memberIndex = familyBalance.memberBalances.findIndex(
          m => String(m.userId) === String(userId)
        );
        
        if (memberIndex >= 0) {
          // Cập nhật số dư = số dư ví thực tế
          familyBalance.memberBalances[memberIndex].balance = walletBalance;
        } else {
          // Tạo mới member balance = số dư ví thực tế
          const User = require('../models/User');
          const user = await User.findById(userId).select('name email');
          
          familyBalance.memberBalances.push({
            userId,
            userName: user ? user.name : '',
            userEmail: user ? user.email : '',
            balance: walletBalance
          });
        }
        
        familyBalance.updatedAt = new Date();
        await familyBalance.save();
      } catch (walletErr) {
        console.error('Error creating wallet transaction:', walletErr);
        // Không throw error, transaction gia đình vẫn được tạo
      }
    } else {
      // Chỉ cập nhật số dư family balance nếu không có wallet
      await FamilyBalance.updateBalance(
        familyId,
        userId,
        amount,
        type,
        transactionScope || 'family'
      );
    }
    
    // Populate và trả về
    await transaction.populate('category', 'name icon type');
    await transaction.populate('createdBy', 'name email');
    await transaction.populate('linkedWallet', 'name currency');
    
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

    // --- NEW: Không cho phép chuyển transactionScope giữa 'family' và 'personal' ---
    if (transactionScope && String(transactionScope) !== String(transaction.transactionScope)) {
      return res.status(400).json({
        message: 'Không được thay đổi phạm vi giao dịch giữa "family" và "personal". Vui lòng tạo giao dịch mới nếu bạn muốn thay đổi phạm vi, hoặc hủy liên kết ví trước khi chuyển.'
      });
    }
    // --- end NEW ---

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
    // newBalanceChange: số tiền mà giao dịch mới sẽ thay đổi số dư
    // balanceDifference: sự khác biệt cần cập nhật (new - old)
    const oldBalanceChange = oldType === 'income' ? oldAmount : -oldAmount;
    const newBalanceChange = newType === 'income' ? newAmount : -newAmount;
    const balanceDifference = newBalanceChange - oldBalanceChange;
    
    // Xử lý cập nhật số dư - CHỈ CHO FAMILY scope
    // Personal scope sẽ được sync từ wallet transaction
    if (balanceDifference !== 0 || oldTransactionScope !== newTransactionScope) {
      if (oldTransactionScope === 'family' || newTransactionScope === 'family') {
        // Nếu có liên quan đến family scope, update balance
        if (oldTransactionScope !== newTransactionScope) {
          // Thay đổi scope
          const reverseOldChange = oldType === 'income' ? -oldAmount : oldAmount;
          
          if (oldTransactionScope === 'family') {
            await FamilyBalance.updateBalance(transaction.familyId, userId, reverseOldChange, 'income', 'family');
          }
          
          if (newTransactionScope === 'family') {
            await FamilyBalance.updateBalance(transaction.familyId, userId, newBalanceChange, 'income', 'family');
          }
        } else if (newTransactionScope === 'family' && balanceDifference !== 0) {
          // Chỉ thay đổi amount/type trong family scope
          await FamilyBalance.updateBalance(transaction.familyId, userId, balanceDifference, 'income', 'family');
        }
      }
      // Personal scope: KHÔNG dùng updateBalance, sẽ sync từ wallet
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
    
    // Sync với linked wallet transaction nếu có
    if (transaction.isLinkedToWallet && transaction.linkedTransaction && transaction.transactionScope === 'personal') {
      try {
        const linkedTx = await Transaction.findById(transaction.linkedTransaction);
        const wallet = await Wallet.findById(transaction.linkedWallet);
        
        if (linkedTx && wallet) {
          // Lưu giá trị cũ để hoàn tác
          const oldType = linkedTx.type;
          const oldAmount = linkedTx.amount;
          
          // Xác định giá trị mới
          const newType = type || oldType;
          const newAmount = amount || oldAmount;
          
          // Hoàn tác transaction cũ
          if (oldType === 'income') {
            wallet.initialBalance -= oldAmount;  // Hoàn tác thu nhập cũ
          } else if (oldType === 'expense') {
            wallet.initialBalance += oldAmount;  // Hoàn tác chi tiêu cũ
          }
          
          // Áp dụng transaction mới
          if (newType === 'income') {
            wallet.initialBalance += newAmount;  // Áp dụng thu nhập mới
          } else if (newType === 'expense') {
            wallet.initialBalance -= newAmount;  // Áp dụng chi tiêu mới
          }
          
          await wallet.save();
          
          // Update wallet transaction
          if (type) linkedTx.type = type;
          if (amount) linkedTx.amount = amount;
          if (category) linkedTx.category = category;
          if (description !== undefined) {
            linkedTx.title = description || 'Giao dịch gia đình';
            linkedTx.description = `Liên kết từ giao dịch gia đình: ${description || ''}`;
          }
          if (date) linkedTx.date = date;
          await linkedTx.save();
          
          // Sync family balance = số dư ví sau khi update
          let familyBalance = await FamilyBalance.findOne({ familyId: transaction.familyId });
          if (familyBalance) {
            const memberIndex = familyBalance.memberBalances.findIndex(
              m => String(m.userId) === String(userId)
            );
            
            if (memberIndex >= 0) {
              familyBalance.memberBalances[memberIndex].balance = wallet.initialBalance;
              familyBalance.updatedAt = new Date();
              await familyBalance.save();
            }
          }
        }
      } catch (err) {
        console.error('Error syncing linked wallet transaction:', err);
        // Continue even if sync fails
      }
    }
    
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
    
    // Hoàn tác số dư - CHỈ CHO FAMILY scope
    if (transaction.transactionScope === 'family') {
      const updateAmount = transaction.type === 'income' ? -transaction.amount : transaction.amount;
      await FamilyBalance.updateBalance(transaction.familyId, userId, updateAmount, 'income', 'family');
    }
    
    // Xóa linked wallet transaction và hoàn tiền vào ví nếu là personal
    if (transaction.isLinkedToWallet && transaction.linkedTransaction && transaction.transactionScope === 'personal') {
      try {
        // Hoàn tiền vào ví TRƯỚC KHI xóa
        const wallet = await Wallet.findById(transaction.linkedWallet);
        if (wallet) {
          // Hoàn tác: chi tiêu → cộng lại, thu nhập → trừ đi
          if (transaction.type === 'income') {
            wallet.initialBalance -= transaction.amount;  // Hoàn tác thu nhập
          } else if (transaction.type === 'expense') {
            wallet.initialBalance += transaction.amount;  // Hoàn tác chi tiêu
          }
          await wallet.save();
          
          // Xóa wallet transaction
          await Transaction.findByIdAndDelete(transaction.linkedTransaction);
          
          // Sync family balance = số dư ví sau khi hoàn tiền
          let familyBalance = await FamilyBalance.findOne({ familyId: transaction.familyId });
          if (familyBalance) {
            const memberIndex = familyBalance.memberBalances.findIndex(
              m => String(m.userId) === String(userId)
            );
            
            if (memberIndex >= 0) {
              familyBalance.memberBalances[memberIndex].balance = wallet.initialBalance;
              familyBalance.updatedAt = new Date();
              await familyBalance.save();
            }
          }
        } else {
          // Nếu không tìm thấy wallet, vẫn xóa transaction
          await Transaction.findByIdAndDelete(transaction.linkedTransaction);
        }
      } catch (err) {
        console.error('Error deleting linked wallet transaction:', err);
        // Continue even if deletion fails
      }
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

// GET /api/family/:familyId/member-transactions - Lấy giao dịch của một thành viên cụ thể
router.get('/:familyId/member-transactions', authenticateToken, isFamilyMember, async (req, res) => {
  try {
    const { familyId } = req.params;
    const { userId, userEmail, limit = 10, page = 1 } = req.query;
    
    if (!userId && !userEmail) {
      return res.status(400).json({ message: 'Cần có userId hoặc userEmail' });
    }
    
    // Kiểm tra quyền truy cập (chỉ owner hoặc bản thân thành viên đó)
    const family = await Family.findById(familyId);
    if (!family) {
      return res.status(404).json({ message: 'Family not found' });
    }
    
    const currentUserId = req.user.id || req.user._id;
    const isOwner = String(family.owner) === String(currentUserId);
    const isSelfQuery = (userId && String(userId) === String(currentUserId)) || 
                       (userEmail && userEmail.toLowerCase() === req.user.email.toLowerCase());
    
    if (!isOwner && !isSelfQuery) {
      return res.status(403).json({ message: 'Bạn không có quyền xem giao dịch của thành viên khác' });
    }
    
    // Xây dựng query filter
    const filter = { familyId };
    
    // Lọc theo userId hoặc email của người tạo
    if (userId) {
      // Đảm bảo userId là string hợp lệ
      const userIdStr = typeof userId === 'object' ? (userId._id || userId.id || userId) : userId;
      if (userIdStr && typeof userIdStr === 'string') {
        filter.createdBy = userIdStr;
      }
    } else if (userEmail) {
      // Tìm user ID từ email
      const user = await User.findOne({ email: userEmail.toLowerCase().trim() });
      if (user) {
        filter.createdBy = user._id;
      } else {
        // Nếu không tìm thấy user, trả về mảng rỗng
        return res.json({ transactions: [], total: 0 });
      }
    }
    
    // Thêm filter cho transactionScope nếu có
    if (req.query.transactionScope) {
      filter.transactionScope = req.query.transactionScope;
    }
    
    // Query với phân trang
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOption = { date: -1 }; // Mặc định sắp xếp theo ngày mới nhất
    
    const transactions = await FamilyTransaction.find(filter)
      .populate('category', 'name icon type')
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit));
    
    // Đếm tổng số giao dịch
    const totalCount = await FamilyTransaction.countDocuments(filter);
    
    res.json({
      transactions,
      pagination: {
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        currentPage: parseInt(page),
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching member transactions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/family/transactions/:id/link-wallet - Liên kết giao dịch gia đình với ví cá nhân
router.post('/transactions/:id/link-wallet', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { walletId } = req.body;
    
    if (!walletId) {
      return res.status(400).json({ message: 'walletId is required' });
    }
    
    // Tìm giao dịch gia đình
    const familyTx = await FamilyTransaction.findById(id);
    if (!familyTx) {
      return res.status(404).json({ message: 'Family transaction not found' });
    }
    
    const userId = req.user.id || req.user._id;
    
    // Kiểm tra quyền: chỉ người tạo giao dịch mới được link
    if (String(familyTx.createdBy) !== String(userId)) {
      return res.status(403).json({ message: 'Chỉ người tạo giao dịch mới có thể liên kết ví' });
    }
    
    // Kiểm tra giao dịch phải là personal
    if (familyTx.transactionScope !== 'personal') {
      return res.status(400).json({ message: 'Chỉ có thể liên kết giao dịch cá nhân với ví' });
    }
    
    // Kiểm tra wallet có tồn tại và thuộc về user
    const wallet = await Wallet.findById(walletId);
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }
    
    if (String(wallet.owner) !== String(userId)) {
      return res.status(403).json({ message: 'Bạn không có quyền sử dụng ví này' });
    }
    
    // Kiểm tra đã link chưa
    if (familyTx.isLinkedToWallet) {
      return res.status(400).json({ 
        message: 'Giao dịch này đã được liên kết với ví. Vui lòng hủy liên kết trước khi liên kết với ví khác.',
        linkedWallet: familyTx.linkedWallet
      });
    }
    
    // Tạo transaction trong wallet
    const walletTransaction = new Transaction({
      wallet: walletId,
      category: familyTx.category,
      type: familyTx.type,
      amount: familyTx.amount,
      currency: wallet.currency || 'VND',
      title: familyTx.description || 'Giao dịch gia đình',
      description: `Liên kết từ giao dịch gia đình: ${familyTx.description || ''}`,
      date: familyTx.date,
      createdBy: userId,
      metadata: {
        source: 'family',
        familyTransactionId: familyTx._id,
        familyId: familyTx.familyId
      }
    });
    
    await walletTransaction.save();
    
    // Cập nhật family transaction
    familyTx.linkedWallet = walletId;
    familyTx.linkedTransaction = walletTransaction._id;
    familyTx.isLinkedToWallet = true;
    await familyTx.save();
    
    // Populate và trả về
    await familyTx.populate('linkedWallet', 'name currency');
    await familyTx.populate('linkedTransaction');
    
    res.json({
      message: 'Đã liên kết giao dịch với ví thành công',
      familyTransaction: familyTx,
      walletTransaction: walletTransaction
    });
  } catch (error) {
    console.error('Error linking wallet to family transaction:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// DELETE /api/family/transactions/:id/unlink-wallet - Hủy liên kết ví
router.delete('/transactions/:id/unlink-wallet', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Tìm giao dịch gia đình
    const familyTx = await FamilyTransaction.findById(id);
    if (!familyTx) {
      return res.status(404).json({ message: 'Family transaction not found' });
    }
    
    const userId = req.user.id || req.user._id;
    
    // Kiểm tra quyền
    if (String(familyTx.createdBy) !== String(userId)) {
      return res.status(403).json({ message: 'Chỉ người tạo giao dịch mới có thể hủy liên kết ví' });
    }
    
    // Kiểm tra đã link chưa
    if (!familyTx.isLinkedToWallet) {
      return res.status(400).json({ message: 'Giao dịch này chưa được liên kết với ví nào' });
    }
    
    // Xóa transaction trong wallet nếu có
    if (familyTx.linkedTransaction) {
      try {
        await Transaction.findByIdAndDelete(familyTx.linkedTransaction);
      } catch (err) {
        console.error('Error deleting linked wallet transaction:', err);
        // Continue even if deletion fails
      }
    }
    
    // Cập nhật family transaction
    familyTx.linkedWallet = null;
    familyTx.linkedTransaction = null;
    familyTx.isLinkedToWallet = false;
    await familyTx.save();
    
    res.json({
      message: 'Đã hủy liên kết ví thành công',
      familyTransaction: familyTx
    });
  } catch (error) {
    console.error('Error unlinking wallet from family transaction:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/family/wallets/user - Lấy danh sách ví của user hiện tại
router.get('/wallets/user', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    const wallets = await Wallet.find({ owner: userId })
      .select('name currency initialBalance createdAt updatedAt')
      .sort({ createdAt: -1 });
    
    // Trả về wallets với currentBalance = initialBalance (đã được cập nhật)
    const walletsWithBalance = wallets.map(wallet => ({
      _id: wallet._id,
      name: wallet.name,
      currency: wallet.currency,
      initialBalance: wallet.initialBalance,
      currentBalance: wallet.initialBalance,  // initialBalance đã là số dư hiện tại
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt
    }));
    
    res.json(walletsWithBalance);
  } catch (error) {
    console.error('Error fetching user wallets:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /api/family/:familyId/reset-member-balance - Reset số dư cá nhân về 0
router.post('/:familyId/reset-member-balance', authenticateToken, isFamilyMember, async (req, res) => {
  try {
    const { familyId } = req.params;
    const userId = req.user.id || req.user._id;
    
    // Tìm FamilyBalance
    let familyBalance = await FamilyBalance.findOne({ familyId });
    
    if (!familyBalance) {
      return res.status(404).json({ message: 'Family balance not found' });
    }
    
    // Tìm member balance
    const memberIndex = familyBalance.memberBalances.findIndex(
      m => String(m.userId) === String(userId)
    );
    
    if (memberIndex >= 0) {
      // Reset về 0
      familyBalance.memberBalances[memberIndex].balance = 0;
      familyBalance.updatedAt = new Date();
      await familyBalance.save();
    }
    
    res.json({
      message: 'Đã reset số dư cá nhân về 0',
      memberBalance: familyBalance.memberBalances[memberIndex]
    });
  } catch (error) {
    console.error('Error resetting member balance:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /api/family/:familyId/sync-wallet-balance - Đồng bộ số dư từ ví vào family balance
router.post('/:familyId/sync-wallet-balance', authenticateToken, isFamilyMember, async (req, res) => {
  try {
    const { familyId } = req.params;
    const { walletId } = req.body;
    
    if (!walletId) {
      return res.status(400).json({ message: 'walletId is required' });
    }
    
    const userId = req.user.id || req.user._id;
    
    // Kiểm tra wallet có thuộc về user không
    const wallet = await Wallet.findById(walletId);
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }
    
    if (String(wallet.owner) !== String(userId)) {
      return res.status(403).json({ message: 'Bạn không có quyền sử dụng ví này' });
    }
    
    // Lấy số dư từ initialBalance (đã được cập nhật)
    const walletBalance = wallet.initialBalance || 0;
    
    // Cập nhật FamilyBalance
    let familyBalance = await FamilyBalance.findOne({ familyId });
    
    if (!familyBalance) {
      familyBalance = new FamilyBalance({
        familyId,
        familyBalance: 0,
        memberBalances: []
      });
    }
    
    // Tìm hoặc tạo member balance
    const memberIndex = familyBalance.memberBalances.findIndex(
      m => String(m.userId) === String(userId)
    );
    
    if (memberIndex >= 0) {
      // Cập nhật số dư
      familyBalance.memberBalances[memberIndex].balance = walletBalance;
    } else {
      // Thêm mới
      const User = require('../models/User');
      const user = await User.findById(userId).select('name email');
      
      familyBalance.memberBalances.push({
        userId,
        userName: user ? user.name : '',
        userEmail: user ? user.email : '',
        balance: walletBalance
      });
    }
    
    familyBalance.updatedAt = new Date();
    await familyBalance.save();
    
    res.json({
      message: 'Đã đồng bộ số dư thành công',
      walletBalance,
      familyBalance: familyBalance.memberBalances.find(m => String(m.userId) === String(userId))
    });
  } catch (error) {
    console.error('Error syncing wallet balance:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /api/family/:familyId/transfer-to-family - Chuyển tiền từ ví cá nhân vào quỹ gia đình
router.post('/:familyId/transfer-to-family', authenticateToken, isFamilyMember, async (req, res) => {
  try {
    const { familyId } = req.params;
    const { amount, walletId, description } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Số tiền phải lớn hơn 0' });
    }
    
    if (!walletId) {
      return res.status(400).json({ message: 'Vui lòng chọn ví để chuyển tiền' });
    }
    
    const userId = req.user.id || req.user._id;
    
    // Kiểm tra wallet
    const wallet = await Wallet.findById(walletId);
    if (!wallet) {
      return res.status(404).json({ message: 'Ví không tồn tại' });
    }
    
    if (String(wallet.owner) !== String(userId)) {
      return res.status(403).json({ message: 'Bạn không có quyền sử dụng ví này' });
    }
    
    // Kiểm tra số dư ví
    if (wallet.initialBalance < amount) {
      return res.status(400).json({ 
        message: `Số dư ví không đủ. Hiện tại: ${wallet.initialBalance}₫` 
      });
    }
    
    // Trừ tiền từ ví và cập nhật updatedAt
    wallet.initialBalance -= amount;
    wallet.updatedAt = new Date();
    await wallet.save();
    
    // Cộng tiền vào family balance
    await FamilyBalance.updateBalance(familyId, userId, amount, 'income', 'family');
    
    // --- NEW: tạo FamilyTransaction CHO HOẠT ĐỘNG NẠP trước để có _id ---
    const familyTx = new FamilyTransaction({
      familyId,
      type: 'income',
      amount,
      category: null,
      description: description || `Nạp từ ví ${wallet.name}`,
      transactionScope: 'family',
      date: new Date(),
      createdBy: userId,
      creatorName: req.user.name || '',
      tags: ['transfer', 'to-family']
    });
    await familyTx.save();
    // --- end NEW ---
    
    // Tạo wallet transaction (chi tiêu - chuyển cho gia đình) và gắn metadata family
    const walletTransaction = new Transaction({
      wallet: walletId,
      type: 'expense',
      amount: amount,
      category: null,
      title: description || 'Chuyển tiền vào quỹ gia đình',
      description: description || 'Chuyển tiền vào quỹ gia đình',
      date: new Date(),
      createdBy: userId,
      metadata: {
        source: 'family_transfer',
        direction: 'to-family',
        familyId: familyId,
        familyName: req.family?.name || '',       // cung cấp tên gia đình để frontend hiển thị
        familyTransactionId: familyTx._id
      }
    });
    await walletTransaction.save();

    // Cập nhật số dư cá nhân = số dư ví sau khi chuyển
    let familyBalance = await FamilyBalance.findOne({ familyId });
    if (familyBalance) {
      const memberIndex = familyBalance.memberBalances.findIndex(
        m => String(m.userId) === String(userId)
      );
      
      if (memberIndex >= 0) {
        familyBalance.memberBalances[memberIndex].balance = wallet.initialBalance;
        familyBalance.updatedAt = new Date();
        await familyBalance.save();
      }
    }
    
    // Lấy family balance mới nhất
    const updatedFamilyBalance = await FamilyBalance.getBalance(familyId);
    
    res.json({
      message: 'Chuyển tiền thành công',
      walletBalance: wallet.initialBalance,
      familyBalance: updatedFamilyBalance.familyBalance,
      memberBalance: wallet.initialBalance,
      amount: amount,
      wallet: {
        _id: wallet._id,
        name: wallet.name,
        currency: wallet.currency,
        initialBalance: wallet.initialBalance,
        currentBalance: wallet.initialBalance,
        updatedAt: wallet.updatedAt
      },
      familyTransaction: familyTx,
      walletTransaction // trả về wallet tx có metadata
    });
  } catch (error) {
    console.error('Error transferring to family:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /api/family/:familyId/transfer-from-family - Chuyển tiền từ quỹ gia đình về ví cá nhân
router.post('/:familyId/transfer-from-family', authenticateToken, isFamilyMember, async (req, res) => {
  try {
    const { familyId } = req.params;
    const { amount, walletId, description } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Số tiền phải lớn hơn 0' });
    }
    
    if (!walletId) {
      return res.status(400).json({ message: 'Vui lòng chọn ví để nhận tiền' });
    }
    
    const userId = req.user.id || req.user._id;
    
    // Kiểm tra wallet
    const wallet = await Wallet.findById(walletId);
    if (!wallet) {
      return res.status(404).json({ message: 'Ví không tồn tại' });
    }
    
    if (String(wallet.owner) !== String(userId)) {
      return res.status(403).json({ message: 'Bạn không có quyền sử dụng ví này' });
    }
    
    // Kiểm tra số dư quỹ gia đình
    const familyBalance = await FamilyBalance.findOne({ familyId });
    if (!familyBalance) {
      return res.status(404).json({ message: 'Không tìm thấy thông tin số dư gia đình' });
    }
    
    if (familyBalance.familyBalance < amount) {
      return res.status(400).json({ 
        message: `Số dư quỹ gia đình không đủ. Hiện tại: ${familyBalance.familyBalance}₫` 
      });
    }
    
    // Trừ tiền từ quỹ gia đình
    await FamilyBalance.updateBalance(familyId, userId, amount, 'expense', 'family');
    
    // --- NEW: tạo FamilyTransaction CHO HOẠT ĐỘNG RÚT trước để có _id ---
    const familyTx = new FamilyTransaction({
      familyId,
      type: 'expense',
      amount,
      category: null,
      description: description || `Rút về ví ${wallet.name}`,
      transactionScope: 'family',
      date: new Date(),
      createdBy: userId,
      creatorName: req.user.name || '',
      tags: ['transfer', 'from-family']
    });
    await familyTx.save();
    // --- end NEW ---
    
    // Cộng tiền vào ví và cập nhật updatedAt
    wallet.initialBalance += amount;
    wallet.updatedAt = new Date();
    await wallet.save();
    
    // Tạo wallet transaction (thu nhập - nhận từ gia đình) và gắn metadata family
    const walletTransaction = new Transaction({
      wallet: walletId,
      type: 'income',
      amount: amount,
      category: null,
      title: description || 'Nhận tiền từ quỹ gia đình',
      description: description || 'Nhận tiền từ quỹ gia đình',
      date: new Date(),
      createdBy: userId,
      metadata: {
        source: 'family_transfer',
        direction: 'from-family',
        familyId: familyId,
        familyName: req.family?.name || '',
        familyTransactionId: familyTx._id
      }
    });
    await walletTransaction.save();

    // Cập nhật số dư cá nhân = số dư ví sau khi nhận
    const updatedFamilyBalance = await FamilyBalance.findOne({ familyId });
    if (updatedFamilyBalance) {
      const memberIndex = updatedFamilyBalance.memberBalances.findIndex(
        m => String(m.userId) === String(userId)
      );
      
      if (memberIndex >= 0) {
        updatedFamilyBalance.memberBalances[memberIndex].balance = wallet.initialBalance;
        updatedFamilyBalance.updatedAt = new Date();
        await updatedFamilyBalance.save();
      }
    }
    
    // Lấy family balance mới nhất
    const finalFamilyBalance = await FamilyBalance.getBalance(familyId);
    
    res.json({
      message: 'Chuyển tiền thành công',
      walletBalance: wallet.initialBalance,
      familyBalance: finalFamilyBalance.familyBalance,
      memberBalance: wallet.initialBalance,
      amount: amount,
      wallet: {
        _id: wallet._id,
        name: wallet.name,
        currency: wallet.currency,
        initialBalance: wallet.initialBalance,
        currentBalance: wallet.initialBalance,
        updatedAt: wallet.updatedAt
      },
      familyTransaction: familyTx,
      walletTransaction
    });
  } catch (error) {
    console.error('Error transferring from family:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/family/:familyId/budget-progress - Lấy tiến độ ngân sách (tổng chi tiêu theo danh mục trong tháng)
router.get('/:familyId/budget-progress', authenticateToken, isFamilyMember, async (req, res) => {
  try {
    const { familyId } = req.params;
    
    // Lấy tất cả ngân sách của gia đình
    const family = await require('../models/family').findById(familyId);
    if (!family || !Array.isArray(family.budgets)) {
      return res.json({});
    }
    
    const progress = {};
    
    // Tính tiến độ cho TỪNG ngân sách (theo tháng của budget.date)
    for (const budget of family.budgets) {
      if (!budget.date || !budget.category) continue;
      
      const budgetDate = new Date(budget.date);
      const startOfMonth = new Date(budgetDate.getFullYear(), budgetDate.getMonth(), 1);
      const endOfMonth = new Date(budgetDate.getFullYear(), budgetDate.getMonth() + 1, 0, 23, 59, 59, 999);
      
      const categoryId = budget.category._id || budget.category;
      
      // Lấy giao dịch chi tiêu gia đình trong THÁNG CỦA NGÂN SÁCH ĐÓ
      const transactions = await FamilyTransaction.find({
        familyId,
        type: 'expense',
        transactionScope: 'family',
        tags: { $ne: 'transfer' },
        category: categoryId,
        date: { $gte: startOfMonth, $lte: endOfMonth }
      });
      
      const spent = transactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);
      
      // Lưu vào progress theo category ID
      const categoryIdStr = String(categoryId);
      progress[categoryIdStr] = spent;
    }
    
    res.json(progress);
  } catch (error) {
    console.error('Error fetching budget progress:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/family/:familyId/transactions/:transactionId/receipts - Lấy danh sách ảnh hóa đơn liên kết với giao dịch
router.get('/:familyId/transactions/:transactionId/receipts', authenticateToken, isFamilyMember, async (req, res) => {
  try {
    const { familyId, transactionId } = req.params;
    // Tìm family
    const family = await require('../models/family').findById(familyId)
      .populate('receiptImages.uploadedBy', 'name email')
      .populate('receiptImages.category', 'name icon type');
    if (!family) {
      return res.status(404).json({ message: 'Family not found' });
    }
    // Lọc các ảnh hóa đơn có linkedTransaction trùng transactionId
    const linkedReceipts = (family.receiptImages || []).filter(img =>
      img.linkedTransaction && String(img.linkedTransaction) === String(transactionId)
    );
    // Trả về danh sách ảnh với URL truy cập trực tiếp
    const imagesWithUrls = linkedReceipts.map(img => ({
      ...img.toObject(),
      imageUrl: `http://localhost:5000/uploads/receipts/${img.filename}`,
      uploaderName: img.uploadedBy?.name || 'Thành viên',
      categoryInfo: img.category ? {
        _id: img.category._id,
        name: img.category.name,
        icon: img.category.icon,
        type: img.category.type
      } : null
    }));
    res.json({
      receiptImages: imagesWithUrls,
      total: imagesWithUrls.length
    });
  } catch (error) {
    console.error('Error fetching receipts for transaction:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/family/:familyId/transactions/monthly - Dữ liệu giao dịch theo tháng (6 tháng gần nhất)
router.get('/:familyId/transactions/monthly', authenticateToken, isFamilyMember, async (req, res) => {
  try {
    const { familyId } = req.params;
    const { transactionScope } = req.query; // Hỗ trợ filter theo transactionScope
    
    // Lấy 6 tháng gần nhất
    const monthsData = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
      const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
      
      // Xây dựng filter
      const filter = {
        familyId,
        date: { $gte: startOfMonth, $lte: endOfMonth },
        tags: { $ne: 'transfer' }
      };
      
      // Nếu có transactionScope, chỉ lấy loại đó (mặc định là family)
      if (transactionScope) {
        filter.transactionScope = transactionScope;
      } else {
        // Mặc định chỉ lấy giao dịch gia đình
        filter.transactionScope = 'family';
      }
      
      const transactions = await FamilyTransaction.find(filter);
      
      const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
      const expense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
      
      monthsData.push({
        month: date.toLocaleDateString('vi-VN', { month: 'short', year: 'numeric' }),
        income,
        expense
      });
    }
    
    res.json(monthsData);
  } catch (error) {
    console.error('Error fetching monthly data:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/family/:familyId/transactions/categories - Phân bổ theo danh mục
router.get('/:familyId/transactions/categories', authenticateToken, isFamilyMember, async (req, res) => {
  try {
    const { familyId } = req.params;
    
    // Lấy giao dịch chi tiêu tháng hiện tại
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    
    const transactions = await FamilyTransaction.find({
      familyId,
      type: 'expense',
      tags: { $ne: 'transfer' },
      date: { $gte: startOfMonth, $lte: endOfMonth }
    }).populate('category', 'name icon');
    
    // Nhóm theo category
    const categoryMap = {};
    transactions.forEach(tx => {
      const catId = tx.category?._id || 'other';
      const catName = tx.category?.name || 'Khác';
      
      if (!categoryMap[catId]) {
        categoryMap[catId] = { name: catName, value: 0 };
      }
      categoryMap[catId].value += tx.amount;
    });
    
    const categoryData = Object.values(categoryMap);
    
    res.json(categoryData);
  } catch (error) {
    console.error('Error fetching category data:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/family/:familyId/transactions/activity - Hoạt động nạp/rút
router.get('/:familyId/transactions/activity', authenticateToken, isFamilyMember, async (req, res) => {
  try {
    const { familyId } = req.params;
    
    // Lấy 7 ngày gần nhất
    const activityData = [];
    const now = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
      
      const transactions = await FamilyTransaction.find({
        familyId,
        tags: 'transfer',
        date: { $gte: startOfDay, $lte: endOfDay }
      });
      
      const deposits = transactions.filter(t => t.tags.includes('to-family')).reduce((sum, t) => sum + t.amount, 0);
      const withdrawals = transactions.filter(t => t.tags.includes('from-family')).reduce((sum, t) => sum + t.amount, 0);
      
      activityData.push({
        date: date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
        name: date.toLocaleDateString('vi-VN', { weekday: 'short' }),
        deposits,
        withdrawals
      });
    }
    
    res.json(activityData);
  } catch (error) {
    console.error('Error fetching activity data:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/family/:familyId/transactions/top - Top giao dịch
router.get('/:familyId/transactions/top', authenticateToken, isFamilyMember, async (req, res) => {
  try {
    const { familyId } = req.params;
    const { limit = 5 } = req.query;
    
    const transactions = await FamilyTransaction.find({
      familyId,
      tags: { $ne: 'transfer' }
    })
    .populate('category', 'name icon')
    .populate('createdBy', 'name')
    .sort({ amount: -1 })
    .limit(parseInt(limit));
    
    res.json(transactions);
  } catch (error) {
    console.error('Error fetching top transactions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
