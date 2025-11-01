require('dotenv').config();
const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const Category = require('../models/Category');

// ======================== GEMINI AI SETUP ========================
let model = null;
let geminiAvailable = false;

try {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (GEMINI_API_KEY && GEMINI_API_KEY.trim() !== '') {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.trim());
    // ✅ Dùng model mới nhất, tránh lỗi 404
    model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); 
    geminiAvailable = true;
    console.log('✅ Gemini AI initialized successfully (model: gemini-2.0-flash)');
  } else {
    console.warn('⚠️ GEMINI_API_KEY không tồn tại trong file .env');
  }
} catch (error) {
  console.error('❌ Error initializing Gemini AI:', error.message);
  geminiAvailable = false;
}

// ======================== Helper functions ========================

// Phân tích ý định hành động
function analyzeForActionSuggestion(userMessage, aiReply) {
  const lowerMessage = userMessage.toLowerCase();

  const transactionKeywords = ['tạo', 'thêm', 'ghi', 'ăn', 'mua', 'chi', 'thu', 'nhận'];
  if (transactionKeywords.some(keyword => lowerMessage.includes(keyword))) {
    const amount = extractAmount(userMessage);
    return {
      type: 'create_transaction',
      suggested: true,
      data: {
        title: userMessage,
        amount: amount,
        confidence: amount ? 0.8 : 0.5
      }
    };
  }

  const statsKeywords = ['thống kê', 'xem', 'báo cáo', 'tổng'];
  if (statsKeywords.some(keyword => lowerMessage.includes(keyword))) {
    return { type: 'view_stats', suggested: true, data: {} };
  }

  return { suggested: false };
}

// Trích xuất số tiền
function extractAmount(text) {
  const lowerText = (text || '').toLowerCase();
  const amountRegex = /(\d+(?:[\.,]\d+)?)\s*(k|nghìn|ngàn|triệu|tr|vnd|đ|vnđ|usd|\$)?/gi;
  const matches = [...lowerText.matchAll(amountRegex)];
  
  if (matches.length > 0) {
    const match = matches[0];
    let amount = parseFloat(match[1].replace(',', '.'));
    const unit = (match[2] || '').toLowerCase();
    
    if (unit === 'k' || unit === 'nghìn' || unit === 'ngàn') amount *= 1000;
    else if (unit === 'triệu' || unit === 'tr') amount *= 1000000;
    else if (unit === 'usd' || unit === '$') amount *= 23000;
    
    return Math.round(amount);
  }
  return null;
}

