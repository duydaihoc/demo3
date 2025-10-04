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

    // Include group name in creator's notification
    const groupName = await getGroupNameForNotification(groupId);
    
    // Notify creator about their own action
    try {
      await Notification.create({
        recipient: req.user._id,
        sender: req.user._id,
        type: 'group.transaction.created',
        message: `Bạn đã tạo giao dịch "${title}" trong nhóm ${groupName || ''}`,
        data: {
          transactionId: tx._id,
          groupId,
          groupName,
          title,
          amount: totalAmount,
          category
        }
      });
    } catch (e) {
      console.warn('Failed to create notification for transaction creator', e);
    }

    // Get group information for the notification
    let groupName = 'Nhóm không xác định';
    try {
      const group = await Group.findById(groupId).select('name').lean();
      if (group && group.name) {
        groupName = group.name;
      }
    } catch (groupErr) {
      console.warn('Error fetching group name for notification:', groupErr);
    }
    
    // Notify transaction creator with group context
    try {
      await Notification.create({
        recipient: req.user._id,
        sender: req.user._id,
        type: 'group.transaction.created',
        message: `Bạn đã tạo giao dịch "${title}" trong nhóm "${groupName}"`,
        data: {
          transactionId: transaction._id,
          groupId,
          groupName,
          title,
          amount: totalAmount,
          category,
          categoryName: transaction.category ? transaction.category.name : '',
          categoryIcon: transaction.category ? transaction.category.icon : '',
        }
      });
    } catch (e) {
      console.warn('Failed to create notification for transaction creator', e);
    }
    
    // Notify debt participants with group context
    if (Array.isArray(transaction.participants)) {
      for (const p of transaction.participants) {
        if (p.user && String(p.user) !== String(req.user._id)) {
          try {
            await Notification.create({
              recipient: p.user,
              sender: req.user._id,
              type: 'group.transaction.debt',
              message: `${req.user.name || 'Người dùng'} đã tạo giao dịch "${title}" trong nhóm "${groupName}" và bạn nợ ${p.shareAmount.toLocaleString('vi-VN')}đ`,
              data: {
                transactionId: transaction._id,
                groupId,
                groupName,
                title,
                shareAmount: p.shareAmount,
                categoryName: transaction.category ? transaction.category.name : '',
                categoryIcon: transaction.category ? transaction.category.icon : '',
              }
            });
          } catch (e) {
            console.warn(`Failed to notify participant ${p.user}:`, e);
          }
        }
      }
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

// PUT /api/groups/:groupId/transactions/:txId - Edit transaction
router.put('/:groupId/transactions/:txId', auth, async (req, res) => {
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
    if (String(transaction.group) !== String(groupId)) {
      return res.status(400).json({ message: 'Transaction does not belong to this group' });
    }

    // Only the creator can edit
    if (String(transaction.createdBy) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Only the creator can edit this transaction' });
    }

    const { title, description, amount, participants, category, perPerson } = req.body;

    // Update basic fields if provided
    if (title) transaction.title = title;
    if (description !== undefined) transaction.description = description;
    if (category) transaction.category = category;
    
    // Keep track of participants that were removed or changed for notifications
    const originalParticipants = JSON.parse(JSON.stringify(transaction.participants || []));
    
    // Update participants and recalculate if needed
    let totalAmount = amount;
    let participantsBuilt = []; // Define participantsBuilt here at the top level of the function
    
    if (participants && Array.isArray(participants)) {
      // Normalize participants input
      const normalizedParticipants = await normalizeParticipantsInput(participants);
      
      // Calculate share amounts
      if (perPerson && normalizedParticipants.length > 0) {
        totalAmount = amount * normalizedParticipants.length;
      }
      
      // Create map of original participants for quick lookup
      const originalParticipantsMap = new Map();
      originalParticipants.forEach(op => {
        const key = op.user ? String(op.user) : (op.email ? op.email.toLowerCase() : null);
        if (key) originalParticipantsMap.set(key, op);
      });
      
      // Map participants with shareAmount
      participantsBuilt = normalizedParticipants.map(p => {
        const share = perPerson ? amount : (normalizedParticipants.length > 0 ? totalAmount / normalizedParticipants.length : 0);
        
        // Try to find existing participant
        const key = p.user ? String(p.user) : (p.email ? p.email.toLowerCase() : null);
        const existingParticipant = key ? originalParticipantsMap.get(key) : null;
        
        // Check if this is a previously removed participant being added back
        const isReadded = key && existingParticipant === undefined;
        
        // Check if this is an existing participant with changed settled status
        const wasSettled = existingParticipant && existingParticipant.settled;
        const nowSettled = p.settled || false;
        const settledStatusChanged = existingParticipant && wasSettled !== nowSettled;
        
        return {
          user: p.user,
          email: p.email,
          shareAmount: Number(Number(share).toFixed(2)),
          settled: p.settled || false, // Allow explicitly setting settled status
          settledAt: p.settled ? (existingParticipant?.settledAt || new Date()) : undefined,
          isReadded,
          settledStatusChanged,
          previouslySettled: wasSettled,
          name: p.name || existingParticipant?.name || ''
        };
      });
      
      // Remove temporary tracking properties before saving
      transaction.participants = participantsBuilt.map(p => {
        // Create a clean copy without our tracking fields
        const { isReadded, settledStatusChanged, previouslySettled, ...cleanParticipant } = p;
        return cleanParticipant;
      });
    }
    
    // Update amount if provided or recalculated
    if (amount !== undefined || totalAmount !== undefined) {
      transaction.amount = Number(Number(totalAmount).toFixed(2));
      transaction.perPerson = !!perPerson;
    }
    
    // Add updated timestamp
    transaction.updatedAt = new Date();
    
    await transaction.save();
    
    // Add group name to notifications
    const groupName = await getGroupNameForNotification(groupId);
    
    // Send notifications to participants that were changed or removed
    const notifyParticipantChanges = async () => {
      // Get current participants map for quick lookup
      const currentParticipantsMap = new Map();
      transaction.participants.forEach(p => {
        const key = p.user ? String(p.user) : (p.email ? p.email.toLowerCase() : null);
        if (key) currentParticipantsMap.set(key, p);
      });
      
      // Find removed participants
      const removedParticipants = originalParticipants.filter(op => {
        const key = op.user ? String(op.user) : (op.email ? op.email.toLowerCase() : null);
        return key && !currentParticipantsMap.has(key);
      });
      
      // Find changed participants (amount changed)
      const changedParticipants = originalParticipants.filter(op => {
        const key = op.user ? String(op.user) : (op.email ? op.email.toLowerCase() : null);
        if (!key) return false;
        const current = currentParticipantsMap.get(key);
        return current && current.shareAmount !== op.shareAmount && !op.settled;
      });
      
      // Find re-added participants - here's where we need participantsBuilt
      const readdedParticipants = participantsBuilt ? participantsBuilt.filter(p => p.isReadded) : [];
      
      // Find participants with changed settlement status (from settled to unsettled)
      const unsettledParticipants = participantsBuilt ? participantsBuilt.filter(p => 
        p.settledStatusChanged && p.previouslySettled && !p.settled
      ) : [];
      
      // Get necessary info for notifications
      const payer = await User.findById(transaction.payer).select('name email').lean();
      const payerName = payer ? (payer.name || payer.email) : 'Người trả';
      const group = await Group.findById(groupId).select('name').lean();
      const groupName = group ? group.name : 'nhóm';
      
      // Get category name if available
      let categoryName = '';
      if (transaction.category) {
        try {
          const cat = await Category.findById(transaction.category).lean();
          if (cat) categoryName = cat.name;
        } catch (e) { /* ignore */ }
      }
      
      // Notify removed participants
      for (const removed of removedParticipants) {
        if (removed.user) {
          try {
            await Notification.create({
              recipient: removed.user,
              sender: req.user._id,
              type: 'group.transaction.removed',
              message: `${req.user.name || 'Người dùng'} đã loại bỏ bạn khỏi giao dịch "${transaction.title}" trong nhóm ${groupName || 'của bạn'}`,
              data: {
                transactionId: transaction._id,
                groupId,
                groupName,
                title: transaction.title,
                previousAmount: removed.shareAmount
              }
            });
          } catch (e) { console.warn('Failed to notify removed participant', e); }
        }
      }
      
      // Notify participants with changed amounts
      for (const changed of changedParticipants) {
        if (changed.user) {
          try {
            const current = currentParticipantsMap.get(changed.user ? String(changed.user) : changed.email?.toLowerCase());
            if (!current) continue;
            
            const oldAmount = changed.shareAmount;
            const newAmount = current.shareAmount;
            const difference = newAmount - oldAmount;
            
            // Improved message clarity with visual indicators of increase/decrease
            let changeMessage = '';
            if (difference > 0) {
              changeMessage = `Khoản nợ của bạn đã tăng thêm ${difference.toLocaleString('vi-VN')}đ`;
            } else if (difference < 0) {
              changeMessage = `Khoản nợ của bạn đã giảm ${Math.abs(difference).toLocaleString('vi-VN')}đ`;
            }
            
            await Notification.create({
              recipient: changed.user,
              sender: req.user._id,
              type: 'group.transaction.updated',
              message: `${req.user.name || 'Người dùng'} đã cập nhật giao dịch "${transaction.title}". ${changeMessage} (${oldAmount.toLocaleString('vi-VN')}đ → ${newAmount.toLocaleString('vi-VN')}đ)`,
              data: {
                transactionId: transaction._id,
                groupId,
                previousAmount: oldAmount,
                newAmount,
                difference,
                title: transaction.title,
                updatedBy: req.user._id,
                payer: { _id: transaction.payer, name: payerName },
                category: transaction.category,
                categoryName,
                // Add more data to support rich notification display
                amountIncreased: difference > 0,
                amountDecreased: difference < 0
              }
            });
            
            // Add real-time notification if socket.io is available
            const io = req.app.get('io');
            if (io) io.to(String(changed.user)).emit('notification', {
              type: 'group.transaction.updated',
              message: `Khoản nợ của bạn trong giao dịch "${transaction.title}" đã thay đổi từ ${oldAmount.toLocaleString('vi-VN')}đ thành ${newAmount.toLocaleString('vi-VN')}đ`,
            });
            
          } catch (e) { console.warn('Failed to notify participant about amount change', e); }
        }
      }

      // Notify re-added participants
      for (const readded of readdedParticipants) {
        if (readded.user) {
          try {
            await Notification.create({
              recipient: readded.user,
              sender: req.user._id,
              type: 'group.transaction.debt',
              message: `${req.user.name || 'Người dùng'} đã thêm bạn vào giao dịch "${transaction.title}" trong nhóm ${groupName || 'của bạn'}`,
              data: {
                transactionId: transaction._id,
                groupId,
                shareAmount: readded.shareAmount,
                title: transaction.title,
                updatedBy: req.user._id,
                payer: { _id: transaction.payer, name: payerName },
                category: transaction.category,
                categoryName,
                readdedToTransaction: true
              }
            });
            
            const io = req.app.get('io');
            if (io) io.to(String(readded.user)).emit('notification', {
              type: 'group.transaction.debt',
              message: `${req.user.name || 'Người dùng'} đã thêm bạn vào giao dịch "${transaction.title}" trong nhóm ${groupName || 'của bạn'}`
            });
          } catch (e) { console.warn('Failed to notify re-added participant', e); }
        }
      }
      
      // Notify participants whose settlement status changed from settled to unsettled
      for (const unsettled of unsettledParticipants) {
        if (unsettled.user) {
          try {
            await Notification.create({
              recipient: unsettled.user,
              sender: req.user._id,
              type: 'group.transaction.unsettled',
              message: `${req.user.name || 'Người dùng'} đã đánh dấu lại khoản nợ ${unsettled.shareAmount.toLocaleString('vi-VN')}đ của bạn là "Chưa thanh toán" trong giao dịch "${transaction.title}" của nhóm "${groupName}"`,
              data: {
                transactionId: transaction._id,
                groupId,
                groupName,
                shareAmount: unsettled.shareAmount,
                title: transaction.title,
                updatedBy: req.user._id,
                payer: { _id: transaction.payer, name: payerName },
                category: transaction.category,
                categoryName,
                statusChangedToUnsettled: true
              }
            });
            
            // Also notify the payer about this status change
            await Notification.create({
              recipient: transaction.payer,
              sender: req.user._id,
              type: 'group.transaction.status_changed',
              message: `Khoản nợ của ${unsettled.name || unsettled.email || 'thành viên'} (${unsettled.shareAmount.toLocaleString('vi-VN')}đ) trong giao dịch "${transaction.title}" của nhóm "${groupName}" đã được đánh dấu lại là "Chưa thanh toán"`,
              data: {
                transactionId: transaction._id,
                groupId,
                groupName,
                shareAmount: unsettled.shareAmount,
                title: transaction.title,
                participant: unsettled.user,
                categoryName: transaction.category ? transaction.category.name : '',
                categoryIcon: transaction.category ? transaction.category.icon : '',
              }
            });
            
            const io = req.app.get('io');
            if (io) {
              io.to(String(unsettled.user)).emit('notification', {
                type: 'group.transaction.unsettled',
                message: `Khoản nợ của bạn trong giao dịch "${transaction.title}" đã được đánh dấu lại là "Chưa thanh toán"`,
              });
              
              if (transaction.payer) {
                io.to(String(transaction.payer)).emit('notification', {
                  type: 'group.transaction.status_changed',
                  message: `Khoản nợ trong giao dịch "${transaction.title}" đã được đánh dấu lại là "Chưa thanh toán"`,
                });
              }
            }
          } catch (e) { console.warn('Failed to notify unsettled participant', e); }
        }
      }
      
      // Notify editor (as before)
      try {
        // Get category name if available
        let categoryName = '';
        if (transaction.category) {
          try {
            const cat = await Category.findById(transaction.category).lean();
            if (cat) categoryName = cat.name;
          } catch (e) { /* ignore */ }
        }
        
        // Create notification for the editor (user who made the changes)
        await Notification.create({
          recipient: req.user._id, // The editor receives their own notification
          sender: req.user._id,
          type: 'group.transaction.edited',
          message: `Bạn đã chỉnh sửa giao dịch "${transaction.title}" trong nhóm`,
          data: {
            transactionId: transaction._id,
            groupId,
            title: transaction.title,
            amount: transaction.amount,
            category: transaction.category,
            categoryName,
            editedAt: new Date(),
            participantsCount: transaction.participants ? transaction.participants.length : 0,
            changes: {
              removedCount: removedParticipants.length,
              changedCount: changedParticipants.length
            }
          }
        });

        // Send real-time notification if socket.io is available
        const io = req.app.get('io');
        if (io) {
          io.to(String(req.user._id)).emit('notification', {
            type: 'group.transaction.edited',
            message: `Bạn đã chỉnh sửa giao dịch "${transaction.title}" trong nhóm`
          });
        }
      } catch (e) {
        console.warn('Failed to notify editor about their own changes', e);
      }
    };
    
    // Run notifications in background
    notifyParticipantChanges().catch(e => console.warn('Error sending notifications after tx update', e));
    
    // Return the updated transaction
    const populatedTx = await GroupTransaction.findById(txId)
      .populate('payer', 'name email')
      .populate('participants.user', 'name email')
      .populate('category', 'name icon')
      .populate('group', 'name');
      
    res.json(populatedTx);
  } catch (err) {
    console.error('Edit group transaction error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
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
    if (String(transaction.group) !== String(groupId)) {
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

module.exports = router;
