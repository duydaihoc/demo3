const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { auth } = require('../middleware/auth');

// GET /api/notifications?userId=...
router.get('/', auth, async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ message: 'userId required' });

    // Validate ObjectId format
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.log(`Invalid ObjectId format: ${userId}`);
      return res.json([]); // Return empty array instead of error
    }

    const notifs = await Notification.find({ recipient: userId }).sort({ createdAt: -1 }).limit(100);
    res.json(notifs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/notifications
// body: { recipient, sender?, type, message, data? }
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
router.post('/:id/mark-read', async (req, res) => {
  try {
    const { id } = req.params;
    const notif = await Notification.findByIdAndUpdate(id, { read: true, readAt: new Date() }, { new: true });
    if (!notif) return res.status(404).json({ message: 'Notification not found' });
    res.json(notif);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/notifications/mark-all-read?userId=...
router.post('/mark-all-read', auth, async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ message: 'userId required' });

    // Validate ObjectId format
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.log(`Invalid ObjectId format: ${userId}`);
      return res.json({ message: 'Invalid userId format' });
    }

    await Notification.updateMany({ recipient: userId, read: false }, { read: true, readAt: new Date() });
    res.json({ message: 'Marked all as read' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
