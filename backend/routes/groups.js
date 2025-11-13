const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Group = require('../models/Group');
const GroupTransaction = require('../models/GroupTransaction');
const Notification = require('../models/Notification');
const { auth } = require('../middleware/auth');
const crypto = require('crypto');

// GET /api/groups - Get groups for current user
router.get('/', auth, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const groups = await Group.find({
      $or: [
        { owner: req.user._id },
        { 'members.user': req.user._id }
      ]
    })
      .populate('owner', 'name email')
      .populate('members.user', 'name email')
      .sort({ updatedAt: -1 });

    // convert docs to plain objects and parse color if it's a JSON string
    const out = groups.map(g => {
      const obj = g.toObject ? g.toObject() : g;
      if (obj.color && typeof obj.color === 'string') {
        try {
          obj.color = JSON.parse(obj.color);
        } catch (e) {
          // leave as string if not JSON
        }
      }
      return obj;
    });
    res.json(out);
  } catch (err) {
    console.error('Groups GET error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET /api/groups/search-users?email=...
router.get('/search-users', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email || !email.trim()) return res.status(400).json({ message: 'email query required' });

    const regex = new RegExp(email.trim(), 'i');
    const users = await User.find({ email: { $regex: regex } }, '_id name email').limit(10);
    res.json(users);
  } catch (err) {
    console.error('Groups search-users error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/groups
// body: { name, description?, members: [{ email }] }
router.post('/', auth, async (req, res) => {
  try {
    const { name, description = '', members = [] } = req.body;
    const { color } = req.body;
    if (!name) return res.status(400).json({ message: 'name is required' });
    if (!req.user) return res.status(401).json({ message: 'Authentication required to create group' });

    const creator = req.user;

    // build members array, attempt to link existing users
    const builtMembers = await Promise.all(members.map(async (m) => {
      const email = (m.email || '').toLowerCase().trim();
      const user = await User.findOne({ email });
      return {
        user: user ? user._id : undefined,
        email,
        role: m.role || 'member',
        invited: true,
        invitedAt: new Date()
      };
    }));

    const creatorEmailForMember = creator.email || '';

    const groupData = {
      name,
      description,
      owner: creator._id,
      members: [
        { user: creator._id, email: creatorEmailForMember, role: 'owner', invited: false, joinedAt: new Date() },
        ...builtMembers
      ],
      createdBy: creator._id
    };

    // attach color if provided
    if (typeof color !== 'undefined') {
      // schema expects a string; if caller provided an object, stringify it so it's stored as JSON string
      groupData.color = (typeof color === 'object') ? JSON.stringify(color) : color;
    }
    
    const group = new Group(groupData);
    
    await group.save();
    
    // Notify invited existing users (don't abort on notification errors)
    for (const member of builtMembers) {
      if (member.user) {
        try {
          await Notification.create({
            recipient: member.user,
            sender: creator._id,
            type: 'group.added', // Đổi từ group.invite thành group.added
            message: `Bạn đã được thêm vào nhóm "${name}"`, // Thay đổi nội dung
            data: { groupId: group._id }
          });
        } catch (notifErr) {
          console.warn('Failed to create notification for member', member.email, notifErr.message);
        }
      }
    }

    const populated = await Group.findById(group._id)
      .populate('owner', 'name email')
      .populate('members.user', 'name email');

    // ensure color is parsed if stored as string
    const out = populated.toObject ? populated.toObject() : populated;
    if (out.color && typeof out.color === 'string') {
      try { out.color = JSON.parse(out.color); } catch (e) { /* ignore */ }
    }
    res.status(201).json(out);
  } catch (err) {
    console.error('Groups POST error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/groups/:groupId/invite
// body: { email, inviterId }
router.post('/:groupId/invite', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { email, inviterId } = req.body;
    if (!email) return res.status(400).json({ message: 'email required' });

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    const emailNormalized = email.toLowerCase().trim();
    if (group.members.some(m => m.email === emailNormalized)) {
      return res.status(400).json({ message: 'Member already invited/exists' });
    }

    const user = await User.findOne({ email: emailNormalized });
    const newMember = {
      user: user ? user._id : undefined,
      email: emailNormalized,
      role: 'member',
      invited: true,
      invitedAt: new Date()
    };

    group.members.push(newMember);
    await group.save();

    if (user) {
      try {
        await Notification.create({
          recipient: user._id,
          sender: inviterId || req.user._id,
          type: 'group.added', // Đổi từ group.invite thành group.added
          message: `Bạn đã được thêm vào nhóm "${group.name}"`, // Thay đổi nội dung
          data: { groupId: group._id }
        });
      } catch (notifErr) {
        console.warn('Failed to notify invited user:', notifErr.message);
      }
    }

    res.status(200).json({ message: 'Invited', member: newMember });
  } catch (err) {
    console.error('Groups invite error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/groups/:groupId/respond
// body: { userId, accept: boolean }
router.post('/:groupId/respond', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId, accept } = req.body;

    if (!userId || typeof accept !== 'boolean') {
      return res.status(400).json({ message: 'userId and accept(boolean) are required' });
    }

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const email = (user.email || '').toLowerCase().trim();

    const memberIndex = group.members.findIndex(m =>
      (m.user && m.user.toString() === userId) || (m.email && m.email.toLowerCase() === email)
    );

    if (memberIndex === -1) return res.status(400).json({ message: 'No invitation found for this user' });

    const member = group.members[memberIndex];

    if (accept) {
      member.user = user._id;
      member.invited = false;
      member.joinedAt = new Date();
      group.members[memberIndex] = member;
      await group.save();

      const ownerId = group.owner || group.createdBy;
      if (ownerId) {
        try {
          await Notification.create({
            recipient: ownerId,
            sender: user._id,
            type: 'group.response',
            message: `${user.name || user.email} đã chấp nhận lời mời vào nhóm "${group.name}"`,
            data: { groupId: group._id, response: 'accepted', userId: user._id }
          });
        } catch (notifErr) {
          console.warn('Failed to notify owner about acceptance:', notifErr.message);
        }
      }

      return res.json({ message: 'Accepted and added to group', member });
    } else {
      group.members.splice(memberIndex, 1);
      await group.save();

      const ownerId = group.owner || group.createdBy;
      if (ownerId) {
        try {
          await Notification.create({
            recipient: ownerId,
            sender: user._id,
            type: 'group.response',
            message: `${user.name || user.email} đã từ chối lời mời vào nhóm "${group.name}"`,
            data: { groupId: group._id, response: 'rejected', userId: user._id }
          });
        } catch (notifErr) {
          console.warn('Failed to notify owner about rejection:', notifErr.message);
        }
      }

      return res.json({ message: 'Invitation rejected and removed' });
    }
  } catch (err) {
    console.error('Groups respond error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/groups/:groupId/remove-member
// owner: xóa thành viên bất kỳ; member: tự rời nhóm
router.post('/:groupId/remove-member', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const rawMember = req.body && req.body.memberId;
    if (!groupId || (typeof rawMember === 'undefined' || rawMember === null)) {
      return res.status(400).json({ message: 'groupId and memberId required' });
    }

    // Normalize member identifier: accept string id, email, or object { _id, id, email }
    let targetId = null;
    let targetEmail = null;
    if (typeof rawMember === 'object') {
      if (rawMember._id) targetId = String(rawMember._id);
      else if (rawMember.id) targetId = String(rawMember.id);
      if (rawMember.email) targetEmail = String(rawMember.email).toLowerCase().trim();
    } else {
      const s = String(rawMember);
      if (s.includes('@')) targetEmail = s.toLowerCase().trim();
      else targetId = s;
    }
 
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });
 
    const isOwner = String(group.owner) === String(req.user._id);
 
    // Permission check:
    // - owner can remove any member
    // - non-owner can remove only themself (either by id or by email)
    if (!isOwner) {
      let allowed = false;
      if (targetId && String(req.user._id) === String(targetId)) allowed = true;
      if (!allowed && targetEmail && req.user.email && String(req.user.email).toLowerCase().trim() === targetEmail) allowed = true;
      if (!allowed) return res.status(403).json({ message: 'Bạn chỉ có thể rời nhóm của mình' });
    }
 
    // Find member by user id or email (members may store user ObjectId or only email)
    const idx = group.members.findIndex(m => {
      // normalize stored member user id/email
      const mUserId = m.user && (m.user._id ? String(m.user._id) : String(m.user));
      const mEmail = m.email && String(m.email).toLowerCase();
      if (targetId && mUserId && String(mUserId) === String(targetId)) return true;
      if (targetEmail && mEmail && mEmail === targetEmail) return true;
      return false;
    });
    if (idx === -1) return res.status(404).json({ message: 'Thành viên không tồn tại trong nhóm' });
 
    // Prevent deleting the owner
    const memberAtIdx = group.members[idx];
    const memberUserId = memberAtIdx && memberAtIdx.user && (memberAtIdx.user._id ? String(memberAtIdx.user._id) : String(memberAtIdx.user));
    if (String(group.owner) === String(memberUserId)) {
      return res.status(400).json({ message: 'Không thể xóa chủ nhóm' });
    }
 
    group.members.splice(idx, 1);
    await group.save();

    // Xóa tất cả giao dịch liên quan đến thành viên này
    try {
      const deleteQuery = { groupId: groupId };
      
      // Build query to match payer or participant
      const conditions = [];
      
      if (targetId) {
        conditions.push(
          { payer: targetId },
          { 'participants.user': targetId }
        );
        
        // Try to convert to ObjectId if valid
        if (mongoose.Types.ObjectId.isValid(targetId)) {
          const objectId = new mongoose.Types.ObjectId(targetId);
          conditions.push(
            { payer: objectId },
            { 'participants.user': objectId }
          );
        }
      }
      
      if (targetEmail) {
        conditions.push(
          { payer: targetEmail },
          { 'participants.email': targetEmail }
        );
      }
      
      if (conditions.length > 0) {
        deleteQuery.$or = conditions;
        const deleteResult = await GroupTransaction.deleteMany(deleteQuery);
        console.log(`Deleted ${deleteResult.deletedCount} transactions for removed member`);
      }
    } catch (txErr) {
      console.error('Error deleting transactions for removed member:', txErr);
      // Continue even if transaction deletion fails
    }

    // Trả về group mới
    const populated = await Group.findById(group._id)
      .populate('owner', 'name email')
      .populate('members.user', 'name email');
    const obj = populated.toObject ? populated.toObject() : populated;
    if (obj.color && typeof obj.color === 'string') {
      try { obj.color = JSON.parse(obj.color); } catch (e) { /* ignore */ }
    }
    res.json(obj);
  } catch (err) {
    console.error('Groups remove-member error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});
 
// GET /api/groups/:groupId - Get group by ID
router.get('/:groupId', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    if (!groupId) return res.status(400).json({ message: 'groupId required' });

    const group = await Group.findById(groupId)
      .populate('owner', 'name email')
      .populate('members.user', 'name email');
    if (!group) return res.status(404).json({ message: 'Group not found' });

    // parse color if stored as string
    const obj = group.toObject ? group.toObject() : group;
    if (obj.color && typeof obj.color === 'string') {
      try { obj.color = JSON.parse(obj.color); } catch (e) { /* ignore */ }
    }
    res.json(obj);
  } catch (err) {
    console.error('Groups GET /:groupId error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// PUT /api/groups/:groupId - Owner update group name/color
router.put('/:groupId', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { name, color } = req.body;
    if (!groupId) return res.status(400).json({ message: 'groupId required' });

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    // Only owner can update
    if (String(group.owner) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Chỉ chủ nhóm mới được sửa nhóm' });
    }

    if (name) group.name = name;
    if (color) group.color = typeof color === 'object' ? JSON.stringify(color) : color;
    await group.save();

    const populated = await Group.findById(group._id)
      .populate('owner', 'name email')
      .populate('members.user', 'name email');
    // parse color if needed
    const obj = populated.toObject ? populated.toObject() : populated;
    if (obj.color && typeof obj.color === 'string') {
      try { obj.color = JSON.parse(obj.color); } catch (e) { /* ignore */ }
    }
    res.json(obj);
  } catch (err) {
    console.error('Groups PUT error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// DELETE /api/groups/:groupId - Owner xóa nhóm
router.delete('/:groupId', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    if (!groupId) return res.status(400).json({ message: 'groupId required' });

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    // Chỉ owner được xóa nhóm
    if (String(group.owner) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Chỉ chủ nhóm mới được xóa nhóm' });
    }

    // Xóa tất cả giao dịch của nhóm
    try {
      const deleteResult = await GroupTransaction.deleteMany({ groupId: groupId });
      console.log(`Deleted ${deleteResult.deletedCount} transactions when deleting group`);
    } catch (txErr) {
      console.error('Error deleting group transactions:', txErr);
      // Continue even if transaction deletion fails
    }

    await group.deleteOne();
    res.json({ message: 'Đã xóa nhóm' });
  } catch (err) {
    console.error('Groups DELETE error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/groups/:groupId/share - tạo/cập nhật chia sẻ
router.post('/:groupId/share', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { enabled, allowedData, expiresInDays } = req.body;
    const frontendBase = process.env.FRONTEND_URL || 'http://localhost:3000';

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    if (String(group.owner) !== String(req.user._id))
      return res.status(403).json({ message: 'Không có quyền' });

    if (enabled) {
      if (!group.shareSettings || !group.shareSettings.shareKey) {
        let shareKey, ok = false;
        while (!ok) {
          shareKey = crypto.randomBytes(16).toString('hex');
          ok = !(await Group.findOne({ 'shareSettings.shareKey': shareKey }));
        }
        group.shareSettings = group.shareSettings || {};
        group.shareSettings.shareKey = shareKey;
      }
      group.shareSettings.enabled = true;
      group.shareSettings.allowedData = {
        transactions: allowedData?.transactions ?? true,
        members: allowedData?.members ?? false,
        statistics: allowedData?.statistics ?? true,
        charts: allowedData?.charts ?? true
      };
      group.shareSettings.createdAt = group.shareSettings.createdAt || new Date();
      if (expiresInDays && expiresInDays > 0) {
        const exp = new Date();
        exp.setDate(exp.getDate() + expiresInDays);
        group.shareSettings.expiresAt = exp;
      } else {
        group.shareSettings.expiresAt = null;
      }
      group.isPublic = true;
    } else {
      if (group.shareSettings) group.shareSettings.enabled = false;
      group.isPublic = false;
    }

    await group.save();
    res.json({
      success: true,
      shareKey: group.shareSettings?.shareKey,
      shareUrl: group.shareSettings?.enabled
        ? `${frontendBase}/public/group/${group.shareSettings.shareKey}`
        : null,
      shareSettings: group.shareSettings
    });
  } catch (e) {
    console.error('share config error', e);
    res.status(500).json({ message: 'Server error', error: e.message });
  }
});

// GET /api/groups/:groupId/share - lấy cấu hình chia sẻ
router.get('/:groupId/share', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const frontendBase = process.env.FRONTEND_URL || 'http://localhost:3000';
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    if (String(group.owner) !== String(req.user._id))
      return res.status(403).json({ message: 'Không có quyền' });

    const shareUrl = group.shareSettings?.enabled && group.shareSettings?.shareKey
      ? `${frontendBase}/public/group/${group.shareSettings.shareKey}`
      : null;

    res.json({
      shareSettings: group.shareSettings || { enabled: false },
      shareUrl,
      isExpired: group.shareSettings?.expiresAt ? new Date() > group.shareSettings.expiresAt : false
    });
  } catch (e) {
    console.error('get share settings error', e);
    res.status(500).json({ message: 'Server error', error: e.message });
  }
});

// GET /api/public/group/:shareKey - dữ liệu công khai
router.get('/public/:shareKey', async (req, res) => {
  try {
    const { shareKey } = req.params;
    if (!shareKey) return res.status(400).json({ message: 'Share key required' });

    const group = await Group.findOne({
      'shareSettings.shareKey': shareKey,
      'shareSettings.enabled': true
    })
      .populate('owner', 'name')
      .populate('members.user', 'name email')
      .lean();

    if (!group) return res.status(404).json({ message: 'Link không hợp lệ hoặc đã tắt' });
    if (group.shareSettings?.expiresAt && new Date() > group.shareSettings.expiresAt)
      return res.status(410).json({ message: 'Link đã hết hạn' });

    const allowed = group.shareSettings.allowedData || {};

    const payload = {
      groupInfo: {
        name: group.name,
        description: group.description,
        color: group.color,
        createdAt: group.createdAt,
        ownerName: group.owner?.name || 'Quản lý'
      },
      shareSettings: allowed
    };

    // members count
    if (allowed.members) {
      payload.membersCount = Array.isArray(group.members) ? group.members.length : 0;
    }

    // transactions
    let txs = [];
    if (allowed.transactions || allowed.statistics || allowed.charts) {
      txs = await GroupTransaction.find({ groupId: group._id })
        .populate('category', 'name icon')
        .select('title amount date transactionType category participants payer createdAt')
        .sort({ date: -1 })
        .lean();
    }

    if (allowed.transactions) {
      payload.transactions = txs.slice(0, 30).map(tx => ({
        _id: tx._id,
        title: tx.title,
        amount: tx.amount,
        date: tx.date,
        transactionType: tx.transactionType,
        category: tx.category,
        participantsCount: tx.participants?.length || 0,
        settledCount: tx.participants?.filter(p => p.settled).length || 0,
        isFullySettled: Array.isArray(tx.participants) && tx.participants.length > 0 && tx.participants.every(p => p.settled)
      }));
    }

    if (allowed.statistics) {
      const totalAmount = txs.reduce((s, t) => s + (Number(t.amount) || 0), 0);
      const totalTransactions = txs.length;
      const settledTransactions = txs.filter(t =>
        Array.isArray(t.participants) &&
        t.participants.length > 0 &&
        t.participants.every(p => p.settled)
      ).length;
      const typeStats = {};
      txs.forEach(t => {
        const k = t.transactionType || 'other';
        typeStats[k] = (typeStats[k] || 0) + (Number(t.amount) || 0);
      });
      payload.statistics = {
        totalAmount,
        totalTransactions,
        settledTransactions,
        settlementRate: totalTransactions ? Number(((settledTransactions / totalTransactions) * 100).toFixed(1)) : 0,
        typeStats
      };
    }

    if (allowed.charts) {
      const now = new Date();
      const start = new Date();
      start.setMonth(start.getMonth() - 6);
      const dayMap = new Map();
      for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
        dayMap.set(d.toISOString().slice(0, 10), 0);
      }
      txs.forEach(tx => {
        const d = new Date(tx.date || tx.createdAt);
        if (isNaN(d.getTime())) return;
        const key = d.toISOString().slice(0, 10);
        if (dayMap.has(key)) {
          dayMap.set(key, dayMap.get(key) + (Number(tx.amount) || 0));
        }
      });
      const trendLabels = Array.from(dayMap.keys()).sort();
      const trendValues = trendLabels.map(k => dayMap.get(k) || 0);
      let cum = 0;
      const trendCumulative = trendValues.map(v => (cum += v));

      const catMap = new Map();
      txs.forEach(tx => {
        const name = tx.category?.name || 'Chưa phân loại';
        catMap.set(name, (catMap.get(name) || 0) + (Number(tx.amount) || 0));
      });
      const categoryBreakdown = Array.from(catMap.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([name, amount]) => ({ name, amount }));

      let membersOverview = [];
      if (allowed.members) {
        const agg = new Map();
        const ensure = (k, n) => {
          if (!agg.has(k)) agg.set(k, { name: n, paid: 0, borrowed: 0, owed: 0 });
          return agg.get(k);
        };
        txs.forEach(tx => {
          const payerId = tx.payer && (tx.payer._id || tx.payer);
            const payerName = tx.payer && typeof tx.payer === 'object'
              ? (tx.payer.name || tx.payer.email || 'Người tạo')
              : 'Người tạo';
          if (payerId) ensure(String(payerId), payerName).paid += Number(tx.amount) || 0;
          (tx.participants || []).forEach(p => {
            const pid = p.user && (p.user._id || p.user);
            const pname = p.user && typeof p.user === 'object'
              ? (p.user.name || p.user.email || 'Thành viên')
              : (p.email || 'Thành viên');
            if (pid && String(pid) !== String(payerId)) {
              ensure(String(pid), pname).borrowed += Number(p.shareAmount) || 0;
              if (payerId) ensure(String(payerId), payerName).owed += Number(p.shareAmount) || 0;
            }
          });
        });
        membersOverview = Array.from(agg.values())
          .filter(m => m.paid || m.borrowed || m.owed)
          .sort((a, b) => (b.owed + b.paid) - (a.owed + a.paid))
          .slice(0, 8);
      }

      payload.charts = {
        trend: { labels: trendLabels, values: trendValues, cumulative: trendCumulative },
        categories: categoryBreakdown,
        members: membersOverview
      };
    }

    res.json(payload);
  } catch (e) {
    console.error('public group error', e);
    res.status(500).json({ message: 'Server error', error: e.message });
  }
});

// đảm bảo xuất router
module.exports = router;
