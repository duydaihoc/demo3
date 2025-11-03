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
    const { message, conversationHistory = [], selectedWalletId, pendingTransaction } = req.body;
    const userId = req.user._id;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // THÊM: Kiểm tra incomplete transaction TRƯỚC
    const incompleteCheck = detectIncompleteTransaction(message, pendingTransaction);
    
    if (incompleteCheck.complete && incompleteCheck.transaction) {
      // Có đủ thông tin rồi, phân tích category
      const wallets = await Wallet.find({ owner: userId }).populate('categories');
      const categories = await Category.find({ 
        $or: [{ isDefault: true }, { user: userId }] 
      });
      
      let categoryId = null;
      let categoryName = null;
      
      // SỬA: Phân tích category bằng fullContext (description + số tiền)
      if (geminiAvailable && model) {
        try {
          // SỬA: Sử dụng fullContext thay vì chỉ description
          const contextForAnalysis = incompleteCheck.transaction.fullContext || incompleteCheck.transaction.description;
          
          console.log('🔍 Analyzing category with full context:', contextForAnalysis);
          
          const categoryAnalysis = await analyzeCategoryForMessage(
            contextForAnalysis,
            categories,
            model
          );
          categoryId = categoryAnalysis.categoryId;
          categoryName = categoryAnalysis.categoryName;
          
          console.log('✅ Category analysis result:', { categoryId, categoryName });
        } catch (error) {
          console.log('⚠️ Category analysis failed, using fallback');
          // Fallback analysis với full context
          const fallbackResult = analyzeCategoryWithFallback(
            incompleteCheck.transaction.fullContext || incompleteCheck.transaction.description,
            categories
          );
          categoryId = fallbackResult.categoryId;
          categoryName = fallbackResult.categoryName;
        }
      } else {
        // Fallback AI trực tiếp với full context
        const fallbackResult = analyzeCategoryWithFallback(
          incompleteCheck.transaction.fullContext || incompleteCheck.transaction.description,
          categories
        );
        categoryId = fallbackResult.categoryId;
        categoryName = fallbackResult.categoryName;
      }
      
      // Trả về transaction suggestion đầy đủ
      return res.json({
        reply: `✅ **Đã ghi nhận thông tin giao dịch:**

📝 ${incompleteCheck.transaction.description}
💰 ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(incompleteCheck.transaction.amount)}
${incompleteCheck.transaction.type === 'income' ? '💵 Thu nhập' : '💸 Chi tiêu'}
${categoryName ? `📊 ${categoryName}` : ''}

✨ Hãy xác nhận để tạo giao dịch!`,
        transactionSuggestion: {
          type: incompleteCheck.transaction.type,
          amount: incompleteCheck.transaction.amount,
          description: incompleteCheck.transaction.description,
          categoryId: categoryId,
          categoryName: categoryName,
          confidence: 0.85,
          reasoning: 'Đã bổ sung đầy đủ thông tin từ cuộc hội thoại'
        },
        needsMoreInfo: false,
        geminiAvailable,
        timestamp: new Date().toISOString()
      });
    }
    
    if (incompleteCheck.missing === 'amount' && incompleteCheck.pendingTransaction) {
      // Thiếu số tiền, hỏi lại
      const promptReply = generateMissingInfoPrompt(incompleteCheck.pendingTransaction);
      
      return res.json({
        reply: promptReply,
        needsMoreInfo: true,
        pendingTransaction: incompleteCheck.pendingTransaction,
        geminiAvailable,
        timestamp: new Date().toISOString()
      });
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
  const lowerMessage = message.toLowerCase().trim();
  
  // Enhanced fallback với quota detection
  let quotaMessage = '';
  if (geminiError && geminiError.includes('quota')) {
    quotaMessage = '\n\n🚫 **Đã hết quota Gemini API hôm nay** (200 requests miễn phí). Đang sử dụng AI dự phòng thông minh.\n\n💡 **Để có trải nghiệm tốt hất:** Có thể nâng cấp lên Gemini Pro hoặc chờ reset quota vào ngày mai.';
  }
  
  // Analyze transaction intent with fallback
  const transactionAnalysis = analyzeTransactionWithFallback(message);
  
  if (transactionAnalysis && transactionAnalysis.success) {
    return `🤖 **AI Dự phòng thông minh đã phân tích:**

📝 **Giao dịch được phát hiện:**
• Loại: ${transactionAnalysis.type === 'expense' ? '💸 Chi tiêu' : '💰 Thu nhập'}
• Số tiền: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(transactionAnalysis.amount)}
• Mô tả: ${transactionAnalysis.description}
• Độ tin cậy: ${Math.round(transactionAnalysis.confidence * 100)}%

💡 **Để tạo giao dịch:** Hãy chọn ví và danh mục phù hợp từ giao diện xác nhận.${quotaMessage}

🔮 **AI dự phòng:** Tôi có thể phân tích và tạo giao dịch cơ bản, trả lời câu hỏi về tài chính dựa trên dữ liệu thực tế của bạn!`;
  }
  
  // Financial advice and analysis
  if (lowerMessage.includes('tình hình') || lowerMessage.includes('phân tích') || lowerMessage.includes('tài chính')) {
    return `📊 **Tình hình tài chính hiện tại:**

💼 **Tổng quan:**
• Số ví đang quản lý: ${context.walletsCount}
• Tổng số dư: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(context.totalBalance)}
• Giao dịch gần đây: ${context.recentTransactionsCount} giao dịch

💡 **Gợi ý từ AI dự phòng:**
• Theo dõi chi tiêu hàng ngày để kiểm soát tốt hơn
• Đặt ngân sách cho từng danh mục
• Xem xét tăng tiết kiệm nếu có thể${quotaMessage}

🎯 **Để phân tích chi tiết hơn:** Hãy hỏi về danh mục cụ thể hoặc khoảng thời gian nhất định.`;
  }
  
  // Savings advice
  if (lowerMessage.includes('tiết kiệm') || lowerMessage.includes('save')) {
    return `💰 **Lời khuyên tiết kiệm từ AI dự phòng:**

🎯 **Nguyên tắc 50-30-20:**
• 50% cho chi tiêu thiết yếu
• 30% cho giải trí và mua sắm
• 20% cho tiết kiệm và đầu tư

📈 **Chiến lược thông minh:**
• Tự động chuyển tiền tiết kiệm ngay khi có lương
• Cắt giảm các khoản chi không cần thiết
• Theo dõi chi tiêu qua ứng dụng này

💡 **Với số dư hiện tại ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(context.totalBalance)}:**
Bạn có thể bắt đầu tiết kiệm 10-15% tổng thu nhập.${quotaMessage}`;
  }
  
  // Investment advice
  if (lowerMessage.includes('đầu tư') || lowerMessage.includes('invest')) {
    return `📈 **Tư vấn đầu tư cơ bản từ AI:**

🎯 **Nguyên tắc đầu tư thông minh:**
• Chỉ đầu tư số tiền có thể chấp nhận mất
• Đa dạng hóa danh mục đầu tư
• Đầu tư dài hạn (3-5 năm+)

💼 **Các kênh phù hợp:**
• Gửi tiết kiệm ngân hàng (an toàn)
• Trái phiếu chính phủ (ổn định)
• Quỹ đầu tư (cân bằng rủi ro)
• Vàng (bảo toàn giá trị)

⚠️ **Lưu ý:** Đây chỉ là thông tin tham khảo. Hãy tự nghiên cứu hoặc tham khảo chuyên gia tài chính.${quotaMessage}`;
  }
  
  // Default response
  return `🤖 **AI Dự phòng thông minh** ${user?.name ? `xin chào ${user.name}` : 'xin chào'}!

💡 **Tôi có thể giúp bạn:**
• 📝 Tạo giao dịch (vd: "ăn tối 50k", "nhận lương 10 triệu")
• 📊 Phân tích tình hình tài chính
• 💰 Tư vấn tiết kiệm và đầu tư
• 📈 Theo dõi chi tiêu theo danh mục
• ✏️ Sửa đổi giao dịch đã tạo

🎯 **Thống kê hiện tại:**
• ${context.walletsCount} ví đang quản lý
• ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(context.totalBalance)} tổng số dư
• ${context.recentTransactionsCount} giao dịch gần đây${quotaMessage}

💬 **Hãy thử hỏi:** "Phân tích chi tiêu tháng này" hoặc "Tôi nên tiết kiệm thế nào?"`;
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

// THÊM: Helper function để phát hiện thiếu thông tin giao dịch
function detectIncompleteTransaction(message, pendingTransaction = null) {
  try {
    const lowerMessage = message.toLowerCase().trim();
    
    // Nếu đang có pending transaction, check xem message có cung cấp thông tin còn thiếu không
    if (pendingTransaction) {
      // Kiểm tra có số tiền không
      const amount = extractAmount(message);
      if (amount) {
        return {
          complete: true,
          transaction: {
            ...pendingTransaction,
            amount: amount,
            // THÊM: Kết hợp description gốc với message mới để có context đầy đủ
            fullContext: `${pendingTransaction.description} ${message}`.trim()
          }
        };
      }
      
      return {
        complete: false,
        missing: 'amount',
        pendingTransaction: pendingTransaction
      };
    }
    
    // SỬA: Phát hiện ý định tạo giao dịch mới - BAO GỒM CẢ THU NHẬP
    const expenseKeywords = ['tạo', 'thêm', 'ghi', 'ăn', 'mua', 'chi', 'trả', 'đổ', 'mua sắm'];
    const incomeKeywords = ['thu', 'nhận', 'lương', 'thưởng', 'kiếm', 'bán', 'thu nhập', 'nhận tiền'];
    
    const hasExpenseIntent = expenseKeywords.some(keyword => lowerMessage.includes(keyword));
    const hasIncomeIntent = incomeKeywords.some(keyword => lowerMessage.includes(keyword));
    const hasTransactionIntent = hasExpenseIntent || hasIncomeIntent;
    
    if (hasTransactionIntent) {
      const amount = extractAmount(message);
      
      // Nếu không có số tiền, tạo pending transaction
      if (!amount) {
        // Trích xuất mô tả từ message
        let description = message.trim();
        // Loại bỏ các từ khóa tạo giao dịch
        const removeKeywords = [
          'tạo giao dịch', 'thêm giao dịch', 'ghi giao dịch', 
          'tạo', 'thêm', 'ghi', 'nhận', 'thu'
        ];
        removeKeywords.forEach(keyword => {
          description = description.replace(new RegExp(keyword, 'gi'), '').trim();
        });
        
        // SỬA: Xác định type dựa trên keywords - ƯU TIÊN income keywords
        let type = 'expense'; // default
        
        // Check income TRƯỚC để ưu tiên nhận diện thu nhập
        for (const keyword of incomeKeywords) {
          if (lowerMessage.includes(keyword)) {
            type = 'income';
            break;
          }
        }
        
        console.log(`🔍 Detected incomplete transaction: type=${type}, description="${description}"`);
        
        return {
          complete: false,
          missing: 'amount',
          pendingTransaction: {
            type: type,
            description: description || (type === 'income' ? 'Thu nhập' : 'Giao dịch'),
            hasDescription: !!description
          }
        };
      }
    }
    
    return { complete: false, missing: null };
  } catch (error) {
    console.error('Error detecting incomplete transaction:', error);
    return { complete: false, missing: null };
  }
}

// THÊM: Helper function tạo prompt hỏi thông tin còn thiếu
function generateMissingInfoPrompt(pendingTransaction) {
  if (!pendingTransaction) return null;
  
  const { type, description } = pendingTransaction;
  
  return `💡 **Tôi hiểu bạn muốn tạo giao dịch:**

📝 ${description || 'Giao dịch'}
${type === 'income' ? '💰 Thu nhập' : '💸 Chi tiêu'}

❓ **Số tiền là bao nhiêu?**

Ví dụ: "50k", "50 nghìn", "500.000đ", "2 triệu"`;
}

// THÊM: Enhanced fallback AI cho transaction analysis
function analyzeTransactionWithFallback(message) {
  try {
    const lowerMessage = message.toLowerCase().trim();
    
    // Extract amount using regex
    const amountPatterns = [
      /(\d+(?:\.\d+)?)\s*(?:k|nghìn|ngàn)/gi,
      /(\d+(?:\.\d+)?)\s*(?:tr|triệu)/gi,
      /(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:đ|vnd|dong)/gi,
      /(\d+(?:,\d{3})*(?:\.\d+)?)/g
    ];
    
    let amount = 0;
    let foundAmount = false;
    
    for (const pattern of amountPatterns) {
      const matches = lowerMessage.match(pattern);
      if (matches) {
        const match = matches[0];
        let num = parseFloat(match.replace(/[^\d.]/g, ''));
        
        if (match.includes('k') || match.includes('nghìn') || match.includes('ngàn')) {
          num *= 1000;
        } else if (match.includes('tr') || match.includes('triệu')) {
          num *= 1000000;
        }
        
        if (num > 0) {
          amount = num;
          foundAmount = true;
          break;
        }
      }
    }
    
    if (!foundAmount) return null;
    
    // Determine transaction type
    const expenseKeywords = ['mua', 'chi', 'trả', 'ăn', 'uống', 'cafe', 'cơm', 'phở', 'bún', 'đổ xăng', 'xăng', 'grab', 'taxi', 'thuốc', 'điện', 'nước', 'internet', 'mua sắm', 'quần áo', 'giày', 'phim', 'game'];
    const incomeKeywords = ['nhận', 'lương', 'thưởng', 'thu', 'bán', 'kiếm'];
    
    let type = 'expense'; // default
    
    for (const keyword of incomeKeywords) {
      if (lowerMessage.includes(keyword)) {
        type = 'income';
        break;
      }
    }
    
    // Extract description
    let description = message.trim();
    // Remove amount from description
    for (const pattern of amountPatterns) {
      description = description.replace(pattern, '').trim();
    }
    
    // Clean up description
    description = description.replace(/\s+/g, ' ').trim();
    if (!description) {
      description = type === 'income' ? 'Thu nhập' : 'Chi tiêu';
    }
    
    return {
      success: true,
      type,
      amount,
      description,
      confidence: 0.8,
      reasoning: 'Phân tích bằng AI dự phòng thông minh'
    };
    
  } catch (error) {
    console.error('Fallback AI error:', error);
    return null;
  }
}

// THÊM: Enhanced fallback category analysis
function analyzeCategoryWithFallback(message, categories) {
  try {
    const lowerMessage = message.toLowerCase().trim();
    
    // Category mapping
    const categoryMappings = {
      'ăn uống': ['ăn', 'uống', 'cafe', 'cơm', 'phở', 'bún', 'trà', 'nước', 'nhậu', 'bar', 'nhà hàng', 'quán', 'tối', 'sáng', 'trưa', 'ăn vặt'],
      'đi lại': ['xe', 'xăng', 'đổ xăng', 'taxi', 'grab', 'bus', 'tàu', 'máy bay', 'vé', 'đi', 'về', 'đường'],
      'mua sắm': ['mua', 'shopping', 'quần áo', 'giày', 'túi', 'phụ kiện', 'đồ', 'sắm'],
      'giải trí': ['phim', 'game', 'vui chơi', 'giải trí', 'karaoke', 'du lịch', 'picnic'],
      'sức khỏe': ['thuốc', 'bệnh viện', 'khám', 'chữa', 'y tế', 'sức khỏe', 'dental'],
      'hóa đơn': ['điện', 'nước', 'internet', 'điện thoại', 'wifi', 'cáp', 'gas'],
      'học tập': ['học', 'sách', 'khóa học', 'học phí', 'giáo dục'],
      'lương': ['lương', 'thưởng', 'bonus', 'salary', 'nhận lương']
    };
    
    // Find best matching category
    let bestMatch = null;
    let maxScore = 0;
    
    categories.forEach(category => {
      const categoryName = category.name.toLowerCase();
      let score = 0;
      
      // Direct name match
      if (lowerMessage.includes(categoryName)) {
        score += 10;
      }
      
      // Keyword mapping match
      const mapping = categoryMappings[categoryName] || [];
      mapping.forEach(keyword => {
        if (lowerMessage.includes(keyword)) {
          score += 5;
        }
      });
      
      // Icon-based matching (if available)
      if (category.icon) {
        const iconMappings = {
          '🍔': ['ăn', 'cơm', 'phở'],
          '☕': ['cafe', 'trà', 'uống'],
          '🚗': ['xe', 'xăng', 'đi'],
          '🛍️': ['mua', 'shopping'],
          '🎮': ['game', 'chơi'],
          '🏥': ['thuốc', 'bệnh'],
          '💡': ['điện'],
          '📚': ['học', 'sách']
        };
        
        const iconKeywords = iconMappings[category.icon] || [];
        iconKeywords.forEach(keyword => {
          if (lowerMessage.includes(keyword)) {
            score += 3;
          }
        });
      }
      
      if (score > maxScore) {
        maxScore = score;
        bestMatch = category;
      }
    });
    
    if (maxScore > 0) {
      return {
        categoryId: bestMatch._id,
        categoryName: bestMatch.name,
        confidence: Math.min(maxScore / 10, 1),
        reasoning: `Fallback AI tìm thấy danh mục phù hợp: ${bestMatch.name}`
      };
    }
    
    return {
      categoryId: null,
      categoryName: null,
      confidence: 0,
      reasoning: 'Fallback AI không tìm thấy danh mục phù hợp'
    };
    
  } catch (error) {
    console.error('Fallback category analysis error:', error);
    return {
      categoryId: null,
      categoryName: null,
      confidence: 0,
      reasoning: 'Lỗi phân tích danh mục'
    };
  }
}

// THÊM: Enhanced error handling với quota detection
function handleGeminiError(error) {
  console.error('Gemini API Error:', error);
  
  const errorMessage = error.message || '';
  const isQuotaExceeded = errorMessage.includes('429') || 
                         errorMessage.includes('quota') || 
                         errorMessage.includes('Too Many Requests') ||
                         errorMessage.includes('exceeded your current quota');
  
  const isRateLimit = errorMessage.includes('rate limit') || 
                     errorMessage.includes('requests per');
  
  if (isQuotaExceeded) {
    console.log('🚫 Gemini quota exceeded - switching to enhanced fallback AI');
    return {
      error: 'quota_exceeded',
      message: 'Đã vượt quá giới hạn API Gemini hôm nay. Đang sử dụng AI dự phòng thông minh.',
      fallback: true
    };
  }
  
  if (isRateLimit) {
    console.log('⏰ Gemini rate limit - switching to enhanced fallback AI');
    return {
      error: 'rate_limit',
      message: 'Tạm thời vượt quá tốc độ gọi API. Đang sử dụng AI dự phòng.',
      fallback: true
    };
  }
  
  return {
    error: 'general_error',
    message: 'Lỗi kết nối Gemini AI. Đang sử dụng AI dự phòng.',
    fallback: true
  };
}

// CẬP NHẬT: analyzeBasicTransactionIntent với fallback
async function analyzeBasicTransactionIntent(message, model) {
  try {
    // Try Gemini first
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
    
    console.log('🤖 Gemini basic analysis:', text);
    
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
    console.error('❌ Gemini basic analysis failed:', error.message);
    
    // Handle specific errors
    const errorInfo = handleGeminiError(error);
    
    // Try fallback AI
    console.log('🔄 Attempting enhanced fallback analysis...');
    const fallbackResult = analyzeTransactionWithFallback(message);
    
    if (fallbackResult) {
      console.log('✅ Fallback AI successful:', fallbackResult);
      return fallbackResult;
    }
    
    return { 
      success: false, 
      reason: errorInfo.message,
      errorType: errorInfo.error
    };
  }
}

// THÊM: Helper function phân tích category từ message
async function analyzeCategoryForMessage(description, categories, model) {
  try {
    const expenseCategories = categories.filter(c => c.type === 'expense' || !c.type);
    const incomeCategories = categories.filter(c => c.type === 'income');
    
    const prompt = `
Phân tích mô tả giao dịch và chọn danh mục phù hợp nhất.

DANH MỤC CHI TIÊU:
${expenseCategories.map(c => `- ${c.name} (${c.icon || '📝'}) (ID: ${c._id})`).join('\n')}

DANH MỤC THU NHẬP:
${incomeCategories.map(c => `- ${c.name} (${c.icon || '💰'}) (ID: ${c._id})`).join('\n')}

MÔ TẢ GIAO DỊCH: "${description}"

Trả về JSON (KHÔNG markdown):
{
  "categoryId": "ID danh mục" hoặc null,
  "categoryName": "Tên danh mục" hoặc null,
  "confidence": 0-1
}
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text().trim().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    const analysis = JSON.parse(text);
    return {
      categoryId: analysis.categoryId || null,
      categoryName: analysis.categoryName || null,
      confidence: analysis.confidence || 0
    };
  } catch (error) {
    console.error('Error analyzing category:', error);
    // Fallback
    const fallbackResult = analyzeCategoryWithFallback(description, categories);
    return {
      categoryId: fallbackResult.categoryId,
      categoryName: fallbackResult.categoryName,
      confidence: fallbackResult.confidence
    };
  }
}

// CẬP NHẬT: POST /api/ai/analyze-category-for-wallet với fallback
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

    // Try Gemini first, then fallback
    if (geminiAvailable && model) {
      try {
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
        
        console.log('🤖 Gemini category analysis result:', text);
        
        const analysis = JSON.parse(text);
        
        // Validate category exists in wallet
        if (analysis.categoryId) {
          const categoryExists = walletCategories.some(c => String(c._id) === String(analysis.categoryId));
          if (!categoryExists) {
            console.warn('⚠️ Gemini category không tồn tại trong ví, set về null');
            analysis.categoryId = null;
            analysis.categoryName = null;
          }
        }

        return res.json({
          categoryId: analysis.categoryId,
          categoryName: analysis.categoryName,
          confidence: analysis.confidence || 0,
          reasoning: analysis.reasoning || 'Gemini AI đã phân tích dựa trên danh mục có trong ví'
        });

      } catch (geminiError) {
        console.error('❌ Gemini category analysis failed:', geminiError.message);
        
        // Use fallback AI
        console.log('🔄 Using fallback category analysis...');
        const fallbackResult = analyzeCategoryWithFallback(message, walletCategories);
        
        return res.json({
          categoryId: fallbackResult.categoryId,
          categoryName: fallbackResult.categoryName,
          confidence: fallbackResult.confidence,
          reasoning: fallbackResult.reasoning + ' (Fallback AI)',
          fallback: true
        });
      }
    } else {
      // Use fallback AI directly
      console.log('🤖 Using fallback category analysis (Gemini not available)');
      const fallbackResult = analyzeCategoryWithFallback(message, walletCategories);
      
      return res.json({
        categoryId: fallbackResult.categoryId,
        categoryName: fallbackResult.categoryName,
        confidence: fallbackResult.confidence,
        reasoning: fallbackResult.reasoning + ' (Fallback AI)',
        fallback: true
      });
    }

  } catch (error) {
    console.error('❌ Error analyzing category:', error);
    res.status(500).json({ 
      error: 'Không thể phân tích danh mục',
      details: error.message 
    });
  }
});

// THÊM: Emergency response generator
function generateEmergencyResponse(message, user, error) {
  return `😅 **Xin lỗi, hệ thống đang gặp sự cố.**

⚠️ **Lỗi:** ${error.message || 'Lỗi không xác định'}

💡 **Bạn vẫn có thể:**
• Sử dụng các tính năng khác của ứng dụng
• Thử lại sau vài phút
• Kiểm tra kết nối mạng

🙏 Cảm ơn bạn đã thông cảm!`;
}

module.exports = router;
