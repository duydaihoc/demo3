const express = require('express');
const router = express.Router();
const SavingsGoal = require('../models/SavingsGoal');
const Wallet = require('../models/Wallet');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// NEW: helpers for Unicode PDF text and safe filenames
function stripAccents(s = '') {
  // Convert to NFD, remove combining marks, and normalize Vietnamese đ/Đ
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}
function sanitizeForFilename(name = '', asciiOnly = false) {
  let base = String(name || '').trim();

  // Guard against CR/LF in headers
  base = base.replace(/[\r\n]+/g, ' ');

  // Normalize and (optionally) strip accents
  base = asciiOnly ? stripAccents(base) : base.normalize('NFC');

  // Remove characters illegal or dangerous in headers/filenames
  // - OS reserved: <>:"/\|?* and control chars
  // - Header-param breakers: ; and =
  base = base
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/[;=]/g, '');

  // If ASCII-only fallback requested, drop any remaining non-ASCII bytes
  if (asciiOnly) {
    base = base.replace(/[^\x20-\x7E]/g, '');
  }

  // Collapse spaces to single dashes and trim leading/trailing dots/dashes
  base = base.replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^[\.\-]+|[\.\-]+$/g, '');

  return base || 'bao-cao-muc-tieu';
}
function resolveUnicodeFont() {
  const candidates = [
    path.join(__dirname, '..', 'fonts', 'DejaVuSans.ttf'),
    path.join(process.cwd(), 'fonts', 'DejaVuSans.ttf'),
    // Linux
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
    // Windows
    'C:\\Windows\\Fonts\\arial.ttf',
    'C:\\Windows\\Fonts\\tahoma.ttf',
    'C:\\Windows\\Fonts\\segoeui.ttf',
    // macOS
    '/Library/Fonts/Arial Unicode.ttf',
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
    '/Library/Fonts/Arial.ttf'
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return null;
}

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

// Helper: build gamification summary from goals
function buildGamification(goals = []) {
  const totalGoals = goals.length;
  const completedGoals = goals.filter(g => (g.currentAmount || 0) >= (g.targetAmount || Number.MAX_SAFE_INTEGER) || g.status === 'completed').length;
  const totalSaved = goals.reduce((s, g) => s + (Number(g.currentAmount) || 0), 0);

  // Level thresholds by completed goals
  const thresholds = [0, 1, 3, 5, 10, 15, 20];
  let levelIndex = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (completedGoals >= thresholds[i]) levelIndex = i;
    else break;
  }
  const level = levelIndex; // Level starts at 0
  const curBase = thresholds[levelIndex] || 0;
  const nextBase = thresholds[levelIndex + 1] ?? curBase;
  const span = Math.max(1, nextBase - curBase);
  const progressPct = Math.max(0, Math.min(100, Math.round(((completedGoals - curBase) / span) * 100)));

  // XP: simple formula
  const xp = (completedGoals * 100) + (Math.floor(totalSaved / 1_000_000) * 20);
  const nextLevelXp = (nextBase * 100); // rough guide

  // Base badges
  const badges = [
    {
      key: 'starter',
      name: 'Người bắt đầu',
      description: 'Tạo mục tiêu tiết kiệm đầu tiên',
      unlocked: totalGoals >= 1
    },
    {
      key: 'first_complete',
      name: 'Hoàn thành đầu tiên',
      description: 'Hoàn thành mục tiêu đầu tiên',
      unlocked: completedGoals >= 1
    },
    {
      key: 'silver_saver',
      name: 'Người tiết kiệm bạc',
      description: 'Hoàn thành 3 mục tiêu',
      unlocked: completedGoals >= 3
    },
    {
      key: 'gold_saver',
      name: 'Người tiết kiệm vàng',
      description: 'Hoàn thành 5 mục tiêu',
      unlocked: completedGoals >= 5
    },
    {
      key: 'master_spender',
      name: 'Bậc thầy chi tiêu',
      description: 'Hoàn thành 10 mục tiêu',
      unlocked: completedGoals >= 10
    },
    {
      key: 'ten_million',
      name: 'Tiết kiệm 10 triệu',
      description: 'Tổng số tiền đã tiết kiệm đạt 10.000.000₫',
      unlocked: totalSaved >= 10_000_000
    }
  ];

  // NEW: big goal completion milestones (by targetAmount)
  const completedList = goals.filter(g => g.status === 'completed' || (g.currentAmount || 0) >= (g.targetAmount || Number.MAX_SAFE_INTEGER));
  const has20mGoal = completedList.some(g => (g.targetAmount || 0) >= 20_000_000);
  const has50mGoal = completedList.some(g => (g.targetAmount || 0) >= 50_000_000);
  const has100mGoal = completedList.some(g => (g.targetAmount || 0) >= 100_000_000);
  badges.push(
    { key: 'big_goal_20m', name: 'Mục tiêu 20 triệu', description: 'Hoàn thành mục tiêu ≥ 20.000.000₫', unlocked: !!has20mGoal },
    { key: 'big_goal_50m', name: 'Mục tiêu 50 triệu', description: 'Hoàn thành mục tiêu ≥ 50.000.000₫', unlocked: !!has50mGoal },
    { key: 'big_goal_100m', name: 'Mục tiêu 100 triệu', description: 'Hoàn thành mục tiêu ≥ 100.000.000₫', unlocked: !!has100mGoal }
  );

  // NEW: total saved milestones
  badges.push(
    { key: 'twenty_million_total', name: 'Tiết kiệm 20 triệu', description: 'Tổng đã tiết kiệm đạt 20.000.000₫', unlocked: totalSaved >= 20_000_000 },
    { key: 'fifty_million_total', name: 'Tiết kiệm 50 triệu', description: 'Tổng đã tiết kiệm đạt 50.000.000₫', unlocked: totalSaved >= 50_000_000 },
    { key: 'hundred_million_total', name: 'Tiết kiệm 100 triệu', description: 'Tổng đã tiết kiệm đạt 100.000.000₫', unlocked: totalSaved >= 100_000_000 }
  );

  // NEW: fast finisher (<= 30 days from start to complete)
  const fastFinish = completedList.some(g => {
    const start = g.startDate ? new Date(g.startDate) : null;
    const done = g.completedAt ? new Date(g.completedAt) : null;
    if (!start || !done) return false;
    const days = Math.round((done - start) / 86400000);
    return days >= 0 && days <= 30;
  });
  badges.push({
    key: 'fast_finisher_30d',
    name: 'Về đích nhanh',
    description: 'Hoàn thành một mục tiêu trong ≤ 30 ngày',
    unlocked: fastFinish
  });

  // NEW: precise finisher (currentAmount ~= targetAmount when done)
  const preciseFinish = completedList.some(g => {
    const t = Number(g.targetAmount) || 0;
    const c = Number(g.currentAmount) || 0;
    // tolerance 1.000đ để tránh sai số
    return t > 0 && Math.abs(c - t) <= 1_000;
  });
  badges.push({
    key: 'precise_finisher',
    name: 'Chuẩn xác',
    description: 'Hoàn thành đúng bằng số tiền mục tiêu',
    unlocked: preciseFinish
  });

  // NEW: 3-month completion streak (each of last 3 months has >=1 completed)
  const now = new Date();
  const months = [];
  for (let i = 2; i >= 0; i--) {
    const head = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = new Date(head.getFullYear(), head.getMonth(), 1);
    const end = new Date(head.getFullYear(), head.getMonth() + 1, 1);
    months.push({ start, end });
  }
  const monthHits = months.map(m =>
    completedList.some(g => g.completedAt && new Date(g.completedAt) >= m.start && new Date(g.completedAt) < m.end)
  );
  badges.push({
    key: 'streak_3_months',
    name: 'Chuỗi 3 tháng',
    description: 'Mỗi tháng trong 3 tháng gần đây đều hoàn thành ≥ 1 mục tiêu',
    unlocked: monthHits.every(Boolean)
  });

  // NEW: contributions-based badges
  const totalContribs = goals.reduce((sum, g) => sum + ((Array.isArray(g.contributions) ? g.contributions.length : 0)), 0);
  badges.push(
    { key: 'contributor_10', name: 'Chăm chỉ', description: 'Có từ 10 lần đóng góp trở lên', unlocked: totalContribs >= 10 },
    { key: 'contributor_25', name: 'Rất chăm chỉ', description: 'Có từ 25 lần đóng góp trở lên', unlocked: totalContribs >= 25 }
  );

  // NEW: completed an overdue goal
  const recoverOverdue = completedList.some(g => g.targetDate && g.completedAt && new Date(g.completedAt) > new Date(g.targetDate));
  badges.push({
    key: 'overdue_recovery',
    name: 'Lội ngược dòng',
    description: 'Hoàn thành một mục tiêu sau khi đã quá hạn',
    unlocked: recoverOverdue
  });

  // NEW: completed at least 7 days before target date
  const earlyFinish = completedList.some(g => {
    if (!g.targetDate || !g.completedAt) return false;
    const diffDays = Math.round((new Date(g.targetDate) - new Date(g.completedAt)) / 86400000);
    return diffDays >= 7;
  });
  badges.push({
    key: 'early_bird',
    name: 'Về đích sớm',
    description: 'Hoàn thành mục tiêu sớm ít nhất 7 ngày',
    unlocked: earlyFinish
  });

  // NEW: guidance for levels (unchanged)
  const hasNext = thresholds[levelIndex + 1] !== undefined;
  const nextLevel = hasNext ? levelIndex + 1 : levelIndex;
  const remainingToNext = hasNext ? Math.max(0, thresholds[levelIndex + 1] - completedGoals) : 0;
  const levelNote = hasNext
    ? `Hoàn thành thêm ${remainingToNext} mục tiêu để đạt Lv ${nextLevel}.`
    : 'Bạn đã đạt cấp tối đa theo số mục tiêu hoàn thành.';
  const levelGuides = thresholds.slice(1).map((need, idx) => ({
    level: idx + 1,
    needCompleted: need,
    note: `Hoàn thành ${need} mục tiêu`
  }));

  return {
    level,
    xp,
    nextLevelXp,
    progressPct,
    badges,
    totals: { goals: totalGoals, completed: completedGoals, totalSaved },
    // NEW fields
    thresholds,
    nextLevel,
    remainingToNext,
    levelNote,
    levelGuides
  };
}

