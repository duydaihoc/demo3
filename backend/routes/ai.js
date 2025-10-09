const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const Category = require('../models/Category');

// Helper: đoán type từ title
function guessTransactionType(title) {
  const lowerTitle = (title || '').toLowerCase();
  const incomeKeywords = ['lương', 'thu nhập', 'thưởng', 'hoa hồng', 'lãi', 'bán', 'thu', 'nhận', 'tiền vào'];
  const expenseKeywords = ['mua', 'chi', 'thanh toán', 'trả', 'tiền ra', 'ăn', 'uống', 'đi', 'mua sắm'];

  if (incomeKeywords.some(k => lowerTitle.includes(k))) return 'income';
  if (expenseKeywords.some(k => lowerTitle.includes(k))) return 'expense';
  return 'expense'; // default to expense
}

// Helper: chọn category phù hợp từ danh mục của ví
async function selectCategory(walletId, title, type) {
  const wallet = await Wallet.findById(walletId).populate('categories');
  if (!wallet) return null;

  const categories = wallet.categories || [];
  const lowerTitle = (title || '').toLowerCase();

  // Tìm category có type khớp và tên chứa từ khóa trong title
  for (const cat of categories) {
    if (cat.type === type) {
      const catName = (cat.name || '').toLowerCase();
      if (lowerTitle.includes(catName) || catName.includes(lowerTitle.split(' ')[0])) {
        return cat;
      }
    }
  }

  // Nếu không tìm thấy, chọn category đầu tiên có type khớp
  const fallback = categories.find(c => c.type === type);
  return fallback || null;
}

// POST /api/ai/create-transaction
// body: { title: string, walletId: string, amount?: number }
// Tự đoán type và category, tạo transaction nếu có category phù hợp, ngược lại trả về thông báo
router.post('/create-transaction', auth, async (req, res) => {
  try {
    const { title, walletId, amount } = req.body;
    if (!title || !walletId) {
      return res.status(400).json({ message: 'title and walletId are required' });
    }

    const userId = req.user._id;

    // Kiểm tra ví thuộc về user
    const wallet = await Wallet.findOne({ _id: walletId, owner: userId });
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found or not owned by user' });
    }

    // Đoán type
    const type = guessTransactionType(title);

    // Chọn category
    const category = await selectCategory(walletId, title, type);
    if (!category) {
      // Không có category phù hợp, trả về thông báo cho AI
      return res.json({
        aiMessage: `Không tìm thấy danh mục phù hợp cho giao dịch "${title}" (loại: ${type}). Hãy thêm danh mục vào ví trước khi tạo giao dịch. Ví dụ: thêm danh mục "Ăn uống" cho chi tiêu hoặc "Lương" cho thu nhập.`,
        aiDecisions: {
          guessedType: type,
          categoryNotFound: true
        }
      });
    }

    // Sử dụng amount nếu cung cấp và > 0, ngược lại mặc định 0
    const finalAmount = (typeof amount === 'number' && amount > 0) ? amount : 0;

    // Tạo transaction
    const transaction = new Transaction({
      wallet: walletId,
      category: category._id,
      type,
      amount: finalAmount,
      title,
      description: `Giao dịch được tạo bởi AI: ${title}`,
      date: new Date(),
      createdBy: userId
    });

    await transaction.save();

    // Cập nhật balance của ví
    const balanceChange = type === 'income' ? finalAmount : -finalAmount;
    wallet.initialBalance = (wallet.initialBalance || 0) + balanceChange;
    await wallet.save();

    // Populate để trả về
    const populated = await Transaction.findById(transaction._id)
      .populate('wallet', 'name balance')
      .populate('category', 'name type')
      .populate('createdBy', 'name email');

    res.status(201).json({
      message: 'Transaction created successfully by AI',
      transaction: populated,
      aiDecisions: {
        guessedType: type,
        selectedCategory: category.name,
        extractedAmount: finalAmount,
        balanceChange: balanceChange
      }
    });
  } catch (err) {
    console.error('AI create transaction error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