// Helper: Phân tích message để tự động tạo giao dịch (KHÔNG tự động chọn ví)
async function analyzeTransactionIntent(message, userId, wallets, categories, model) {
  try {
    // Lấy tất cả danh mục từ các ví (bao gồm cả danh mục mặc định)
    const allCategories = [];
    
    // Thêm danh mục mặc định (isDefault: true)
    const defaultCategories = categories.filter(c => c.isDefault);
    allCategories.push(...defaultCategories);
    
    // Thêm danh mục riêng từ các ví
    wallets.forEach(wallet => {
      if (wallet.categories && Array.isArray(wallet.categories)) {
        wallet.categories.forEach(cat => {
          const categoryObj = typeof cat === 'object' ? cat : null;
          if (categoryObj && categoryObj._id) {
            const exists = allCategories.some(c => String(c._id) === String(categoryObj._id));
            if (!exists) {
              allCategories.push(categoryObj);
            }
          }
        });
      }
    });

    // Lọc danh mục theo loại
    const expenseCategories = allCategories.filter(c => c.type === 'expense' || !c.type);
    const incomeCategories = allCategories.filter(c => c.type === 'income');

    console.log('📋 Available categories:', {
      total: allCategories.length,
      expense: expenseCategories.length,
      income: incomeCategories.length
    });

    // Prompt Gemini để phân tích ý định giao dịch - KHÔNG tự động chọn ví
    const analysisPrompt = `
Bạn là AI phân tích ý định giao dịch tài chính. Phân tích câu nói sau và trích xuất thông tin giao dịch.

QUAN TRỌNG: KHÔNG TỰ ĐỘNG CHỌN VÍ - Người dùng sẽ tự chọn ví sau.

DANH MỤC CHI TIÊU CÓ SẴN:
${expenseCategories.map(c => `- ${c.name} (${c.icon || '📝'}) - Mô tả: ${c.description || 'Không có'} (ID: ${c._id})`).join('\n')}

DANH MỤC THU NHẬP CÓ SẴN:
${incomeCategories.map(c => `- ${c.name} (${c.icon || '💰'}) - Mô tả: ${c.description || 'Không có'} (ID: ${c._id})`).join('\n')}

CÂU NÓI CỦA NGƯỜI DÙNG: "${message}"

HƯỚNG DẪN PHÂN TÍCH:
1. Xác định loại giao dịch (chi tiêu hoặc thu nhập) - BẮT BUỘC
2. Trích xuất số tiền chính xác - BẮT BUỘC
3. **QUAN TRỌNG**: Chọn danh mục PHÙ HỢP NHẤT từ danh sách trên dựa trên ngữ cảnh
4. **KHÔNG** tự động chọn ví - để null
5. Tạo mô tả ngắn gọn và rõ ràng

VÍ DỤ PHÂN TÍCH:
- "ăn tối 20k" → Chi tiêu, 20000, danh mục "Ăn uống" (nếu có), ví: null
- "mua sắm quần áo 500k" → Chi tiêu, 500000, danh mục "Mua sắm" hoặc "Quần áo" (nếu có), ví: null
- "đổ xăng 200 nghìn" → Chi tiêu, 200000, danh mục "Đi lại" hoặc "Xe cộ" (nếu có), ví: null
- "nhận lương 10 triệu" → Thu income, 10000000, danh mục "Lương" (nếu có), ví: null
- "cafe sáng 30k" → Chi tiêu, 30000, danh mục "Ăn uống" hoặc "Cafe" (nếu có), ví: null
- "tiền điện 500k" → Chi tiêu, 500000, danh mục "Hóa đơn" hoặc "Điện nước" (nếu có), ví: null

MAPPING KEYWORDS VỚI DANH MỤC:
- Ăn, uống, nhậu, cafe, trà sữa, cơm, bún, phở, tối, sáng, trưa → "Ăn uống"
- Xăng, đổ xăng, xe, taxi, grab, bus → "Đi lại" hoặc "Xe cộ"
- Quần áo, giày dép, phụ kiện, mua sắm → "Mua sắm" hoặc "Quần áo"
- Điện, nước, internet, điện thoại → "Hóa đơn" hoặc "Tiện ích"
- Phim, game, giải trí, vui chơi → "Giải trí"
- Sức khỏe, bệnh viện, thuốc → "Sức khỏe"
- Học, sách, khóa học → "Học tập"
- Lương, thưởng, nhận tiền → "Lương" hoặc "Thu nhập"

Phân tích và trả về JSON với format sau (KHÔNG thêm markdown, KHÔNG thêm giải thích, CHỈ JSON):
{
  "hasIntent": true/false,
  "type": "expense" hoặc "income",
  "amount": số tiền (số, không có đơn vị),
  "description": mô tả giao dịch,
  "categoryId": ID danh mục phù hợp nhất từ danh sách trên (QUAN TRỌNG: phải chọn từ danh sách),
  "categoryName": tên danh mục đã chọn,
  "walletId": null,
  "walletName": null,
  "confidence": độ tự tin từ 0-1,
  "reasoning": giải thích ngắn gọn tại sao chọn danh mục này
}

CHÚ Ý QUAN TRỌNG:
- Số tiền: k = 1000, nghìn/ngàn = 1000, triệu/tr = 1000000
- PHẢI chọn categoryId và categoryName từ danh sách có sẵn ở trên
- LUÔN set walletId = null và walletName = null (người dùng sẽ tự chọn)
- Nếu không tìm thấy danh mục phù hợp 100%, chọn danh mục gần nhất
- Nếu thực sự không có danh mục phù hợp, set categoryId = null
`;

    const result = await model.generateContent(analysisPrompt);
    const response = await result.response;
    let text = response.text().trim();
    
    // Remove markdown code blocks if present
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    console.log('🤖 Gemini raw response:', text);
    
    // Parse JSON
    const analysis = JSON.parse(text);
    
    console.log('📊 Parsed analysis:', analysis);
    
    // Validate category exists in available categories
    if (analysis.categoryId) {
      const categoryExists = allCategories.some(c => String(c._id) === String(analysis.categoryId));
      if (!categoryExists) {
        console.warn('⚠️ Category ID không tồn tại trong danh sách, set về null');
        analysis.categoryId = null;
        analysis.categoryName = null;
      } else {
        console.log('✅ Category validated:', analysis.categoryName);
      }
    }
    
    // Validate and return
    if (analysis.hasIntent && analysis.confidence > 0.6) {
      return {
        success: true,
        transaction: {
          type: analysis.type,
          amount: analysis.amount,
          description: analysis.description,
          categoryId: analysis.categoryId,
          categoryName: analysis.categoryName,
          walletId: null, // Luôn null - người dùng sẽ chọn
          walletName: null, // Luôn null - người dùng sẽ chọn
          confidence: analysis.confidence,
          reasoning: analysis.reasoning
        }
      };
    }
    
    return { success: false, reason: 'Không đủ thông tin hoặc độ tự tin thấp' };
    
  } catch (error) {
    console.error('❌ Error analyzing transaction intent:', error);
    return { success: false, reason: error.message };
  }
}

