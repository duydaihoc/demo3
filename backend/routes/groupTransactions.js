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

// Helper function to get group name and info for notifications
const getGroupInfoForNotification = async (groupId) => {
  try {
    if (!groupId) return { groupName: null, groupId: null };
    const group = await Group.findById(groupId).select('name').lean();
    return { 
      groupName: group ? group.name : 'Nhóm không xác định', 
      groupId: groupId 
    };
  } catch (e) {
    console.warn('Failed to get group info for notification', e);
    return { groupName: 'Nhóm không xác định', groupId: groupId };
  }
};

// Helper function to get group name for notifications
const getGroupNameForNotification = async (groupId) => {
  try {
    if (!groupId) return 'Nhóm không xác định';
    const Group = mongoose.model('Group'); // Use mongoose.model to get the Group model dynamically
    const group = await Group.findById(groupId).select('name').lean();
    return group ? group.name : 'Nhóm không xác định';
  } catch (e) {
    console.warn('Failed to get group name for notification', e);
    return 'Nhóm không xác định';
  }
};

// Add helper to robustly check transaction <-> group relationship
function belongsToGroup(tx, gid) {
	// gid may be ObjectId string
	if (!tx || !gid) return false;
	const checkFields = ['group', 'groupId'];
	for (const f of checkFields) {
		const val = tx[f];
		if (!val) continue;
		// if val is populated object with _id
		if (typeof val === 'object') {
			const id = String(val._id || val.id || val);
			if (id === String(gid)) return true;
		} else {
			if (String(val) === String(gid)) return true;
		}
	}
	return false;
}

// Helper: compute unique participants count (include creator if missing)
function computeParticipantsCount(tx) {
  if (!tx) return 0;
  const set = new Set();
  if (Array.isArray(tx.participants)) {
    tx.participants.forEach(p => {
      if (p.user) set.add(String(p.user._id || p.user));
      else if (p.email) set.add(String((p.email || '').toLowerCase()));
    });
  }
  if (tx.createdBy) {
    if (typeof tx.createdBy === 'object') {
      const cid = tx.createdBy._id || tx.createdBy.id || null;
      const cemail = tx.createdBy.email || null;
      if (cid && !set.has(String(cid))) set.add(String(cid));
      else if (cemail && !set.has(String(cemail.toLowerCase()))) set.add(String(cemail.toLowerCase()));
    } else {
      const c = String(tx.createdBy);
      if (c.includes('@')) {
        if (!set.has(c.toLowerCase())) set.add(c.toLowerCase());
      } else {
        if (!set.has(c)) set.add(c);
      }
    }
  }
  return set.size || (tx.createdBy ? 1 : 0);
}

