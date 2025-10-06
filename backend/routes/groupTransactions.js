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
      percentages = [], // for percentage split
      title = '',
      description = '',
      category
    } = req.body;

    // Validate inputs
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ message: 'Valid amount required' });
    }

    // Validate transaction type (thêm payer_single)
    const validTypes = ['payer_single', 'payer_for_others', 'equal_split', 'percentage_split'];
    if (!validTypes.includes(transactionType)) {
      return res.status(400).json({ message: 'Invalid transaction type' });
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
      amount: Number(amount),
      transactionType,
      title,
      description,
      date: new Date(),
      group: groupId,
      payer: req.user._id,
      category,
      createdBy: req.user._id,
      creatorIsParticipant: true // Người tạo luôn tham gia
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

        // Validate total percentage is 100%
        const totalPercentage = percentages.reduce((sum, p) => sum + (Number(p.percentage) || 0), 0);
        if (Math.abs(totalPercentage - 100) > 0.01) {
          return res.status(400).json({ message: 'Total percentage must equal 100%' });
        }

        // Validate each percentage is between 0 and 100
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
        // Kiểu 1: Người tạo trả giúp, ghi nợ người tham gia
        participantsBuilt = normalizedParticipants.map(p => ({
          user: p.user,
          email: p.email,
          shareAmount: Number(amount), // Mỗi người nợ toàn bộ số tiền
          percentage: 0,
          settled: false
        }));
      } else if (transactionType === 'equal_split') {
        // Kiểu 2: Chia đều cho tất cả người tham gia bao gồm người tạo
        const totalParticipants = normalizedParticipants.length + 1; // +1 for creator
        const shareAmount = Number(amount) / totalParticipants;

        // Add creator as participant
        participantsBuilt.push({
          user: req.user._id,
          shareAmount: Number(shareAmount.toFixed(2)),
          percentage: 0,
          settled: false
        });

        // Add other participants
        participantsBuilt.push(...normalizedParticipants.map(p => ({
          user: p.user,
          email: p.email,
          shareAmount: Number(shareAmount.toFixed(2)),
          percentage: 0,
          settled: false
        })));
      } else if (transactionType === 'percentage_split') {
        // Kiểu 3: Chia theo phần trăm
        // Create map of participants for quick lookup
        const participantMap = new Map();
        normalizedParticipants.forEach(p => {
          const key = p.user ? String(p.user) : (p.email ? p.email.toLowerCase() : null);
          if (key) participantMap.set(key, p);
        });

        // Build participants based on percentages
        for (const percentageData of percentages) {
          const percentage = Number(percentageData.percentage);
          const shareAmount = (Number(amount) * percentage) / 100;

          // Find participant
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

        // Add creator if not already included and creatorIsParticipant is true
        if (builtTransaction.creatorIsParticipant) {
          const creatorPercentage = percentages.find(p =>
            (p.user && String(p.user) === String(req.user._id)) ||
            (p.email && p.email.toLowerCase() === req.user.email?.toLowerCase())
          );

          if (creatorPercentage) {
            // Creator already included in percentages
          } else {
            // Add creator with remaining percentage (should be 0 if total is 100%)
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

      // Store percentages for percentage split
      if (transactionType === 'percentage_split') {
        builtTransaction.splitPercentages = percentages.map(p => ({
          user: p.user,
          email: p.email,
          percentage: Number(p.percentage)
        }));
      }
    } else if (transactionType === 'payer_for_others') {
      // payer_for_others yêu cầu phải có danh sách participants
      return res.status(400).json({ message: 'Participants required for payer_for_others transaction type' });
    } else if (transactionType === 'payer_single') {
      // Trả đơn: giao dịch chỉ dành cho người tạo, không cần participants từ client
      const participantsBuilt = [{
        user: req.user._id,
        email: req.user.email || undefined,
        shareAmount: Number(amount),
        percentage: 100,
        settled: true
      }];
      builtTransaction.participants = participantsBuilt;
    }

    // Ensure required fields are present on builtTransaction before saving
    // (groupId is required by schema; createdBy/payer often expected)
    builtTransaction.groupId = builtTransaction.groupId || groupId;
    if (!builtTransaction.createdBy) {
      // record who created this transaction
      builtTransaction.createdBy = req.user ? (req.user._id || req.user) : undefined;
    }
    if (!builtTransaction.payer) {
      // default payer to the creator (server-side canonical ref)
      builtTransaction.payer = req.user ? (req.user._id || req.user) : undefined;
    }

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
    const { page = 1, limit = 100 } = req.query;
    if (!groupId) return res.status(400).json({ message: 'groupId required' });

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const lim = Math.max(1, Math.min(1000, parseInt(limit, 10) || 100));
    const skip = (pageNum - 1) * lim;

    const GroupTransaction = require('../models/GroupTransaction');
    const Group = require('../models/Group');
    const User = require('../models/User');

    // fetch lean to avoid strict populate errors, then manually enrich
    const [txs, total] = await Promise.all([
      GroupTransaction.find({ $or: [{ group: groupId }, { groupId: groupId }] }).sort({ date: -1, createdAt: -1 }).skip(skip).limit(lim).lean(),
      GroupTransaction.countDocuments({ $or: [{ group: groupId }, { groupId: groupId }] })
    ]);

    // gather ids
    const userIds = new Set();
    txs.forEach(tx => {
      if (tx.createdBy) {
        const cb = typeof tx.createdBy === 'object' ? (tx.createdBy._id || tx.createdBy) : tx.createdBy;
        if (cb) userIds.add(String(cb));
      }
      if (tx.payer) {
        const p = typeof tx.payer === 'object' ? (tx.payer._id || tx.payer) : tx.payer;
        if (p) userIds.add(String(p));
      }
      if (Array.isArray(tx.participants)) {
        tx.participants.forEach(p => {
          if (p && p.user) {
            const uid = typeof p.user === 'object' ? (p.user._id || p.user) : p.user;
            if (uid) userIds.add(String(uid));
          }
        });
      }
    });

    const usersArr = userIds.size ? await User.find({ _id: { $in: Array.from(userIds) } }).select('name email').lean() : [];
    const userMap = new Map(usersArr.map(u => [String(u._id), u]));

    const countParticipants = (tx) => {
      const s = new Set();
      if (Array.isArray(tx.participants)) {
        tx.participants.forEach(p => {
          if (!p) return;
          if (p.user) s.add(String(typeof p.user === 'object' ? (p.user._id || p.user) : p.user));
          else if (p.email) s.add(String((p.email || '').toLowerCase()));
        });
      }
      if (tx.createdBy) {
        const c = typeof tx.createdBy === 'object' ? (tx.createdBy._id || tx.createdBy.email || tx.createdBy) : tx.createdBy;
        if (c) s.add(String(c).toLowerCase());
      }
      return s.size || 0;
    };

    const enriched = txs.map(tx => {
      const copy = { ...tx };
      if (copy.createdBy) {
        const cbId = typeof copy.createdBy === 'object' ? (String(copy.createdBy._id || copy.createdBy)) : String(copy.createdBy);
        copy.createdBy = userMap.has(cbId) ? { _id: cbId, name: userMap.get(cbId).name, email: userMap.get(cbId).email } : (typeof copy.createdBy === 'object' ? copy.createdBy : { _id: cbId });
      }
      if (copy.payer) {
        const pId = typeof copy.payer === 'object' ? (String(copy.payer._id || copy.payer)) : String(copy.payer);
        copy.payer = userMap.has(pId) ? { _id: pId, name: userMap.get(pId).name, email: userMap.get(pId).email } : (typeof copy.payer === 'object' ? copy.payer : { _id: pId });
      }
      if (Array.isArray(copy.participants)) {
        copy.participants = copy.participants.map(p => {
          const pp = { ...p };
          if (pp.user) {
            const uid = typeof pp.user === 'object' ? (String(pp.user._id || pp.user)) : String(pp.user);
            pp.user = userMap.has(uid) ? { _id: uid, name: userMap.get(uid).name, email: userMap.get(uid).email } : (typeof pp.user === 'object' ? pp.user : { _id: uid });
          }
          if (typeof pp.shareAmount !== 'undefined') pp.shareAmount = Number(pp.shareAmount || 0);
          if (typeof pp.percentage !== 'undefined') pp.percentage = Number(pp.percentage || 0);
          return pp;
        });
      } else copy.participants = [];

      copy.amount = Number(copy.amount || 0);
      copy.transactionType = copy.transactionType || copy.type || copy.txType || copy.transaction_type || null;
      copy.participantsCount = Number(typeof copy.participantsCount !== 'undefined' ? copy.participantsCount : countParticipants(copy));
      return copy;
    });

    return res.json({ transactions: enriched, total, page: pageNum, limit: lim });
  } catch (err) {
    console.error('Group transactions fetch error:', err);
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
    if (!belongsToGroup(tx, groupId)) {
      return res.status(400).json({ message: 'Transaction does not belong to group' });
    }

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

// PUT update a transaction
// PUT /api/groups/:groupId/transactions/:txId
router.put('/:groupId/transactions/:txId', auth, async (req, res) => {
  try {
    const { groupId, txId } = req.params;
    const updater = req.user && req.user._id;
    // load existing transaction
    const Transaction = require('../models/GroupTransaction'); // adjust path/name if different
    const original = await Transaction.findById(txId).lean();
    if (!original) return res.status(404).json({ message: 'Transaction not found' });

    // copy incoming payload
    const updatePayload = { ...(req.body || {}) };

    // determine the effective amount and type (prefer incoming values)
    const effectiveAmount = Number(typeof updatePayload.amount !== 'undefined' ? updatePayload.amount : original.amount || 0);
    const effectiveType = updatePayload.transactionType || original.transactionType || 'equal_split';

    // Helper: obtain normalized participant entries (user/email) from either incoming payload or original
    let normalizedInputs = [];
    if (Array.isArray(updatePayload.participants) && updatePayload.participants.length > 0) {
      // reuse existing helper normalizeParticipantsInput
      normalizedInputs = await normalizeParticipantsInput(updatePayload.participants);
    } else if (Array.isArray(original.participants) && original.participants.length > 0) {
      // derive from original participants
      normalizedInputs = original.participants.map(p => ({
        user: p.user ? (String(p.user._id || p.user)) : undefined,
        email: p.email ? String(p.email).toLowerCase() : undefined
      }));
    } else {
      normalizedInputs = [];
    }

    // Build participants according to transaction type
    let participantsBuilt = [];

    if (effectiveType === 'payer_for_others') {
      // each selected participant owes the full amount (creator paid for others)
      if (normalizedInputs.length === 0) {
        return res.status(400).json({ message: 'Participants required for payer_for_others' });
      }
      participantsBuilt = normalizedInputs.map(p => ({
        user: p.user,
        email: p.email,
        shareAmount: Number(effectiveAmount),
        percentage: 0,
        settled: false
      }));
    } else if (effectiveType === 'equal_split') {
      // include creator + normalizedInputs
      const totalParticipants = (normalizedInputs.length + 1) || 1; // +1 for creator
      const per = totalParticipants ? Number((effectiveAmount / totalParticipants).toFixed(2)) : 0;
      // creator
      participantsBuilt.push({
        user: String(req.user._id),
        email: req.user.email || undefined,
        shareAmount: per,
        percentage: 0,
        settled: false
      });
      // others
      participantsBuilt.push(...normalizedInputs.map(p => ({
        user: p.user,
        email: p.email,
        shareAmount: per,
        percentage: 0,
        settled: false
      })));
    } else if (effectiveType === 'percentage_split') {
      // Prefer incoming percentages, fallback to original.percentages or original.splitPercentages
      const incomingPerc = Array.isArray(updatePayload.percentages) ? updatePayload.percentages :
                           Array.isArray(updatePayload.splitPercentages) ? updatePayload.splitPercentages :
                           Array.isArray(original.percentages) ? original.percentages :
                           Array.isArray(original.splitPercentages) ? original.splitPercentages : [];

      if (incomingPerc.length === 0) {
        // If no percentages provided, initialize equal among creator + normalizedInputs
        const list = [{ user: String(req.user._id), email: req.user.email }, ...normalizedInputs];
        const base = list.length ? Number((100 / list.length).toFixed(2)) : 0;
        const percArr = list.map((p, i) => ({ user: p.user, email: p.email, percentage: base }));
        // ensure sum 100
        const sum = percArr.reduce((s, x) => s + Number(x.percentage || 0), 0);
        if (percArr.length > 0 && Math.abs(sum - 100) > 0.01) {
          const diff = Number((100 - sum).toFixed(2));
          percArr[percArr.length - 1].percentage = Number((Number(percArr[percArr.length - 1].percentage || 0) + diff).toFixed(2));
        }
        // build participantsBuilt from percArr
        participantsBuilt = percArr.map(pp => ({
          user: pp.user,
          email: pp.email,
          percentage: Number(pp.percentage || 0),
          shareAmount: Number(((Number(pp.percentage || 0) / 100) * effectiveAmount).toFixed(2)),
          settled: false
        }));
        updatePayload.percentages = percArr;
      } else {
        // use incomingPerc to build participantsBuilt
        participantsBuilt = incomingPerc.map(pp => {
          const percentage = Number(pp.percentage || 0);
          const shareAmount = Number(((percentage / 100) * effectiveAmount).toFixed(2));
          return {
            user: pp.user ? String(pp.user) : undefined,
            email: pp.email ? String(pp.email).toLowerCase() : undefined,
            percentage,
            shareAmount,
            settled: false
          };
        });
        // keep percentages in payload
        updatePayload.percentages = incomingPerc.map(pp => ({ user: pp.user, email: pp.email, percentage: Number(pp.percentage || 0) }));
      }
    } else if (effectiveType === 'payer_single') {
      // only creator: single participant = creator
      participantsBuilt = [{
        user: String(req.user._id),
        email: req.user.email || undefined,
        shareAmount: Number(effectiveAmount),
        percentage: 100,
        settled: true
      }];
    } else {
      // fallback: if there are normalizedInputs, divide among them; else keep original behavior
      if (normalizedInputs.length > 0) {
        const per = normalizedInputs.length ? Number((effectiveAmount / normalizedInputs.length).toFixed(2)) : 0;
        participantsBuilt = normalizedInputs.map(p => ({
          user: p.user,
          email: p.email,
          shareAmount: per,
          percentage: 0,
          settled: false
        }));
      } else {
        participantsBuilt = original.participants || [];
      }
    }

    // assign built participants into payload so DB update persists correct shares
    updatePayload.participants = participantsBuilt;

    // ensure amount/type fields set as numbers/strings
    updatePayload.amount = Number(effectiveAmount);
    updatePayload.transactionType = effectiveType;

    // apply update and return new document
    const updated = await Transaction.findByIdAndUpdate(txId, updatePayload, { new: true }).lean();
    if (!updated) return res.status(500).json({ message: 'Failed to update transaction' });

    // Compare original vs updated to craft notification
    const prevAmount = Number(original.amount || 0);
    const newAmount = Number(updated.amount || 0);
    const diff = Number((newAmount - prevAmount).toFixed(2));
    const amountChanged = Math.abs(diff) > 0.001;
    const prevType = original.transactionType || '';
    const newType = updated.transactionType || '';
    const typeChanged = prevType !== newType;

    // Helper to compare participants / percentages to detect debt distribution change
    const participantsChanged = () => {
      const pA = Array.isArray(original.participants) ? original.participants : [];
      const pB = Array.isArray(updated.participants) ? updated.participants : [];
      if (pA.length !== pB.length) return true;
      const normalize = p => ({
        id: p.user ? String(p.user._id || p.user) : (p.email || '').toLowerCase(),
        share: Number(p.shareAmount || p.share || 0),
        perc: Number(p.percentage || 0)
      });
      const mapB = new Map(pB.map(x => [normalize(x).id, normalize(x)]));
      for (const a of pA) {
        const na = normalize(a);
        const nb = mapB.get(na.id);
        if (!nb) return true;
        if (Math.abs(na.share - nb.share) > 0.01) return true;
        if (Math.abs(na.perc - nb.perc) > 0.01) return true;
      }
      return false;
    };
    const debtChanged = participantsChanged() || amountChanged || typeChanged;

    // Craft readable message and structured data
    const actorName = (req.user && (req.user.name || req.user.email)) || 'Người dùng';
    const txTitle = updated.title || 'Giao dịch';
    const messageParts = [];
    messageParts.push(`${actorName} đã chỉnh sửa giao dịch "${txTitle}"`);
    if (amountChanged) messageParts.push(`Số tiền: ${prevAmount} → ${newAmount} (Δ ${diff >= 0 ? '+' : ''}${diff})`);
    if (typeChanged) messageParts.push(`Kiểu giao dịch: ${prevType || 'n/a'} → ${newType || 'n/a'}`);
    if (debtChanged) messageParts.push('Phân bổ nợ đã thay đổi');
    const message = messageParts.join(' — ');

    const notifData = {
      transactionId: String(updated._id || updated.id),
      groupId: String(groupId),
      title: txTitle,
      previousAmount: prevAmount,
      newAmount: newAmount,
      difference: diff,
      previousType: prevType,
      newType: newType,
      debtChanged: !!debtChanged,
      updatedBy: { id: String(updater), name: actorName }
    };

    // Attempt to notify group members (lookup group members list)
    try {
      const Group = require('../models/Group');
      const groupDoc = await Group.findById(groupId).lean();
      if (groupDoc && Array.isArray(groupDoc.members)) {
        for (const m of groupDoc.members) {
          // only notify members who have a linked user id
          if (m.user) {
            // Optionally skip notifying the actor themself
            if (String(m.user) === String(updater)) continue;
            try {
              const notif = await Notification.create({
                recipient: m.user,
                sender: updater,
                type: 'group.transaction.edited',
                message,
                data: notifData
              });
              // Emit realtime notification immediately if io available
              try {
                const io = req.app.get('io');
                if (io) io.to(String(m.user)).emit('notification', notif);
              } catch (emitErr) { /* ignore */ }
            } catch (e) {
              console.warn('Failed to create notif for member', m.user, e && e.message);
            }
          }
        }
      }
    } catch (innerErr) {
      console.warn('Could not fetch group members to notify:', innerErr && innerErr.message);
    }

    // return updated transaction (existing response format)
    return res.json({ transaction: updated });
  } catch (err) {
    console.error('Transaction update error', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// DELETE /api/groups/:groupId/transactions/:txId - Delete transaction
router.delete('/:groupId/transactions/:txId', auth, async (req, res) => {
  try {
    const { groupId, txId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(txId)) {
      return res.status(400).json({ message: 'Invalid ID format' });
    }

    // Find the transaction
    const transaction = await GroupTransaction.findById(txId);
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    // Verify the transaction belongs to this group
    if (!belongsToGroup(transaction, groupId)) {
      return res.status(400).json({ message: 'Transaction does not belong to this group' });
    }

    // Only the creator can delete
    if (String(transaction.createdBy) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Only the creator can delete this transaction' });
    }
    
    // Get information needed for notifications before deleting
    const title = transaction.title || 'Không tiêu đề';
    const unsettledParticipants = transaction.participants
      ? transaction.participants.filter(p => !p.settled && p.user)
      : [];
    
    // Delete the transaction
    await transaction.deleteOne();
    
    // Notify unsettled participants that their debt has been cleared
    for (const participant of unsettledParticipants) {
      if (!participant.user) continue;
      
      try {
        await Notification.create({
          recipient: participant.user,
          sender: req.user._id,
          type: 'group.transaction.deleted',
          message: `${req.user.name || 'Người dùng'} đã xóa giao dịch "${title}". Khoản nợ ${participant.shareAmount.toLocaleString('vi-VN')}đ của bạn đã được hủy.`,
          data: {
            previousTransactionId: txId,
            groupId,
            amount: participant.shareAmount,
            title,
            deletedBy: req.user._id,
            userName: req.user.name || req.user.email || 'Người dùng',
            deletedAt: new Date()
          }
        });
        
        // Add real-time notification
        const io = req.app.get('io');
        if (io) io.to(String(participant.user)).emit('notification', {
          type: 'group.transaction.deleted',
          message: `Giao dịch "${title}" đã bị xóa, khoản nợ ${participant.shareAmount.toLocaleString('vi-VN')}đ của bạn đã được hủy`,
        });
        
      } catch (e) { 
        console.warn('Failed to notify participant about transaction deletion', e);
      }
    }

    // After notifying unsettled participants
    // Notify the deleting user as well
    try {
      await Notification.create({
        recipient: req.user._id,
        sender: req.user._id,
        type: 'group.transaction.deleted',
        message: `Bạn đã xóa giao dịch "${title}" trong nhóm`,
        data: {
          previousTransactionId: txId,
          groupId,
          title,
          deletedAt: new Date()
        }
      });
      
      // Send real-time notification if socket.io is available
      const io = req.app.get('io');
      if (io) {
        io.to(String(req.user._id)).emit('notification', {
          type: 'group.transaction.deleted',
          message: `Bạn đã xóa giao dịch "${title}" trong nhóm`
        });
      }
    } catch (e) {
      console.warn('Failed to notify deleter about their own action', e);
    }
    
    res.json({ message: 'Transaction deleted successfully' });
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

module.exports = router;
