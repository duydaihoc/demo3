const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { auth } = require('../middleware/auth');
const mongoose = require('mongoose');

// GET /api/notifications
// optional query: userId (if admin/debug); otherwise use authenticated user
router.get('/', auth, async (req, res) => {
  try {
    let { userId } = req.query;
    if (!userId) {
      // use authenticated user
      if (!req.user || !req.user._id) return res.status(401).json({ message: 'Authentication required' });
      userId = String(req.user._id);
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.log(`Invalid ObjectId format: ${userId}`);
      return res.json([]); // Return empty array instead of error
    }

    const notifs = await Notification.find({ recipient: userId }).sort({ createdAt: -1 }).limit(200);
    res.json(notifs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/notifications
// body: { recipient, sender?, type, message, data? }
// keep public for internal use; optionally it can be protected
router.post('/', async (req, res) => {
  try {
    const { recipient, sender, type, message, data } = req.body;
    if (!recipient || !type || !message) return res.status(400).json({ message: 'recipient, type, message required' });

    const notif = await Notification.create({ recipient, sender, type, message, data });
    res.status(201).json(notif);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/notifications/:id/mark-read
// only recipient can mark their notification as read
router.post('/:id/mark-read', auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid notification id' });

    const notif = await Notification.findById(id);
    if (!notif) return res.status(404).json({ message: 'Notification not found' });

    // ensure requester is recipient
    const requesterId = String(req.user._id);
    if (String(notif.recipient) !== requesterId) {
      return res.status(403).json({ message: 'Not authorized to mark this notification' });
    }

    notif.read = true;
    notif.readAt = new Date();
    await notif.save();

    res.json(notif);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/notifications/mark-all-read
// marks all unread notifications for authenticated user as read
router.post('/mark-all-read', auth, async (req, res) => {
  try {
    const userId = String(req.user._id);
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid userId format' });
    }

    await Notification.updateMany({ recipient: userId, read: false }, { read: true, readAt: new Date() });
    res.json({ message: 'Marked all as read' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
