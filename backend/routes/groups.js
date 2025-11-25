const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Group = require('../models/Group');
const GroupTransaction = require('../models/GroupTransaction');
const GroupPost = require('../models/GroupPost');
const Notification = require('../models/Notification');
const { auth } = require('../middleware/auth');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Helper function to populate category for linkedTransaction
async function populateLinkedTransactionCategory(post) {
  if (!post.linkedTransaction || !post.linkedTransaction.category) {
    return post;
  }

  const Category = mongoose.model('Category');
  const category = post.linkedTransaction.category;

  // If category is a string (ObjectId), populate it
  if (typeof category === 'string' && mongoose.Types.ObjectId.isValid(category)) {
    try {
      const categoryDoc = await Category.findById(category).select('name icon').lean();
      if (categoryDoc) {
        post.linkedTransaction.category = categoryDoc;
      } else {
        post.linkedTransaction.category = null;
      }
    } catch (err) {
      console.error('Error populating category:', err);
      post.linkedTransaction.category = null;
    }
  }
  // If category is an object but doesn't have name, it might be an ObjectId object
  else if (typeof category === 'object' && category._id && !category.name) {
    try {
      const categoryDoc = await Category.findById(category._id).select('name icon').lean();
      if (categoryDoc) {
        post.linkedTransaction.category = categoryDoc;
      } else {
        post.linkedTransaction.category = null;
      }
    } catch (err) {
      console.error('Error populating category:', err);
      post.linkedTransaction.category = null;
    }
  }
  // If category is already an object with name, keep it as is
  // If category is not a valid format, set to null
  else if (typeof category !== 'object' || !category.name) {
    post.linkedTransaction.category = null;
  }

  return post;
}

