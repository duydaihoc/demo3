const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const Category = require('../models/Category');

// Helper: trích xuất số tiền từ text
function extractAmount(text) {
  const lowerText = (text || '').toLowerCase();
  // Regex: số + đơn vị (k, triệu, nghìn, vnd, đ, etc.)
  const amountRegex = /(\d+(?:[\.,]\d+)?)\s*(k|nghìn|ngàn|triệu|tr|vnd|đ|vnđ|usd|\$)?/gi;
  const matches = [...lowerText.matchAll(amountRegex)];
  
  if (matches.length > 0) {
    const match = matches[0];
    let amount = parseFloat(match[1].replace(',', '.'));
    const unit = (match[2] || '').toLowerCase();
    
    // Chuyển đổi đơn vị
    if (unit === 'k') amount *= 1000;
    else if (unit === 'nghìn' || unit === 'ngàn') amount *= 1000;
    else if (unit === 'triệu' || unit === 'tr') amount *= 1000000;
    else if (unit === 'usd' || unit === '$') amount *= 23000;
    
    return Math.round(amount);
  }
  return null;
}

// Helper: đoán type từ title với nhiều keyword hơn
function guessTransactionType(title) {
  const lowerTitle = (title || '').toLowerCase();
  const incomeKeywords = [
    'lương', 'thu nhập', 'thưởng', 'hoa hồng', 'lãi', 'bán', 'thu', 'nhận', 'tiền vào',
    'được trả', 'thu về', 'kiếm', 'profit', 'salary', 'bonus', 'commission'
  ];
  const expenseKeywords = [
    'mua', 'chi', 'thanh toán', 'trả', 'tiền ra', 'ăn', 'uống', 'đi', 'mua sắm',
    'cafe', 'cà phê', 'cơm', 'phở', 'bún', 'xăng', 'điện', 'nước', 'nhà', 'thuê',
    'internet', 'điện thoại', 'quần áo', 'giải trí', 'xem phim', 'du lịch',
    'y tế', 'thuốc', 'khám bệnh', 'học', 'sách', 'khóa học'
  ];

  if (incomeKeywords.some(k => lowerTitle.includes(k))) return 'income';
  if (expenseKeywords.some(k => lowerTitle.includes(k))) return 'expense';
  return 'expense'; // default to expense
}

// Helper: mapping từ khóa -> tên danh mục
const CATEGORY_KEYWORDS = {
  'Ăn uống': ['ăn', 'uống', 'cafe', 'cà phê', 'cơm', 'phở', 'bún', 'nhà hàng', 'quán', 'food', 'drink', 'breakfast', 'lunch', 'dinner', 'tối', 'trưa', 'sáng'],
  'Di chuyển': ['xăng', 'xe', 'bus', 'taxi', 'grab', 'di chuyển', 'đi', 'transport', 'gas', 'fuel'],
  'Hóa đơn': ['điện', 'nước', 'internet', 'điện thoại', 'wifi', 'phone', 'bill', 'hóa đơn'],
  'Mua sắm': ['mua', 'shopping', 'quần áo', 'giày', 'túi', 'clothes', 'fashion'],
  'Giải trí': ['xem phim', 'phim', 'game', 'du lịch', 'travel', 'giải trí', 'vui chơi', 'movie'],
  'Y tế': ['thuốc', 'bệnh viện', 'khám', 'y tế', 'sức khỏe', 'health', 'doctor'],
  'Giáo dục': ['học', 'sách', 'khóa học', 'học phí', 'education', 'course', 'book'],
  'Lương': ['lương', 'salary', 'thu nhập', 'income'],
  'Thưởng': ['thưởng', 'bonus', 'hoa hồng', 'commission'],
  'Đầu tư': ['lãi', 'cổ tức', 'đầu tư', 'investment', 'profit', 'dividend'],
  'Khác': ['khác', 'other', 'misc']
};

// Helper: chọn category phù hợp từ danh mục của ví với AI matching
async function selectCategory(walletId, title, type) {
  const wallet = await Wallet.findById(walletId).populate('categories');
  if (!wallet) return null;

  const categories = wallet.categories || [];
  const lowerTitle = (title || '').toLowerCase();

  // Tìm category dựa trên keyword matching
  let bestMatch = null;
  let maxScore = 0;

  for (const cat of categories) {
    if (cat.type !== type) continue;
    
    const catName = (cat.name || '').toLowerCase();
    let score = 0;
    
    // Check direct name match
    if (lowerTitle.includes(catName) || catName.includes(lowerTitle.split(' ')[0])) {
      score += 10;
    }
    
    // Check keyword mapping
    const keywords = CATEGORY_KEYWORDS[cat.name] || [];
    for (const keyword of keywords) {
      if (lowerTitle.includes(keyword)) {
        score += 5;
      }
    }
    
    if (score > maxScore) {
      maxScore = score;
      bestMatch = cat;
    }
  }

  if (bestMatch) return bestMatch;

  // Nếu không tìm thấy, chọn category đầu tiên có type khớp
  const fallback = categories.find(c => c.type === type);
  return fallback || null;
}