// POST /api/groups/:groupId/transactions
// body: { payerId (optional, default auth), amount, transactionType, participants: [{email|userId}], percentages: [{user|email, percentage}], title, description, category }
router.post('/:groupId/transactions', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const {
      amount,
      transactionType = 'equal_split',
      participants = [],
      percentages = [],
      title = '',
      description = '',
      category,
      walletId // Thêm walletId
    } = req.body;

    // Validate inputs
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ message: 'Valid amount required' });
    }

    // Validate transaction type
    const validTypes = ['payer_single', 'payer_for_others', 'equal_split', 'percentage_split'];
    if (!validTypes.includes(transactionType)) {
      return res.status(400).json({ message: 'Invalid transaction type' });
    }

    // Validate wallet
    if (!walletId) {
      return res.status(400).json({ message: 'Wallet is required' });
    }
    const Wallet = mongoose.model('Wallet');
    const wallet = await Wallet.findOne({ _id: walletId, owner: req.user._id }); // Sửa từ userId thành owner
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }
    if (wallet.initialBalance < amount) { // Sửa từ balance thành initialBalance
      return res.status(400).json({ message: 'Insufficient wallet balance' });
    }

    // Get group information for the notification
    let currentGroupName = 'Nhóm không xác định';
    try {
      const group = await Group.findById(groupId).select('name').lean();
      if (group && group.name) {
        currentGroupName = group.name;
      }
    } catch (groupErr) {
      console.warn('Error fetching group name for notification:', groupErr);
    }

    // Build the transaction first before saving
    const builtTransaction = {
      groupId, // Add groupId here
      amount: Number(amount),
      transactionType,
      title,
      description,
      date: new Date(),
      payer: req.user._id,
      category,
      createdBy: req.user._id,
      wallet: walletId // Lưu ví của payer
    };

    let normalizedParticipants = [];

    // Process participants based on transaction type
    if (Array.isArray(participants) && participants.length > 0) {
      normalizedParticipants = await normalizeParticipantsInput(participants);

      // Validate percentages for percentage split
      if (transactionType === 'percentage_split') {
        if (!Array.isArray(percentages) || percentages.length === 0) {
          return res.status(400).json({ message: 'Percentages required for percentage split' });
        }

        const totalPercentage = percentages.reduce((sum, p) => sum + (Number(p.percentage) || 0), 0);
        if (Math.abs(totalPercentage - 100) > 0.01) {
          return res.status(400).json({ message: 'Total percentage must equal 100%' });
        }

        for (const p of percentages) {
          const percentage = Number(p.percentage);
          if (isNaN(percentage) || percentage < 0 || percentage > 100) {
            return res.status(400).json({ message: 'Each percentage must be between 0 and 100' });
          }
        }
      }

      // Build participants with shareAmount based on transaction type
      let participantsBuilt = [];

      if (transactionType === 'payer_for_others') {
        participantsBuilt = normalizedParticipants.map(p => ({
          user: p.user,
          email: p.email,
          shareAmount: Number(amount),
          percentage: 0,
          settled: false
        }));
      } else if (transactionType === 'equal_split') {
        const totalParticipants = normalizedParticipants.length + 1;
        const shareAmount = Number(amount) / totalParticipants;

        participantsBuilt.push({
          user: req.user._id,
          shareAmount: Number(shareAmount.toFixed(2)),
          percentage: 0,
          settled: false
        });

        participantsBuilt.push(...normalizedParticipants.map(p => ({
          user: p.user,
          email: p.email,
          shareAmount: Number(shareAmount.toFixed(2)),
          percentage: 0,
          settled: false
        })));
      } else if (transactionType === 'percentage_split') {
        const participantMap = new Map();
        normalizedParticipants.forEach(p => {
          const key = p.user ? String(p.user) : (p.email ? p.email.toLowerCase() : null);
          if (key) participantMap.set(key, p);
        });

        for (const percentageData of percentages) {
          const percentage = Number(percentageData.percentage);
          const shareAmount = (Number(amount) * percentage) / 100;

          let participant = null;
          if (percentageData.user) {
            participant = participantMap.get(String(percentageData.user));
          } else if (percentageData.email) {
            participant = participantMap.get(percentageData.email.toLowerCase());
          }

          if (participant) {
            participantsBuilt.push({
              user: participant.user,
              email: participant.email,
              shareAmount: Number(shareAmount.toFixed(2)),
              percentage: percentage,
              settled: false
            });
          }
        }

        if (builtTransaction.creatorIsParticipant) {
          const creatorPercentage = percentages.find(p =>
            (p.user && String(p.user) === String(req.user._id)) ||
            (p.email && p.email.toLowerCase() === req.user.email?.toLowerCase())
          );

          if (!creatorPercentage) {
            participantsBuilt.push({
              user: req.user._id,
              shareAmount: 0,
              percentage: 0,
              settled: false
            });
          }
        }
      }

      builtTransaction.participants = participantsBuilt;

      if (transactionType === 'percentage_split') {
        builtTransaction.splitPercentages = percentages.map(p => ({
          user: p.user,
          email: p.email,
          percentage: Number(p.percentage)
        }));
      }
    } else if (transactionType === 'payer_for_others') {
      return res.status(400).json({ message: 'Participants required for payer_for_others transaction type' });
    } else if (transactionType === 'payer_single') {
      const participantsBuilt = [{
        user: req.user._id,
        email: req.user.email || undefined,
        shareAmount: Number(amount),
        percentage: 100,
        settled: true
      }];
      builtTransaction.participants = participantsBuilt;
    }

    // Validation: Các giao dịch ghi nợ bắt buộc phải có người tham gia (ngoài người tạo)
    const debtTransactionTypes = ['payer_for_others', 'equal_split', 'percentage_split'];
    if (debtTransactionTypes.includes(transactionType)) {
      const participantsList = Array.isArray(builtTransaction.participants) ? builtTransaction.participants : [];
      // Đếm số người tham gia khác người tạo
      const otherParticipants = participantsList.filter(p => 
        String(p.user) !== String(req.user._id)
      );
      if (otherParticipants.length === 0) {
        return res.status(400).json({ 
          message: 'Giao dịch ghi nợ phải có ít nhất 1 người tham gia (ngoài người tạo). Vui lòng chọn người tham gia hoặc chuyển sang loại "Trả đơn".' 
        });
      }
    }

    // Xác định số tiền cần trừ khỏi ví của người tạo
    let totalAmountToDeduct = Number(amount);

    if (transactionType === 'payer_for_others') {
      // Trả giúp: trừ số tiền * số người (bao gồm cả người tạo)
      // participants chỉ chứa người được trả giúp, cần cộng thêm người tạo
      totalAmountToDeduct = Number(amount) * (participants.length + 1);
    }
    // equal_split, percentage_split, payer_single: trừ đúng số tiền như nhập

    // Trừ tiền khỏi ví của người tạo
    const payerWallet = await Wallet.findById(walletId);
    if (!payerWallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }
    if (payerWallet.initialBalance < totalAmountToDeduct) {
      return res.status(400).json({ message: 'Insufficient wallet balance' });
    }
    payerWallet.initialBalance -= totalAmountToDeduct;
    await payerWallet.save();

    // Now create and save the transaction
    const newTransaction = new GroupTransaction(builtTransaction);
    const savedTransaction = await newTransaction.save();
    
    // Notify transaction creator with group context
    try {
      const notif = await Notification.create({
        recipient: req.user._id,
        sender: req.user._id,
        type: 'group.transaction.created',
        message: `Bạn đã tạo giao dịch "${title}" trong nhóm "${currentGroupName}"`,
        data: {
          transactionId: savedTransaction._id,
          groupId,
          groupName: currentGroupName,
          title,
          amount: savedTransaction.amount,
          transactionType,
          category,
          categoryName: savedTransaction.category ? savedTransaction.category.name : '',
          categoryIcon: savedTransaction.category ? savedTransaction.category.icon : '',
        }
      });
      // Emit realtime notification if socket.io is available
      try {
        const io = req.app.get('io');
        if (io) io.to(String(req.user._id)).emit('notification', notif);
      } catch (e) { /* ignore emit errors */ }
    } catch (e) {
      console.warn('Failed to create notification for transaction creator', e);
    }
 
    // Notify debt participants with group context
    // Only notify other participants if they exist and are not the creator.
    if (Array.isArray(savedTransaction.participants)) {
      for (const p of savedTransaction.participants) {
        // skip notifying the creator (and skip email-only creator entry)
        if (!p.user) continue;
        if (String(p.user) === String(req.user._id)) continue;

        try {
          let message = '';
          switch (transactionType) {
            case 'payer_for_others':
              message = `${req.user.name || 'Người dùng'} đã tạo giao dịch "${title}" trong nhóm "${currentGroupName}" và bạn nợ ${p.shareAmount.toLocaleString('vi-VN')}đ (trả giúp)`;
              break;
            case 'equal_split':
              message = `${req.user.name || 'Người dùng'} đã tạo giao dịch "${title}" trong nhóm "${currentGroupName}" và bạn nợ ${p.shareAmount.toLocaleString('vi-VN')}đ (chia đều)`;
              break;
            case 'percentage_split':
              message = `${req.user.name || 'Người dùng'} đã tạo giao dịch "${title}" trong nhóm "${currentGroupName}" và bạn nợ ${p.shareAmount.toLocaleString('vi-VN')}đ (${p.percentage}% của tổng tiền)`;
              break;
            // payer_single đã bị loại trừ vì participant sẽ là creator, nên sẽ không rơi vào đây
            default:
              message = `${req.user.name || 'Người dùng'} đã tạo giao dịch "${title}" trong nhóm "${currentGroupName}" và bạn nợ ${p.shareAmount.toLocaleString('vi-VN')}đ`;
          }

          await Notification.create({
            recipient: p.user,
            sender: req.user._id,
            type: 'group.transaction.debt',
            message,
            data: {
              transactionId: savedTransaction._id,
              groupId,
              groupName: currentGroupName,
              title,
              shareAmount: p.shareAmount,
              percentage: p.percentage,
              transactionType,
              categoryName: savedTransaction.category ? savedTransaction.category.name : '',
              categoryIcon: savedTransaction.category ? savedTransaction.category.icon : '',
            }
          });
          // Emit realtime notification to participant if possible
          try {
            const io = req.app.get('io');
            if (io) io.to(String(p.user)).emit('notification', {
              recipient: p.user,
              sender: req.user._id,
              type: 'group.transaction.debt',
              message,
              data: {
                transactionId: savedTransaction._id,
                groupId,
                groupName: currentGroupName,
                title,
                shareAmount: p.shareAmount,
                percentage: p.percentage,
                transactionType
              }
            });
          } catch (e) { /* ignore */ }
         } catch (e) {
           console.warn(`Failed to notify participant ${p.user}:`, e);
         }
       }
     }
 
    // Return the created transaction
    return res.status(201).json(savedTransaction);
   } catch (err) {
     console.error('Create group transaction error:', err);
     res.status(500).json({ message: 'Server error', error: err.message });
   }
 });
 
