const express = require('express');
const User = require('../models/User');
const router = express.Router();
const { auth } = require('../middleware/auth');
const Group = require('../models/Group');

// Middleware kiểm tra quyền admin
function isAdmin(req, res, next) {
  // Giả sử token gửi qua header Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'No token provided' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = require('jsonwebtoken').verify(token, 'secretKey');
    if (decoded.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

// Lấy tất cả người dùng
router.get('/users', isAdmin, async (req, res) => {
  try {
    const users = await User.find({}, '-password'); // Không trả về password
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching users' });
  }
});

// Sửa thông tin người dùng
router.put('/users/:id', isAdmin, async (req, res) => {
  try {
    const { name, email, role } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { name, email, role },
      { new: true, runValidators: true }
    );
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Error updating user' });
  }
});

// Xóa người dùng
router.delete('/users/:id', isAdmin, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting user' });
  }
});

// GET /api/admin/groups - Admin endpoint to get all groups with detailed information
router.get('/groups', auth, async (req, res) => {
  try {
    // Verify admin role
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    // Fetch all groups with populated information
    const groups = await Group.find({})
      .populate('owner', 'name email')
      .populate('members.user', 'name email')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    // Transform and enhance the data for admin view
    const enhancedGroups = groups.map(group => {
      // Convert to plain object to avoid mongoose document immutability
      const g = group.toObject();
      
      // Parse color if it's stored as a string
      if (g.color && typeof g.color === 'string') {
        try {
          g.color = JSON.parse(g.color);
        } catch (e) {
          // Keep as string if not valid JSON
        }
      }

      // Add calculated fields for admin display
      return {
        ...g,
        memberCount: g.members ? g.members.length : 0,
        activeMembers: g.members ? g.members.filter(m => !m.invited).length : 0,
        pendingMembers: g.members ? g.members.filter(m => m.invited).length : 0,
        creatorName: g.createdBy ? (g.createdBy.name || g.createdBy.email) : 'Unknown',
        creatorEmail: g.createdBy ? g.createdBy.email : '',
        ownerName: g.owner ? (g.owner.name || g.owner.email) : 'Unknown',
        ownerEmail: g.owner ? g.owner.email : ''
      };
    });

    res.json(enhancedGroups);
  } catch (err) {
    console.error('Admin groups fetch error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/admin/groups/:groupId/delete - Admin endpoint to delete any group
router.post('/groups/:groupId/delete', auth, async (req, res) => {
  try {
    // Verify admin role
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { groupId } = req.params;
    if (!groupId) return res.status(400).json({ message: 'Group ID required' });

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    // Log the admin action
    console.log(`Admin ${req.user.email} deleted group: ${group.name} (${groupId})`);

    // Delete the group
    await group.deleteOne();

    res.json({ message: 'Group deleted successfully', groupId });
  } catch (err) {
    console.error('Admin group delete error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET /api/admin/groups/:groupId - Admin endpoint to get group by ID
router.get('/groups/:groupId', auth, async (req, res) => {
  try {
    // Verify admin role
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { groupId } = req.params;
    if (!groupId) return res.status(400).json({ message: 'Group ID required' });
    
    const group = await Group.findById(groupId)
      .populate('owner', 'name email')
      .populate('members.user', 'name email')
      .populate('createdBy', 'name email');
      
    if (!group) return res.status(404).json({ message: 'Group not found' });

    // Transform and enhance the data for admin view
    const g = group.toObject();
    
    // Parse color if it's stored as a string
    if (g.color && typeof g.color === 'string') {
      try {
        g.color = JSON.parse(g.color);
      } catch (e) {
        // Keep as string if not valid JSON
      }
    }

    // Add calculated fields for admin display
    const activeMembers = g.members ? g.members.filter(m => !m.invited).length : 0;
    const pendingMembers = g.members ? g.members.filter(m => m.invited).length : 0;
    
    const enhancedGroup = {
      ...g,
      activeMembers,
      pendingMembers,
      creatorName: g.createdBy ? (g.createdBy.name || g.createdBy.email) : 'Unknown',
      creatorEmail: g.createdBy ? g.createdBy.email : '',
      ownerName: g.owner ? (g.owner.name || g.owner.email) : 'Unknown',
      ownerEmail: g.owner ? g.owner.email : ''
    };

    res.json(enhancedGroup);
  } catch (err) {
    console.error('Admin group fetch error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Admin: get transactions for a group (or all groups)
// GET /api/admin/groups/:groupId/transactions? page, limit, startDate, endDate, minAmount, maxAmount, type, q
router.get('/groups/:groupId/transactions', auth, async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });

    const { groupId } = req.params;
    const { page = 1, limit = 50, startDate, endDate, minAmount, maxAmount, type, q } = req.query;

    const filter = {};
    if (groupId && String(groupId).toLowerCase() !== 'all') filter.$or = [{ group: groupId }, { groupId: groupId }];

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) { const sd = new Date(startDate); if (!isNaN(sd)) filter.date.$gte = sd; }
      if (endDate)   { const ed = new Date(endDate); if (!isNaN(ed)) { ed.setHours(23,59,59,999); filter.date.$lte = ed; } }
      if (Object.keys(filter.date).length === 0) delete filter.date;
    }

    if (minAmount || maxAmount) {
      filter.amount = {};
      if (minAmount && !isNaN(Number(minAmount))) filter.amount.$gte = Number(minAmount);
      if (maxAmount && !isNaN(Number(maxAmount))) filter.amount.$lte = Number(maxAmount);
      if (Object.keys(filter.amount).length === 0) delete filter.amount;
    }

    if (type) filter.transactionType = type;
    if (q) {
      const regex = new RegExp(String(q), 'i');
      filter.$or = filter.$or ? [...filter.$or, { title: { $regex: regex } }, { description: { $regex: regex } }] : [{ title: { $regex: regex } }, { description: { $regex: regex } }];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const lim = Math.max(1, Math.min(1000, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * lim;

    const GroupTransaction = require('../models/GroupTransaction');
    const Group = require('../models/Group');
    const User = require('../models/User');

    const [txs, total] = await Promise.all([
      GroupTransaction.find(filter).sort({ date: -1, createdAt: -1 }).skip(skip).limit(lim).lean(),
      GroupTransaction.countDocuments(filter)
    ]);

    // collect ids
    const groupIds = new Set();
    const userIds = new Set();
    txs.forEach(tx => {
      if (tx.group) groupIds.add(String(tx.group));
      if (tx.groupId) groupIds.add(String(tx.groupId));
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

    const groupsArr = groupIds.size ? await Group.find({ _id: { $in: Array.from(groupIds) } }).select('name').lean() : [];
    const usersArr = userIds.size ? await User.find({ _id: { $in: Array.from(userIds) } }).select('name email').lean() : [];

    const groupMap = new Map(groupsArr.map(g => [String(g._id), g]));
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
      const gid = copy.group ? String(copy.group) : (copy.groupId ? String(copy.groupId) : null);
      copy.group = gid ? (groupMap.get(gid) ? { _id: gid, name: groupMap.get(gid).name } : { _id: gid, name: `Group ${gid.substring(0,8)}...` }) : null;

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
    console.error('Admin group transactions fetch error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET /api/admin/group-transactions - Admin endpoint to get transactions across all groups
router.get('/group-transactions', auth, async (req, res) => {
  try {
    // Verify admin role
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const {
      groupId,
      startDate,
      endDate,
      type,
      minAmount,
      maxAmount,
      q: searchQuery,
      page = 1,
      limit = 20
    } = req.query;

    // Build filter query
    const filter = {};
    
    // Filter by group
    if (groupId) {
      filter.group = groupId;
    }
    
    // Filter by date range
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) {
        // Set to end of the day for the end date
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        filter.date.$lte = endDateTime;
      }
    }
    
    // Filter by transaction type
    if (type) {
      filter.type = type;
    }
    
    // Filter by amount range
    if (minAmount || maxAmount) {
      filter.amount = {};
      if (minAmount) filter.amount.$gte = parseFloat(minAmount);
      if (maxAmount) filter.amount.$lte = parseFloat(maxAmount);
    }
    
    // Search in title or description
    if (searchQuery) {
      filter.$or = [
        { title: { $regex: searchQuery, $options: 'i' } },
        { description: { $regex: searchQuery, $options: 'i' } }
      ];
    }
    
    // Import model if not already imported
    const GroupTransaction = require('../models/GroupTransaction');

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Execute query with pagination - improved populate to get more group info
    const transactions = await GroupTransaction.find(filter)
      .populate({
        path: 'group',
        select: 'name description owner members createdAt', // Get more fields
        populate: {
          path: 'owner',
          select: 'name email'
        }
      })
      .populate('category', 'name icon')
      .populate('createdBy', 'name email')
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const total = await GroupTransaction.countDocuments(filter);
    
    res.json({
      transactions,
      total,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (err) {
    console.error('Admin group transactions fetch error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET /api/admin/group-transactions/:id - Get single transaction by ID
router.get('/group-transactions/:id', auth, async (req, res) => {
  try {
    // Verify admin role
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'Transaction ID required' });
    
    // Import model if not already imported
    const GroupTransaction = require('../models/GroupTransaction');
    
    const transaction = await GroupTransaction.findById(id)
      .populate('group', 'name')
      .populate('category', 'name icon')
      .populate('createdBy', 'name email');
      
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    
    res.json(transaction);
  } catch (err) {
    console.error('Admin transaction fetch error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
      