// NEW: validate ObjectId parameters (prevents "gamification" being treated as :id)
router.param('id', (req, res, next, id) => {
  if (!/^[0-9a-fA-F]{24}$/.test(id)) {
    return res.status(400).json({ message: 'ID không hợp lệ' });
  }
  next();
});

// GET /api/savings - list goals for authenticated user
router.get('/', async (req, res) => {
  try {
    const userId = getUserIdFromHeader(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });

    const goals = await SavingsGoal.find({ owner: userId })
      .populate('walletId', 'name currency balance')
      .sort({ createdAt: -1 })
      .lean();

    // Tính toán status cho mỗi mục tiêu
    const now = new Date();
    const goalsWithStatus = goals.map(goal => {
      let status = goal.status || 'active';
      let notification = null;

      // Nếu đã hoàn thành hoặc quá hạn, cập nhật status
      if (goal.currentAmount >= goal.targetAmount) {
        status = 'completed';
        notification = {
          type: 'completed',
          message: 'Mục tiêu đã đạt được số tiền yêu cầu!',
          action: 'report'
        };
      } else if (goal.targetDate && new Date(goal.targetDate) < now) {
        status = 'overdue';
        notification = {
          type: 'overdue',
          message: 'Mục tiêu đã đến ngày hạn!',
          action: 'report'
        };
      }

      return {
        ...goal,
        status,
        notification
      };
    });

    res.json(goalsWithStatus);
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

// GET /api/savings/gamification - gamification summary for current user
router.get('/gamification', async (req, res) => {
  try {
    const userId = getUserIdFromHeader(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });

    // NEW: include completedAt, startDate, contributions for richer badges
    const goals = await SavingsGoal.find({ owner: userId })
      .select('name targetAmount currentAmount status createdAt startDate targetDate completedAt contributions')
      .lean();

    const payload = buildGamification(goals || []);
    return res.json({ ok: true, ...payload });
  } catch (err) {
    console.error('Gamification error:', err);
    return res.status(500).json({ ok: false, message: 'Lỗi tính gamification', error: err.message });
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

    // NEW: auto mark completed if reached/exceeded target
    try {
      if ((goal.currentAmount || 0) >= (goal.targetAmount || Number.MAX_SAFE_INTEGER)) {
        goal.status = 'completed';
        if (!goal.completedAt) goal.completedAt = new Date();
      }
    } catch (_) {}

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

// PUT /api/savings/:id/report - báo cáo hoàn thành mục tiêu
router.put('/:id/report', async (req, res) => {
  try {
    const userId = getUserIdFromHeader(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });

    const goal = await SavingsGoal.findOne({ _id: req.params.id, owner: userId });
    if (!goal) return res.status(404).json({ message: 'Mục tiêu không tồn tại' });

    // Cập nhật status thành completed
    goal.status = 'completed';
    goal.completedAt = new Date();
    await goal.save();

    const populated = await SavingsGoal.findById(goal._id).populate('walletId', 'name currency balance').lean();
    res.json({
      message: 'Đã báo cáo hoàn thành mục tiêu',
      goal: populated
    });
  } catch (err) {
    console.error('Error reporting goal:', err);
    res.status(500).json({
      message: 'Lỗi khi báo cáo mục tiêu',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// GET /api/savings/:id/report-pdf - Xuất PDF báo cáo hoàn thành mục tiêu
router.get('/:id/report-pdf', async (req, res) => {
  try {
    const userId = getUserIdFromHeader(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });

    const goal = await SavingsGoal.findOne({ _id: req.params.id, owner: userId })
      .populate('walletId', 'name')
      .populate('contributions.walletId', 'name');

    if (!goal) return res.status(404).json({ message: 'Mục tiêu không tồn tại' });

    // Tạo PDF document với font mặc định (Helvetica) - font chuẩn mà mọi PDF reader đều hỗ trợ
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50
    });

    // NEW: choose a Unicode font if available
    const unicodeFontPath = resolveUnicodeFont();
    const hasUnicode = !!unicodeFontPath;
    if (hasUnicode) {
      try { doc.font(unicodeFontPath); } catch (e) { /* fallback below if load fails */ }
    }

    // NEW: filename with UTF-8 header + ASCII fallback (safe)
    const preferredName = `bao-cao-muc-tieu-${sanitizeForFilename(goal.name, false)}.pdf`;
    const asciiFallback = `bao-cao-muc-tieu-${sanitizeForFilename(goal.name, true)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(preferredName)}`
    );
    res.setHeader('Cache-Control', 'no-cache');

    // Pipe PDF
    doc.pipe(res);

    // Header
    doc.fontSize(24).fillColor('#2a5298')
       .text(hasUnicode ? 'BÁO CÁO HOÀN THÀNH MỤC TIÊU TIẾT KIỆM'
                        : 'BAO CAO HOAN THANH MUC TIEU TIET KIEM',
             { align: 'center' });
    doc.moveDown(2);

    // Section title
    doc.fontSize(16).fillColor('#000')
       .text(hasUnicode ? 'Thông tin mục tiêu:' : 'Thong tin muc tieu:', { underline: true });
    doc.moveDown(0.5);

    // Body info (strip accents if no Unicode font)
    doc.fontSize(12).fillColor('#333');
    const goalNameText = hasUnicode ? goal.name : stripAccents(goal.name);
    doc.text(`${hasUnicode ? 'Tên mục tiêu' : 'Ten muc tieu'}: ${goalNameText}`);
    doc.text(`${hasUnicode ? 'Mục tiêu số tiền' : 'Muc tieu so tien'}: ${goal.targetAmount.toLocaleString('vi-VN')} VND`);
    doc.text(`${hasUnicode ? 'Số tiền hiện tại' : 'So tien hien tai'}: ${goal.currentAmount.toLocaleString('vi-VN')} VND`);
    doc.text(`${hasUnicode ? 'Ngày bắt đầu' : 'Ngay bat dau'}: ${new Date(goal.startDate).toLocaleDateString('vi-VN')}`);
    doc.text(`${hasUnicode ? 'Ngày kết thúc' : 'Ngay ket thuc'}: ${goal.targetDate ? new Date(goal.targetDate).toLocaleDateString('vi-VN') : (hasUnicode ? 'Chưa đặt' : 'Chua dat')}`);
    doc.text(`${hasUnicode ? 'Ngày hoàn thành' : 'Ngay hoan thanh'}: ${goal.completedAt ? new Date(goal.completedAt).toLocaleDateString('vi-VN') : (hasUnicode ? 'Chưa hoàn thành' : 'Chua hoan thanh')}`);
    doc.text(`${hasUnicode ? 'Trạng thái' : 'Trang thai'}: ${
      goal.status === 'completed'
        ? (hasUnicode ? 'Đã hoàn thành' : 'Da hoan thanh')
        : goal.status === 'overdue'
          ? (hasUnicode ? 'Quá hạn' : 'Qua han')
          : (hasUnicode ? 'Đang thực hiện' : 'Dang thuc hien')
    }`);
    if (goal.walletId) {
      const walletNameText = hasUnicode ? goal.walletId.name : stripAccents(goal.walletId.name);
      doc.text(`${hasUnicode ? 'Ví chính' : 'Vi chinh'}: ${walletNameText}`);
    }

    doc.moveDown(2);
    doc.fontSize(16).fillColor('#000')
       .text(hasUnicode ? 'Thống kê đóng góp:' : 'Thong ke dong gop:', { underline: true });
    doc.moveDown(0.5);

    if (goal.contributions && goal.contributions.length > 0) {
      const totalContributions = goal.contributions.length;
      const totalAmount = goal.contributions.reduce((sum, c) => sum + (c.amount || 0), 0);
      const avgContribution = totalAmount / totalContributions;

      doc.fontSize(12).fillColor('#333');
      doc.text(`${hasUnicode ? 'Tổng số lần đóng góp' : 'Tong so lan dong gop'}: ${totalContributions}`);
      doc.text(`${hasUnicode ? 'Tổng số tiền đóng góp' : 'Tong so tien dong gop'}: ${totalAmount.toLocaleString('vi-VN')} VND`);
      doc.text(`${hasUnicode ? 'Số tiền trung bình mỗi lần' : 'So tien trung binh moi lan'}: ${avgContribution.toLocaleString('vi-VN')} VND`);
      doc.moveDown(1);

      doc.fontSize(14).fillColor('#000')
         .text(hasUnicode ? 'Chi tiết các lần đóng góp:' : 'Chi tiet cac lan dong gop:', { underline: true });
      doc.moveDown(0.5);

      const tableTop = doc.y;
      doc.fontSize(10);
      doc.text(hasUnicode ? 'Ngày' : 'Ngay', 50, tableTop);
      doc.text(hasUnicode ? 'Số tiền' : 'So tien', 150, tableTop);
      doc.text(hasUnicode ? 'Ví' : 'Vi', 250, tableTop);
      doc.text(hasUnicode ? 'Ghi chú' : 'Ghi chu', 350, tableTop);
      doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

      let yPosition = tableTop + 25;
      doc.fontSize(9);

      goal.contributions.forEach((contribution) => {
        if (yPosition > 700) { doc.addPage(); yPosition = 50; }
        const date = new Date(contribution.date).toLocaleDateString('vi-VN');
        const amount = `${(contribution.amount || 0).toLocaleString('vi-VN')} VND`;
        const wallet = contribution.walletId
          ? (hasUnicode ? contribution.walletId.name : stripAccents(contribution.walletId.name))
          : 'N/A';
        const note = hasUnicode ? (contribution.note || '') : stripAccents(contribution.note || '');

        doc.text(date, 50, yPosition);
        doc.text(amount, 150, yPosition);
        doc.text(wallet, 250, yPosition);
        doc.text(note, 350, yPosition, { width: 150 });
        yPosition += 20;
      });
    } else {
      doc.fontSize(12).fillColor('#666')
         .text(hasUnicode ? 'Chưa có đóng góp nào.' : 'Chua co dong gop nao.');
    }

    doc.moveDown(2);
    doc.fontSize(10).fillColor('#666')
       .text(`${hasUnicode ? 'Báo cáo được tạo vào' : 'Bao cao duoc tao vao'}: ${new Date().toLocaleString('vi-VN')}`, { align: 'center' });
    doc.text(hasUnicode ? 'Ứng dụng Quản lý Tài chính Cá nhân' : 'Ung dung Quan ly Tai chinh Ca nhan', { align: 'center' });

    doc.end();
  } catch (err) {
    console.error('Error generating PDF:', err);
    res.status(500).json({ message: 'Loi khi tao bao cao PDF' });
  }
});

module.exports = router;
