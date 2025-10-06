const express = require('express');
const User = require('../models/User');
const router = express.Router();
const { auth } = require('../middleware/auth');
const Group = require('../models/Group');
const mongoose = require('mongoose');
const GroupTransaction = require('../models/GroupTransaction');

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

// --- Only keep this admin group-transactions endpoint ---
// GET /api/admin/group-transactions
// Admin only: list all group transactions with filters, pagination and sorting.
// Query params: page, limit, groupId, transactionType, q, startDate, endDate, sort
router.get('/group-transactions', auth, async (req, res) => {
  try {
    // basic admin guard - adjust to your user model fields
    if (!req.user || !(req.user.role === 'admin' || req.user.isAdmin)) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const {
      page = 1,
      limit = 50,
      groupId,
      transactionType,
      q,
      startDate,
      endDate,
      sort = '-createdAt'
    } = req.query;

    const pg = Math.max(1, parseInt(page, 10) || 1);
    const lim = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

    const filter = {};

    if (groupId) {
      // Prefer matching groupId field; include legacy group string if provided
      if (mongoose.Types.ObjectId.isValid(String(groupId))) {
        filter.$or = [{ groupId: groupId }];
      } else {
        filter.$or = [{ groupId: groupId }, { group: groupId }];
      }
    }

    if (transactionType) filter.transactionType = transactionType;

    if (q && String(q).trim()) {
      const regex = new RegExp(String(q).trim(), 'i');
      filter.$or = (filter.$or || []).concat([
        { title: { $regex: regex } },
        { description: { $regex: regex } }
      ]);
    }

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) {
        const s = new Date(startDate);
        if (!isNaN(s)) filter.date.$gte = s;
      }
      if (endDate) {
        const e = new Date(endDate);
        if (!isNaN(e)) filter.date.$lte = e;
      }
      if (Object.keys(filter.date).length === 0) delete filter.date;
    }

    const totalCount = await GroupTransaction.countDocuments(filter);

    // IMPORTANT: do NOT populate('group') if schema doesn't include it.
    // Populate only fields known to exist on the schema to avoid StrictPopulateError.
    const items = await GroupTransaction.find(filter)
      .populate('payer', 'name email')
      .populate('participants.user', 'name email')
      .populate('category', 'name icon')
      .populate('createdBy', 'name email')
      .sort(sort)
      .skip((pg - 1) * lim)
      .limit(lim)
      .lean()
      .exec();

    // Batch-load groups referenced by groupId (or legacy group) to avoid StrictPopulateError and N+1 queries
    const groupIdSet = new Set();
    items.forEach(it => {
      const gid = it.groupId || it.group;
      if (gid && mongoose.Types.ObjectId.isValid(String(gid))) groupIdSet.add(String(gid));
    });

    let groupMap = new Map();
    if (groupIdSet.size > 0) {
      const ids = Array.from(groupIdSet);
      try {
        const groups = await Group.find({ _id: { $in: ids } }).select('name owner').lean();
        groupMap = new Map(groups.map(g => [String(g._id), g]));
        items.forEach(it => {
          const gid = it.groupId || it.group;
          if (gid && groupMap.has(String(gid))) it.group = groupMap.get(String(gid));
        });
      } catch (e) {
        console.warn('Admin: failed to batch-load groups', e && e.message);
        // don't fail whole request if group lookup fails
      }
    }

    // Chuẩn hóa dữ liệu trả về: lấy tên người dùng, kiểu giao dịch
    const normalized = await Promise.all(items.map(async tx => {
      // payer
      let payerName = '';
      if (tx.payer && typeof tx.payer === 'object') {
        payerName = tx.payer.name || tx.payer.email || '';
      } else if (tx.payer) {
        payerName = String(tx.payer);
      }
      // createdBy
      let creatorName = '';
      if (tx.createdBy && typeof tx.createdBy === 'object') {
        creatorName = tx.createdBy.name || tx.createdBy.email || '';
      } else if (tx.createdBy) {
        // Nếu là id, truy vấn User để lấy tên/email
        try {
          const user = await User.findById(tx.createdBy).select('name email').lean();
          creatorName = user ? (user.name || user.email || '') : '';
        } catch (e) {
          creatorName = '';
        }
      }
      // participants
      let participants = Array.isArray(tx.participants) ? tx.participants.map(p => {
        let name = '';
        if (p.user && typeof p.user === 'object') {
          name = p.user.name || p.user.email || '';
        } else if (p.user) {
          name = String(p.user);
        } else if (p.email) {
          name = p.email;
        }
        return {
          ...p,
          userName: name
        };
      }) : [];
      // transactionType
      const transactionType = tx.transactionType || 'unknown';

      return {
        ...tx,
        payerName,
        creatorName,
        transactionType,
        participants,
      };
    }));

    res.json({
      total: totalCount,
      page: pg,
      limit: lim,
      pages: Math.max(1, Math.ceil(totalCount / lim)),
      data: normalized
    });
  } catch (err) {
    console.error('Admin group-transactions error:', err);
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

// GET /api/admin/group-transactions
// Admin only: list all group transactions with filters, pagination and sorting.
// Query params: page, limit, groupId, transactionType, q, startDate, endDate, sort
router.get('/group-transactions', auth, async (req, res) => {
  try {
    // basic admin guard - adjust to your user model fields
    if (!req.user || !(req.user.role === 'admin' || req.user.isAdmin)) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const {
      page = 1,
      limit = 50,
      groupId,
      transactionType,
      q,
      startDate,
      endDate,
      sort = '-createdAt'
    } = req.query;

    const pg = Math.max(1, parseInt(page, 10) || 1);
    const lim = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

    const filter = {};

    if (groupId) {
      // Prefer matching groupId field; include legacy group string if provided
      if (mongoose.Types.ObjectId.isValid(String(groupId))) {
        filter.$or = [{ groupId: groupId }];
      } else {
        filter.$or = [{ groupId: groupId }, { group: groupId }];
      }
    }

    if (transactionType) filter.transactionType = transactionType;

    if (q && String(q).trim()) {
      const regex = new RegExp(String(q).trim(), 'i');
      filter.$or = (filter.$or || []).concat([
        { title: { $regex: regex } },
        { description: { $regex: regex } }
      ]);
    }

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) {
        const s = new Date(startDate);
        if (!isNaN(s)) filter.date.$gte = s;
      }
      if (endDate) {
        const e = new Date(endDate);
        if (!isNaN(e)) filter.date.$lte = e;
      }
      if (Object.keys(filter.date).length === 0) delete filter.date;
    }

    const totalCount = await GroupTransaction.countDocuments(filter);

    // IMPORTANT: do NOT populate('group') if schema doesn't include it.
    // Populate only fields known to exist on the schema to avoid StrictPopulateError.
    const items = await GroupTransaction.find(filter)
      .populate('payer', 'name email')
      .populate('participants.user', 'name email')
      .populate('category', 'name icon')
      .populate('createdBy', 'name email')
      .sort(sort)
      .skip((pg - 1) * lim)
      .limit(lim)
      .lean()
      .exec();

    // Batch-load groups referenced by groupId (or legacy group) to avoid StrictPopulateError and N+1 queries
    const groupIdSet = new Set();
    items.forEach(it => {
      const gid = it.groupId || it.group;
      if (gid && mongoose.Types.ObjectId.isValid(String(gid))) groupIdSet.add(String(gid));
    });

    let groupMap = new Map();
    if (groupIdSet.size > 0) {
      const ids = Array.from(groupIdSet);
      try {
        const groups = await Group.find({ _id: { $in: ids } }).select('name owner').lean();
        groupMap = new Map(groups.map(g => [String(g._id), g]));
        items.forEach(it => {
          const gid = it.groupId || it.group;
          if (gid && groupMap.has(String(gid))) it.group = groupMap.get(String(gid));
        });
      } catch (e) {
        console.warn('Admin: failed to batch-load groups', e && e.message);
        // don't fail whole request if group lookup fails
      }
    }

    // Chuẩn hóa dữ liệu trả về: lấy tên người dùng, kiểu giao dịch
    const normalized = await Promise.all(items.map(async tx => {
      // payer
      let payerName = '';
      if (tx.payer && typeof tx.payer === 'object') {
        payerName = tx.payer.name || tx.payer.email || '';
      } else if (tx.payer) {
        payerName = String(tx.payer);
      }
      // createdBy
      let creatorName = '';
      if (tx.createdBy && typeof tx.createdBy === 'object') {
        creatorName = tx.createdBy.name || tx.createdBy.email || '';
      } else if (tx.createdBy) {
        // Nếu là id, truy vấn User để lấy tên/email
        try {
          const user = await User.findById(tx.createdBy).select('name email').lean();
          creatorName = user ? (user.name || user.email || '') : '';
        } catch (e) {
          creatorName = '';
        }
      }
      // participants
      let participants = Array.isArray(tx.participants) ? tx.participants.map(p => {
        let name = '';
        if (p.user && typeof p.user === 'object') {
          name = p.user.name || p.user.email || '';
        } else if (p.user) {
          name = String(p.user);
        } else if (p.email) {
          name = p.email;
        }
        return {
          ...p,
          userName: name
        };
      }) : [];
      // transactionType
      const transactionType = tx.transactionType || 'unknown';

      return {
        ...tx,
        payerName,
        creatorName,
        transactionType,
        participants,
      };
    }));

    res.json({
      total: totalCount,
      page: pg,
      limit: lim,
      pages: Math.max(1, Math.ceil(totalCount / lim)),
      data: normalized
    });
  } catch (err) {
    console.error('Admin group-transactions error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
module.exports = router;