// ======================== MAIN AI ENDPOINT ========================
router.post('/chat', auth, async (req, res) => {
  try {
    const { message, conversationHistory = [], selectedWalletId } = req.body; // THÊM: nhận selectedWalletId từ frontend
    const userId = req.user._id;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Lấy thông tin context của user
    const wallets = await Wallet.find({ owner: userId }).populate('categories');
    const categories = await Category.find({ 
      $or: [{ isDefault: true }, { user: userId }] 
    });
    
    const recentTransactions = await Transaction.find({ 
      wallet: { $in: wallets.map(w => w._id) } 
    })
      .populate('wallet', 'name')
      .populate('category', 'name type')
      .sort({ createdAt: -1 })
      .limit(15);

    // Context cho response
    const context = {
      walletsCount: wallets.length,
      totalBalance: wallets.reduce((sum, w) => sum + (w.initialBalance || 0), 0),
      recentTransactionsCount: recentTransactions.length
    };

    let aiReply = '';
    let fallback = false;
    let geminiError = null;
    let transactionSuggestion = null;
    let editSuggestion = null;

    if (geminiAvailable && model) {
      try {
        console.log('🤖 Sending request to Gemini Pro...');
        
        // THÊM: Kiểm tra ý định sửa giao dịch TRƯỚC
        const lowerMessage = message.toLowerCase();
        if (lowerMessage.includes('sửa') || lowerMessage.includes('chỉnh') || 
            lowerMessage.includes('thay đổi') || lowerMessage.includes('cập nhật') || 
            lowerMessage.includes('đổi')) {
          
          const editAnalysis = await analyzeEditTransactionIntent(
            message, 
            userId, 
            wallets, 
            categories, 
            model
          );
          
          if (editAnalysis.success) {
            editSuggestion = editAnalysis.editIntent;
            console.log('✏️ Edit intent detected:', editSuggestion);
          }
        }
        
        // THAY ĐỔI: Nếu không phải sửa, phân tích tạo giao dịch - KHÔNG tự động chọn ví, KHÔNG chọn danh mục
        if (!editSuggestion) {
          // Chỉ trích xuất type, amount, description - KHÔNG phân tích category và wallet
          const intentAnalysis = await analyzeBasicTransactionIntent(
            message, 
            model
          );
          
          if (intentAnalysis.success) {
            transactionSuggestion = {
              type: intentAnalysis.type,
              amount: intentAnalysis.amount,
              description: intentAnalysis.description,
              categoryId: null, // Sẽ được xác định sau khi user chọn ví
              categoryName: null,
              walletId: null,
              walletName: null,
              confidence: intentAnalysis.confidence,
              reasoning: intentAnalysis.reasoning
            };
            console.log('💡 Transaction intent detected:', transactionSuggestion);
          }
        }
        
        // Tạo context prompt cho Gemini
        const contextPrompt = `
Bạn là trợ lý tài chính cá nhân thông minh và thân thiện. Hãy trả lời câu hỏi của người dùng một cách tự nhiên, hữu ích và cụ thể.

THÔNG TIN NGƯỜI DÙNG:
- Tên: ${req.user.name || 'Người dùng'}
- Email: ${req.user.email || 'Không có'}

TÌNH HÌNH TÀI CHÍNH HIỆN TẠI:
- Số ví đang quản lý: ${wallets.length}
- Tổng số dư hiện tại: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(context.totalBalance)}

DANH SÁCH VÍ:
${wallets.map(w => `- ${w.name}: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(w.initialBalance || 0)}`).join('\n')}

GIAO DỊCH GẦN ĐÂY (${recentTransactions.length} giao dịch):
${recentTransactions.slice(0, 10).map(t => `- ${t.title}: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(t.amount)} (${t.type === 'income' ? 'Thu nhập' : 'Chi tiêu'})`).join('\n')}

${editSuggestion ? `
QUAN TRỌNG: Tôi đã phát hiện người dùng muốn SỬA giao dịch:
${editSuggestion.multipleMatches 
  ? `- Tìm thấy ${editSuggestion.foundTransactions.length} giao dịch tương tự. Hãy yêu cầu người dùng chọn giao dịch cụ thể.`
  : editSuggestion.foundTransactions.length === 1
    ? `- Tìm thấy giao dịch: ${editSuggestion.foundTransactions[0].description} - ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(editSuggestion.foundTransactions[0].amount)}
- Cập nhật: ${JSON.stringify(editSuggestion.updates)}
Hãy xác nhận với người dùng và chuẩn bị cập nhật giao dịch này.`
    : `- Không tìm thấy giao dịch phù hợp. Hãy yêu cầu người dùng cung cấp thêm thông tin.`
}
` : transactionSuggestion ? `
QUAN TRỌNG: Tôi đã phát hiện người dùng muốn tạo giao dịch MỚI:
- Loại: ${transactionSuggestion.type === 'expense' ? 'Chi tiêu' : 'Thu nhập'}
- Số tiền: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(transactionSuggestion.amount)}
- Mô tả: ${transactionSuggestion.description}
Hãy xác nhận với người dùng.
` : ''}

CÂU HỎI HIỆN TẠI: ${message}

Hãy trả lời một cách chi tiết, hữu ích và cá nhân hóa.
`;

        // Gọi Gemini API với timeout
        const result = await Promise.race([
          model.generateContent(contextPrompt),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Gemini API timeout after 20 seconds')), 20000)
          )
        ]);
        
        const response = await result.response;
        aiReply = response.text().trim();
        
        console.log('✅ Gemini Pro response received successfully');
        
      } catch (geminiErrorCatch) {
        console.error('❌ Gemini API Error:', geminiErrorCatch.message);
        geminiError = geminiErrorCatch.message;
        fallback = true;
        aiReply = generateAdvancedFallbackResponse(message, context, req.user, geminiError);
      }
    } else {
      console.log('⚠️ Gemini not available, using enhanced fallback');
      fallback = true;
      aiReply = generateAdvancedFallbackResponse(message, context, req.user, null);
    }

    // Phân tích AI response để đề xuất hành động
    const actionSuggestion = analyzeForActionSuggestion(message, aiReply);

    res.json({
      reply: aiReply,
      actionSuggestion,
      transactionSuggestion,
      editSuggestion,
      context,
      fallback,
      geminiAvailable,
      geminiError,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Chat Error:', error);
    
    const emergencyResponse = generateEmergencyResponse(req.body.message, req.user, error);
    
    res.json({
      reply: emergencyResponse,
      fallback: true,
      error: error.message,
      geminiAvailable: false,
      timestamp: new Date().toISOString()
    });
  }
});

