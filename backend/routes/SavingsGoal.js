const express = require('express');
const router = express.Router();
const SavingsGoal = require('../models/SavingsGoal');
const Wallet = require('../models/Wallet');

// lightweight JWT payload parser (no verification) to extract user id if token provided
function parseJwt(token) {
  try {
    const payload = token.split('.')[1];
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(b64, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch (err) {
    return {};
  }
}

// Middleware to extract user id from Authorization header if present
function getUserIdFromHeader(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const p = parseJwt(token);
  return p && (p.id || p._id || p.sub) ? (p.id || p._id || p.sub) : null;
}

// GET /api/savings - list goals for authenticated user
router.get('/', async (req, res) => {
  try {
    const userId = getUserIdFromHeader(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });

    const goals = await SavingsGoal.find({ owner: userId })
      .populate('walletId', 'name currency balance')
      .sort({ createdAt: -1 })
      .lean();

    res.json(goals);
  } catch (err) {
    console.error('Error fetching goals:', err);
    res.status(500).json({
      message: 'Lỗi khi tải danh sách mục tiêu',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// POST /api/savings - create a new savings goal (no transactions)
router.post('/', async (req, res) => {
  try {
    const authOwner = getUserIdFromHeader(req);
    if (!authOwner) return res.status(401).json({ message: 'Chưa đăng nhập' });

    const { name, targetAmount, targetDate, color } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ message: 'Tên mục tiêu không được để trống' });
    const amount = Number(targetAmount);
    if (isNaN(amount) || amount <= 0) return res.status(400).json({ message: 'Số tiền mục tiêu phải lớn hơn 0' });
    if (!targetDate || isNaN(new Date(targetDate).getTime())) return res.status(400).json({ message: 'Ngày đạt mục tiêu không hợp lệ' });

    const newGoal = new SavingsGoal({
      name: name.trim(),
      targetAmount: amount,
      currentAmount: 0,
      startDate: new Date(),
      targetDate: new Date(targetDate),
      owner: authOwner,
      color: color || '#4CAF50',
      contributions: []
    });

    const saved = await newGoal.save();
    const populated = await SavingsGoal.findById(saved._id).populate('walletId', 'name currency').lean();
    res.status(201).json(populated);
  } catch (err) {
    console.error('Error creating goal:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        message: 'Dữ liệu không hợp lệ',
        errors: Object.values(err.errors).map(e => e.message)
      });
    }
    res.status(500).json({
      message: 'Có lỗi xảy ra khi tạo mục tiêu',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// GET /api/savings/:id - get a single goal (owner only)
router.get('/:id', async (req, res) => {
  try {
    const userId = getUserIdFromHeader(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });

    const goal = await SavingsGoal.findOne({ _id: req.params.id, owner: userId })
      .populate('walletId', 'name currency balance')
      .lean();

    if (!goal) return res.status(404).json({ message: 'Không tìm thấy mục tiêu' });
    res.json(goal);
  } catch (err) {
    console.error('Error fetching goal:', err);
    res.status(500).json({
      message: 'Lỗi khi tải thông tin mục tiêu',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// POST /api/savings/:id/deposit - deposit into a goal from a wallet (non-transactional)
router.post('/:id/deposit', async (req, res) => {
  try {
    const userId = getUserIdFromHeader(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });

    const { amount, walletId, note } = req.body;
    const goalId = req.params.id;

    if (!walletId) return res.status(400).json({ message: 'Vui lòng chọn ví' });
    const depositAmount = Number(amount);
    if (isNaN(depositAmount) || depositAmount <= 0) return res.status(400).json({ message: 'Số tiền không hợp lệ' });

    const goal = await SavingsGoal.findById(goalId);
    if (!goal) return res.status(404).json({ message: 'Mục tiêu không tồn tại' });
    if (String(goal.owner) !== String(userId)) return res.status(403).json({ message: 'Không có quyền thực hiện thao tác này' });

    const wallet = await Wallet.findById(walletId);
    if (!wallet) return res.status(404).json({ message: 'Ví không tồn tại' });
    if (String(wallet.owner) !== String(userId)) return res.status(403).json({ message: 'Bạn không sở hữu ví này' });

    // Check if wallet has initialBalance field but no balance field
    // This handles wallets created before balance field was added
    if (wallet.initialBalance !== undefined && wallet.balance === undefined) {
      wallet.balance = wallet.initialBalance;
    }

    // Get the effective balance, prioritizing balance field if it exists
    const walletBalance = typeof wallet.balance === 'number' ? wallet.balance : (wallet.initialBalance || 0);
    
    if (walletBalance < depositAmount) {
      return res.status(400).json({
        message: 'Số dư trong ví không đủ',
        currentBalance: walletBalance,
        requiredAmount: depositAmount
      });
    }

    // Update both initialBalance and balance to ensure compatibility with all app parts
    wallet.balance = walletBalance - depositAmount;
    wallet.initialBalance = walletBalance - depositAmount;
    
    // Create a transaction record in wallet's transactions array if it exists
    if (Array.isArray(wallet.transactions)) {
      wallet.transactions.push({
        type: 'expense',
        amount: depositAmount,
        date: new Date(),
        category: 'savings', // You might want a special category for this
        description: note || `Nạp tiền vào mục tiêu: ${goal.name}`
      });
    }
    
    await wallet.save();

    goal.currentAmount = (goal.currentAmount || 0) + depositAmount;
    goal.contributions.push({
      amount: depositAmount,
      date: new Date(),
      walletId: wallet._id,
      note: note || `Nạp tiền vào mục tiêu ${goal.name}`
    });
    if (!goal.walletId) goal.walletId = wallet._id;
    await goal.save();

    // Notify any event listeners about the wallet update
    try {
      const io = req.app.get('socketio');
      if (io) {
        io.emit('wallet-updated', {
          walletId: wallet._id,
          newBalance: wallet.balance
        });
      }
    } catch (socketErr) {
      console.error('Socket notification error:', socketErr);
    }

    const updatedGoal = await SavingsGoal.findById(goalId).populate('walletId', 'name currency balance').lean();

    res.status(200).json({
      message: 'Nạp tiền thành công',
      goal: updatedGoal,
      wallet: {
        _id: wallet._id,
        name: wallet.name,
        balance: wallet.balance,
        initialBalance: wallet.initialBalance
      }
    });
  } catch (err) {
    console.error('Deposit error:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        message: 'Dữ liệu không hợp lệ',
        errors: Object.values(err.errors).map(e => e.message)
      });
    }
    res.status(500).json({
      message: 'Có lỗi xảy ra khi nạp tiền',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// DELETE /api/savings/:id - delete a goal (non-transactional)
router.delete('/:id', async (req, res) => {
  try {
    const userId = getUserIdFromHeader(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });

    const goal = await SavingsGoal.findOne({ _id: req.params.id, owner: userId });
    if (!goal) return res.status(404).json({ message: 'Không tìm thấy mục tiêu' });

    // Track how much money is returned to each wallet
    const walletReturns = {};
    const returnSummary = [];
    
    // Process all contributions to return money to original wallets
    if (Array.isArray(goal.contributions) && goal.contributions.length > 0) {
      for (const contribution of goal.contributions) {
        if (contribution.walletId && contribution.amount) {
          const walletId = String(contribution.walletId);
          const amount = Number(contribution.amount) || 0;
          
          // Add to wallet tracking
          if (!walletReturns[walletId]) {
            walletReturns[walletId] = 0;
          }
          walletReturns[walletId] += amount;
        }
      }
      
      // Now update all wallets with their returns
      for (const [walletId, amount] of Object.entries(walletReturns)) {
        try {
          const wallet = await Wallet.findById(walletId);
          if (wallet && amount > 0) {
            // Add the money back to the wallet
            wallet.balance = (wallet.balance || 0) + amount;
            wallet.initialBalance = (wallet.initialBalance || 0) + amount;
            
            // Create a transaction record if applicable
            if (Array.isArray(wallet.transactions)) {
              wallet.transactions.push({
                type: 'income',
                amount,
                date: new Date(),
                category: 'savings_return',
                description: `Hoàn tiền từ mục tiêu đã xóa: ${goal.name}`
              });
            }
            
            await wallet.save();
            
            // Add to summary for response
            returnSummary.push({
              walletId,
              walletName: wallet.name || 'Unknown',
              amount
            });
          }
        } catch (walletErr) {
          console.error(`Error returning funds to wallet ${walletId}:`, walletErr);
          // Continue with other wallets even if one fails
        }
      }
    } 
    // For backward compatibility: if no contributions but there's a walletId and currentAmount
    else if (goal.walletId && goal.currentAmount > 0) {
      try {
        const wallet = await Wallet.findById(goal.walletId);
        if (wallet) {
          wallet.balance = (wallet.balance || 0) + goal.currentAmount;
          wallet.initialBalance = (wallet.initialBalance || 0) + goal.currentAmount;
          
          if (Array.isArray(wallet.transactions)) {
            wallet.transactions.push({
              type: 'income',
              amount: goal.currentAmount,
              date: new Date(),
              category: 'savings_return',
              description: `Hoàn tiền từ mục tiêu đã xóa: ${goal.name}`
            });
          }
          
          await wallet.save();
          
          returnSummary.push({
            walletId: String(goal.walletId),
            walletName: wallet.name || 'Unknown',
            amount: goal.currentAmount
          });
        }
      } catch (err) {
        console.error('Error returning funds to wallet:', err);
      }
    }
    
    // Delete the goal after returning all money
    await SavingsGoal.deleteOne({ _id: goal._id });

    res.json({
      message: 'Đã xóa mục tiêu thành công',
      returnedAmount: goal.currentAmount,
      walletReturns: returnSummary
    });
  } catch (err) {
    console.error('Error deleting goal:', err);
    res.status(500).json({
      message: 'Lỗi khi xóa mục tiêu',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// PUT /api/savings/:id - update goal (owner only)
router.put('/:id', async (req, res) => {
  try {
    const userId = getUserIdFromHeader(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });

    const { name, targetAmount, targetDate, color } = req.body;
    const updates = {};
    if (typeof name !== 'undefined') updates.name = String(name).trim();
    if (typeof targetAmount !== 'undefined') {
      const amt = Number(targetAmount);
      if (isNaN(amt) || amt <= 0) return res.status(400).json({ message: 'Số tiền mục tiêu không hợp lệ' });
      updates.targetAmount = amt;
    }
    if (typeof targetDate !== 'undefined') {
      if (!targetDate || isNaN(new Date(targetDate).getTime())) return res.status(400).json({ message: 'Ngày đạt mục tiêu không hợp lệ' });
      updates.targetDate = new Date(targetDate);
    }
    if (typeof color !== 'undefined') updates.color = color;

    const goal = await SavingsGoal.findById(req.params.id);
    if (!goal) return res.status(404).json({ message: 'Mục tiêu không tồn tại' });
    if (String(goal.owner) !== String(userId)) return res.status(403).json({ message: 'Không có quyền cập nhật mục tiêu này' });

    // apply updates
    Object.assign(goal, updates);
    const saved = await goal.save();
    const populated = await SavingsGoal.findById(saved._id).populate('walletId', 'name currency balance').lean();
    res.json(populated);
  } catch (err) {
    console.error('Update goal error:', err);
    res.status(500).json({
      message: 'Lỗi khi cập nhật mục tiêu',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

module.exports = router;