// GET /api/groups/:groupId/transactions
router.get('/:groupId/transactions', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    // Query both possible fields: some code paths save as `group` while others use `groupId`.
    // This makes the endpoint robust and returns all transactions for the group regardless of storage field.
    const query = { $or: [{ group: groupId }, { groupId: groupId }] };
    const txs = await GroupTransaction.find(query)
      .sort({ createdAt: -1 })
      .populate('payer', 'name email')
      .populate('participants.user', 'name email')
      .populate('category', 'name icon')
      .populate('createdBy', 'name email');

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
    const { userId, walletId } = req.body; // Thêm walletId
    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(txId)) {
      return res.status(400).json({ message: 'Invalid id(s)' });
    }

    const tx = await GroupTransaction.findById(txId);
    if (!tx) return res.status(404).json({ message: 'Transaction not found' });
    if (!belongsToGroup(tx, groupId)) {
      return res.status(400).json({ message: 'Transaction does not belong to group' });
    }

    // Validate wallet
    if (!walletId) {
      return res.status(400).json({ message: 'Wallet is required' });
    }
    const Wallet = mongoose.model('Wallet');
    const userWallet = await Wallet.findOne({ _id: walletId, userId: req.user._id });
    if (!userWallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }

    const actor = req.user;
    const isOwnerOrPayer = String(actor._id) === String(tx.payer) || String(actor._id) === String((tx.group && tx.group.owner) || '');

    const targetUserId = userId || actor._id;
    const idx = tx.participants.findIndex(p => {
      if (p.user) return String(p.user) === String(targetUserId);
      if (p.email && actor.email) return p.email.toLowerCase() === String(actor.email).toLowerCase();
      return false;
    });

    if (idx === -1) return res.status(404).json({ message: 'Participant not found in this transaction' });

    const participant = tx.participants[idx];
    const isParticipant = String(actor._id) === String(participant.user);
    if (!isParticipant && !isOwnerOrPayer) {
      return res.status(403).json({ message: 'Not authorized to settle for this participant' });
    }

    if (tx.participants[idx].settled) {
      const populatedAlready = await GroupTransaction.findById(txId)
        .populate('payer', 'name email')
        .populate('participants.user', 'name email')
        .populate('category', 'name icon');
      return res.json(populatedAlready);
    }

    // Validate balance
    if (userWallet.balance < participant.shareAmount) {
      return res.status(400).json({ message: 'Insufficient wallet balance' });
    }

    // Trừ tiền từ ví người nợ
    userWallet.balance -= participant.shareAmount;
    await userWallet.save();

    // Cộng tiền vào ví của payer
    const payerWallet = await Wallet.findById(tx.wallet);
    if (payerWallet) {
      payerWallet.balance += participant.shareAmount;
      await payerWallet.save();
    }

    tx.participants[idx].settled = true;
    tx.participants[idx].settledAt = new Date();
    tx.participants[idx].wallet = walletId; // Lưu ví đã dùng
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
      await Notification.create({
        recipient: tx.payer,
        sender: actor._id,
        type: 'group.transaction.settled',
        message: `${participantName} đã hoàn trả ${formattedAmount} đồng cho giao dịch "${tx.title || 'Không tiêu đề'}"`,
        data: { 
          transactionId: tx._id, 
          groupId,
          amount: participant.shareAmount,
          title: tx.title,
          description: tx.description,
          category: tx.category,
          categoryName,
          receivedPayment: true
        }
      });
      const io = req.app.get('io');
      if (io) io.to(String(tx.payer)).emit('notification', {
        recipient: tx.payer,
        sender: actor._id,
        type: 'group.transaction.settled',
        message: `${participantName} đã hoàn trả ${formattedAmount} đồng cho giao dịch "${tx.title || 'Không tiêu đề'}"`,
        data: { transactionId: tx._id, groupId, amount: participant.shareAmount }
      });

      // 2. Thông báo cho người nợ biết họ đã hoàn trả (dù họ không tự bấm)
      if (participant.user) {
        await Notification.create({
          recipient: participant.user,
          sender: tx.payer,
          type: 'group.transaction.debt.paid',
          message: `Bạn đã hoàn trả ${formattedAmount} đồng cho giao dịch "${tx.title || 'Không tiêu đề'}"`,
          data: { 
            transactionId: tx._id, 
            groupId,
            amount: participant.shareAmount,
            payerId: tx.payer,
            title: tx.title,
            description: tx.description,
            category: tx.category,
            categoryName,
            debtPaid: true
          }
        });
        if (io) io.to(String(participant.user)).emit('notification', {
          recipient: participant.user,
          sender: tx.payer,
          type: 'group.transaction.debt.paid',
          message: `Bạn đã hoàn trả ${formattedAmount} đồng cho giao dịch "${tx.title || 'Không tiêu đề'}"`,
          data: { transactionId: tx._id, groupId, amount: participant.shareAmount }
        });
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

// POST /api/groups/:groupId/transactions/:txId/paid
// Mark the currently authenticated user as having paid (settled) their share in a transaction.
// This is a convenience endpoint so client can call "I've paid" without sending userId.
router.post('/:groupId/transactions/:txId/paid', auth, async (req, res) => {
  try {
    const { groupId, txId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(txId)) {
      return res.status(400).json({ message: 'Invalid id(s)' });
    }

    const tx = await GroupTransaction.findById(txId);
    if (!tx) return res.status(404).json({ message: 'Transaction not found' });

    // allow documents that saved group or groupId field
    if (String(tx.group) !== String(groupId) && String(tx.groupId || '') !== String(groupId)) {
      return res.status(400).json({ message: 'Transaction does not belong to this group' });
    }

    const actor = req.user;
    // find participant record for current user (by user id or email)
    const idx = tx.participants.findIndex(p => {
      if (p.user) {
        return String(p.user) === String(actor._id);
      }
      if (p.email && actor.email) {
        return p.email.toLowerCase() === String(actor.email).toLowerCase();
      }
      return false;
    });

    if (idx === -1) return res.status(404).json({ message: 'You are not a participant in this transaction' });

    // if already settled, return populated transaction
    if (tx.participants[idx].settled) {
      const populatedAlready = await GroupTransaction.findById(txId)
        .populate('payer', 'name email')
        .populate('participants.user', 'name email')
        .populate('category', 'name icon');
      return res.json(populatedAlready);
    }

    tx.participants[idx].settled = true;
    tx.participants[idx].settledAt = new Date();
    await tx.save();

    // Notifications: inform payer and participant
    try {
      // participant display name
      let participantName = actor.name || actor.email || 'Người dùng';
      // formatted amount (safe fallback)
      const shareAmount = tx.participants[idx].shareAmount || 0;
      const formattedAmount = Number(shareAmount).toLocaleString('vi-VN');

      // category name if present
      let categoryName = '';
      if (tx.category) {
        try {
          const cat = await Category.findById(tx.category).lean();
          if (cat) categoryName = cat.name;
        } catch (e) { /* ignore */ }
      }

      // 1) notify payer
      if (tx.payer) {
        await Notification.create({
          recipient: tx.payer,
          sender: actor._id,
          type: 'group.transaction.settled',
          message: `${participantName} đã hoàn trả ${formattedAmount} đồng cho giao dịch "${tx.title || 'Không tiêu đề'}"`,
          data: {
            transactionId: tx._id,
            groupId,
            amount: shareAmount,
            title: tx.title,
            category: tx.category,
            categoryName,
            paidBy: actor._id
          }
        });
        const io = req.app.get('io');
        if (io) {
          io.to(String(tx.payer)).emit('notification', {
            type: 'group.transaction.settled',
            message: `${participantName} đã hoàn trả ${formattedAmount} đồng cho giao dịch "${tx.title || 'Không tiêu đề'}"`,
            data: { transactionId: tx._id, groupId, amount: shareAmount }
          });
        }
      }

      // 2) notify participant themselves (confirm)
      if (actor._id) {
        await Notification.create({
          recipient: actor._id,
          sender: tx.payer || actor._id,
          type: 'group.transaction.debt.paid',
          message: `Bạn đã hoàn trả ${formattedAmount} đồng cho giao dịch "${tx.title || 'Không tiêu đề'}"`,
          data: {
            transactionId: tx._id,
            groupId,
            amount: shareAmount,
            payerId: tx.payer,
            title: tx.title,
            debtPaid: true
          }
        });
        const io = req.app.get('io');
        if (io) {
          io.to(String(actor._id)).emit('notification', {
            type: 'group.transaction.debt.paid',
            message: `Bạn đã hoàn trả ${formattedAmount} đồng cho giao dịch "${tx.title || 'Không tiêu đề'}"`,
            data: { transactionId: tx._id, groupId, amount: shareAmount }
          });
        }
      }
    } catch (notifErr) {
      console.warn('notify on paid failed', notifErr && notifErr.message);
    }

    // return updated populated transaction so client can update list immediately
    const updated = await GroupTransaction.findById(tx._id)
      .populate('payer', 'name email')
      .populate('participants.user', 'name email')
      .populate('category', 'name icon');

    return res.json(updated);
  } catch (err) {
    console.error('Mark paid error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET /api/groups/:groupId/transactions/:txId
// Return single populated transaction (including transactionType) for edit form
router.get('/:groupId/transactions/:txId', auth, async (req, res) => {
  try {
    const { groupId, txId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(txId)) return res.status(400).json({ message: 'Invalid txId' });

    const tx = await GroupTransaction.findById(txId)
      .populate('payer', 'name email')
      .populate('participants.user', 'name email')
      .populate('category', 'name icon')
      .populate('createdBy', 'name email');

    if (!tx) return res.status(404).json({ message: 'Transaction not found' });

    if (!belongsToGroup(tx, groupId)) return res.status(400).json({ message: 'Transaction does not belong to group' });

    // Add computed participantsCount for convenience
    const participantsCount = computeParticipantsCount(tx);

    return res.json({
      transaction: tx,
      transactionType: tx.transactionType || null,
      amount: tx.amount || 0,
      participantsCount
    });
  } catch (err) {
    console.error('GET transaction error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Helper: Tính số tiền cần hoàn lại cho ví khi hoàn tác giao dịch nhóm
function getWalletRefundAmount(transaction) {
  if (!transaction) return 0;
  const amount = Number(transaction.amount) || 0;
  const participantsCount = Array.isArray(transaction.participants) ? transaction.participants.length : 0;
  switch (transaction.transactionType) {
    case 'payer_for_others':
      // Trả giúp: mỗi người nợ full amount, creator đã trả tổng = amount * (participantsCount + 1)
      return amount * (participantsCount + 1);
    case 'equal_split':
      // Chia đều: tổng amount đã trừ khỏi ví
      return amount;
    case 'percentage_split':
      // Chia phần trăm: tổng amount đã trừ khỏi ví
      return amount;
    case 'payer_single':
      // Trả đơn: tổng amount đã trừ khỏi ví
      return amount;
    default:
      return amount;
  }
}

// PUT /api/groups/:groupId/transactions/:txId - Sửa giao dịch nhóm
router.put('/:groupId/transactions/:txId', auth, async (req, res) => {
  try {
    const { groupId, txId } = req.params;
    const Transaction = require('../models/GroupTransaction');
    const Wallet = mongoose.model('Wallet');
    const transaction = await Transaction.findById(txId);
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    // Không cho sửa nếu đã có participant thanh toán
    const hasSettled = Array.isArray(transaction.participants) && transaction.participants.some(p => p.settled);
    if (hasSettled) {
      return res.status(400).json({ message: 'Không thể sửa giao dịch vì đã có người thanh toán.' });
    }

    // Lưu lại thông tin ví cũ và số tiền cũ
    const oldWalletId = transaction.wallet;
    const oldRefundAmount = getWalletRefundAmount(transaction);

    // Nếu thay đổi ví, hoàn lại tiền cho ví cũ
    if (req.body.walletId && req.body.walletId !== String(oldWalletId)) {
      if (oldWalletId) {
        const oldWallet = await Wallet.findById(oldWalletId);
        if (oldWallet) {
          oldWallet.initialBalance += oldRefundAmount;
          await oldWallet.save();
        }
      }
      transaction.wallet = req.body.walletId;
    } else if (oldWalletId) {
      // Nếu không đổi ví, hoàn lại tiền cho ví cũ trước khi cập nhật
      const oldWallet = await Wallet.findById(oldWalletId);
      if (oldWallet) {
        oldWallet.initialBalance += oldRefundAmount;
        await oldWallet.save();
      }
    }

    // Cập nhật các trường cơ bản
    if (req.body.transactionType) transaction.transactionType = req.body.transactionType;
    if (req.body.title) transaction.title = req.body.title;
    if (req.body.amount) transaction.amount = req.body.amount;
    if (req.body.description !== undefined) transaction.description = req.body.description;
    if (req.body.participants) transaction.participants = req.body.participants;
    if (req.body.percentages) transaction.percentages = req.body.percentages;

    // Validation: Các giao dịch ghi nợ bắt buộc phải có người tham gia
    const debtTransactionTypes = ['payer_for_others', 'equal_split', 'percentage_split'];
    if (debtTransactionTypes.includes(transaction.transactionType)) {
      const participantsList = Array.isArray(transaction.participants) ? transaction.participants : [];
      if (participantsList.length === 0) {
        return res.status(400).json({ 
          message: 'Giao dịch ghi nợ phải có ít nhất 1 người tham gia. Vui lòng chọn người tham gia hoặc chuyển sang loại "Trả đơn".' 
        });
      }
    }

    // Tính lại số tiền cần trừ khỏi ví mới
    const newWalletId = transaction.wallet;
    const newDeducted = getWalletRefundAmount(transaction);

    // Trừ tiền từ ví mới
    if (newWalletId) {
      const newWallet = await Wallet.findById(newWalletId);
      if (!newWallet) {
        return res.status(404).json({ message: 'Wallet not found' });
      }
      if (newWallet.initialBalance < newDeducted) {
        return res.status(400).json({ message: 'Insufficient wallet balance' });
      }
      newWallet.initialBalance -= newDeducted;
      await newWallet.save();
    }

    // Cập nhật lại shareAmount cho từng participant
    if (req.body.transactionType || req.body.participants || req.body.percentages || req.body.amount) {
      let updatedParticipants = Array.isArray(transaction.participants) ? transaction.participants : [];
      if (transaction.transactionType === 'payer_for_others') {
        updatedParticipants = updatedParticipants.map(p => ({
          ...p,
          shareAmount: Number(transaction.amount),
          percentage: 0,
          settled: false
        }));
      } else if (transaction.transactionType === 'equal_split') {
        const total = updatedParticipants.length + 1;
        const per = Number(transaction.amount) / total;
        updatedParticipants = updatedParticipants.map(p => ({
          ...p,
          shareAmount: Number(per.toFixed(2)),
          percentage: 0,
          settled: false
        }));
      } else if (transaction.transactionType === 'percentage_split' && Array.isArray(transaction.percentages)) {
        const percMap = new Map();
        transaction.percentages.forEach(pp => {
          const key = (pp.email || pp.user || '').toString().toLowerCase();
          percMap.set(key, Number(pp.percentage || 0));
        });
        updatedParticipants = updatedParticipants.map(p => {
          const key = (p.email || p.user || '').toString().toLowerCase();
          const perc = percMap.get(key) || 0;
          return {
            ...p,
            shareAmount: Number(((perc / 100) * Number(transaction.amount)).toFixed(2)),
            percentage: perc,
            settled: false
          };
        });
      } else if (transaction.transactionType === 'payer_single') {
        updatedParticipants = updatedParticipants.map(p => ({
          ...p,
          shareAmount: Number(transaction.amount),
          percentage: 100,
          settled: true
        }));
      }
      transaction.participants = updatedParticipants;
    }

    await transaction.save();

    res.json({ message: 'Cập nhật giao dịch thành công', transaction });
  } catch (err) {
    console.error('Update group transaction error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// DELETE /api/groups/:groupId/transactions/:txId - Xóa giao dịch nhóm
router.delete('/:groupId/transactions/:txId', auth, async (req, res) => {
  try {
    const { groupId, txId } = req.params;
    const Transaction = require('../models/GroupTransaction');
    const Wallet = mongoose.model('Wallet');
    const transaction = await Transaction.findById(txId);
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    // Xử lý hoàn tiền dựa trên transactionType và trạng thái settled
    const transactionType = transaction.transactionType;
    const amount = Number(transaction.amount) || 0;
    
    if (transactionType === 'payer_single') {
      // Kiểu trả đơn: Chỉ hoàn lại tiền cho người tạo
      if (transaction.wallet) {
        const wallet = await Wallet.findById(transaction.wallet);
        if (wallet) {
          wallet.initialBalance += amount;
          await wallet.save();
        }
      }
    } else {
      // Kiểu có nợ: payer_for_others, equal_split, percentage_split
      const participants = Array.isArray(transaction.participants) ? transaction.participants : [];
      const settledParticipants = participants.filter(p => p.settled);
      const hasSettled = settledParticipants.length > 0;

      if (!hasSettled) {
        // Chưa có ai trả nợ: Hoàn tổng tiền cho người tạo
        const totalRefund = getWalletRefundAmount(transaction);
        if (transaction.wallet) {
          const wallet = await Wallet.findById(transaction.wallet);
          if (wallet) {
            wallet.initialBalance += totalRefund;
            await wallet.save();
          }
        }
      } else {
        // Đã có người trả nợ: Hoàn tiền cho người tạo và người đã trả
        
        // 1. Tính tổng tiền đã nhận từ người trả nợ
        let totalReceived = 0;
        for (const p of settledParticipants) {
          totalReceived += (Number(p.shareAmount) || 0);
        }

        // 2. Tính số tiền ban đầu người tạo đã trả
        let initialPaid = 0;
        if (transactionType === 'payer_for_others') {
          // Trả giúp: người tạo đã trả amount * (số người + 1)
          initialPaid = amount * (participants.length + 1);
        } else {
          // equal_split hoặc percentage_split: người tạo đã trả đúng amount
          initialPaid = amount;
        }

        // 3. Hoàn tiền cho người tạo (số tiền ban đầu - số tiền đã nhận)
        const refundToPayer = initialPaid - totalReceived;
        if (refundToPayer > 0 && transaction.wallet) {
          const payerWallet = await Wallet.findById(transaction.wallet);
          if (payerWallet) {
            payerWallet.initialBalance += refundToPayer;
            await payerWallet.save();
          }
        }

        // 4. Hoàn tiền cho từng người đã trả nợ
        for (const p of settledParticipants) {
          if (p.wallet) {
            const debtorWallet = await Wallet.findById(p.wallet);
            if (debtorWallet) {
              debtorWallet.initialBalance += (Number(p.shareAmount) || 0);
              await debtorWallet.save();
            }
          }
        }
      }
    }

    await Transaction.findByIdAndDelete(txId);

    res.json({ message: 'Giao dịch đã được xóa thành công' });
  } catch (err) {
    console.error('Delete group transaction error:', err);
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

// GET /api/groups/:groupId/optimize-debts - Get optimized transactions to settle all debts
router.get('/:groupId/optimize-debts', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    
    // Validate group membership
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Check if user is a member of the group
    const isUserInGroup = group.members.some(member => 
      (member.user && String(member.user) === String(req.user._id)) || 
      (member.email && req.user.email && member.email.toLowerCase() === req.user.email.toLowerCase())
    );

    if (!isUserInGroup) {
      return res.status(403).json({ message: 'You are not a member of this group' });
    }

    // Fetch all unsettled transactions in the group
    const transactions = await GroupTransaction.find({
      group: groupId,
      'participants.settled': false
    }).populate('payer', 'name email')
      .populate('participants.user', 'name email')
      .sort({ date: -1 });

    // Initialize balances map
    const balances = new Map();

    // Calculate net balance for each user
    transactions.forEach(tx => {
      const payerId = String(tx.payer._id || tx.payer);
      const payerName = tx.payer.name || tx.payer.email || 'Unknown User';

      // Initialize payer balance if needed
      if (!balances.has(payerId)) {
        balances.set(payerId, { 
          id: payerId, 
          name: payerName, 
          email: tx.payer.email || null,
          balance: 0 
        });
      }

      tx.participants.forEach(participant => {
        if (participant.settled) return; // Skip settled debts

        const userId = participant.user ? String(participant.user._id || participant.user) : null;
        const userEmail = participant.user ? participant.user.email : participant.email;
        const userName = participant.user ? (participant.user.name || participant.user.email) : participant.email;
        
        // Skip if participant is the payer
        if (userId && userId === payerId) return;
        
        // Generate a unique ID for email-only participants
        const participantId = userId || `email:${userEmail}`;
        
        // Initialize participant balance if needed
        if (!balances.has(participantId)) {
          balances.set(participantId, { 
            id: participantId, 
            name: userName,
            email: userEmail,
            balance: 0 
          });
        }

        // Update balances: payer gets credit, participant gets debit
        balances.get(payerId).balance += participant.shareAmount;
        balances.get(participantId).balance -= participant.shareAmount;
      });
    });

    // Convert balances map to array for processing
    const balanceArray = Array.from(balances.values());
    
    // Separate creditors (balance > 0) and debtors (balance < 0)
    const creditors = balanceArray.filter(user => user.balance > 0)
      .sort((a, b) => b.balance - a.balance); // Sort in descending order
    
    const debtors = balanceArray.filter(user => user.balance < 0)
      .sort((a, b) => a.balance - b.balance); // Sort in ascending order (most negative first)
    
    // Generate optimized transactions
    const optimizedTransactions = [];
    
    // Cash flow minimization algorithm
    while (debtors.length > 0 && creditors.length > 0) {
      const debtor = debtors[0];
      const creditor = creditors[0];
      
      // Find the smaller absolute value between the debt and credit
      const amount = Math.min(Math.abs(debtor.balance), creditor.balance);
      
      if (amount > 0) {
        optimizedTransactions.push({
          from: {
            id: debtor.id,
            name: debtor.name,
            email: debtor.email
          },
          to: {
            id: creditor.id,
            name: creditor.name,
            email: creditor.email
          },
          amount
        });
      }
      
      // Update balances
      debtor.balance += amount;
      creditor.balance -= amount;
      
      // Remove users with zero balance
      if (Math.abs(debtor.balance) < 0.01) debtors.shift();
      if (Math.abs(creditor.balance) < 0.01) creditors.shift();
    }
    
    return res.json({
      optimizedTransactions,
      groupId,
      groupName: group.name,
      transactionCount: transactions.length,
      originalTransactionCount: transactions.length,
      calculatedAt: new Date()
    });
  } catch (err) {
    console.error('Error optimizing debts:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/groups/:groupId/settle-optimized - Settle debts using optimized transactions
router.post('/:groupId/settle-optimized', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { transactions } = req.body;
    
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ message: 'Valid transactions array required' });
    }

    const results = [];
    const settledTransactions = [];
    
    // Validate group membership
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }
    
    // Get group name for notification context
    let groupName = 'Nhóm không xác định';
    try {
      if (group && group.name) {
        groupName = group.name;
      }
    } catch (e) {
      console.warn('Error getting group name:', e);
    }

    // Process each optimized transaction
    for (const tx of transactions) {
      const { from, to, amount } = tx;
      
      if (!from || !to || !amount || amount <= 0) {
        results.push({ success: false, message: 'Invalid transaction data', transaction: tx });
        continue;
      }

      // Find all unsettled transactions where 'from' is a participant and 'to' is the payer
      const unsettledTxs = await GroupTransaction.find({
        group: groupId,
        $or: [
          { payer: to.id, 'participants.user': from.id, 'participants.settled': false },
          { payer: to.id, 'participants.email': from.email, 'participants.settled': false }
        ]
      }).populate('payer', 'name email');
      
      if (unsettledTxs.length === 0) {
        results.push({ success: false, message: 'No matching unsettled transactions found', transaction: tx });
        continue;
      }

      // Mark transactions as settled
      let totalSettled = 0;
      for (const unsettledTx of unsettledTxs) {
        if (totalSettled >= amount) break;
        
        const participant = unsettledTx.participants.find(p => {
          if (p.settled) return false;
          
          if (p.user) {
            return String(p.user) === String(from.id);
          } else if (p.email && from.email) {
            return p.email.toLowerCase() === from.email.toLowerCase();
          }
          return false;
        });
        
        if (!participant) continue;
        
        const remainingToSettle = amount - totalSettled;
        const toSettleInThisTx = Math.min(participant.shareAmount, remainingToSettle);
        
        if (toSettleInThisTx > 0) {
          participant.settled = true;
          participant.settledAt = new Date();
          
          await unsettledTx.save();
          totalSettled += toSettleInThisTx;
          settledTransactions.push(unsettledTx);
          
          // Create notifications for both parties
          try {
            // Notification for the person who paid (from)
            if (from.id && !from.id.startsWith('email:')) {
              await Notification.create({
                recipient: from.id,
                sender: req.user._id,
                type: 'group.transaction.debt.paid',
                message: `Bạn đã thanh toán khoản nợ ${toSettleInThisTx.toLocaleString('vi-VN')}đ cho "${unsettledTx.title}" trong nhóm "${groupName}"`,
                data: {
                  transactionId: unsettledTx._id,
                  groupId,
                  groupName,
                  shareAmount: toSettleInThisTx,
                  title: unsettledTx.title,
                  optimized: true,
                  settledAt: new Date()
                }
              });
            }
            
            // Notification for the person who received payment (to)
            if (to.id && !to.id.startsWith('email:')) {
              await Notification.create({
                recipient: to.id,
                sender: req.user._id,
                type: 'group.transaction.settled',
                message: `${from.name || from.email || 'Người dùng'} đã thanh toán khoản nợ ${toSettleInThisTx.toLocaleString('vi-VN')}đ cho "${unsettledTx.title}" trong nhóm "${groupName}"`,
                data: {
                  transactionId: unsettledTx._id,
                  groupId,
                  groupName,
                  shareAmount: toSettleInThisTx,
                  payerId: from.id,
                  payerName: from.name || from.email || 'Người dùng',
                  title: unsettledTx.title,
                  optimized: true,
                  settledAt: new Date()
                }
              });
            }
          } catch (e) {
            console.warn('Error creating notifications for debt settlement:', e);
          }
        }
      }
      
      results.push({ success: true, settled: totalSettled, transaction: tx });
    }
    
    res.json({
      success: true,
      results,
      settledCount: settledTransactions.length
    });
  } catch (err) {
    console.error('Error settling optimized debts:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/groups/:groupId/transactions/:txId/repay
// API để trả nợ cho người bị nợ
router.post('/:groupId/transactions/:txId/repay', auth, async (req, res) => {
  try {
    const { groupId, txId } = req.params;
    const { walletId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(txId)) {
      return res.status(400).json({ message: 'Invalid groupId or txId' });
    }

    if (!walletId) {
      return res.status(400).json({ message: 'Wallet ID is required' });
    }

    const transaction = await GroupTransaction.findById(txId)
      .populate('payer', 'name email')
      .populate('participants.user', 'name email')
      .populate('wallet', 'name initialBalance')
      .lean();

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    if (!belongsToGroup(transaction, groupId)) {
      return res.status(400).json({ message: 'Transaction does not belong to this group' });
    }

    const participant = transaction.participants.find(p => 
      p.user && String(p.user._id || p.user) === String(req.user._id) && !p.settled
    );

    if (!participant) {
      return res.status(400).json({ message: 'You have no unsettled debt in this transaction' });
    }

    const Wallet = mongoose.model('Wallet');

    // Lấy ví của người trả nợ
    const userWallet = await Wallet.findOne({ _id: walletId, owner: req.user._id });
    if (!userWallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }

    if (userWallet.initialBalance < participant.shareAmount) {
      return res.status(400).json({ message: 'Insufficient wallet balance' });
    }

    // Lấy ví của người nhận tiền (payer)
    const payerWallet = await Wallet.findById(transaction.wallet);
    if (!payerWallet) {
      return res.status(404).json({ message: 'Payer\'s wallet not found' });
    }

    // Trừ tiền từ ví của người trả nợ
    userWallet.initialBalance -= participant.shareAmount;
    await userWallet.save();

    // Cộng tiền vào ví của người nhận
    payerWallet.initialBalance += participant.shareAmount;
    await payerWallet.save();

    // Đánh dấu participant đã trả nợ
    participant.settled = true;
    participant.settledAt = new Date();
    participant.wallet = walletId;

    await GroupTransaction.findByIdAndUpdate(txId, { participants: transaction.participants });

    // Gửi thông báo cho người nhận
    try {
      const Notification = mongoose.model('Notification');
      const formattedAmount = participant.shareAmount.toLocaleString('vi-VN');
      await Notification.create({
        recipient: transaction.payer._id,
        sender: req.user._id,
        type: 'group.transaction.debt.paid', // Sửa lại cho đúng enum
        message: `${req.user.name || 'Người dùng'} đã trả ${formattedAmount} đồng cho giao dịch "${transaction.title}"`,
        data: {
          transactionId: txId,
          groupId,
          amount: participant.shareAmount,
          title: transaction.title
        }
      });

      const io = req.app.get('io');
      if (io) {
        io.to(String(transaction.payer._id)).emit('notification', {
          type: 'group.transaction.debt.paid',
          message: `${req.user.name || 'Người dùng'} đã trả ${formattedAmount} đồng cho giao dịch "${transaction.title}"`,
          data: { transactionId: txId, groupId, amount: participant.shareAmount }
        });
      }
    } catch (err) {
      console.warn('Failed to send notification for repayment:', err);
    }

    res.json({ message: 'Debt repaid successfully', transactionId: txId });
  } catch (err) {
    console.error('Repay debt error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