// ======================== FALLBACK RESPONSES ========================
function generateAdvancedFallbackResponse(message, context, user, geminiError) {
  const lowerMessage = message.toLowerCase();
  const userName = user?.name || 'bạn';

  let statusNotice = '';
  if (geminiError) {
    if (geminiError.includes('API key')) statusNotice = '\n\n🔑 API key Gemini không hợp lệ.';
    else if (geminiError.includes('quota')) statusNotice = '\n\n📊 Đã đạt giới hạn sử dụng hôm nay.';
    else statusNotice = '\n\n⚠️ Gemini AI tạm thời không khả dụng, tôi đang dùng chế độ dự phòng.';
  }

  if (lowerMessage.includes('xin chào') || lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
    return `👋 Xin chào **${userName}**! Tôi là trợ lý tài chính của bạn.

📊 **Tình hình hiện tại:**
- 💼 Số ví: ${context.walletsCount}
- 💰 Tổng số dư: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(context.totalBalance)}
- 🧾 Giao dịch gần đây: ${context.recentTransactionsCount}

Tôi có thể giúp bạn phân tích chi tiêu, gợi ý tiết kiệm hoặc xem thống kê.${statusNotice}`;
  }

  if (lowerMessage.includes('thống kê') || lowerMessage.includes('phân tích')) {
    const advice = context.totalBalance > 1000000 
      ? 'Tình hình tài chính ổn định 👍' 
      : 'Nên tiết kiệm nhiều hơn 💪';

    return `📈 **Phân tích tài chính:**
- Số ví: ${context.walletsCount}
- Tổng số dư: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(context.totalBalance)}
- Giao dịch gần đây: ${context.recentTransactionsCount}

💡 Nhận xét: ${advice}${statusNotice}`;
  }

  return `🤖 Tôi hiểu bạn nói: "${message}"  
Hiện tại bạn có ${context.walletsCount} ví với tổng số dư ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(context.totalBalance)}.  
Bạn có thể hỏi tôi:
• "Phân tích tài chính của tôi"  
• "Gợi ý tiết kiệm"  
• "Xem thống kê giao dịch"${statusNotice}`;
}

// Emergency fallback
function generateEmergencyResponse(message, user, error) {
  const userName = user?.name || 'bạn';
  return `😅 Xin lỗi ${userName}, hệ thống AI đang gặp sự cố.

Lỗi: ${error?.message || 'Unknown error'}

💡 Bạn vẫn có thể:
• Xem Dashboard  
• Quản lý ví, giao dịch  
• Thử lại AI sau vài phút`;
}

