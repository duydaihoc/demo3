const express = require('express');
const User = require('../models/User');
const router = express.Router();
const { auth } = require('../middleware/auth');
const Group = require('../models/Group');
const mongoose = require('mongoose');
const GroupTransaction = require('../models/GroupTransaction');
// Import Family model for admin family management
const Family = require('../models/family');
// Import FamilyTransaction model for admin family transactions
const FamilyTransaction = require('../models/FamilyTransaction');

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

// GET /api/admin/groups/:groupId/transactions - Admin endpoint to get group transactions with detailed stats
router.get('/groups/:groupId/transactions', auth, async (req, res) => {
  try {
    // Verify admin role
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { groupId } = req.params;
    if (!groupId) return res.status(400).json({ message: 'Group ID required' });

    // Lấy tất cả giao dịch của nhóm
    const GroupTransaction = mongoose.model('GroupTransaction');
    const User = mongoose.model('User');
    
    const transactions = await GroupTransaction.find({ groupId })
      .populate('category', 'name icon')
      .populate('participants.user', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    // Collect all user IDs from payer and createdBy (vì chúng là Mixed type)
    const userIds = new Set();
    transactions.forEach(tx => {
      if (tx.payer && mongoose.Types.ObjectId.isValid(tx.payer)) {
        userIds.add(String(tx.payer));
      }
      if (tx.createdBy && mongoose.Types.ObjectId.isValid(tx.createdBy)) {
        userIds.add(String(tx.createdBy));
      }
    });

    // Batch fetch all users
    const users = await User.find({ _id: { $in: Array.from(userIds) } })
      .select('name email')
      .lean();
    const userMap = new Map(users.map(u => [String(u._id), u]));

    // Thống kê chi tiết
    let totalAmount = 0;
    let totalDebt = 0; // Tổng tiền ghi nợ (chưa trả)
    let totalPaid = 0; // Tổng tiền đã trả nợ
    let totalParticipants = new Set();
    
    const transactionsWithDetails = transactions.map(tx => {
      // Tổng số tiền giao dịch
      totalAmount += tx.amount || 0;
      
      // Đếm participants
      if (Array.isArray(tx.participants)) {
        tx.participants.forEach(p => {
          const userId = p.user?._id || p.user;
          if (userId) totalParticipants.add(String(userId));
          
          // Tính nợ và đã trả
          if (p.settled) {
            totalPaid += p.shareAmount || 0;
          } else {
            totalDebt += p.shareAmount || 0;
          }
        });
      }
      
      // Lookup payer và createdBy từ userMap
      const payerId = tx.payer && mongoose.Types.ObjectId.isValid(tx.payer) ? String(tx.payer) : null;
      const creatorId = tx.createdBy && mongoose.Types.ObjectId.isValid(tx.createdBy) ? String(tx.createdBy) : null;
      
      const payerUser = payerId ? userMap.get(payerId) : null;
      const creatorUser = creatorId ? userMap.get(creatorId) : null;
      
      const payerName = payerUser ? (payerUser.name || payerUser.email) : 'Không xác định';
      const creatorName = creatorUser ? (creatorUser.name || creatorUser.email) : 'Không xác định';
      
      const participantCount = tx.participants?.length || 0;
      const settledCount = tx.participants?.filter(p => p.settled).length || 0;
      const pendingCount = participantCount - settledCount;
      
      return {
        ...tx,
        payerName,
        creatorName,
        participantCount,
        settledCount,
        pendingCount,
        participants: tx.participants?.map(p => ({
          ...p,
          userName: p.user?.name || p.user?.email || p.email || 'Không xác định',
          userEmail: p.user?.email || p.email || '',
          status: p.settled ? 'Đã trả' : 'Chưa trả'
        }))
      };
    });

    // Tổng hợp thống kê
    const stats = {
      totalTransactions: transactions.length,
      totalAmount,
      totalDebt,
      totalPaid,
      totalParticipants: totalParticipants.size,
      settledTransactions: transactionsWithDetails.filter(tx => tx.settledCount === tx.participantCount).length,
      pendingTransactions: transactionsWithDetails.filter(tx => tx.pendingCount > 0).length
    };

    res.json({
      transactions: transactionsWithDetails,
      stats
    });
  } catch (err) {
    console.error('Admin group transactions fetch error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// --- Only keep this admin group-transactions endpoint ---
// GET /api/admin/group-transactions
// Admin only: list all group transactions with filters, pagination and sorting.
// Query params: page, limit, groupId, transactionType, q, startDate, endDate, sort
router.get('/group-transactions', auth, async (req, res) => {
  try {
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
      if (mongoose.Types.ObjectId.isValid(String(groupId))) filter.$or = [{ groupId: groupId }];
      else filter.$or = [{ groupId: groupId }, { group: groupId }];
    }
    if (transactionType) filter.transactionType = transactionType;
    if (q && String(q).trim()) {
      const regex = new RegExp(String(q).trim(), 'i');
      filter.$or = (filter.$or || []).concat([{ title: { $regex: regex } }, { description: { $regex: regex } }]);
    }
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) { const s = new Date(startDate); if (!isNaN(s)) filter.date.$gte = s; }
      if (endDate) { const e = new Date(endDate); if (!isNaN(e)) filter.date.$lte = e; }
      if (Object.keys(filter.date).length === 0) delete filter.date;
    }

    const totalCount = await GroupTransaction.countDocuments(filter);

    // Populate only known schema paths (avoid populate('group'))
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

    // Batch-load groups referenced by groupId (or legacy group)
    const groupIdSet = new Set();
    items.forEach(it => {
      const gid = it.groupId || it.group;
      if (gid && mongoose.Types.ObjectId.isValid(String(gid))) groupIdSet.add(String(gid));
    });
    let groupMap = new Map();
    if (groupIdSet.size > 0) {
      const ids = Array.from(groupIdSet);
      try {
        const groups = await Group.find({ _id: { $in: ids } }).select('name').lean();
        groupMap = new Map(groups.map(g => [String(g._id), g]));
      } catch (e) { /* ignore group fetch errors */ }
    }

    // Collect user ids that were not populated (createdBy / payer / participants.user)
    const userIdSet = new Set();
    items.forEach(tx => {
      // createdBy can be string id or object {_id: ...} — include both cases
      if (tx.createdBy) {
        if (typeof tx.createdBy === 'object') {
          const cid = tx.createdBy._id || tx.createdBy.id;
          if (cid && mongoose.Types.ObjectId.isValid(String(cid))) userIdSet.add(String(cid));
        } else if (mongoose.Types.ObjectId.isValid(String(tx.createdBy))) {
          userIdSet.add(String(tx.createdBy));
        }
      }
      // payer may be object or id
      if (tx.payer) {
        if (typeof tx.payer === 'object') {
          const pid = tx.payer._id || tx.payer.id;
          if (pid && mongoose.Types.ObjectId.isValid(String(pid))) userIdSet.add(String(pid));
        } else if (mongoose.Types.ObjectId.isValid(String(tx.payer))) {
          userIdSet.add(String(tx.payer));
        }
      }
      // participants
      if (Array.isArray(tx.participants)) {
        tx.participants.forEach(p => {
          if (p.user) {
            if (typeof p.user === 'object') {
              const uid = p.user._id || p.user.id;
              if (uid && mongoose.Types.ObjectId.isValid(String(uid))) userIdSet.add(String(uid));
            } else if (mongoose.Types.ObjectId.isValid(String(p.user))) {
              userIdSet.add(String(p.user));
            }
          }
        });
      }
    });

    const userMap = new Map();
    if (userIdSet.size > 0) {
      const uids = Array.from(userIdSet);
      try {
        const User = require('../models/User');
        const users = await User.find({ _id: { $in: uids } }).select('name email').lean();
        users.forEach(u => userMap.set(String(u._id), u));
      } catch (e) { /* ignore */ }
    }

    // Normalize each transaction to return only required fields (and friendly user/group info)
    const normalized = items.map(tx => {
      const gid = tx.groupId || tx.group;
      const groupObj = (tx.group && typeof tx.group === 'object') ? tx.group : (gid && groupMap.has(String(gid)) ? groupMap.get(String(gid)) : null);
      // creator
      let creator = null;
      if (tx.createdBy && typeof tx.createdBy === 'object') {
        const cid = tx.createdBy._id || tx.createdBy.id;
        const name = tx.createdBy.name || tx.createdBy.email;
        if (name) creator = { id: cid, name: name, email: tx.createdBy.email || '' };
        else if (cid && userMap.has(String(cid))) { const u = userMap.get(String(cid)); creator = { id: u._id, name: u.name || u.email, email: u.email || '' }; }
        else creator = { id: cid || null, name: '', email: '' };
      } else if (tx.createdBy && userMap.has(String(tx.createdBy))) {
        const u = userMap.get(String(tx.createdBy));
        creator = { id: u._id, name: u.name || u.email, email: u.email || '' };
      }
      // payer
      let payer = null;
      if (tx.payer && typeof tx.payer === 'object') {
        const pid = tx.payer._id || tx.payer.id;
        const pname = tx.payer.name || tx.payer.email;
        if (pname) payer = { id: pid, name: pname, email: tx.payer.email || '' };
        else if (pid && userMap.has(String(pid))) { const u = userMap.get(String(pid)); payer = { id: u._id, name: u.name || u.email, email: u.email || '' }; }
        else payer = { id: pid || null, name: '', email: '' };
      } else if (tx.payer && userMap.has(String(tx.payer))) {
        const u = userMap.get(String(tx.payer));
        payer = { id: u._id, name: u.name || u.email, email: u.email || '' };
      }

      // participants
      const parts = Array.isArray(tx.participants) ? tx.participants.map(p => {
        let userObj = null;
        if (p.user && typeof p.user === 'object') {
          const uid = p.user._id || p.user.id;
          const uname = p.user.name || p.user.email;
          if (uname) userObj = { id: uid, name: uname, email: p.user.email || '' };
          else if (uid && userMap.has(String(uid))) { const u = userMap.get(String(uid)); userObj = { id: u._id, name: u.name || u.email, email: u.email || '' }; }
          else userObj = { id: uid || null, name: p.email || '', email: p.email || '' };
        } else if (p.user && userMap.has(String(p.user))) {
          const u = userMap.get(String(p.user));
          userObj = { id: u._id, name: u.name || u.email, email: u.email || '' };
        } else if (p.email) userObj = { id: null, name: p.email, email: p.email };
        return {
          id: userObj ? userObj.id : null,
          name: userObj ? userObj.name : (p.name || p.email || ''),
          email: userObj ? userObj.email : (p.email || ''),
          shareAmount: typeof p.shareAmount !== 'undefined' ? Number(p.shareAmount || 0) : undefined,
          settled: !!p.settled,
          percentage: typeof p.percentage !== 'undefined' ? Number(p.percentage) : undefined
        };
      }) : [];

      // participants metadata: count and names
      const participantsCount = parts.length;
      const participantsNames = parts.map(p => p.name || p.email || (p.id ? String(p.id) : 'Unknown'));

      // Build allParticipants including creator if not present
      const allParticipants = [];
      // include creator first when available
      if (creator && (creator.name || creator.email || creator.id)) {
        // check if creator already in parts by id/email
        const present = parts.some(p => (creator.id && p.id && String(p.id) === String(creator.id)) || (creator.email && p.email && String(p.email).toLowerCase() === String(creator.email).toLowerCase()));
        if (!present) {
          allParticipants.push({ id: creator.id || null, name: creator.name || creator.email || '', email: creator.email || '' , isCreator: true });
        } else {
          // if present, mark that participant as creator in allParticipants
          parts.forEach(p => {
            if ((creator.id && p.id && String(p.id) === String(creator.id)) || (creator.email && p.email && String(p.email).toLowerCase() === String(creator.email).toLowerCase())) {
              allParticipants.push({ ...p, isCreator: true });
            } else {
              allParticipants.push(p);
            }
          });
        }
      } else {
        // no creator (or already processed), just copy parts
        parts.forEach(p => allParticipants.push(p));
      }
      // if we added creator separately above, also append other parts
      if (allParticipants.length > 0 && parts.length > 0 && !(allParticipants.length === parts.length && allParticipants.every((a,i)=>a.id===parts[i].id))) {
        // ensure parts that are not already included are appended
        const ids = new Set(allParticipants.map(a => String(a.id || a.email || '')));
        parts.forEach(p => {
          const key = String(p.id || p.email || '');
          if (!ids.has(key)) allParticipants.push(p);
        });
      }

      return {
        id: tx._id || tx.id,
        title: tx.title || tx.description || '',
        group: groupObj ? { id: groupObj._id || groupObj.id, name: groupObj.name || 'Unknown Group' } : (gid ? { id: gid, name: `Group ${String(gid).slice(0,8)}...` } : null),
        transactionType: tx.transactionType || tx.type || 'unknown',
        amount: Number(tx.amount || 0),
        creator: creator || { id: null, name: '', email: '' },
        payer: payer || null,
        participants: parts,
        participantsCount,
        participantsNames,
        allParticipants,
        date: tx.date || tx.createdAt || null,
        raw: tx // include raw if caller needs extra fields
      };
    });

    return res.json({
      total: totalCount,
      page: pg,
      limit: lim,
      pages: Math.max(1, Math.ceil(totalCount / lim)),
      data: normalized
    });
  } catch (err) {
    console.error('Admin group-transactions error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
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

// GET /api/admin/families - Admin endpoint to get all families with detailed information
router.get('/families', auth, async (req, res) => {
  try {
    // Verify admin role
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    // Fetch all families with populated information
    const families = await Family.find({})
      .populate('owner', 'name email')
      .populate('members.user', 'name email')
      .sort({ createdAt: -1 });

    // Transform and enhance the data for admin view
    const enhancedFamilies = families.map(family => {
      // Convert to plain object to avoid mongoose document immutability
      const f = family.toObject();
      
      // Add calculated fields for admin display
      return {
        ...f,
        memberCount: f.members ? f.members.length : 0,
        activeMembers: f.members ? f.members.filter(m => !m.invited).length : 0,
        pendingMembers: f.members ? f.members.filter(m => m.invited).length : 0,
        ownerName: f.owner ? (f.owner.name || f.owner.email) : 'Unknown',
        ownerEmail: f.owner ? f.owner.email : ''
      };
    });

    res.json(enhancedFamilies);
  } catch (err) {
    console.error('Admin families fetch error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET /api/admin/families/:familyId - Admin endpoint to get family by ID
router.get('/families/:familyId', auth, async (req, res) => {
  try {
    // Verify admin role
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { familyId } = req.params;
    if (!familyId) {
      return res.status(400).json({ message: 'Family ID required' });
    }

    // Fetch family with populated information
    const family = await Family.findById(familyId)
      .populate('owner', 'name email')
      .populate('members.user', 'name email');

    if (!family) {
      return res.status(404).json({ message: 'Family not found' });
    }

    // Transform and enhance the data for admin view
    const f = family.toObject();
    
    // Add calculated fields for admin display
    const enhancedFamily = {
      ...f,
      memberCount: f.members ? f.members.length : 0,
      activeMembers: f.members ? f.members.filter(m => !m.invited).length : 0,
      pendingMembers: f.members ? f.members.filter(m => m.invited).length : 0,
      ownerName: f.owner ? (f.owner.name || f.owner.email) : 'Unknown',
      ownerEmail: f.owner ? f.owner.email : ''
    };

    res.json(enhancedFamily);
  } catch (err) {
    console.error('Admin family fetch error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET /api/admin/family-transactions - Admin endpoint to get all family transactions
router.get('/family-transactions', auth, async (req, res) => {
  try {
    // Verify admin role
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const {
      page = 1,
      limit = 50,
      familyId,
      type,
      category,
      startDate,
      endDate,
      sort = '-date'
    } = req.query;

    const pg = Math.max(1, parseInt(page, 10) || 1);
    const lim = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

    const filter = {};
    if (familyId) filter.familyId = familyId;
    if (type) filter.type = type;
    if (category) filter.category = category;
    
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

    const totalCount = await FamilyTransaction.countDocuments(filter);

    const transactions = await FamilyTransaction.find(filter)
      .populate('familyId', 'name')
      .populate('category', 'name icon type')
      .populate('createdBy', 'name email')
      .sort(sort)
      .skip((pg - 1) * lim)
      .limit(lim);

    // Thêm thông tin vai trò và tên cho từng giao dịch
    const transactionsWithRoles = transactions.map(tx => {
      const txObj = tx.toObject();
      
      // Lấy thông tin người tạo
      const creatorId = txObj.createdBy?._id || txObj.createdBy;
      const creatorEmail = txObj.createdBy?.email;
      const creatorName = txObj.createdBy?.name || '';
      
      // Tìm vai trò của người tạo trong gia đình
      let creatorRole = '';
      if (txObj.familyId?.members) {
        const member = txObj.familyId.members.find(m => {
          if (m.user && creatorId && String(m.user) === String(creatorId)) {
            return true;
          }
          if (m.email && creatorEmail && m.email.toLowerCase() === creatorEmail.toLowerCase()) {
            return true;
          }
          return false;
        });
        
        if (member) {
          creatorRole = member.familyRole || '';
        }
      }
      
      // Thêm thông tin vào transaction object
      txObj.creatorName = creatorName;
      txObj.creatorRole = creatorRole;
      
      return txObj;
    });

    res.json({
      total: totalCount,
      page: pg,
      limit: lim,
      pages: Math.max(1, Math.ceil(totalCount / lim)),
      data: transactionsWithRoles
    });
  } catch (err) {
    console.error('Admin family-transactions error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET /api/admin/families/:familyId/transfer-activities - Admin endpoint to get family fund deposit/withdrawal activities
router.get('/families/:familyId/transfer-activities', auth, async (req, res) => {
  try {
    // Verify admin role
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { familyId } = req.params;
    if (!familyId) {
      return res.status(400).json({ message: 'Family ID required' });
    }

    const {
      page = 1,
      limit = 50,
      startDate,
      endDate,
      sort = '-date'
    } = req.query;

    const pg = Math.max(1, parseInt(page, 10) || 1);
    const lim = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

    // Filter for transfer activities only (tags contains 'transfer')
    const filter = {
      familyId: familyId,
      tags: { $in: ['transfer'] } // Match documents where tags array contains 'transfer'
    };
    
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

    const totalCount = await FamilyTransaction.countDocuments(filter);

    const transactions = await FamilyTransaction.find(filter)
      .populate('familyId', 'name')
      .populate('createdBy', 'name email')
      .sort(sort)
      .skip((pg - 1) * lim)
      .limit(lim);

    // Thêm thông tin vai trò và tên cho từng giao dịch
    const transactionsWithRoles = transactions.map(tx => {
      const txObj = tx.toObject();
      
      // Lấy thông tin người tạo
      const creatorId = txObj.createdBy?._id || txObj.createdBy;
      const creatorEmail = txObj.createdBy?.email;
      const creatorName = txObj.createdBy?.name || '';
      
      // Tìm vai trò của người tạo trong gia đình
      let creatorRole = '';
      if (txObj.familyId?.members) {
        const member = txObj.familyId.members.find(m => {
          if (m.user && creatorId && String(m.user) === String(creatorId)) {
            return true;
          }
          if (m.email && creatorEmail && m.email.toLowerCase() === creatorEmail.toLowerCase()) {
            return true;
          }
          return false;
        });
        
        if (member) {
          creatorRole = member.familyRole || '';
        }
      }
      
      // Xác định loại hoạt động (nạp hay rút)
      const isDeposit = txObj.tags && txObj.tags.includes('to-family');
      const isWithdrawal = txObj.tags && txObj.tags.includes('from-family');
      const activityType = isDeposit ? 'deposit' : (isWithdrawal ? 'withdrawal' : 'transfer');
      
      // Thêm thông tin vào transaction object
      txObj.creatorName = creatorName;
      txObj.creatorRole = creatorRole;
      txObj.activityType = activityType;
      
      return txObj;
    });

    res.json({
      total: totalCount,
      page: pg,
      limit: lim,
      pages: Math.max(1, Math.ceil(totalCount / lim)),
      data: transactionsWithRoles
    });
  } catch (err) {
    console.error('Admin family transfer activities error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
