const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Notification = require('../models/Notification');
const FriendRequest = require('../models/FriendRequest');
const GroupTransaction = require('../models/GroupTransaction');
const { auth } = require('../middleware/auth');

// POST /api/friends/invite
router.post('/invite', auth, async (req, res) => {
  try {
    const sender = req.user;
    if (!sender) return res.status(401).json({ message: 'Authentication required' });

    const email = (req.body.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ message: 'email is required' });

    if (sender.email && sender.email.toLowerCase().trim() === email) {
      return res.status(400).json({ message: 'Cannot invite yourself' });
    }

    const existing = await FriendRequest.findOne({
      sender: sender._id,
      recipientEmail: email,
      status: 'pending'
    });
    if (existing) return res.status(400).json({ message: 'Friend request already sent' });

    const recipientUser = await User.findOne({ email });

    const fr = new FriendRequest({
      sender: sender._id,
      recipient: recipientUser ? recipientUser._id : undefined,
      recipientEmail: email
    });
    await fr.save();

    if (recipientUser) {
      try {
        const notif = await Notification.create({
          recipient: recipientUser._id,
          sender: sender._id,
          type: 'friend.request',
          message: `${sender.name || sender.email} đã gửi lời mời kết bạn`,
          data: { friendRequestId: fr._id }
        });
        // emit via socket.io to recipient if connected
        const io = req.app.get('io');
        if (io) io.to(String(recipientUser._id)).emit('notification', notif);
      } catch (notifErr) {
        console.warn('Failed to create friend notification:', notifErr && notifErr.message);
      }
    }

    const out = await FriendRequest.findById(fr._id).populate('sender', 'name email').populate('recipient', 'name email');
    res.status(201).json(out);
  } catch (err) {
    console.error('Friends invite error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET /api/friends/requests - incoming pending requests
router.get('/requests', auth, async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Authentication required' });

    const email = (user.email || '').toLowerCase().trim();
    const requests = await FriendRequest.find({
      status: 'pending',
      $or: [{ recipient: user._id }, { recipientEmail: email }]
    }).populate('sender', 'name email').sort({ createdAt: -1 });

    res.json(requests);
  } catch (err) {
    console.error('Friends requests error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/friends/respond
router.post('/respond', auth, async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Authentication required' });

    const { requestId, accept } = req.body;
    if (!requestId || typeof accept !== 'boolean') {
      return res.status(400).json({ message: 'requestId and accept(boolean) are required' });
    }

    const fr = await FriendRequest.findById(requestId).populate('sender', 'name email');
    if (!fr) return res.status(404).json({ message: 'Friend request not found' });

    const userEmail = (user.email || '').toLowerCase().trim();
    const isRecipient = (fr.recipient && fr.recipient.toString() === user._id.toString()) ||
      (fr.recipientEmail && fr.recipientEmail.toLowerCase() === userEmail);
    if (!isRecipient) {
      return res.status(403).json({ message: 'Not authorized to respond to this request' });
    }

    if (fr.status !== 'pending') return res.status(400).json({ message: 'Request already responded' });

    fr.status = accept ? 'accepted' : 'rejected';
    fr.respondedAt = new Date();

    // If recipient field missing but current user is the recipient by email, set it
    if (!fr.recipient) fr.recipient = user._id;

    await fr.save();

    if (accept) {
      // Add each other to friends list (use $addToSet)
      try {
        await User.findByIdAndUpdate(fr.sender._id, { $addToSet: { friends: user._id } });
        await User.findByIdAndUpdate(user._id, { $addToSet: { friends: fr.sender._id } });
      } catch (uErr) {
        console.warn('Failed to update users friends list:', uErr && uErr.message);
      }
    }

    // Notify sender about response (both accept and reject)
    try {
      const notif = await Notification.create({
        recipient: fr.sender._id,
        sender: user._id,
        type: 'friend.response',
        message: accept
          ? `${user.name || user.email} đã chấp nhận lời mời kết bạn`
          : `${user.name || user.email} đã từ chối lời mời kết bạn`,
        data: { friendRequestId: fr._id, response: fr.status }
      });

      // emit via socket.io if available
      const io = req.app.get('io');
      if (io) {
        io.to(String(fr.sender._id)).emit('notification', notif);
      }
    } catch (notifErr) {
      console.warn('Failed to create friend response notification:', notifErr && notifErr.message);
    }

    const out = await FriendRequest.findById(fr._id).populate('sender', 'name email').populate('recipient', 'name email');
    res.json({ message: accept ? 'Accepted' : 'Rejected', request: out });
  } catch (err) {
    console.error('Friends respond error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// NEW: GET /api/friends/list - trả về danh sách bạn bè của user (populated) với số nợ
router.get('/list', auth, async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Authentication required' });

    // populate friends array on User model
    const me = await User.findById(user._id).populate('friends', 'name email').lean();
    if (!me) return res.status(404).json({ message: 'User not found' });

    const friendsList = Array.isArray(me.friends) ? me.friends.filter(Boolean) : [];
    
    // Tính toán số nợ với từng bạn bè
    const friendsWithDebt = await Promise.all(friendsList.map(async (friend) => {
      const friendId = friend._id || friend.id;
      
      // Tìm tất cả giao dịch nhóm liên quan đến cả 2 người
      const transactions = await GroupTransaction.find({
        $or: [
          // Transactions where current user is creator and friend is participant
          {
            createdBy: user._id,
            'participants.user': friendId
          },
          // Transactions where friend is creator and current user is participant
          {
            createdBy: friendId,
            'participants.user': user._id
          }
        ]
      }).lean();
      
      let iOwe = 0; // Số tiền tôi nợ bạn bè này
      let theyOwe = 0; // Số tiền bạn bè này nợ tôi
      
      transactions.forEach(tx => {
        const isCreator = String(tx.createdBy) === String(user._id);
        
        if (isCreator) {
          // Tôi là người tạo, tính số tiền bạn bè nợ tôi
          const friendParticipant = (tx.participants || []).find(p => 
            String(p.user) === String(friendId)
          );
          
          if (friendParticipant && !friendParticipant.settled) {
            theyOwe += friendParticipant.shareAmount || 0;
          }
        } else {
          // Bạn bè là người tạo, tính số tiền tôi nợ bạn bè
          const myParticipant = (tx.participants || []).find(p => 
            String(p.user) === String(user._id)
          );
          
          if (myParticipant && !myParticipant.settled) {
            iOwe += myParticipant.shareAmount || 0;
          }
        }
      });
      
      return {
        id: friendId,
        name: friend.name || friend.email || 'Thành viên',
        email: friend.email || '',
        iOwe: Number(iOwe.toFixed(2)), // Số tiền tôi nợ bạn này
        theyOwe: Number(theyOwe.toFixed(2)), // Số tiền bạn này nợ tôi
        netDebt: Number((iOwe - theyOwe).toFixed(2)) // Số nợ ròng (+ = tôi nợ, - = họ nợ tôi)
      };
    }));

    return res.json(friendsWithDebt);
  } catch (err) {
    console.error('Friends list error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ADD: remove friend endpoint
router.post('/remove', auth, async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Authentication required' });

    const { friendId } = req.body;
    if (!friendId) return res.status(400).json({ message: 'friendId is required' });
    if (String(friendId) === String(user._id)) return res.status(400).json({ message: 'Cannot remove yourself' });

    const friendUser = await User.findById(friendId);
    if (!friendUser) return res.status(404).json({ message: 'Friend user not found' });

    // remove each other from friends array
    await User.findByIdAndUpdate(user._id, { $pull: { friends: friendId } });
    await User.findByIdAndUpdate(friendId, { $pull: { friends: user._id } });

    // create notification to inform the other user (best-effort)
    try {
      const notif = await Notification.create({
        recipient: friendId,
        sender: user._id,
        type: 'friend.remove',
        message: `${user.name || user.email} đã hủy kết bạn`,
        data: { removedBy: user._id }
      });
      const io = req.app.get('io');
      if (io) io.to(String(friendId)).emit('notification', notif);
    } catch (notifErr) {
      console.warn('Failed to create remove-friend notification:', notifErr && notifErr.message);
    }

    return res.json({ message: 'Friend removed' });
  } catch (err) {
    console.error('Friends remove error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;