// ======================== CREATE TRANSACTION ENDPOINT ========================
// POST /api/ai/create-transaction
// Endpoint mới để tạo giao dịch từ AI suggestion
router.post('/create-transaction', auth, async (req, res) => {
  try {
    const { type, amount, description, categoryId, walletId } = req.body;
    const userId = req.user._id;

    // Validate input
    if (!type || !amount || !walletId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify wallet belongs to user
    const wallet = await Wallet.findOne({ _id: walletId, owner: userId });
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // Verify category if provided
    if (categoryId) {
      const category = await Category.findById(categoryId);
      if (!category) {
        return res.status(404).json({ error: 'Category not found' });
      }
    }

    // Create transaction
    const transaction = new Transaction({
      wallet: walletId,
      type,
      amount,
      description: description || 'Giao dịch từ AI',
      category: categoryId || null,
      date: new Date(),
      createdAt: new Date()
    });

    await transaction.save();

    // Update wallet balance
    if (type === 'income') {
      wallet.initialBalance = (wallet.initialBalance || 0) + amount;
    } else {
      wallet.initialBalance = (wallet.initialBalance || 0) - amount;
    }
    await wallet.save();

    // Populate transaction for response
    await transaction.populate('wallet', 'name');
    await transaction.populate('category', 'name icon type');

    console.log('✅ Transaction created from AI suggestion:', transaction._id);

    res.json({
      success: true,
      message: 'Tạo giao dịch thành công',
      transaction
    });

  } catch (error) {
    console.error('❌ Error creating transaction:', error);
    res.status(500).json({ 
      error: 'Không thể tạo giao dịch',
      details: error.message 
    });
  }
});

// THÊM: Helper: Phân tích ý định sửa giao dịch
async function analyzeEditTransactionIntent(message, userId, wallets, categories, model) {
  try {
    // Lấy danh sách giao dịch gần đây để AI có context
    const Transaction = require('../models/Transaction');
    const recentTransactions = await Transaction.find({ 
      wallet: { $in: wallets.map(w => w._id) } 
    })
      .populate('wallet', 'name')
      .populate('category', 'name icon type')
      .sort({ createdAt: -1 })
      .limit(20);

    const analysisPrompt = `
Bạn là AI phân tích ý định sửa giao dịch tài chính. Phân tích câu nói sau và xác định xem người dùng có muốn SỬA giao dịch nào không.

DANH SÁCH GIAO DỊCH GẦN ĐÂY:
${recentTransactions.map((t, idx) => `${idx + 1}. ${t.description || 'Giao dịch'} - ${t.amount} VND - ${t.type === 'income' ? 'Thu nhập' : 'Chi tiêu'} - Ngày: ${new Date(t.date || t.createdAt).toLocaleDateString('vi-VN')} - Ví: ${t.wallet?.name} (ID: ${t._id})`).join('\n')}

DANH SÁCH VÍ CÓ SẴN:
${wallets.map(w => `- ${w.name} (ID: ${w._id})`).join('\n')}

DANH MỤC CÓ SẴN:
${categories.map(c => `- ${c.name} (${c.type === 'expense' ? 'Chi tiêu' : 'Thu nhập'}) - Icon: ${c.icon} (ID: ${c._id})`).join('\n')}

CÂU NÓI CỦA NGƯỜI DÙNG: "${message}"

HƯỚNG DẪN PHÂN TÍCH:
1. Xác định xem có ý định SỬA giao dịch không (từ khóa: sửa, chỉnh, thay đổi, cập nhật, đổi)
2. Tìm giao dịch cần sửa dựa trên:
   - Mô tả/tên giao dịch (ưu tiên)
   - Số tiền
   - Ngày giao dịch
   - Loại giao dịch (thu/chi)
3. Xác định thông tin cần sửa:
   - Số tiền mới
   - Mô tả mới
   - Danh mục mới
   - Ngày mới
4. Nếu tìm thấy NHIỀU giao dịch giống nhau, trả về DANH SÁCH để người dùng chọn

VÍ DỤ:
- "Sửa giao dịch mua cafe thành 60k" → Tìm giao dịch "cafe", đổi số tiền thành 60000
- "Đổi mô tả giao dịch 50k thành ăn sáng" → Tìm giao dịch 50k, đổi mô tả
- "Cập nhật giao dịch hôm qua thành 100k" → Tìm giao dịch ngày hôm qua, đổi số tiền

Trả về JSON với format sau (KHÔNG thêm markdown):
{
  "hasEditIntent": true/false,
  "foundTransactions": [
    {
      "id": "transaction_id",
      "description": "mô tả hiện tại",
      "amount": số tiền hiện tại,
      "date": "ngày",
      "wallet": "tên ví",
      "category": "tên danh mục"
    }
  ],
  "multipleMatches": true/false,
  "updates": {
    "amount": số tiền mới (nếu có),
    "description": "mô tả mới" (nếu có),
    "categoryId": "ID danh mục mới" (nếu có),
    "date": "ngày mới" (nếu có)
  },
  "confidence": độ tự tin 0-1,
  "reasoning": "giải thích ngắn gọn"
}

CHÚ Ý:
- Nếu tìm thấy 1 giao dịch duy nhất: multipleMatches = false, trả về giao dịch đó
- Nếu tìm thấy nhiều giao dịch: multipleMatches = true, trả về tất cả
- Nếu không tìm thấy: hasEditIntent = true nhưng foundTransactions = []
`;

    const result = await model.generateContent(analysisPrompt);
    const response = await result.response;
    let text = response.text().trim();
    
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    console.log('🔍 Edit intent analysis:', text);
    
    const analysis = JSON.parse(text);
    
    if (analysis.hasEditIntent && analysis.confidence > 0.6) {
      return {
        success: true,
        editIntent: {
          foundTransactions: analysis.foundTransactions || [],
          multipleMatches: analysis.multipleMatches || false,
          updates: analysis.updates || {},
          confidence: analysis.confidence,
          reasoning: analysis.reasoning
        }
      };
    }
    
    return { success: false, reason: 'Không phát hiện ý định sửa giao dịch' };
    
  } catch (error) {
    console.error('Error analyzing edit intent:', error);
    return { success: false, reason: error.message };
  }
}

// POST /api/ai/chat - Cập nhật để phát hiện ý định sửa
router.post('/chat', auth, async (req, res) => {
  try {
    const { message, conversationHistory = [], selectedWalletId } = req.body; // THÊM: nhận selectedWalletId từ frontend
    const userId = req.user._id;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Lấy thông tin context của user
    const wallets = await Wallet.find({ owner: userId }).populate('categories');
    const categories = await Category.find({ 
      $or: [{ isDefault: true }, { user: userId }] 
    });
    
    const recentTransactions = await Transaction.find({ 
      wallet: { $in: wallets.map(w => w._id) } 
    })
      .populate('wallet', 'name')
      .populate('category', 'name type')
      .sort({ createdAt: -1 })
      .limit(15);

    // Context cho response
    const context = {
      walletsCount: wallets.length,
      totalBalance: wallets.reduce((sum, w) => sum + (w.initialBalance || 0), 0),
      recentTransactionsCount: recentTransactions.length
    };

    let aiReply = '';
    let fallback = false;
    let geminiError = null;
    let transactionSuggestion = null;
    let editSuggestion = null;

    if (geminiAvailable && model) {
      try {
        console.log('🤖 Sending request to Gemini Pro...');
        
        // THÊM: Kiểm tra ý định sửa giao dịch TRƯỚC
        const lowerMessage = message.toLowerCase();
        if (lowerMessage.includes('sửa') || lowerMessage.includes('chỉnh') || 
            lowerMessage.includes('thay đổi') || lowerMessage.includes('cập nhật') || 
            lowerMessage.includes('đổi')) {
          
          const editAnalysis = await analyzeEditTransactionIntent(
            message, 
            userId, 
            wallets, 
            categories, 
            model
          );
          
          if (editAnalysis.success) {
            editSuggestion = editAnalysis.editIntent;
            console.log('✏️ Edit intent detected:', editSuggestion);
          }
        }
        
        // THAY ĐỔI: Nếu không phải sửa, phân tích tạo giao dịch - KHÔNG tự động chọn ví, KHÔNG chọn danh mục
        if (!editSuggestion) {
          // Chỉ trích xuất type, amount, description - KHÔNG phân tích category và wallet
          const intentAnalysis = await analyzeBasicTransactionIntent(
            message, 
            model
          );
          
          if (intentAnalysis.success) {
            transactionSuggestion = {
              type: intentAnalysis.type,
              amount: intentAnalysis.amount,
              description: intentAnalysis.description,
              categoryId: null, // Sẽ được xác định sau khi user chọn ví
              categoryName: null,
              walletId: null,
              walletName: null,
              confidence: intentAnalysis.confidence,
              reasoning: intentAnalysis.reasoning
            };
            console.log('💡 Transaction intent detected:', transactionSuggestion);
          }
        }
        
        // Tạo context prompt cho Gemini
        const contextPrompt = `
Bạn là trợ lý tài chính cá nhân thông minh và thân thiện. Hãy trả lời câu hỏi của người dùng một cách tự nhiên, hữu ích và cụ thể.

THÔNG TIN NGƯỜI DÙNG:
- Tên: ${req.user.name || 'Người dùng'}
- Email: ${req.user.email || 'Không có'}

TÌNH HÌNH TÀI CHÍNH HIỆN TẠI:
- Số ví đang quản lý: ${wallets.length}
- Tổng số dư hiện tại: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(context.totalBalance)}

DANH SÁCH VÍ:
${wallets.map(w => `- ${w.name}: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(w.initialBalance || 0)}`).join('\n')}

GIAO DỊCH GẦN ĐÂY (${recentTransactions.length} giao dịch):
${recentTransactions.slice(0, 10).map(t => `- ${t.title}: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(t.amount)} (${t.type === 'income' ? 'Thu nhập' : 'Chi tiêu'})`).join('\n')}

${editSuggestion ? `
QUAN TRỌNG: Tôi đã phát hiện người dùng muốn SỬA giao dịch:
${editSuggestion.multipleMatches 
  ? `- Tìm thấy ${editSuggestion.foundTransactions.length} giao dịch tương tự. Hãy yêu cầu người dùng chọn giao dịch cụ thể.`
  : editSuggestion.foundTransactions.length === 1
    ? `- Tìm thấy giao dịch: ${editSuggestion.foundTransactions[0].description} - ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(editSuggestion.foundTransactions[0].amount)}
- Cập nhật: ${JSON.stringify(editSuggestion.updates)}
Hãy xác nhận với người dùng và chuẩn bị cập nhật giao dịch này.`
    : `- Không tìm thấy giao dịch phù hợp. Hãy yêu cầu người dùng cung cấp thêm thông tin.`
}
` : transactionSuggestion ? `
QUAN TRỌNG: Tôi đã phát hiện người dùng muốn tạo giao dịch MỚI:
- Loại: ${transactionSuggestion.type === 'expense' ? 'Chi tiêu' : 'Thu nhập'}
- Số tiền: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(transactionSuggestion.amount)}
- Mô tả: ${transactionSuggestion.description}
Hãy xác nhận với người dùng.
` : ''}

CÂU HỎI HIỆN TẠI: ${message}

Hãy trả lời một cách chi tiết, hữu ích và cá nhân hóa.
`;

        // Gọi Gemini API với timeout
        const result = await Promise.race([
          model.generateContent(contextPrompt),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Gemini API timeout after 20 seconds')), 20000)
          )
        ]);
        
        const response = await result.response;
        aiReply = response.text().trim();
        
        console.log('✅ Gemini Pro response received successfully');
        
      } catch (geminiErrorCatch) {
        console.error('❌ Gemini API Error:', geminiErrorCatch.message);
        geminiError = geminiErrorCatch.message;
        fallback = true;
        aiReply = generateAdvancedFallbackResponse(message, context, req.user, geminiError);
      }
    } else {
      console.log('⚠️ Gemini not available, using enhanced fallback');
      fallback = true;
      aiReply = generateAdvancedFallbackResponse(message, context, req.user, null);
    }

    // Phân tích AI response để đề xuất hành động
    const actionSuggestion = analyzeForActionSuggestion(message, aiReply);

    res.json({
      reply: aiReply,
      actionSuggestion,
      transactionSuggestion,
      editSuggestion,
      context,
      fallback,
      geminiAvailable,
      geminiError,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Chat Error:', error);
    
    const emergencyResponse = generateEmergencyResponse(req.body.message, req.user, error);
    
    res.json({
      reply: emergencyResponse,
      fallback: true,
      error: error.message,
      geminiAvailable: false,
      timestamp: new Date().toISOString()
    });
  }
});

