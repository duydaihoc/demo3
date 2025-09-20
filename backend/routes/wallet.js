const express = require('express');
const mongoose = require('mongoose');
const Wallet = require('../models/Wallet');
const Category = require('../models/Category');
const router = express.Router();

// @route   POST /api/wallets
// @desc    Create a new wallet
// @access  Public (sẽ thêm auth sau)
router.post('/', async (req, res) => {
  try {
    const { name, currency, initialBalance, owner } = req.body;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'Tên ví là bắt buộc' });
    }

    // Use provided owner if valid, otherwise create temp id (existing behavior)
    let ownerId;
    if (owner && mongoose.Types.ObjectId.isValid(owner)) {
      ownerId = owner;
    } else {
      ownerId = new mongoose.Types.ObjectId();
    }
    
    const newWallet = new Wallet({
      name: name.trim(),
      currency: currency || 'VND',
      initialBalance: Number(initialBalance) || 0,
      owner: ownerId
    });

    const wallet = await newWallet.save();
    // populate categories (will be empty) for consistency
    const populated = await Wallet.findById(wallet._id).populate('categories', 'name icon type');
    res.status(201).json(populated);
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
    const wallets = await Wallet.find().sort({ createdAt: -1 }).populate('categories', 'name icon type');
    res.json(wallets);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
});

// @route   PATCH /api/wallets/:id
// @desc    Update wallet categories
// @access  Public
router.patch('/:id', async (req, res) => {
  try {
    const { categories } = req.body;
    // Expect categories to be array of ids
    if (!Array.isArray(categories)) {
      return res.status(400).json({ message: 'categories must be an array of category IDs' });
    }

    // filter unique and valid ObjectIds
    const uniqueIds = [...new Set(categories)].filter(id => mongoose.Types.ObjectId.isValid(id));
    if (uniqueIds.length === 0) {
      // allow clearing categories
      const walletCleared = await Wallet.findByIdAndUpdate(req.params.id, { categories: [] }, { new: true }).populate('categories', 'name icon type');
      if (!walletCleared) return res.status(404).json({ message: 'Wallet not found' });
      return res.json(walletCleared);
    }

    // Verify that provided category ids exist
    const found = await Category.find({ _id: { $in: uniqueIds } }).select('_id');
    const foundIds = found.map(f => f._id.toString());
    const invalid = uniqueIds.filter(id => !foundIds.includes(id));
    if (invalid.length > 0) {
      return res.status(400).json({ message: 'Some category IDs are invalid', invalid });
    }

    const wallet = await Wallet.findByIdAndUpdate(
      req.params.id,
      { categories: uniqueIds },
      { new: true }
    ).populate('categories', 'name icon type');

    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }
    res.json(wallet);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
});

// Add: GET single wallet by id (populate categories)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid wallet id' });
    }
    const wallet = await Wallet.findById(id).populate('categories', 'name icon type');
    if (!wallet) return res.status(404).json({ message: 'Wallet not found' });
    res.json(wallet);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
});

// Add: PUT update wallet fields (name, currency, initialBalance)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, currency, initialBalance, categories } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid wallet id' });
    }
    const update = {};
    if (name !== undefined) update.name = String(name).trim();
    if (currency !== undefined) update.currency = currency;
    if (initialBalance !== undefined) update.initialBalance = Number(initialBalance) || 0;

    // Nếu client gửi categories -> validate và gán
    if (categories !== undefined) {
      if (!Array.isArray(categories)) {
        return res.status(400).json({ message: 'categories must be an array of category IDs' });
      }
      const uniqueIds = [...new Set(categories)].filter(cid => mongoose.Types.ObjectId.isValid(cid));
      if (uniqueIds.length > 0) {
        // verify existence
        const found = await Category.find({ _id: { $in: uniqueIds } }).select('_id');
        const foundIds = found.map(f => f._id.toString());
        const invalid = uniqueIds.filter(id => !foundIds.includes(id));
        if (invalid.length > 0) {
          return res.status(400).json({ message: 'Some category IDs are invalid', invalid });
        }
        update.categories = uniqueIds;
      } else {
        // empty list -> clear categories
        update.categories = [];
      }
    }

    const wallet = await Wallet.findByIdAndUpdate(id, update, { new: true }).populate('categories', 'name icon type');
    if (!wallet) return res.status(404).json({ message: 'Wallet not found' });
    res.json(wallet);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
});

// Add: DELETE wallet by id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid wallet id' });
    }
    const wallet = await Wallet.findByIdAndDelete(id);
    if (!wallet) return res.status(404).json({ message: 'Wallet not found' });
    // return deleted wallet data so frontend can optionally recreate (undo)
    res.json({ message: 'Wallet deleted', wallet });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
});

module.exports = router;
