const express = require('express');
const router = express.Router({ mergeParams: true });
const mongoose = require('mongoose');
const { auth } = require('../middleware/auth');
const Group = require('../models/Group');
const User = require('../models/User');
const Category = require('../models/Category');
const Notification = require('../models/Notification');
const GroupTransaction = require('../models/GroupTransaction');

// Helper: normalize participant input (array of { email or userId })
const normalizeParticipantsInput = async (arr = []) => {
  const out = [];
  for (const p of arr) {
    if (!p) continue;
    let email = (p.email || p || '').toString().toLowerCase().trim();
    let user = p.user || p.userId || p.userId || null;
    if (!user && email && mongoose.Types.ObjectId.isValid(email)) {
      user = email; // passed id accidentally in email field
      email = '';
    }
    // try find user by email if email provided and no user id
    if (!user && email) {
      const found = await User.findOne({ email }).select('_id email name').lean();
      if (found) user = found._id;
    }
    out.push({ user: user ? String(user) : undefined, email: email || undefined });
  }
  return out;
};

// POST /api/groups/:groupId/transactions
// body: { payerId (optional, default auth), amount, perPerson(boolean), participants: [{email|userId}], title, description, category }
router.post('/:groupId/transactions', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(groupId)) return res.status(400).json({ message: 'Invalid groupId' });

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    const payerId = req.body.payerId || req.user._id;
    const payer = await User.findById(payerId).select('_id name email').lean();
    if (!payer) return res.status(404).json({ message: 'Payer user not found' });

    let { 
      amount, 
      perPerson = false, 
      participants = [], 
      title = '', 
      description = '', 
      category 
    } = req.body;
    
    amount = Number(amount || 0);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }

    // Kiểm tra danh mục nếu có
    if (category && mongoose.Types.ObjectId.isValid(category)) {
      const categoryExists = await Category.findById(category);
      if (!categoryExists) {
        return res.status(400).json({ message: 'Category not found' });
      }
    }

    // Normalize participants input and map to users/emails
    const normalized = await normalizeParticipantsInput(Array.isArray(participants) ? participants : []);
    
    // If perPerson is true: input amount is per-person, compute total
    let totalAmount = amount;
    if (perPerson && normalized.length > 0) {
      totalAmount = amount * normalized.length;
    }

    // Build participants array with shareAmount
    const participantsBuilt = normalized.map(p => {
      const share = perPerson ? amount : (normalized.length > 0 ? totalAmount / normalized.length : 0);
      return {
        user: p.user,
        email: p.email,
        shareAmount: Number(Number(share).toFixed(2)),
        settled: false
      };
    });

    const txAmount = Number(Number(totalAmount).toFixed(2));

    const tx = new GroupTransaction({
      group: group._id,
      payer: payer._id,
      amount: txAmount,
      perPerson: !!perPerson,
      title,
      description,
      category: category || undefined,
      participants: participantsBuilt,
      createdBy: req.user._id,
      date: new Date()
    });

    await tx.save();

    // Create notification to each participant (notify that payer paid for them)
    for (const p of participantsBuilt) {
      // notify only if we can resolve a user id
      if (p.user) {
        try {
          // Tìm thông tin danh mục nếu có
          let categoryInfo = '';
          if (category) {
            const categoryData = await Category.findById(category).lean();
            if (categoryData) {
              categoryInfo = ` (${categoryData.icon || ''} ${categoryData.name})`;
            }
          }

          const notif = await Notification.create({
            recipient: p.user,
            sender: payer._id,
            type: 'group.transaction.debt',
            message: `${payer.name || payer.email} đã thanh toán ${p.shareAmount.toLocaleString('vi-VN')} đồng cho bạn trong nhóm "${group.name}"${categoryInfo}`,
            data: { 
              groupId: group._id, 
              transactionId: tx._id, 
              shareAmount: p.shareAmount, 
              title,
              description,
              category,
              payer: {
                _id: payer._id,
                name: payer.name,
                email: payer.email
              },
              isDebt: true,  // đánh dấu đây là khoản nợ
              settled: false // ban đầu chưa thanh toán
            }
          });
          const io = req.app.get('io');
          if (io) io.to(String(p.user)).emit('notification', notif);
        } catch (e) {
          console.warn('notify participant failed', e && e.message);
        }
      }
    }

    // Tạo thông báo cho người trả tiền về việc tạo giao dịch
    try {
      const categoryName = category ? 
        (await Category.findById(category).select('name icon').lean())?.name || '' : '';
      
      await Notification.create({
        recipient: payer._id,
        sender: req.user._id,
        type: 'group.transaction.created',
        message: `Bạn đã tạo giao dịch "${title || 'Không tiêu đề'}" với ${participantsBuilt.length} người tham gia, tổng ${txAmount.toLocaleString('vi-VN')} đồng`,
        data: {
          groupId: group._id,
          transactionId: tx._id,
          totalAmount: txAmount,
          title,
          description,
          category,
          categoryName,
          participantCount: participantsBuilt.length,
          isPayer: true
        }
      });
    } catch (e) {
      console.warn('notify payer on transaction creation failed', e && e.message);
    }

    // return populated transaction
    const populated = await GroupTransaction.findById(tx._id)
      .populate('payer', 'name email')
      .populate('participants.user', 'name email')
      .populate('group', 'name')
      .populate('category', 'name icon');

    res.status(201).json(populated);
  } catch (err) {
    console.error('Create group transaction error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET /api/groups/:groupId/transactions
router.get('/:groupId/transactions', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(groupId)) return res.status(400).json({ message: 'Invalid groupId' });

    const txs = await GroupTransaction.find({ group: groupId })
      .sort({ createdAt: -1 })
      .populate('payer', 'name email')
      .populate('participants.user', 'name email')
      .populate('category', 'name icon'); // Thêm populate cho danh mục

    res.json(txs);
  } catch (err) {
    console.error('List group transactions error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/groups/:groupId/transactions/:txId/settle
// body: { userId } - mark participant settled
router.post('/:groupId/transactions/:txId/settle', auth, async (req, res) => {
  try {
    const { groupId, txId } = req.params;
    const { userId } = req.body;
    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(txId)) {
      return res.status(400).json({ message: 'Invalid id(s)' });
    }

    const tx = await GroupTransaction.findById(txId);
    if (!tx) return res.status(404).json({ message: 'Transaction not found' });
    if (String(tx.group) !== String(groupId)) return res.status(400).json({ message: 'Transaction does not belong to group' });

    // Allow either participant themselves or group owner/payer to mark settlement
    const actor = req.user;
    const isOwnerOrPayer = String(actor._id) === String(tx.payer) || String(actor._id) === String((tx.group && tx.group.owner) || '');

    const targetUserId = userId || actor._id;
    const idx = tx.participants.findIndex(p => {
      if (p.user) return String(p.user) === String(targetUserId);
      if (p.email && actor.email) return p.email.toLowerCase() === String(actor.email).toLowerCase();
      return false;
    });

    if (idx === -1) return res.status(404).json({ message: 'Participant not found in this transaction' });

    // If caller is neither the participant nor owner/payer, forbid
    const participant = tx.participants[idx];
    const isParticipant = String(actor._id) === String(participant.user);
    if (!isParticipant && !isOwnerOrPayer) {
      return res.status(403).json({ message: 'Not authorized to settle for this participant' });
    }

    tx.participants[idx].settled = true;
    tx.participants[idx].settledAt = new Date();
    await tx.save();

    // Notify payer that participant settled
    try {
      // Tìm user name của participant nếu có
      let participantName = "Người dùng";
      if (participant.user) {
        const user = await User.findById(participant.user).select('name email');
        participantName = user ? (user.name || user.email) : "Người dùng";
      } else if (participant.email) {
        participantName = participant.email;
      }

      // Format số tiền thân thiện
      const formattedAmount = participant.shareAmount.toLocaleString('vi-VN');

      // Lấy thông tin danh mục nếu có
      let categoryName = '';
      if (tx.category) {
        const categoryData = await Category.findById(tx.category).lean();
        categoryName = categoryData ? categoryData.name : '';
      }

      // 1. Thông báo cho người trả tiền (payer) biết ai đó đã trả nợ
      const notif = await Notification.create({
        recipient: tx.payer,
        sender: actor._id,
        type: 'group.transaction.settled',
        message: `${actor.name || actor.email || participantName} đã hoàn trả ${formattedAmount} đồng cho giao dịch "${tx.title || 'Không tiêu đề'}"`,
        data: { 
          transactionId: tx._id, 
          groupId,
          amount: participant.shareAmount,
          title: tx.title,
          description: tx.description,
          category: tx.category,
          categoryName,
          receivedPayment: true // đánh dấu là người nhận thanh toán
        }
      });
      const io = req.app.get('io');
      if (io) io.to(String(tx.payer)).emit('notification', notif);

      // 2. Thông báo cho người nợ tiền biết họ đã trả nợ xong
      if (participant.user && String(participant.user) !== String(actor._id)) {
        await Notification.create({
          recipient: participant.user,
          sender: actor._id,
          type: 'group.transaction.debt.paid',
          message: `Bạn đã thanh toán khoản nợ ${formattedAmount} đồng cho giao dịch "${tx.title || 'Không tiêu đề'}"`,
          data: { 
            transactionId: tx._id, 
            groupId,
            amount: participant.shareAmount,
            payerId: tx.payer,
            title: tx.title,
            description: tx.description,
            category: tx.category,
            categoryName,
            debtPaid: true // đánh dấu là người trả nợ
          }
        });
        if (io) io.to(String(participant.user)).emit('notification', notif);
      }
    } catch (e) {
      console.warn('notify on settle failed', e && e.message);
    }

    const updated = await GroupTransaction.findById(tx._id)
      .populate('payer', 'name email')
      .populate('participants.user', 'name email')
      .populate('category', 'name icon'); // Thêm populate cho danh mục

    res.json(updated);
  } catch (err) {
    console.error('Settle group transaction error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET /api/categories - get all categories for select dropdown
router.get('/categories', auth, async (req, res) => {
  try {
    const categories = await Category.find({ type: 'expense' })
      .sort({ name: 1 })
      .select('name icon')
      .lean();
    
    res.json(categories);
  } catch (err) {
    console.error('Get categories error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