// THÊM: Helper mới - chỉ phân tích cơ bản (type, amount, description)
async function analyzeBasicTransactionIntent(message, model) {
  try {
    const analysisPrompt = `
Bạn là AI phân tích ý định giao dịch tài chính. Phân tích câu nói sau và trích xuất THÔNG TIN CƠ BẢN.

**QUAN TRỌNG:** CHỈ phân tích loại giao dịch (thu/chi), số tiền và mô tả. KHÔNG phân tích danh mục hay ví.

CÂU NÓI CỦA NGƯỜI DÙNG: "${message}"

HƯỚNG DẪN PHÂN TÍCH:
1. Xác định loại giao dịch: "expense" (chi tiêu) hoặc "income" (thu nhập)
2. Trích xuất số tiền chính xác (chuyển đổi k, nghìn, triệu)
3. Tạo mô tả ngắn gọn dựa trên câu nói

VÍ DỤ:
- "ăn tối 20k" → expense, 20000, "ăn tối"
- "mua cafe 50 nghìn" → expense, 50000, "mua cafe"
- "nhận lương 10 triệu" → income, 10000000, "nhận lương"
- "đổ xăng 200k" → expense, 200000, "đổ xăng"

Trả về JSON (KHÔNG markdown, CHỈ JSON):
{
  "hasIntent": true/false,
  "type": "expense" hoặc "income",
  "amount": số tiền (số, không đơn vị),
  "description": "mô tả ngắn gọn",
  "confidence": độ tự tin 0-1,
  "reasoning": "giải thích ngắn"
}

CHÚ Ý:
- k = 1000, nghìn/ngàn = 1000, triệu/tr = 1000000
- Tự động nhận dạng chi tiêu (mua, ăn, đổ, trả) vs thu nhập (lương, thưởng, nhận)
`;

    const result = await model.generateContent(analysisPrompt);
    const response = await result.response;
    let text = response.text().trim();
    
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    console.log('🤖 Basic analysis:', text);
    
    const analysis = JSON.parse(text);
    
    if (analysis.hasIntent && analysis.confidence > 0.6) {
      return {
        success: true,
        type: analysis.type,
        amount: analysis.amount,
        description: analysis.description,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning
      };
    }
    
    return { success: false, reason: 'Không đủ thông tin' };
    
  } catch (error) {
    console.error('Error in basic analysis:', error);
    return { success: false, reason: error.message };
  }
}

