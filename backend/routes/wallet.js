const express = require('express');
const mongoose = require('mongoose');
const Wallet = require('../models/Wallet');
const router = express.Router();

// @route   POST /api/wallets
// @desc    Create a new wallet
// @access  Public (sẽ thêm auth sau)
router.post('/', async (req, res) => {
  try {
    const { name, currency, initialBalance } = req.body;
    
    // Validation
    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'Tên ví là bắt buộc' });
    }

    // Tạo ObjectId hợp lệ cho owner
    const tempUserId = new mongoose.Types.ObjectId();
    
    const newWallet = new Wallet({
      name: name.trim(),
      currency: currency || 'VND',
      initialBalance: Number(initialBalance) || 0,
      owner: tempUserId
    });

    const wallet = await newWallet.save();
    res.status(201).json(wallet);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
});

// @route   GET /api/wallets
// @desc    Get all wallets
// @access  Public
router.get('/', async (req, res) => {
  try {
    const wallets = await Wallet.find().sort({ createdAt: -1 });
    res.json(wallets);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
});

module.exports = router;
