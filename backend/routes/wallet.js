const express = require('express');
const mongoose = require('mongoose');
const Wallet = require('../models/Wallet');
const Category = require('../models/Category');
const { auth, requireAuth } = require('../middleware/auth');
const router = express.Router();

// Apply auth middleware to all wallet routes
router.use(auth);

// @route   POST /api/wallets
// @desc    Create a new wallet
// @access  Private
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, currency, initialBalance } = req.body;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'Tên ví là bắt buộc' });
    }
    
    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    const newWallet = new Wallet({
      name: name.trim(),
      currency: currency || 'VND',
      initialBalance: Number(initialBalance) || 0,
      owner: req.user._id // Use the authenticated user's ID
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
// @desc    Get all wallets for the authenticated user
// @access  Private
router.get('/', requireAuth, async (req, res) => {
  try {
    // Only get wallets owned by the authenticated user
    const wallets = await Wallet.find({ owner: req.user._id })
      .sort({ createdAt: -1 })
      .populate('categories', 'name icon type');
    res.json(wallets);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
});

// @route   PATCH /api/wallets/:id
// @desc    Update wallet categories
// @access  Private
router.patch('/:id', requireAuth, async (req, res) => {
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

// @route   PUT /api/wallets/:id
// @desc    Update a wallet
// @access  Private
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, currency, initialBalance, categories } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid wallet ID' });
    }
    
    // First find the wallet to verify ownership
    const wallet = await Wallet.findOne({ _id: id, owner: req.user._id });
    
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found or access denied' });
    }
    
    const updateFields = {};
    if (name) updateFields.name = name.trim();
    if (currency) updateFields.currency = currency;
    if (initialBalance !== undefined) updateFields.initialBalance = Number(initialBalance);
    if (categories !== undefined) updateFields.categories = categories;
    
    // Now update the wallet
    const updatedWallet = await Wallet.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { new: true }
    ).populate('categories', 'name icon type');
    
    res.json(updatedWallet);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
});

// @route   DELETE /api/wallets/:id
// @desc    Delete a wallet
// @access  Private
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid wallet ID' });
    }
    
    // First find the wallet to verify ownership
    const wallet = await Wallet.findOne({ _id: id, owner: req.user._id });
    
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found or access denied' });
    }
    
    // Now delete the wallet
    await Wallet.findByIdAndDelete(id);
    
    res.json({ message: 'Wallet deleted successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
});

module.exports = router;