// THÊM: Endpoint mới - phân tích danh mục dựa trên ví đã chọn
router.post('/analyze-category-for-wallet', auth, async (req, res) => {
  try {
    const { message, walletId } = req.body;
    const userId = req.user._id;

    if (!message || !walletId) {
      return res.status(400).json({ error: 'Message and walletId are required' });
    }

    // Lấy ví và danh mục của ví đó
    const wallet = await Wallet.findOne({ _id: walletId, owner: userId }).populate('categories');
    
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // Lấy danh mục từ ví
    const walletCategories = [];
    
    // Thêm danh mục mặc định
    const defaultCategories = await Category.find({ isDefault: true });
    walletCategories.push(...defaultCategories);
    
    // Thêm danh mục riêng của ví
    if (wallet.categories && Array.isArray(wallet.categories)) {
      wallet.categories.forEach(cat => {
        const categoryObj = typeof cat === 'object' ? cat : null;
        if (categoryObj && categoryObj._id) {
          const exists = walletCategories.some(c => String(c._id) === String(categoryObj._id));
          if (!exists) {
            walletCategories.push(categoryObj);
          }
        }
      });
    }

    console.log(`📋 Analyzing category for wallet "${wallet.name}" with ${walletCategories.length} categories`);

    // Phân tích danh mục với Gemini
    if (!geminiAvailable || !model) {
      return res.json({
        categoryId: null,
        categoryName: null,
        confidence: 0,
        reasoning: 'Gemini AI không khả dụng'
      });
    }

    const categoryPrompt = `
Bạn là AI phân tích danh mục cho giao dịch tài chính.

DANH MỤC CÓ TRONG VÍ "${wallet.name}":
${walletCategories.map(c => `- ${c.name} (${c.type === 'expense' ? 'Chi tiêu' : 'Thu nhập'}) - ${c.icon || '📝'} - Mô tả: ${c.description || 'Không có'} (ID: ${c._id})`).join('\n')}

CÂU NÓI: "${message}"

**QUAN TRỌNG:** 
- CHỈ chọn danh mục TỪ DANH SÁCH TRÊN
- Nếu không tìm thấy danh mục phù hợp, trả về categoryId = null

MAPPING KEYWORDS:
- Ăn, uống, cafe, cơm, bún, phở → "Ăn uống"
- Xăng, xe, taxi, grab → "Đi lại" / "Xe cộ"
- Quần áo, giày dép → "Mua sắm" / "Quần áo"
- Điện, nước, internet → "Hóa đơn" / "Tiện ích"
- Phim, game → "Giải trí"
- Lương, thưởng → "Lương" / "Thu nhập"

Trả về JSON (KHÔNG markdown):
{
  "categoryId": "ID của danh mục" hoặc null,
  "categoryName": "Tên danh mục" hoặc null,
  "confidence": độ tự tin 0-1,
  "reasoning": "giải thích tại sao chọn danh mục này"
}
`;

    const result = await model.generateContent(categoryPrompt);
    const response = await result.response;
    let text = response.text().trim();
    
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    console.log('🤖 Category analysis result:', text);
    
    const analysis = JSON.parse(text);
    
    // Validate category exists in wallet
    if (analysis.categoryId) {
      const categoryExists = walletCategories.some(c => String(c._id) === String(analysis.categoryId));
      if (!categoryExists) {
        console.warn('⚠️ Category không tồn tại trong ví, set về null');
        analysis.categoryId = null;
        analysis.categoryName = null;
      }
    }

    res.json({
      categoryId: analysis.categoryId,
      categoryName: analysis.categoryName,
      confidence: analysis.confidence || 0,
      reasoning: analysis.reasoning || 'AI đã phân tích dựa trên danh mục có trong ví'
    });

  } catch (error) {
    console.error('❌ Error analyzing category:', error);
    res.status(500).json({ 
      error: 'Không thể phân tích danh mục',
      details: error.message 
    });
  }
});

module.exports = router;