// Helper: kiểm tra user có thuộc nhóm (owner hoặc member) hay không
async function ensureGroupMember(groupId, userId) {
  const group = await Group.findById(groupId).select('_id owner members');
  if (!group) return { ok: false, status: 404, message: 'Group not found' };
  const isOwner = String(group.owner) === String(userId);
  const isMember =
    isOwner ||
    group.members.some(
      (m) =>
        (m.user && String(m.user) === String(userId)) ||
        (m.email &&
          String(m.email).toLowerCase().trim() ===
            String((userId.email || '')).toLowerCase().trim())
    );
  if (!isMember) {
    return { ok: false, status: 403, message: 'Bạn không thuộc nhóm này' };
  }
  return { ok: true, group };
}

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

    // Chỉ lấy danh sách email để gửi lời mời sau
    const inviteEmails = members.map(m => (m.email || '').toLowerCase().trim()).filter(Boolean);

    const creatorEmailForMember = creator.email || '';

    const groupData = {
      name,
      description,
      owner: creator._id,
      // Chỉ thêm owner vào members, các members khác sẽ được thêm sau khi chấp nhận lời mời
      members: [
        { user: creator._id, email: creatorEmailForMember, role: 'owner', invited: false, joinedAt: new Date() }
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
    
    // Gửi lời mời cho các thành viên (không thêm vào group.members ngay)
    // Lưu lời mời vào Group model để không bị mất khi reload
    if (!group.pendingInvites) {
      group.pendingInvites = [];
    }
    
    for (const email of inviteEmails) {
      const user = await User.findOne({ email });
      if (user) {
        try {
          const notification = await Notification.create({
            recipient: user._id,
            sender: creator._id,
            type: 'group.invite',
            message: `Bạn được mời tham gia nhóm "${name}"`,
            data: { 
              groupId: group._id,
              groupName: name,
              inviterName: creator.name || creator.email,
              email: email
            }
          });
          
          // Lưu lời mời vào Group model
          group.pendingInvites.push({
            email: email,
            userId: user._id,
            invitedBy: creator._id,
            status: 'pending',
            invitedAt: new Date(),
            notificationId: notification._id
          });
        } catch (notifErr) {
          console.warn('Failed to create notification for member', email, notifErr.message);
        }
      }
    }
    
    // Lưu group với pendingInvites
    await group.save();

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

    // Ensure user is a member of the group (owner or member can invite)
    const { ok, status, message, group } = await ensureGroupMember(groupId, req.user._id);
    if (!ok) return res.status(status).json({ message });

    const emailNormalized = email.toLowerCase().trim();
    if (group.members.some(m => m.email === emailNormalized)) {
      return res.status(400).json({ message: 'Member already invited/exists' });
    }

    const user = await User.findOne({ email: emailNormalized });
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng với email này' });
    }

    // Không thêm vào group.members ngay, chỉ gửi thông báo mời
    // Tạo notification với type 'group.invite' để người nhận có thể chấp nhận/từ chối
    let notification = null;
    try {
      notification = await Notification.create({
        recipient: user._id,
        sender: inviterId || req.user._id,
        type: 'group.invite',
        message: `Bạn được mời tham gia nhóm "${group.name}"`,
        data: { 
          groupId: group._id,
          groupName: group.name,
          inviterName: req.user.name || req.user.email,
          email: emailNormalized
        }
      });
    } catch (notifErr) {
      console.warn('Failed to notify invited user:', notifErr.message);
      return res.status(500).json({ message: 'Không thể gửi lời mời' });
    }

    // Lưu lời mời vào Group model để không bị mất khi reload
    if (!group.pendingInvites) {
      group.pendingInvites = [];
    }
    
    // Kiểm tra xem đã có lời mời cho email này chưa
    const existingInviteIndex = group.pendingInvites.findIndex(
      inv => inv.email === emailNormalized && inv.status === 'pending'
    );
    
    if (existingInviteIndex === -1) {
      // Thêm lời mời mới
      group.pendingInvites.push({
        email: emailNormalized,
        userId: user._id,
        invitedBy: inviterId || req.user._id,
        status: 'pending',
        invitedAt: new Date(),
        notificationId: notification._id
      });
      await group.save();
    }

    res.status(200).json({ message: 'Đã gửi lời mời', email: emailNormalized });
  } catch (err) {
    console.error('Groups invite error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/groups/:groupId/respond-invite
// body: { accept: boolean, notificationId }
// User phản hồi lời mời từ notification
router.post('/:groupId/respond-invite', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { accept, notificationId } = req.body;

    if (typeof accept !== 'boolean') {
      return res.status(400).json({ message: 'accept(boolean) is required' });
    }

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    const user = req.user;
    const email = (user.email || '').toLowerCase().trim();

    // Kiểm tra xem user đã là thành viên chưa
    const existingMember = group.members.find(m =>
      (m.user && m.user.toString() === user._id.toString()) || 
      (m.email && m.email.toLowerCase() === email)
    );

    if (existingMember && !existingMember.invited) {
      return res.status(400).json({ message: 'Bạn đã là thành viên của nhóm này' });
    }

    if (accept) {
      // Chấp nhận lời mời - thêm vào nhóm
      const newMember = {
        user: user._id,
        email: email,
        role: 'member',
        invited: false,
        joinedAt: new Date()
      };

      if (existingMember) {
        // Cập nhật thành viên hiện có
        Object.assign(existingMember, newMember);
      } else {
        // Thêm thành viên mới
        group.members.push(newMember);
      }
      
      // Cập nhật trạng thái lời mời trong Group model
      if (group.pendingInvites && Array.isArray(group.pendingInvites)) {
        const inviteIndex = group.pendingInvites.findIndex(
          inv => (inv.email === email || (inv.userId && String(inv.userId) === String(user._id))) && inv.status === 'pending'
        );
        if (inviteIndex !== -1) {
          group.pendingInvites[inviteIndex].status = 'accepted';
          group.pendingInvites[inviteIndex].respondedAt = new Date();
        }
      }
      
      await group.save();

      // Thông báo cho owner
      const ownerId = group.owner || group.createdBy;
      if (ownerId) {
        try {
          await Notification.create({
            recipient: ownerId,
            sender: user._id,
            type: 'group.invite.accepted',
            message: `${user.name || user.email} đã chấp nhận lời mời vào nhóm "${group.name}"`,
            data: { 
              groupId: group._id, 
              userId: user._id, 
              email: user.email,
              groupName: group.name 
            }
          });
        } catch (notifErr) {
          console.warn('Failed to notify owner about acceptance:', notifErr.message);
        }
      }

      // Đánh dấu notification là đã đọc
      if (notificationId) {
        try {
          await Notification.findByIdAndUpdate(notificationId, { read: true });
        } catch (e) {
          console.warn('Failed to mark notification as read:', e);
        }
      }

      return res.json({ message: 'Đã tham gia nhóm', member: newMember });
    } else {
      // Từ chối lời mời - không thêm vào nhóm
      
      // Cập nhật trạng thái lời mời trong Group model
      if (group.pendingInvites && Array.isArray(group.pendingInvites)) {
        const inviteIndex = group.pendingInvites.findIndex(
          inv => (inv.email === email || (inv.userId && String(inv.userId) === String(user._id))) && inv.status === 'pending'
        );
        if (inviteIndex !== -1) {
          group.pendingInvites[inviteIndex].status = 'rejected';
          group.pendingInvites[inviteIndex].respondedAt = new Date();
        }
      }
      await group.save();
      
      const ownerId = group.owner || group.createdBy;
      if (ownerId) {
        try {
          await Notification.create({
            recipient: ownerId,
            sender: user._id,
            type: 'group.invite.rejected',
            message: `${user.name || user.email} đã từ chối lời mời vào nhóm "${group.name}"`,
            data: { 
              groupId: group._id, 
              userId: user._id, 
              email: user.email,
              groupName: group.name 
            }
          });
        } catch (notifErr) {
          console.warn('Failed to notify owner about rejection:', notifErr.message);
        }
      }

      // Đánh dấu notification là đã đọc
      if (notificationId) {
        try {
          await Notification.findByIdAndUpdate(notificationId, { read: true });
        } catch (e) {
          console.warn('Failed to mark notification as read:', e);
        }
      }

      return res.json({ message: 'Đã từ chối lời mời' });
    }
  } catch (err) {
    console.error('Groups respond-invite error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/groups/:groupId/respond
// body: { userId, accept: boolean }
// (Giữ lại endpoint cũ để tương thích ngược)
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
    
    // Xóa tất cả lời mời liên quan đến thành viên này trong pendingInvites
    if (group.pendingInvites && Array.isArray(group.pendingInvites)) {
      group.pendingInvites = group.pendingInvites.filter(invite => {
        // Xóa lời mời nếu email hoặc userId trùng với thành viên bị xóa
        const inviteEmail = (invite.email || '').toLowerCase().trim();
        const inviteUserId = invite.userId ? String(invite.userId._id || invite.userId) : null;
        
        // Kiểm tra match bằng email
        if (targetEmail && inviteEmail && inviteEmail === targetEmail) {
          return false; // Xóa lời mời này
        }
        
        // Kiểm tra match bằng userId
        if (targetId && inviteUserId && String(inviteUserId) === String(targetId)) {
          return false; // Xóa lời mời này
        }
        
        // Giữ lại lời mời này
        return true;
      });
    }
    
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

    // Xóa tất cả notification liên quan đến lời mời của thành viên này
    try {
      if (targetId) {
        const targetObjectId = mongoose.Types.ObjectId.isValid(targetId) ? new mongoose.Types.ObjectId(targetId) : targetId;
        const groupObjectId = mongoose.Types.ObjectId.isValid(groupId) ? new mongoose.Types.ObjectId(groupId) : groupId;
        
        // Xóa notification group.invite mà recipient là thành viên bị xóa và groupId trùng
        const inviteNotifResult = await Notification.deleteMany({
          type: 'group.invite',
          recipient: targetObjectId,
          $or: [
            { 'data.groupId': String(groupId) },
            { 'data.groupId': groupObjectId }
          ]
        });
        
        // Xóa notification group.invite.accepted/rejected mà sender là thành viên bị xóa và groupId trùng
        const responseNotifResult = await Notification.deleteMany({
          type: { $in: ['group.invite.accepted', 'group.invite.rejected'] },
          sender: targetObjectId,
          $or: [
            { 'data.groupId': String(groupId) },
            { 'data.groupId': groupObjectId }
          ]
        });
        
        console.log(`Deleted ${inviteNotifResult.deletedCount + responseNotifResult.deletedCount} notifications for removed member`);
      }
    } catch (notifErr) {
      console.error('Error deleting notifications for removed member:', notifErr);
      // Continue even if notification deletion fails
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
      .populate('members.user', 'name email')
      .populate('pendingInvites.userId', 'name email')
      .populate('pendingInvites.invitedBy', 'name email');
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
        charts: allowedData?.charts ?? true,
        debts: allowedData?.debts ?? false,
        posts: allowedData?.posts ?? false
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

    // Parse color if it was stored as JSON string so frontend luôn nhận đúng cấu trúc { colors, direction }
    let publicColor = group.color;
    if (publicColor && typeof publicColor === 'string') {
      try {
        publicColor = JSON.parse(publicColor);
      } catch (e) {
        // nếu không parse được thì giữ nguyên string
      }
    }

    const payload = {
      groupInfo: {
        name: group.name,
        description: group.description,
        color: publicColor,
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
      // Chia sẻ nhiều hơn nhưng vẫn giới hạn để tránh load quá nặng: 50 giao dịch gần nhất
      payload.transactions = txs.slice(0, 50).map(tx => ({
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

    // Debts (công nợ chi tiết)
    if (allowed.debts && txs.length > 0) {
      const debtsMap = new Map(); // key: "payerId->participantId", value: { amount, txCount, details[] }
      
      txs.forEach(tx => {
        const payerId = tx.payer && (tx.payer._id || tx.payer);
        const payerName = tx.payer && typeof tx.payer === 'object'
          ? (tx.payer.name || tx.payer.email || 'Người trả')
          : 'Người trả';
        
        if (!tx.participants || !Array.isArray(tx.participants)) return;
        
        tx.participants.forEach(p => {
          if (p.settled) return; // chỉ tính các khoản chưa thanh toán
          
          const participantId = p.user && (p.user._id || p.user);
          const participantName = p.user && typeof p.user === 'object'
            ? (p.user.name || p.user.email || 'Thành viên')
            : (p.email || 'Thành viên');
          
          if (!payerId || !participantId) return;
          if (String(payerId) === String(participantId)) return; // không tính nợ chính mình
          
          const key = `${payerId}->${participantId}`;
          if (!debtsMap.has(key)) {
            debtsMap.set(key, {
              payerId,
              payerName,
              participantId,
              participantName,
              totalAmount: 0,
              txCount: 0,
              details: []
            });
          }
          
          const debt = debtsMap.get(key);
          debt.totalAmount += Number(p.shareAmount) || 0;
          debt.txCount += 1;
          debt.details.push({
            txId: tx._id,
            txTitle: tx.title,
            amount: p.shareAmount,
            date: tx.date || tx.createdAt
          });
        });
      });
      
      payload.debts = Array.from(debtsMap.values())
        .filter(d => d.totalAmount > 0)
        .sort((a, b) => b.totalAmount - a.totalAmount)
        .slice(0, 50); // giới hạn 50 mối quan hệ nợ
    }

    // Posts (bài viết nhóm)
    if (allowed.posts) {
      const posts = await GroupPost.find({ group: group._id })
        .populate('author', 'name')
        .select('content images likes comments createdAt')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
      
      payload.posts = posts.map(post => ({
        _id: post._id,
        content: post.content,
        images: post.images || [],
        authorName: post.author?.name || 'Thành viên',
        likesCount: post.likes?.length || 0,
        commentsCount: post.comments?.length || 0,
        // Lấy 3 comment gần nhất để hiển thị preview
        recentComments: (post.comments || [])
          .slice(-3)
          .map(c => ({
            authorName: c.author?.name || 'Thành viên',
            content: c.content,
            createdAt: c.createdAt
          })),
        createdAt: post.createdAt
      }));
    }

    res.json(payload);
  } catch (e) {
    console.error('public group error', e);
    res.status(500).json({ message: 'Server error', error: e.message });
  }
});

// ===== Group Posts (Hoạt động nhóm) =====

// Cấu hình multer cho upload hình ảnh bài viết nhóm
const postImageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../uploads/group-posts');
    // Tạo thư mục nếu chưa tồn tại
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Tạo tên file unique với timestamp và random string
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `post-${uniqueSuffix}${ext}`);
  }
});

// File filter cho hình ảnh
const postImageFileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Chỉ cho phép upload file hình ảnh (JPEG, PNG, GIF, WebP)'), false);
  }
};

const uploadPostImage = multer({
  storage: postImageStorage,
  fileFilter: postImageFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// POST /api/groups/:groupId/posts/upload-image - upload image for post
router.post('/:groupId/posts/upload-image', auth, uploadPostImage.single('image'), async (req, res) => {
  try {
    const { groupId } = req.params;
    const { ok, status, message } = await ensureGroupMember(groupId, req.user._id);
    if (!ok) return res.status(status).json({ message });

    if (!req.file) {
      return res.status(400).json({ message: 'Vui lòng chọn file hình ảnh để upload' });
    }

    // Trả về URL của ảnh đã upload
    const imageUrl = `/uploads/group-posts/${req.file.filename}`;
    res.json({ imageUrl });
  } catch (err) {
    console.error('Groups upload image error:', err);
    // Xóa file đã upload nếu có lỗi
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting uploaded file:', unlinkError);
      }
    }
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET /api/groups/:groupId/posts - list posts for a group (latest first)
router.get('/:groupId/posts', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { ok, status, message } = await ensureGroupMember(groupId, req.user._id);
    if (!ok) return res.status(status).json({ message });

    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const skip = parseInt(req.query.skip, 10) || 0;

    const posts = await GroupPost.find({ group: groupId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('author', 'name email')
      .populate('comments.user', 'name email')
      .populate('likes.user', 'name email')
      .populate({
        path: 'linkedTransaction',
        select: 'title description amount date category transactionType tags'
      })
      .lean();

    // Populate category manually for linkedTransaction because category is Mixed type
    for (const post of posts) {
      await populateLinkedTransactionCategory(post);
    }

    res.json(posts);
  } catch (err) {
    console.error('Groups posts list error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/groups/:groupId/posts - create a new post
router.post('/:groupId/posts', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { ok, status, message, group } = await ensureGroupMember(
      groupId,
      req.user._id
    );
    if (!ok) return res.status(status).json({ message });

    const { content = '', images = [], linkedTransaction } = req.body || {};
    if (!content && (!images || !images.length) && !linkedTransaction) {
      return res
        .status(400)
        .json({ message: 'Nội dung, hình ảnh hoặc giao dịch liên kết là bắt buộc' });
    }

    // Validate linkedTransaction if provided
    if (linkedTransaction) {
      const transaction = await GroupTransaction.findOne({
        _id: linkedTransaction,
        groupId: group._id
      });
      
      if (!transaction) {
        return res.status(400).json({ message: 'Giao dịch không tồn tại hoặc không thuộc nhóm này' });
      }
      
      // Kiểm tra xem giao dịch này đã được liên kết với bài viết khác chưa
      const existingPost = await GroupPost.findOne({
        group: group._id,
        linkedTransaction: linkedTransaction
      });
      if (existingPost) {
        return res.status(400).json({ message: 'Giao dịch này đã được liên kết với một bài viết khác' });
      }
    }

    const post = await GroupPost.create({
      group: group._id,
      author: req.user._id,
      content: content.trim(),
      images: Array.isArray(images)
        ? images.filter((u) => typeof u === 'string' && u.trim())
        : [],
      linkedTransaction: linkedTransaction || null,
    });

    const populated = await GroupPost.findById(post._id)
      .populate('author', 'name email')
      .populate('comments.user', 'name email')
      .populate('likes.user', 'name email')
      .populate({
        path: 'linkedTransaction',
        select: 'title description amount date category transactionType',
        populate: {
          path: 'category',
          select: 'name icon'
        }
      })
      .lean();

    res.status(201).json(populated);
  } catch (err) {
    console.error('Groups create post error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/groups/:groupId/posts/:postId/like - toggle like
router.post('/:groupId/posts/:postId/like', auth, async (req, res) => {
  try {
    const { groupId, postId } = req.params;
    const { ok, status, message } = await ensureGroupMember(groupId, req.user._id);
    if (!ok) return res.status(status).json({ message });

    const post = await GroupPost.findOne({ _id: postId, group: groupId });
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const existingIndex = post.likes.findIndex(
      (l) => String(l.user) === String(req.user._id)
    );
    if (existingIndex !== -1) {
      post.likes.splice(existingIndex, 1);
    } else {
      post.likes.push({ user: req.user._id });
    }
    await post.save();

    const populated = await GroupPost.findById(post._id)
      .populate('author', 'name email')
      .populate('comments.user', 'name email')
      .populate('likes.user', 'name email')
      .populate({
        path: 'linkedTransaction',
        select: 'title description amount date category transactionType tags'
      })
      .lean();

    // Populate category manually
    await populateLinkedTransactionCategory(populated);

    res.json(populated);
  } catch (err) {
    console.error('Groups like post error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/groups/:groupId/posts/:postId/comments - add comment
router.post('/:groupId/posts/:postId/comments', auth, async (req, res) => {
  try {
    const { groupId, postId } = req.params;
    const { content } = req.body || {};
    const { ok, status, message } = await ensureGroupMember(groupId, req.user._id);
    if (!ok) return res.status(status).json({ message });

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Nội dung bình luận không được để trống' });
    }

    const post = await GroupPost.findOne({ _id: postId, group: groupId });
    if (!post) return res.status(404).json({ message: 'Post not found' });

    post.comments.push({
      user: req.user._id,
      content: content.trim(),
    });

    await post.save();

    const populated = await GroupPost.findById(post._id)
      .populate('author', 'name email')
      .populate('comments.user', 'name email')
      .populate('likes.user', 'name email')
      .populate({
        path: 'linkedTransaction',
        select: 'title description amount date category transactionType tags'
      })
      .lean();

    // Populate category manually
    await populateLinkedTransactionCategory(populated);

    res.status(201).json(populated);
  } catch (err) {
    console.error('Groups comment on post error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/groups/:groupId/posts/:postId - update post (only author)
router.put('/:groupId/posts/:postId', auth, async (req, res) => {
  try {
    const { groupId, postId } = req.params;
    const { content, images, linkedTransaction } = req.body || {};
    const { ok, status, message, group } = await ensureGroupMember(groupId, req.user._id);
    if (!ok) return res.status(status).json({ message });

    const post = await GroupPost.findOne({ _id: postId, group: groupId });
    if (!post) return res.status(404).json({ message: 'Post not found' });

    // Only author can update
    if (String(post.author) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Chỉ người tạo bài viết mới được sửa' });
    }

    // Validate linkedTransaction if provided
    if (linkedTransaction !== undefined) {
      if (linkedTransaction) {
        const transaction = await GroupTransaction.findOne({
          _id: linkedTransaction,
          groupId: group._id
        });
        
        if (!transaction) {
          return res.status(400).json({ message: 'Giao dịch không tồn tại hoặc không thuộc nhóm này' });
        }
        
        // Kiểm tra xem giao dịch này đã được liên kết với bài viết khác chưa (trừ bài viết hiện tại)
        const existingPost = await GroupPost.findOne({
          group: group._id,
          linkedTransaction: linkedTransaction,
          _id: { $ne: postId } // Loại trừ bài viết hiện tại
        });
        if (existingPost) {
          return res.status(400).json({ message: 'Giao dịch này đã được liên kết với một bài viết khác' });
        }
        
        post.linkedTransaction = linkedTransaction;
      } else {
        post.linkedTransaction = null;
      }
    }

    if (content !== undefined) post.content = content.trim();
    if (images !== undefined) {
      post.images = Array.isArray(images)
        ? images.filter((u) => typeof u === 'string' && u.trim())
        : [];
    }

    post.updatedAt = new Date();
    await post.save();

    const populated = await GroupPost.findById(post._id)
      .populate('author', 'name email')
      .populate('comments.user', 'name email')
      .populate('likes.user', 'name email')
      .populate({
        path: 'linkedTransaction',
        select: 'title description amount date category transactionType tags'
      })
      .lean();

    // Populate category manually
    await populateLinkedTransactionCategory(populated);

    res.json(populated);
  } catch (err) {
    console.error('Groups update post error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/groups/:groupId/posts/:postId - delete post (only author)
router.delete('/:groupId/posts/:postId', auth, async (req, res) => {
  try {
    const { groupId, postId } = req.params;
    const { ok, status, message } = await ensureGroupMember(groupId, req.user._id);
    if (!ok) return res.status(status).json({ message });

    const post = await GroupPost.findOne({ _id: postId, group: groupId });
    if (!post) return res.status(404).json({ message: 'Post not found' });

    // Only author can delete
    if (String(post.author) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Chỉ người tạo bài viết mới được xóa' });
    }

    await post.deleteOne();

    res.json({ message: 'Đã xóa bài viết' });
  } catch (err) {
    console.error('Groups delete post error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/groups/:groupId/posts/:postId/comments/:commentId - update comment (only comment author)
router.put('/:groupId/posts/:postId/comments/:commentId', auth, async (req, res) => {
  try {
    const { groupId, postId, commentId } = req.params;
    const { content } = req.body || {};
    const { ok, status, message } = await ensureGroupMember(groupId, req.user._id);
    if (!ok) return res.status(status).json({ message });

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Nội dung bình luận không được để trống' });
    }

    const post = await GroupPost.findOne({ _id: postId, group: groupId });
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    // Only comment author can update
    if (String(comment.user) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Chỉ người tạo bình luận mới được sửa' });
    }

    comment.content = content.trim();
    await post.save();

    const populated = await GroupPost.findById(post._id)
      .populate('author', 'name email')
      .populate('comments.user', 'name email')
      .populate('likes.user', 'name email')
      .populate({
        path: 'linkedTransaction',
        select: 'title description amount date category transactionType tags'
      })
      .lean();

    // Populate category manually
    await populateLinkedTransactionCategory(populated);

    res.json(populated);
  } catch (err) {
    console.error('Groups update comment error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/groups/:groupId/posts/:postId/comments/:commentId - delete comment (only comment author)
router.delete('/:groupId/posts/:postId/comments/:commentId', auth, async (req, res) => {
  try {
    const { groupId, postId, commentId } = req.params;
    const { ok, status, message } = await ensureGroupMember(groupId, req.user._id);
    if (!ok) return res.status(status).json({ message });

    const post = await GroupPost.findOne({ _id: postId, group: groupId });
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    // Only comment author can delete
    if (String(comment.user) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Chỉ người tạo bình luận mới được xóa' });
    }

    // Remove comment from array
    post.comments.pull(commentId);
    await post.save();

    const populated = await GroupPost.findById(post._id)
      .populate('author', 'name email')
      .populate('comments.user', 'name email')
      .populate('likes.user', 'name email')
      .populate({
        path: 'linkedTransaction',
        select: 'title description amount date category transactionType tags'
      })
      .lean();

    // Populate category manually
    await populateLinkedTransactionCategory(populated);

    res.json(populated);
  } catch (err) {
    console.error('Groups delete comment error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// đảm bảo xuất router
module.exports = router;
