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

    // Fetch regular (personal) transactions
    const txs = await Transaction.find(filter)
      .sort({ date: -1 })
      .populate('wallet')
      .populate('category')
      .lean();

    // Fetch group transactions where the current user is involved
    const currentUserId = req.user._id;
    const currentUserEmail = req.user.email;
    const groupTxs = await GroupTransaction.find({
      $or: [
        { createdBy: currentUserId },  // User created the transaction
        { 'participants.user': currentUserId }, // User is a participant
        { 'participants.email': currentUserEmail } // User's email is in participants
      ]
    })
    .populate('wallet')
    .populate('category')
    .populate('createdBy', 'name email')
    .lean();

    // Fetch group information for these transactions
    const groupIds = [...new Set(groupTxs.map(tx => tx.groupId ? tx.groupId.toString() : null).filter(Boolean))];
    const groups = await mongoose.model('Group').find({ _id: { $in: groupIds } }).lean();
    const groupMap = new Map(groups.map(g => [g._id.toString(), g]));

    // Transform group transactions to format compatible with personal transactions
    const transformedGroupTxs = groupTxs.map(gtx => {
      // Determine if this user is the creator/payer
      const isPayer = String(gtx.createdBy?._id || gtx.createdBy) === String(currentUserId);
      
      // Get the group info
      const group = gtx.groupId ? groupMap.get(gtx.groupId.toString()) : null;
      const groupName = group ? group.name : 'Nhóm';
      
      // Find user's participation record
      const userParticipation = gtx.participants?.find(p => 
        (p.user && String(p.user) === String(currentUserId)) ||
        (p.email && p.email.toLowerCase() === currentUserEmail.toLowerCase())
      );
      
      // Helper: get transaction type label in Vietnamese
      const getTransactionTypeLabel = (type) => {
        switch(type) {
          case 'payer_for_others': return 'Trả giúp';
          case 'equal_split': return 'Chia đều';
          case 'percentage_split': return 'Chia %';
          case 'payer_single': return 'Trả đơn';
          default: return '';
        }
      };
      
      // Calculate actual amount paid by creator based on transaction type
      const calculateCreatorPaidAmount = () => {
        const participantsCount = gtx.participants?.length || 0;
        switch(gtx.transactionType) {
          case 'payer_for_others':
            // Trả giúp: người tạo trả amount * (số người + 1)
            return gtx.amount * (participantsCount + 1);
          case 'equal_split':
          case 'percentage_split':
          case 'payer_single':
          default:
            // Các loại khác: người tạo trả đúng amount
            return gtx.amount;
        }
      };
      
      // Build transaction entries based on user's role and transaction type
      const entries = [];
      
      if (isPayer) {
        // Creator/Payer: Show initial expense with actual paid amount
        const actualPaidAmount = calculateCreatorPaidAmount();
        const transactionTypeLabel = getTransactionTypeLabel(gtx.transactionType);
        const participantsCount = gtx.participants?.length || 0;
        
        let detailText = '';
        if (gtx.transactionType === 'payer_for_others') {
          detailText = `Đã trả giúp ${participantsCount} người, mỗi người ${gtx.amount.toLocaleString('vi-VN')}₫`;
        } else if (gtx.transactionType === 'equal_split') {
          detailText = `Chia đều cho ${participantsCount + 1} người`;
        } else if (gtx.transactionType === 'percentage_split') {
          detailText = `Chia theo % cho ${participantsCount} người`;
        } else if (gtx.transactionType === 'payer_single') {
          detailText = `Chi tiêu cá nhân`;
        }
        
        entries.push({
          ...gtx,
          _id: `${gtx._id}_expense`,
          title: `[${groupName}] ${gtx.title || 'Giao dịch nhóm'} (${transactionTypeLabel})`,
          description: gtx.description || '',
          type: 'expense', // Always an expense for creator initially
          amount: actualPaidAmount, // ACTUAL amount paid by creator
          totalAmount: gtx.amount, // Store original per-person amount
          date: gtx.date || gtx.createdAt,
          groupTransaction: true,
          groupTransactionType: gtx.transactionType,
          groupId: gtx.groupId,
          groupName: groupName,
          groupRole: 'payer',
          groupActionType: 'paid',
          participantsCount: participantsCount,
          displayDetails: detailText
        });
        
        // If any participants settled (repaid), show as income with exact repaid amount
        const settledParticipants = (gtx.participants || []).filter(p => p.settled);
        if (settledParticipants.length > 0) {
          settledParticipants.forEach(p => {
            // Get participant name
            let participantName = p.email || 'thành viên';
            if (p.user && typeof p.user === 'object') {
              participantName = p.user.name || p.user.email || p.email || 'thành viên';
            }
            
            entries.push({
              ...gtx,
              _id: `${gtx._id}_income_${p.user || p._id}`,
              title: `[${groupName}] Nhận từ ${participantName}`,
              description: `Thanh toán cho: ${gtx.title || 'Giao dịch nhóm'}`,
              type: 'income', // Income when someone repays
              amount: p.shareAmount || 0, // Amount received from this participant
              totalAmount: gtx.amount, // Original total transaction amount
              date: p.settledAt || gtx.date || gtx.createdAt,
              groupTransaction: true,
              groupTransactionType: gtx.transactionType,
              groupId: gtx.groupId,
              groupName: groupName,
              groupRole: 'receiver',
              groupActionType: 'received',
              fromParticipant: participantName,
              displayDetails: `Nhận ${p.shareAmount.toLocaleString('vi-VN')}₫ từ ${participantName} trong ${groupName}`
            });
          });
        }
      } else if (userParticipation) {
        // Participant role
        // Get payer name
        const payerName = gtx.createdBy?.name || gtx.createdBy?.email || 'người tạo';
        const transactionTypeLabel = getTransactionTypeLabel(gtx.transactionType);
        
        if (userParticipation.settled) {
          // If already paid, show as expense with exact paid amount
          let detailText = `Đã trả ${userParticipation.shareAmount.toLocaleString('vi-VN')}₫ cho ${payerName} trong ${groupName}`;
          if (gtx.transactionType === 'payer_for_others') {
            detailText += ` (Trả giúp)`;
          } else if (gtx.transactionType === 'equal_split') {
            detailText += ` (Chia đều)`;
          } else if (gtx.transactionType === 'percentage_split') {
            detailText += ` (Chia ${userParticipation.percentage || 0}%)`;
          }
          
          entries.push({
            ...gtx,
            _id: `${gtx._id}_participant_paid`,
            title: `[${groupName}] Đã trả cho ${payerName} (${transactionTypeLabel})`,
            description: `Thanh toán cho: ${gtx.title || 'Giao dịch nhóm'}`,
            type: 'expense', // Expense when paying debt
            amount: userParticipation.shareAmount || 0, // Amount this user paid
            totalAmount: gtx.amount, // Original total transaction amount
            date: userParticipation.settledAt || gtx.date || gtx.createdAt,
            groupTransaction: true,
            groupTransactionType: gtx.transactionType,
            groupId: gtx.groupId,
            groupName: groupName,
            groupRole: 'participant',
            groupActionType: 'paid',
            toPayer: payerName,
            displayDetails: detailText
          });
        } else {
          // If not paid yet, show as pending with exact owed amount
          let detailText = `Còn nợ ${userParticipation.shareAmount.toLocaleString('vi-VN')}₫ cho ${payerName} trong ${groupName}`;
          if (gtx.transactionType === 'payer_for_others') {
            detailText += ` (Trả giúp)`;
          } else if (gtx.transactionType === 'equal_split') {
            detailText += ` (Chia đều)`;
          } else if (gtx.transactionType === 'percentage_split') {
            detailText += ` (Chia ${userParticipation.percentage || 0}%)`;
          }
          
          entries.push({
            ...gtx,
            _id: `${gtx._id}_participant_pending`,
            title: `[${groupName}] Cần trả cho ${payerName} (${transactionTypeLabel})`,
            description: `Cho: ${gtx.title || 'Giao dịch nhóm'}`,
            type: 'expense',
            amount: userParticipation.shareAmount || 0, // Amount this user owes
            totalAmount: gtx.amount, // Original total transaction amount
            date: gtx.date || gtx.createdAt,
            groupTransaction: true,
            groupTransactionType: gtx.transactionType,
            groupId: gtx.groupId,
            groupName: groupName,
            groupRole: 'participant',
            groupActionType: 'pending',
            toPayer: payerName,
            isPending: true, // Mark as pending, not affecting balance
            displayDetails: detailText
          });
        }
      }
      
      return entries;
    }).flat(); // Flatten the array of arrays

    // Combine transactions and sort by date
    const allTransactions = [...txs, ...transformedGroupTxs].sort((a, b) => 
      new Date(b.date) - new Date(a.date)
    );

    res.json(allTransactions);
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
