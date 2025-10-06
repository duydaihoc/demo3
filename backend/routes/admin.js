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

// GET /api/admin/groups/:groupId/transactions - Admin endpoint to get transactions for a group
router.get('/groups/:groupId/transactions', auth, async (req, res) => {
  try {
    // Verify admin role
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { groupId } = req.params;
    if (!groupId) return res.status(400).json({ message: 'Group ID required' });
    
    // Import models if not already imported at top of file
    const GroupTransaction = require('../models/GroupTransaction');
    
    const transactions = await GroupTransaction.find({ group: groupId })
      .populate('createdBy', 'name email')
      .populate('category')
      .sort({ date: -1, createdAt: -1 });
      
    res.json(transactions);
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