// POST /api/ai/create-transaction
// body: { title: string, walletId: string, amount?: number }
// Tự đoán type, category và extract amount từ title
router.post('/create-transaction', auth, async (req, res) => {
  try {
    let { title, walletId, amount } = req.body;
    if (!title || !walletId) {
      return res.status(400).json({ message: 'title and walletId are required' });
    }

    const userId = req.user._id;

    // Kiểm tra ví thuộc về user
    const wallet = await Wallet.findOne({ _id: walletId, owner: userId });
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found or not owned by user' });
    }

    // Nếu không có amount, thử extract từ title
    if (!amount || amount <= 0) {
      const extractedAmount = extractAmount(title);
      if (extractedAmount) {
        amount = extractedAmount;
      }
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
        balanceChange: balanceChange,
        autoDetected: true
      }
    });
  } catch (err) {
    console.error('AI create transaction error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// PUT /api/ai/edit-transaction
// body: { transactionId: string, updates: { amount?, title?, description?, categoryName? } }
// AI tự động sửa giao dịch dựa trên updates
router.put('/edit-transaction', auth, async (req, res) => {
  try {
    const { transactionId, updates } = req.body;
    if (!transactionId || !updates) {
      return res.status(400).json({ message: 'transactionId and updates are required' });
    }

    const userId = req.user._id;

    // Tìm transaction
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    // Kiểm tra quyền sở hữu qua wallet
    const wallet = await Wallet.findOne({ _id: transaction.wallet, owner: userId });
    if (!wallet) {
      return res.status(403).json({ message: 'You do not have permission to edit this transaction' });
    }

    const oldAmount = transaction.amount || 0;
    const oldType = transaction.type;

    // Cập nhật các field
    if (updates.title !== undefined) transaction.title = updates.title;
    if (updates.description !== undefined) transaction.description = updates.description;
    if (updates.amount !== undefined && updates.amount >= 0) {
      transaction.amount = updates.amount;
    }

    // Nếu có categoryName, tìm category trong ví
    if (updates.categoryName) {
      const walletWithCats = await Wallet.findById(wallet._id).populate('categories');
      const category = (walletWithCats.categories || []).find(c => 
        c.name.toLowerCase() === updates.categoryName.toLowerCase()
      );
      if (category) {
        transaction.category = category._id;
        // Nếu category có type khác, cập nhật type
        if (category.type !== transaction.type) {
          transaction.type = category.type;
        }
      }
    }

    await transaction.save();

    // Cập nhật balance của wallet
    const newAmount = transaction.amount || 0;
    const newType = transaction.type;

    // Hoàn lại balance cũ
    const oldBalanceChange = oldType === 'income' ? oldAmount : -oldAmount;
    wallet.initialBalance = (wallet.initialBalance || 0) - oldBalanceChange;

    // Áp dụng balance mới
    const newBalanceChange = newType === 'income' ? newAmount : -newAmount;
    wallet.initialBalance = (wallet.initialBalance || 0) + newBalanceChange;
    await wallet.save();

    // Populate để trả về
    const populated = await Transaction.findById(transaction._id)
      .populate('wallet', 'name initialBalance')
      .populate('category', 'name type')
      .populate('createdBy', 'name email');

    res.json({
      message: 'Transaction updated successfully by AI',
      transaction: populated,
      aiDecisions: {
        updatedFields: Object.keys(updates),
        oldAmount,
        newAmount,
        balanceChange: newBalanceChange - oldBalanceChange
      }
    });
  } catch (err) {
    console.error('AI edit transaction error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET /api/ai/search-transactions
// query: { query: string, walletId?: string, limit?: number }
// Tìm kiếm giao dịch để sửa/xóa
router.get('/search-transactions', auth, async (req, res) => {
  try {
    const { query, walletId, limit = 10 } = req.query;
    const userId = req.user._id;

    // Build filter
    const filter = {};
    
    // Lọc theo wallet ownership
    if (walletId) {
      const wallet = await Wallet.findOne({ _id: walletId, owner: userId });
      if (!wallet) {
        return res.status(404).json({ message: 'Wallet not found' });
      }
      filter.wallet = walletId;
    } else {
      // Lấy tất cả wallets của user
      const wallets = await Wallet.find({ owner: userId }).select('_id');
      filter.wallet = { $in: wallets.map(w => w._id) };
    }

    // Search by title
    if (query) {
      filter.title = { $regex: query, $options: 'i' };
    }

    const transactions = await Transaction.find(filter)
      .populate('wallet', 'name')
      .populate('category', 'name type')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json(transactions);
  } catch (err) {
    console.error('AI search transactions error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// DELETE /api/ai/delete-transaction
// body: { transactionId: string }
// AI tự động xóa giao dịch và hoàn lại balance
router.delete('/delete-transaction', auth, async (req, res) => {
  try {
    const { transactionId } = req.body;
    if (!transactionId) {
      return res.status(400).json({ message: 'transactionId is required' });
    }

    const userId = req.user._id;

    // Tìm transaction
    const transaction = await Transaction.findById(transactionId)
      .populate('wallet', 'name initialBalance')
      .populate('category', 'name type');
    
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    // Kiểm tra quyền sở hữu qua wallet
    const wallet = await Wallet.findOne({ _id: transaction.wallet._id, owner: userId });
    if (!wallet) {
      return res.status(403).json({ message: 'You do not have permission to delete this transaction' });
    }

    // Lưu thông tin trước khi xóa
    const deletedInfo = {
      title: transaction.title,
      amount: transaction.amount,
      type: transaction.type,
      category: transaction.category?.name || 'N/A',
      wallet: transaction.wallet.name,
      date: transaction.date || transaction.createdAt
    };

    // Hoàn lại balance cho wallet
    const balanceChange = transaction.type === 'income' ? transaction.amount : -transaction.amount;
    wallet.initialBalance = (wallet.initialBalance || 0) - balanceChange;
    await wallet.save();

    // Xóa transaction
    await Transaction.findByIdAndDelete(transactionId);

    res.json({
      message: 'Transaction deleted successfully by AI',
      deletedTransaction: deletedInfo,
      aiDecisions: {
        restoredBalance: -balanceChange,
        newWalletBalance: wallet.initialBalance
      }
    });
  } catch (err) {
    console.error('AI delete transaction error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
