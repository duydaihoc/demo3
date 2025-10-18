const express = require('express');
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const Category = require('../models/Category');
const GroupTransaction = require('../models/GroupTransaction');
const { auth, requireAuth } = require('../middleware/auth');

const router = express.Router();

// apply auth middleware
router.use(auth);

// helper: verify ObjectId
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// compute wallet balance change for a transaction object { type, amount }
const applyTransactionToWallet = (wallet, type, amount) => {
  const amt = Number(amount) || 0;
  if (type === 'income') wallet.initialBalance = (wallet.initialBalance || 0) + amt;
  else wallet.initialBalance = (wallet.initialBalance || 0) - amt;
};

// revert transaction effect
const revertTransactionOnWallet = (wallet, type, amount) => {
  const amt = Number(amount) || 0;
  if (type === 'income') wallet.initialBalance = (wallet.initialBalance || 0) - amt;
  else wallet.initialBalance = (wallet.initialBalance || 0) + amt;
};

// POST create transaction
router.post('/', requireAuth, async (req, res) => {
  try {
    const { wallet: walletId, category: categoryId, type, amount, title, description, date } = req.body;

    if (!walletId || !isValidId(walletId)) return res.status(400).json({ message: 'wallet is required' });
    if (!categoryId || !isValidId(categoryId)) return res.status(400).json({ message: 'category is required' });
    if (!['expense', 'income'].includes(type)) return res.status(400).json({ message: 'type must be expense or income' });
    if (amount == null || isNaN(Number(amount))) return res.status(400).json({ message: 'amount is required' });

    // load wallet and check ownership (unless admin)
    const wallet = await Wallet.findById(walletId);
    if (!wallet) return res.status(404).json({ message: 'Wallet not found' });

    if (!(req.user && req.user.role === 'admin')) {
      // require owner matches
      if (!wallet.owner || String(wallet.owner) !== String(req.user._id)) {
        return res.status(403).json({ message: 'Access denied to this wallet' });
      }
    }

    // optional: verify category exists
    const category = await Category.findById(categoryId);
    if (!category) return res.status(404).json({ message: 'Category not found' });

    const tx = new Transaction({
      wallet: walletId,
      category: categoryId,
      type,
      amount: Number(amount),
      title: title || '',
      description: description || '',
      date: date ? new Date(date) : Date.now(),
      createdBy: req.user ? req.user._id : undefined
    });

    // apply to wallet balance
    applyTransactionToWallet(wallet, type, Number(amount));
    await wallet.save();

    const saved = await tx.save();
    const populated = await Transaction.findById(saved._id).populate('wallet').populate('category');

    res.status(201).json(populated);
  } catch (err) {
    console.error('Create transaction error:', err);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
});

// GET list transactions (for current user). Admin can pass ?userId=...
router.get('/', requireAuth, async (req, res) => {
  try {
    const { userId } = req.query;

    let filter = {};
    if (req.user && req.user.role === 'admin') {
      if (userId && isValidId(userId)) {
        // find wallets owned by userId
        const wallets = await Wallet.find({ owner: userId }).select('_id');
        filter.wallet = { $in: wallets.map(w => w._id) };
      }
      // else admin: no filter -> return all transactions
    } else {
      // normal user: return transactions for wallets owned by them
      const wallets = await Wallet.find({ owner: req.user._id }).select('_id');
      filter.wallet = { $in: wallets.map(w => w._id) };
    }

    // Fetch only regular (personal) transactions
    const txs = await Transaction.find(filter)
      .sort({ date: -1 })
      .populate('wallet')
      .populate('category')
      .lean();

    // Remove group transaction merging here
    // (No group transaction logic)

    res.json(txs);
  } catch (err) {
    console.error('List transactions error:', err);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
});

// GET transaction by id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: 'Invalid transaction ID' });

    const tx = await Transaction.findById(id).populate('wallet').populate('category');
    if (!tx) return res.status(404).json({ message: 'Transaction not found' });

    // ownership check
    if (!(req.user && req.user.role === 'admin')) {
      const wallet = await Wallet.findById(tx.wallet._id);
      if (!wallet || String(wallet.owner) !== String(req.user._id)) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    res.json(tx);
  } catch (err) {
    console.error('Get transaction error:', err);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
});

// PUT update transaction
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: 'Invalid transaction ID' });

    const tx = await Transaction.findById(id);
    if (!tx) return res.status(404).json({ message: 'Transaction not found' });

    // ownership check
    if (!(req.user && req.user.role === 'admin')) {
      const wallet = await Wallet.findById(tx.wallet);
      if (!wallet || String(wallet.owner) !== String(req.user._id)) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    // load wallet to adjust balances
    const wallet = await Wallet.findById(tx.wallet);
    if (!wallet) return res.status(404).json({ message: 'Wallet not found' });

    // revert old effect
    revertTransactionOnWallet(wallet, tx.type, tx.amount);

    // apply new values
    const { wallet: newWalletId, category: newCategoryId, type, amount, title, description, date } = req.body;

    // if wallet changed, we need to move effect from old wallet to new wallet
    let targetWallet = wallet;
    if (newWalletId && isValidId(newWalletId) && String(newWalletId) !== String(tx.wallet)) {
      // find new wallet
      const nw = await Wallet.findById(newWalletId);
      if (!nw) return res.status(404).json({ message: 'Target wallet not found' });

      // ownership check for new wallet (unless admin)
      if (!(req.user && req.user.role === 'admin')) {
        if (!nw.owner || String(nw.owner) !== String(req.user._id)) {
          return res.status(403).json({ message: 'Access denied to target wallet' });
        }
      }
      targetWallet = nw;
    }

    // update fields on tx
    if (newWalletId && isValidId(newWalletId)) tx.wallet = newWalletId;
    if (newCategoryId && isValidId(newCategoryId)) tx.category = newCategoryId;
    if (type && ['expense','income'].includes(type)) tx.type = type;
    if (amount != null && !isNaN(Number(amount))) tx.amount = Number(amount);
    if (title !== undefined) tx.title = title;
    if (description !== undefined) tx.description = description;
    if (date !== undefined) tx.date = date ? new Date(date) : tx.date;

    // apply new effect to targetWallet
    applyTransactionToWallet(targetWallet, tx.type, tx.amount);

    // save wallets (if moved, save both)
    await targetWallet.save();
    if (String(targetWallet._id) !== String(wallet._id)) {
      await wallet.save();
    }

    const updated = await tx.save();
    const populated = await Transaction.findById(updated._id).populate('wallet').populate('category');
    res.json(populated);
  } catch (err) {
    console.error('Update transaction error:', err);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
});

// DELETE transaction
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: 'Invalid transaction ID' });

    const tx = await Transaction.findById(id);
    if (!tx) return res.status(404).json({ message: 'Transaction not found' });

    // ownership check
    if (!(req.user && req.user.role === 'admin')) {
      const wallet = await Wallet.findById(tx.wallet);
      if (!wallet || String(wallet.owner) !== String(req.user._id)) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    // revert effect on wallet
    const wallet = await Wallet.findById(tx.wallet);
    if (wallet) {
      revertTransactionOnWallet(wallet, tx.type, tx.amount);
      await wallet.save();
    }

    await Transaction.findByIdAndDelete(id);
    res.json({ message: 'Transaction deleted', transaction: tx });
  } catch (err) {
    console.error('Delete transaction error:', err);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
});

module.exports = router;
