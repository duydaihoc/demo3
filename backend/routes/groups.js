const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Group = require('../models/Group');
const Notification = require('../models/Notification');
const { auth } = require('../middleware/auth');

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
            type: 'group.invite',
            message: `Bạn được mời tham gia nhóm "${name}"`,
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
          type: 'group.invite',
          message: `Bạn được mời tham gia nhóm "${group.name}"`,
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

module.exports = router;
