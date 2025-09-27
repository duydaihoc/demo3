const express = require('express');
const router = express.Router();
const SavingsGoal = require('../models/SavingsGoal');

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

// GET /api/savings
// optional query: owner=<id> to filter; otherwise returns goals for authenticated user if token present; admin/all if none
router.get('/', async (req, res) => {
  try {
    const ownerQuery = req.query.owner;
    const authOwner = getUserIdFromHeader(req);
    const filter = {};

    if (ownerQuery) filter.owner = ownerQuery;
    else if (authOwner) filter.owner = authOwner;
    // else no filter -> return all (could be restricted later)

    const goals = await SavingsGoal.find(filter).sort({ createdAt: -1 }).populate('walletId', 'name currency').lean();
    res.json(goals);
  } catch (err) {
    console.error('GET /api/savings error', err);
    res.status(500).json({ message: 'Lỗi khi tải mục tiêu tiết kiệm', error: err.message });
  }
});

// POST /api/savings
router.post('/', async (req, res) => {
  try {
    const authOwner = getUserIdFromHeader(req);
    const owner = authOwner || req.body.owner;
    if (!owner) return res.status(400).json({ message: 'Owner (user id) is required' });

    const { name, targetAmount, currentAmount = 0, startDate, targetDate, walletId } = req.body;
    if (!name || !targetAmount) return res.status(400).json({ message: 'name and targetAmount are required' });

    const newGoal = new SavingsGoal({
      name: String(name).trim(),
      targetAmount: Number(targetAmount),
      currentAmount: Number(currentAmount) || 0,
      startDate: startDate ? new Date(startDate) : undefined,
      targetDate: targetDate ? new Date(targetDate) : undefined,
      owner,
      walletId: walletId || undefined,
      contributions: []
    });

    const saved = await newGoal.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error('POST /api/savings error', err);
    res.status(500).json({ message: 'Lỗi khi tạo mục tiêu', error: err.message });
  }
});

// GET /api/savings/:id
router.get('/:id', async (req, res) => {
  try {
    const goal = await SavingsGoal.findById(req.params.id).populate('walletId', 'name currency').lean();
    if (!goal) return res.status(404).json({ message: 'Mục tiêu không tồn tại' });
    res.json(goal);
  } catch (err) {
    console.error('GET /api/savings/:id error', err);
    res.status(500).json({ message: 'Lỗi khi tải mục tiêu', error: err.message });
  }
});

// PUT /api/savings/:id  (replace/update)
router.put('/:id', async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.startDate) updates.startDate = new Date(updates.startDate);
    if (updates.targetDate) updates.targetDate = new Date(updates.targetDate);
    if (typeof updates.targetAmount !== 'undefined') updates.targetAmount = Number(updates.targetAmount);
    if (typeof updates.currentAmount !== 'undefined') updates.currentAmount = Number(updates.currentAmount);

    const goal = await SavingsGoal.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!goal) return res.status(404).json({ message: 'Mục tiêu không tồn tại' });
    res.json(goal);
  } catch (err) {
    console.error('PUT /api/savings/:id error', err);
    res.status(500).json({ message: 'Lỗi khi cập nhật mục tiêu', error: err.message });
  }
});

// DELETE /api/savings/:id
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await SavingsGoal.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Mục tiêu không tồn tại' });
    res.json({ message: 'Đã xóa mục tiêu', id: deleted._id });
  } catch (err) {
    console.error('DELETE /api/savings/:id error', err);
    res.status(500).json({ message: 'Lỗi khi xóa mục tiêu', error: err.message });
  }
});

// POST /api/savings/:id/contribute  -> add contribution and update currentAmount
router.post('/:id/contribute', async (req, res) => {
  try {
    const { amount, walletId, note } = req.body;
    const num = Number(amount || 0);
    if (!num || num <= 0) return res.status(400).json({ message: 'Amount phải lớn hơn 0' });

    const goal = await SavingsGoal.findById(req.params.id);
    if (!goal) return res.status(404).json({ message: 'Mục tiêu không tồn tại' });

    const contribution = {
      amount: num,
      date: new Date(),
      walletId: walletId || goal.walletId || undefined,
      note: note || ''
    };
    goal.contributions.push(contribution);
    goal.currentAmount = (Number(goal.currentAmount) || 0) + num;
    await goal.save();
    res.status(201).json(goal);
  } catch (err) {
    console.error('POST /api/savings/:id/contribute error', err);
    res.status(500).json({ message: 'Lỗi khi đóng góp vào mục tiêu', error: err.message });
  }
});

module.exports = router;
