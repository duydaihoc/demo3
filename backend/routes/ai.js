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
  // Try several common patterns and units, normalize separators
  const patterns = [
    /(\d+[\.,]?\d*)\s*(k|nghìn|ngàn)\b/gi,
    /(\d+[\.,]?\d*)\s*(tr|triệu)\b/gi,
    /(\d+[\.,]?\d*)\s*(tỷ|ty|b)\b/gi,
    /\$\s*(\d+[\.,]?\d*)\b/gi,
    /(\d{1,3}(?:[\.,]\d{3})+|\d+(?:[\.,]\d+)?)(?:\s*(đ|vnd|vnđ|dong))?\b/gi
  ];

  for (const regex of patterns) {
    const m = regex.exec(lowerText);
    if (m) {
      let raw = m[1];
      if (/^\d{1,3}([\.,]\d{3})+(?:[\.,]\d+)?$/.test(raw)) {
        raw = raw.replace(/[\.,](?=\d{3}(\D|$))/g, '');
      }
      const parsed = parseFloat(raw.replace(',', '.'));
      if (isNaN(parsed)) continue;

      const unit = (m[2] || '').toLowerCase();
      let amount = parsed;
      if (unit === 'k' || unit === 'nghìn' || unit === 'ngàn') amount *= 1000;
      else if (unit === 'tr' || unit === 'triệu') amount *= 1000000;
      else if (unit === 'tỷ' || unit === 'ty' || unit === 'b') amount *= 1000000000;
      else if (regex.source.startsWith("\\$")) amount *= 23000;
      else if (unit === 'usd' || unit === '$') amount *= 23000;

      return Math.round(amount);
    }
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

// THÊM: analyzeBasicTransactionIntent (di chuyển lên trước endpoint /chat)
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

Trả về JSON (KHÔNG markdown, CHỈ JSON):
{
  "hasIntent": true/false,
  "type": "expense" hoặc "income",
  "amount": số tiền (số, không đơn vị),
  "description": "mô tả ngắn gọn",
  "confidence": độ tự tin 0-1,
  "reasoning": "giải thích ngắn"
}
`;

    if (!model) throw new Error('No model available');

    const result = await model.generateContent(analysisPrompt);
    const response = await result.response;
    let text = (await response.text()).trim();
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let analysis;
    try {
      analysis = JSON.parse(text);
    } catch (e) {
      throw new Error('Failed to parse Gemini response JSON: ' + e.message);
    }

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

    return { success: false, reason: 'No confident intent' };
  } catch (error) {
    console.error('❌ analyzeBasicTransactionIntent error:', error.message);
    // Fallback to local parser
    try {
      const fallback = analyzeTransactionWithFallback(message);
      if (fallback) return fallback;
    } catch (e) {
      console.error('Fallback failed:', e.message);
    }
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
    
    // ƯU TIÊN: Kiểm tra ý định SỬA/XÓA trước, để tránh hiểu nhầm là TẠO giao dịch
    const lowerMessageEarly = message.toLowerCase();
    const isEditIntentEarly = lowerMessageEarly.includes('sửa') || lowerMessageEarly.includes('chỉnh') || 
                              lowerMessageEarly.includes('thay đổi') || lowerMessageEarly.includes('cập nhật') || 
                              lowerMessageEarly.includes('đổi');
    
    // THÊM: Kiểm tra ý định XÓA
    const isDeleteIntentEarly = lowerMessageEarly.includes('xóa') || lowerMessageEarly.includes('xoá') || 
                                lowerMessageEarly.includes('hủy') || lowerMessageEarly.includes('bỏ');

    // Chỉ kiểm tra incomplete transaction khi KHÔNG phải sửa/xóa
    const incompleteCheck = !isEditIntentEarly && !isDeleteIntentEarly ? detectIncompleteTransaction(message, pendingTransaction) : { complete: false, missing: null };
    
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
            model,
            incompleteCheck.transaction.type || null
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
    let deleteSuggestion = null; // THÊM: delete suggestion

    if (geminiAvailable && model) {
      try {
        console.log('🤖 Sending request to Gemini Pro...');
        
        // THÊM: Kiểm tra ý định XÓA giao dịch TRƯỚC
        const lowerMessage = message.toLowerCase();
        if (lowerMessage.includes('xóa') || lowerMessage.includes('xoá') || 
            lowerMessage.includes('hủy') || lowerMessage.includes('bỏ')) {
          
          const deleteAnalysis = await analyzeDeleteTransactionIntent(
            message, 
            userId, 
            wallets, 
            categories, 
            model
          );
          
          if (deleteAnalysis.success) {
            deleteSuggestion = deleteAnalysis.deleteIntent;
            console.log('🗑️ Delete intent detected:', deleteSuggestion);
          } else {
            // Fallback: tìm theo mô tả
            const fallback = fallbackAnalyzeDeleteIntent(message, recentTransactions);
            if (fallback && fallback.success) {
              deleteSuggestion = fallback.deleteIntent;
              console.log('🗑️ Delete intent fallback detected:', deleteSuggestion);
            }
          }
        }
        // Kiểm tra ý định sửa giao dịch
        else if (lowerMessage.includes('sửa') || lowerMessage.includes('chỉnh') || 
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
          } else {
            // Fallback: tìm theo mô tả
            const fallback = fallbackAnalyzeEditIntent(message, recentTransactions);
            if (fallback && fallback.success) {
              editSuggestion = fallback.editIntent;
              console.log('✏️ Edit intent fallback detected:', editSuggestion);
            }
          }
        }
        
        // Nếu không phải sửa/xóa, phân tích tạo giao dịch
        if (!editSuggestion && !deleteSuggestion) {
          const intentAnalysis = await analyzeBasicTransactionIntent(
            message, 
            model
          );
          
          if (intentAnalysis.success) {
            transactionSuggestion = {
              type: intentAnalysis.type,
              amount: intentAnalysis.amount,
              description: intentAnalysis.description,
              categoryId: null,
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
Bạn là trợ lý tài chính cá nhân thông minh. Hãy trả lời câu hỏi của người dùng một cách tự nhiên, hữu ích và cụ thể.

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

${deleteSuggestion ? `
QUAN TRỌNG: Tôi đã phát hiện người dùng muốn XÓA giao dịch:
${deleteSuggestion.multipleMatches 
  ? `- Tìm thấy ${deleteSuggestion.foundTransactions.length} giao dịch tương tự. Hãy yêu cầu người dùng chọn giao dịch cụ thể để xóa.`
  : deleteSuggestion.foundTransactions.length === 1
    ? `- Tìm thấy giao dịch: ${deleteSuggestion.foundTransactions[0].description} - ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(deleteSuggestion.foundTransactions[0].amount)}
Hãy xác nhận với người dùng và chuẩn bị XÓA giao dịch này (sẽ hoàn tiền về ví).`
    : `- Không tìm thấy giao dịch phù hợp. Hãy yêu cầu người dùng cung cấp thêm thông tin.`
}
` : editSuggestion ? `
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
      // Fallback: nếu là xóa, tạo deleteSuggestion
      const lowerMessage = message.toLowerCase();
      if (lowerMessage.includes('xóa') || lowerMessage.includes('xoá') || 
          lowerMessage.includes('hủy') || lowerMessage.includes('bỏ')) {
        const fallbackDelete = fallbackAnalyzeDeleteIntent(message, recentTransactions);
        if (fallbackDelete && fallbackDelete.success) {
          deleteSuggestion = fallbackDelete.deleteIntent;
        }
      }
      // Fallback: nếu là sửa, tạo editSuggestion
      else if (lowerMessage.includes('sửa') || lowerMessage.includes('chỉnh') || 
          lowerMessage.includes('thay đổi') || lowerMessage.includes('cập nhật') || 
          lowerMessage.includes('đổi')) {
        const fallbackEdit = fallbackAnalyzeEditIntent(message, recentTransactions);
        if (fallbackEdit && fallbackEdit.success) {
          editSuggestion = fallbackEdit.editIntent;
        }
      }
      aiReply = generateAdvancedFallbackResponse(message, context, req.user, null);
    }

    // Phân tích AI response để đề xuất hành động
    const actionSuggestion = analyzeForActionSuggestion(message, aiReply);

    res.json({
      reply: aiReply,
      actionSuggestion,
      transactionSuggestion,
      editSuggestion,
      deleteSuggestion, // THÊM: delete suggestion
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

    // SỬA: Create transaction với title (từ AI), không có description
    const transaction = new Transaction({
      wallet: walletId,
      type,
      amount,
      title: description || 'Giao dịch từ AI', // SỬA: Lưu vào title
      description: null, // SỬA: Để null hoặc có thể thêm note riêng
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

// THÊM: Endpoint sửa giao dịch từ AI
// POST /api/ai/edit-transaction
router.post('/edit-transaction', auth, async (req, res) => {
  try {
    const { transactionId, updates } = req.body;
    const userId = req.user._id;

    if (!transactionId || !updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Missing transactionId or updates' });
    }

    // Tìm giao dịch và xác thực thuộc ví của user
    const tx = await Transaction.findById(transactionId).populate('wallet');
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });

    const wallet = await Wallet.findOne({ _id: tx.wallet?._id, owner: userId });
    if (!wallet) return res.status(403).json({ error: 'Forbidden' });

    // Lưu giá trị cũ để điều chỉnh số dư
    const oldAmount = tx.amount;
    const oldType = tx.type;

    // SỬA: Cập nhật các trường cho phép với xử lý số chính xác
    if (updates.amount !== undefined && updates.amount !== null && updates.amount !== '') {
      // SỬA: Xử lý số tiền chính xác hơn
      let newAmount = parseFloat(updates.amount);
      
      // Kiểm tra số hợp lệ
      if (isNaN(newAmount) || newAmount < 0) {
        return res.status(400).json({ error: 'Số tiền không hợp lệ' });
      }
      
      // Làm tròn về số nguyên để tránh floating point issues
      newAmount = Math.round(newAmount);
      
      console.log('💰 Amount update:', {
        original: updates.amount,
        parsed: parseFloat(updates.amount),
        rounded: newAmount,
        type: typeof newAmount
      });
      
      tx.amount = newAmount;
    }
    
    // SỬA: Cập nhật title (tên giao dịch chính)
    if (typeof updates.description === 'string' && updates.description.trim()) {
      tx.title = updates.description.trim();
      console.log('📝 Title updated to:', tx.title);
    }
    
    if (typeof updates.date === 'string' || updates.date instanceof Date) {
      const newDate = new Date(updates.date);
      if (!isNaN(newDate.getTime())) {
        tx.date = newDate;
        console.log('📅 Date updated to:', newDate);
      }
    }
    
    if (updates.categoryId === null) {
      tx.category = null;
      console.log('🏷️ Category cleared');
    } else if (updates.categoryId) {
      const category = await Category.findById(updates.categoryId);
      if (!category) return res.status(404).json({ error: 'Category not found' });
      tx.category = category._id;
      console.log('🏷️ Category updated to:', category.name);
    }

    // Điều chỉnh số dư ví nếu số tiền thay đổi
    const newAmount = tx.amount;
    if (newAmount !== oldAmount || oldType !== tx.type) {
      console.log('💳 Updating wallet balance:', {
        oldAmount,
        newAmount,
        oldType,
        newType: tx.type,
        walletBalance: wallet.initialBalance
      });
      
      if (tx.type === 'income') {
        // Remove old effect
        wallet.initialBalance = Math.round((wallet.initialBalance || 0) - oldAmount);
        // Apply new
        wallet.initialBalance = Math.round((wallet.initialBalance || 0) + newAmount);
      } else {
        // expense
        wallet.initialBalance = Math.round((wallet.initialBalance || 0) + oldAmount);
        wallet.initialBalance = Math.round((wallet.initialBalance || 0) - newAmount);
      }
      
      console.log('💳 New wallet balance:', wallet.initialBalance);
    }

    await tx.save();
    await wallet.save();

    await tx.populate('wallet', 'name');
    await tx.populate('category', 'name icon type');

    console.log('✅ Transaction updated successfully:', {
      id: tx._id,
      title: tx.title,
      amount: tx.amount,
      type: tx.type
    });

    return res.json({
      success: true,
      message: 'Cập nhật giao dịch thành công',
      transaction: tx
    });
  } catch (error) {
    console.error('❌ Error editing transaction:', error);
    return res.status(500).json({ error: 'Không thể cập nhật giao dịch', details: error.message });
  }
});

// THÊM: Endpoint xóa giao dịch từ AI
// POST /api/ai/delete-transaction
router.post('/delete-transaction', auth, async (req, res) => {
  try {
    const { transactionId } = req.body;
    const userId = req.user._id;

    if (!transactionId) {
      return res.status(400).json({ error: 'Missing transactionId' });
    }

    // Tìm giao dịch và xác thực thuộc ví của user
    const tx = await Transaction.findById(transactionId).populate('wallet');
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });

    const wallet = await Wallet.findOne({ _id: tx.wallet?._id, owner: userId });
    if (!wallet) return res.status(403).json({ error: 'Forbidden' });

    // Lưu thông tin giao dịch trước khi xóa
    const deletedTxInfo = {
      id: tx._id,
      title: tx.title,
      description: tx.description,
      amount: tx.amount,
      type: tx.type,
      walletName: wallet.name,
      categoryName: tx.category?.name
    };

    // Hoàn tiền về ví
    if (tx.type === 'expense') {
      // Nếu là chi tiêu, hoàn lại tiền (cộng vào ví)
      wallet.initialBalance = (wallet.initialBalance || 0) + tx.amount;
    } else {
      // Nếu là thu nhập, trừ tiền khỏi ví
      wallet.initialBalance = (wallet.initialBalance || 0) - tx.amount;
    }

    // Xóa giao dịch và cập nhật ví
    await Transaction.findByIdAndDelete(transactionId);
    await wallet.save();

    console.log('✅ Transaction deleted:', deletedTxInfo.id);

    return res.json({
      success: true,
      message: 'Xóa giao dịch thành công',
      deletedTransaction: deletedTxInfo,
      newWalletBalance: wallet.initialBalance
    });
  } catch (error) {
    console.error('❌ Error deleting transaction:', error);
    return res.status(500).json({ 
      error: 'Không thể xóa giao dịch', 
      details: error.message 
    });
  }
});

// ======================== FALLBACK ANALYZE INTENT ========================
// THÊM: Helper phân tích ý intention xóa giao dịch
async function analyzeDeleteTransactionIntent(message, userId, wallets, categories, model) {
  try {
    // Lấy danh sách giao dịch gần đây
    const recentTransactions = await Transaction.find({ 
      wallet: { $in: wallets.map(w => w._id) } 
    })
      .populate('wallet', 'name')
      .populate('category', 'name icon type')
      .sort({ createdAt: -1 })
      .limit(30);

    console.log('🗑️ ===== DELETE ANALYSIS DEBUG =====');
    console.log('🗑️ Total transactions:', recentTransactions.length);
    
    const transactionsList = recentTransactions.map((t, idx) => {
      const txName = t.title || t.description || 'Không có tên';
      const dateStr = new Date(t.date || t.createdAt).toLocaleDateString('vi-VN');
      const walletName = t.wallet?.name || 'Không rõ ví';
      
      console.log(`🗑️ #${idx + 1}:`, {
        id: String(t._id),
        title: t.title,
        description: t.description,
        displayName: txName,
        amount: t.amount,
        wallet: walletName
      });
      
      return `${idx + 1}. "${txName}" | ${t.amount.toLocaleString('vi-VN')} VND | ${dateStr} | Ví: ${walletName} | (ID: ${t._id})`;
    }).join('\n');

    console.log('🗑️ User message:', message);
    console.log('🗑️ ===== END DEBUG =====\n');

    const analysisPrompt = `
Bạn là AI tìm kiếm giao dịch để XÓA.

**DANH SÁCH ${recentTransactions.length} GIAO DỊCH (Tên trong dấu ngoặc kép ""):**
${transactionsList}

**CÂU NÓI:** "${message}"

**CÁCH TÌM:**
1. Lấy từ khóa sau "xóa/xoá/hủy/bỏ"
   - Ví dụ: "xóa ăn tối" → từ khóa là "ăn tối"
   
2. Tìm giao dịch có TÊN chứa từ khóa đó
   - "ăn tối" khớp với: "ăn tối", "đi ăn tối", "ăn tối với bạn"
   - KHÔNG phân biệt HOA/thường
   - Tìm trong TÊN giao dịch (trong dấu ngoặc kép "")

3. Trả về TẤT CẢ giao dịch khớp

**VÍ DỤ:**
User: "xóa ăn tối"
List: 1. "ăn tối" | 50000, 2. "cafe sáng" | 30000
→ Trả về #1

User: "xóa cafe"  
List: 1. "cafe sáng" | 30000, 2. "mua cafe" | 25000
→ Trả về CẢ 2

Trả về JSON thuần (KHÔNG markdown):
{{
  "hasDeleteIntent": true,
  "foundTransactions": [
    {
      "id": "ID",
      "description": "tên hiển thị",
      "amount": số,
      "date": "ISO date",
      "wallet": "tên ví",
      "category": "tên danh mục hoặc null"
    }
  ],
  "multipleMatches": true/false,
  "confidence": 0.9,
  "reasoning": "Tìm theo tên giao dịch để xóa"
}}
`;

    const result = await model.generateContent(analysisPrompt);
    const response = await result.response;
    let text = response.text().trim().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    console.log('🔍 Gemini delete response:', text);
    
    const analysis = JSON.parse(text);
    
    console.log('✅ Delete analysis found:', {
      count: analysis.foundTransactions?.length || 0,
      transactions: analysis.foundTransactions
    });
    
    if (analysis.hasDeleteIntent && analysis.confidence > 0.6) {
      return {
        success: true,
        deleteIntent: {
          foundTransactions: analysis.foundTransactions || [],
          multipleMatches: analysis.multipleMatches || false,
          confidence: analysis.confidence,
          reasoning: analysis.reasoning
        }
      };
    }
    
    return { success: false, reason: 'Không tìm thấy giao dịch để xóa' };
    
  } catch (error) {
    console.error('❌ Error analyzing delete intent:', error);
    return { success: false, reason: error.message };
  }
}

// THÊM: Fallback tìm giao dịch để xóa
function fallbackAnalyzeDeleteIntent(message, recentTransactions) {
  try {
    console.log('\n🔄 ===== FALLBACK DELETE SEARCH =====');
    console.log('Message:', message);
    console.log('Total transactions:', recentTransactions.length);
    
    const lower = message.toLowerCase();
    
    const normalize = (s) => (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .trim();
    
    const keywords = ['xóa', 'xoá', 'hủy', 'bỏ', 'xóa bỏ'];
    const hasDelete = keywords.some(k => lower.includes(k));
    
    if (!hasDelete) {
      console.log('⚠️ No delete keyword');
      return null;
    }

    // Trích xuất từ khóa tìm kiếm
    let searchTerm = lower;
    keywords.forEach(k => {
      searchTerm = searchTerm.replace(new RegExp(`\\b${k}\\b`, 'gi'), '');
    });
    searchTerm = searchTerm.replace(/\bgiao dịch\b/gi, '').trim();

    console.log('Delete search term:', searchTerm);

    if (!searchTerm) {
      return {
        success: true,
        deleteIntent: {
          foundTransactions: [],
          multipleMatches: false,
          confidence: 0.7,
          reasoning: 'Không có từ khóa tìm kiếm'
        }
      };
    }

    const normSearch = normalize(searchTerm);
    const searchWords = normSearch.split(/\s+/).filter(w => w.length > 1);
    
    console.log('Normalized delete search:', normSearch);
    console.log('Delete search words:', searchWords);
    
    // Tìm trong cả title và description
    const matches = recentTransactions.filter(t => {
      const titleNorm = normalize(t.title || '');
      const descNorm = normalize(t.description || '');
      const combined = `${titleNorm} ${descNorm}`.trim();
      
      const exactMatch = combined.includes(normSearch);
      const allWordsMatch = searchWords.length > 0 && searchWords.every(word => combined.includes(word));
      
      const found = exactMatch || allWordsMatch;
      
      if (found) {
        console.log('✅ Delete match found:', {
          id: t._id,
          title: t.title,
          description: t.description,
          combined,
          normSearch,
          matchType: exactMatch ? 'exact' : 'words'
        });
      }
      
      return found;
    });
    
    const found = matches.map(t => ({
      id: String(t._id),
      description: t.title || t.description || 'Giao dịch',
      amount: t.amount,
      date: new Date(t.date || t.createdAt).toISOString(),
      wallet: t.wallet?.name,
      category: t.category?.name
    }));

    console.log('✅ Total delete matches found:', found.length);
    console.log('===== END FALLBACK DELETE =====\n');

    return {
      success: true,
      deleteIntent: {
        foundTransactions: found,
        multipleMatches: found.length > 1,
        confidence: found.length > 0 ? 0.85 : 0.6,
        reasoning: `Tìm ${found.length} giao dịch có tên chứa "${searchTerm}" để xóa`
      }
    };
  } catch (e) {
    console.error('❌ Fallback delete error:', e);
    return null;
  }
}

// THÊM: Helper: Phân tích ý intention sửa giao dịch
async function analyzeEditTransactionIntent(message, userId, wallets, categories, model) {
  try {
    // Lấy danh sách giao dịch gần đây
    const recentTransactions = await Transaction.find({ 
      wallet: { $in: wallets.map(w => w._id) } 
    })
      .populate('wallet', 'name')
      .populate('category', 'name icon type')
      .sort({ createdAt: -1 })
      .limit(30);

    // Log để debug
    console.log('📋 ===== EDIT ANALYSIS DEBUG =====');
    console.log('📋 Total transactions:', recentTransactions.length);
    
    // SỬA: Format list với CẢ title VÀ description
    const transactionsList = recentTransactions.map((t, idx) => {
      // Ưu tiên title (tạo tay), fallback sang description (AI)
      const txName = t.title || t.description || 'Không có tên';
      const dateStr = new Date(t.date || t.createdAt).toLocaleDateString('vi-VN');
      const walletName = t.wallet?.name || 'Không rõ ví';
      
      // Log chi tiết
      console.log(`📝 #${idx + 1}:`, {
        id: String(t._id),
        title: t.title,
        description: t.description,
        displayName: txName,
        amount: t.amount,
        wallet: walletName
      });
      
      return `${idx + 1}. "${txName}" | ${t.amount.toLocaleString('vi-VN')} VND | ${dateStr} | Ví: ${walletName} | (ID: ${t._id})`;
    }).join('\n');

    console.log('📋 User message:', message);
    console.log('📋 ===== END DEBUG =====\n');

    const analysisPrompt = `
Bạn là AI tìm kiếm giao dịch để sửa.

**DANH SÁCH ${recentTransactions.length} GIAO DỊCH (Tên trong dấu ngoặc kép ""):**
${transactionsList}

**CÂU NÓI:** "${message}"

**CÁCH TÌM:**
1. Lấy từ khóa sau "sửa/đổi/chỉnh"
   - Ví dụ: "sửa ăn tối" → từ khóa là "ăn tối"
   
2. Tìm giao dịch có TÊN chứa từ khóa
   - "ăn tối" khớp với: "ăn tối", "đi ăn tối", "ăn tối với bạn"
   - KHÔNG phân biệt HOA/thường
   - Tìm trong TÊN giao dịch (trong dấu ngoặc kép "")

3. Trả về TẤT CẢ giao dịch khớp

**VÍ DỤ:**
User: "sửa ăn tối"
List: 1. "ăn tối" | 50000, 2. "cafe sáng" | 30000
→ Trả về #1

User: "sửa cafe"  
List: 1. "cafe sáng" | 30000, 2. "mua cafe" | 25000
→ Trả về CẢ 2

Trả về JSON thuần (KHÔNG markdown):
{{
  "hasEditIntent": true,
  "foundTransactions": [
    {
      "id": "ID",
      "description": "tên hiển thị",
      "amount": số,
      "date": "ISO date",
      "wallet": "tên ví",
      "category": "tên danh mục hoặc null"
    }
  ],
  "multipleMatches": true/false,
  "updates": {{"amount": null, "description": null}},
  "confidence": 0.9,
  "reasoning": "Tìm theo tên giao dịch"
}}
`;

    const result = await model.generateContent(analysisPrompt);
    const response = await result.response;
    let text = response.text().trim().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    console.log('🔍 Gemini response:', text);
    
    const analysis = JSON.parse(text);
    
    console.log('✅ Found:', {
      count: analysis.foundTransactions?.length || 0,
      transactions: analysis.foundTransactions
    });
    
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
    
    return { success: false, reason: 'Không tìm thấy' };
    
  } catch (error) {
    console.error('❌ Error:', error);
    return { success: false, reason: error.message };
  }
}

// THÊM: Fallback tìm theo CẢ title VÀ description
function fallbackAnalyzeEditIntent(message, recentTransactions) {
  try {
    console.log('\n🔄 ===== FALLBACK SEARCH =====');
    console.log('Message:', message);
    console.log('Total transactions:', recentTransactions.length);
    
    const lower = message.toLowerCase();
    
    // Normalize text
    const normalize = (s) => (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .trim();
    
    const keywords = ['sửa', 'chỉnh', 'cập nhật', 'đổi', 'thay đổi'];
    const hasEdit = keywords.some(k => lower.includes(k));
    
    if (!hasEdit) {
      console.log('⚠️ No edit keyword');
      return null;
    }

    // Trích xuất từ khóa
    let searchTerm = lower;
    keywords.forEach(k => {
      searchTerm = searchTerm.replace(new RegExp(`\\b${k}\\b`, 'gi'), '');
    });
    searchTerm = searchTerm.replace(/\bgiao dịch\b/gi, '').trim();
    searchTerm = searchTerm.replace(/\bthành\b.*/gi, '').trim();

    console.log('Search term:', searchTerm);

    if (!searchTerm) {
      return {
        success: true,
        editIntent: {
          foundTransactions: [],
          multipleMatches: false,
          updates: {},
          confidence: 0.7,
          reasoning: 'Không có từ khóa'
        }
      };
    }

    const normSearch = normalize(searchTerm);
    const searchWords = normSearch.split(/\s+/).filter(w => w.length > 1);
    
    console.log('Normalized search:', normSearch);
    console.log('Search words:', searchWords);
    
    // SỬA: TÌM TRONG CẢ title VÀ description
    const matches = recentTransactions.filter(t => {
      // Normalize cả title và description
      const titleNorm = normalize(t.title || '');
      const descNorm = normalize(t.description || '');
      
      // Kết hợp cả 2 để tìm kiếm
      const combined = `${titleNorm} ${descNorm}`.trim();
      
      // Check exact match hoặc all words match
      const exactMatch = combined.includes(normSearch);
      const allWordsMatch = searchWords.length > 0 && searchWords.every(word => combined.includes(word));
      
      const found = exactMatch || allWordsMatch;
      
      if (found) {
        console.log('✅ Match found:', {
          id: t._id,
          title: t.title,
          description: t.description,
          titleNorm,
          descNorm,
          combined,
          normSearch,
          matchType: exactMatch ? 'exact' : 'words'
        });
      }
      
      return found;
    });
    
    // Map kết quả - ưu tiên title, fallback description
    const found = matches.map(t => ({
      id: String(t._id),
      description: t.title || t.description || 'Giao dịch', // Trả về title nếu có
      amount: t.amount,
      date: new Date(t.date || t.createdAt).toISOString(),
      wallet: t.wallet?.name,
      category: t.category?.name
    }));

    console.log('✅ Total found:', found.length);
    console.log('Found transactions:', found);
    console.log('===== END FALLBACK =====\n');

    return {
      success: true,
      editIntent: {
        foundTransactions: found,
        multipleMatches: found.length > 1,
        updates: {},
        confidence: found.length > 0 ? 0.85 : 0.6,
        reasoning: `Tìm ${found.length} giao dịch có tên chứa "${searchTerm}"`
      }
    };
  } catch (e) {
    console.error('❌ Fallback error:', e);
    return null;
  }
}

// ======================== Helper functions (tiếp theo) ========================

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
    
    // Phát hiện ý định tạo giao dịch mới
    const expenseKeywords = ['tạo', 'thêm', 'ghi', 'ăn', 'mua', 'chi', 'trả', 'đổ', 'mua sắm', 'khám', 'bệnh', 'thuốc', 'sức khỏe', 'cafe', 'cơm', 'phở', 'bún', 'trà', 'nước', 'nhậu', 'bar', 'nhà hàng', 'quán', 'tối', 'sáng', 'trưa', 'ăn vặt', 'đồ ăn', 'thức ăn', 'xe', 'xăng', 'đổ xăng', 'taxi', 'grab', 'bus', 'tàu', 'máy bay', 'vé', 'đi', 'về', 'đường', 'gửi xe', 'bảo dưỡng', 'shopping', 'quần áo', 'giày', 'túi', 'phụ kiện', 'đồ', 'sắm', 'áo', 'dép', 'váy', 'quần', 'phim', 'game', 'vui chơi', 'giải trí', 'karaoke', 'du lịch', 'picnic', 'chơi', 'vui', 'điện', 'nước', 'internet', 'điện thoại', 'wifi', 'cáp', 'gas', 'tiền điện', 'tiền nước', 'học', 'sách', 'khóa học', 'học phí', 'giáo dục', 'trường', 'lớp'];
    const incomeKeywords = ['thu', 'nhận', 'lương', 'thưởng', 'kiếm', 'bán', 'thu nhập', 'nhận tiền', 'bonus', 'salary', 'nhận lương', 'trả lương'];
    
    const hasExpenseIntent = expenseKeywords.some(keyword => lowerMessage.includes(keyword));
    const hasIncomeIntent = incomeKeywords.some(keyword => lowerMessage.includes(keyword));
    const hasTransactionIntent = hasExpenseIntent || hasIncomeIntent;
    
    if (hasTransactionIntent) {
      const amount = extractAmount(message);
      
      if (!amount) {
        let description = message.trim();
        const removeKeywords = [
          'tạo giao dịch', 'thêm giao dịch', 'ghi giao dịch', 
          'tạo', 'thêm', 'ghi', 'nhận', 'thu'
        ];
        removeKeywords.forEach(keyword => {
          description = description.replace(new RegExp(keyword, 'gi'), '').trim();
        });
        
        let type = 'expense';
        for (const keyword of incomeKeywords) {
          if (lowerMessage.includes(keyword)) {
            type = 'income';
            break;
          }
        }
        
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
    const amount = extractAmount(message);
    
    if (!amount) return null;
    
    const expenseKeywords = ['mua', 'chi', 'trả', 'ăn', 'uống', 'cafe', 'cà phê', 'cơm', 'phở', 'bún', 'trà', 'nước', 'nhậu', 'bar', 'nhà hàng', 'quán', 'tối', 'sáng', 'trưa', 'ăn vặt', 'đồ ăn', 'thức ăn', 'xe', 'xăng', 'đổ xăng', 'taxi', 'grab', 'bus', 'tàu', 'máy bay', 'vé', 'đi', 'về', 'đường', 'gửi xe', 'bảo dưỡng', 'shopping', 'quần áo', 'giày', 'túi', 'phụ kiện', 'đồ', 'sắm', 'áo', 'dép', 'váy', 'quần', 'phim', 'game', 'vui chơi', 'giải trí', 'karaoke', 'du lịch', 'picnic', 'chơi', 'vui', 'điện', 'nước', 'internet', 'điện thoại', 'wifi', 'cáp', 'gas', 'tiền điện', 'tiền nước', 'học', 'sách', 'khóa học', 'học phí', 'giáo dục', 'trường', 'lớp'];
    const incomeKeywords = ['nhận', 'lương', 'thưởng', 'thu', 'bán', 'kiếm'];
    
    let type = 'expense';
    for (const keyword of incomeKeywords) {
      if (lowerMessage.includes(keyword)) {
        type = 'income';
        break;
      }
    }
    
    let description = message.trim();
    const amountPatterns = [
      /(\d+(?:\.\d+)?)\s*(?:k|nghìn|ngàn)/gi,
      /(\d+(?:\.\d+)?)\s*(?:tr|triệu)/gi,
      /(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:đ|vnd|dong)/gi,
      /(\d+(?:,\d{3})*(?:\.\d+)?)/g
    ];
    
    for (const pattern of amountPatterns) {
      description = description.replace(pattern, '').trim();
    }
    
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
function analyzeCategoryWithFallback(message, categories, hintedType = null) {
  try {
    const lowerMessage = message.toLowerCase().trim();
    
    console.log('🔄 Fallback category analysis:', {
      message: lowerMessage,
      categoriesCount: categories.length
    });
    
    const categoryMappings = {
      'ăn uống': ['ăn', 'uống', 'cafe', 'cà phê', 'cơm', 'phở', 'bún', 'trà', 'nước', 'nhậu', 'bar', 'nhà hàng', 'quán', 'tối', 'sáng', 'trưa', 'ăn vặt', 'đồ ăn', 'thức ăn'],
      'đi lại': ['xe', 'xăng', 'đổ xăng', 'taxi', 'grab', 'bus', 'tàu', 'máy bay', 'vé', 'đi', 'về', 'đường', 'gửi xe', 'bảo dưỡng'],
      'mua sắm': ['mua', 'shopping', 'quần áo', 'giày', 'túi', 'phụ kiện', 'đồ', 'sắm', 'áo', 'dép', 'váy', 'quần'],
      'giải trí': ['phim', 'game', 'vui chơi', 'giải trí', 'karaoke', 'du lịch', 'picnic', 'chơi', 'vui'],
      'sức khỏe': ['thuốc', 'bệnh viện', 'khám', 'chữa', 'y tế', 'sức khỏe', 'bác sĩ', 'nha khoa'],
      'hóa đơn': ['điện', 'nước', 'internet', 'điện thoại', 'wifi', 'cáp', 'gas', 'tiền điện', 'tiền nước'],
      'học tập': ['học', 'sách', 'khóa học', 'học phí', 'giáo dục', 'trường', 'lớp'],
      'lương': ['lương', 'thưởng', 'bonus', 'salary', 'nhận lương', 'trả lương'],
      'thu nhập': ['thu', 'nhận tiền', 'bán', 'kiếm', 'thu nhập', 'income']
    };
    
    let bestMatch = null;
    let maxScore = 0;
    
    categories.forEach(category => {
      const categoryName = category.name.toLowerCase();
      let score = 0;
      
      // Direct name match (highest priority)
      if (lowerMessage.includes(categoryName)) {
        score += 15;
        console.log(`✅ Direct match: "${categoryName}" in message`);
      }
      
      // Keyword mapping match
      const mapping = categoryMappings[categoryName] || [];
      mapping.forEach(keyword => {
        if (lowerMessage.includes(keyword)) {
          score += 8;
          console.log(`✅ Keyword match: "${keyword}" → "${categoryName}"`);
        }
      });
      
      // Type consistency bonus
      if (hintedType && category.type) {
        if (category.type === hintedType) {
          score += 5;
          console.log(`✅ Type match: ${category.type} === ${hintedType}`);
        } else {
          score -= 3;
        }
      }

      if (score > maxScore) {
        maxScore = score;
        bestMatch = category;
      }
    });
    
    console.log(`📊 Best match: ${bestMatch?.name || 'none'} (score: ${maxScore})`);
    
    if (maxScore > 5) { // Lowered threshold from 10 to 5
      return {
        categoryId: bestMatch._id,
        categoryName: bestMatch.name,
        confidence: Math.min(maxScore / 15, 1),
        reasoning: `Fallback AI tìm thấy danh mục phù hợp: ${bestMatch.name} (điểm: ${maxScore})`
      };
    }
    
    return {
      categoryId: null,
      categoryName: null,
      confidence: 0,
      reasoning: `Fallback AI không tìm thấy danh mục phù hợp (điểm cao nhất: ${maxScore})`
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

// ======================== POST /api/ai/analyze-category-for-wallet ========================
// Endpoint phân tích danh mục cho giao dịch tài chính
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
    console.log(`📋 Categories available:`, walletCategories.map(c => ({ id: c._id, name: c.name })));
    console.log(`📋 Message: "${message}"`);

    // Try Gemini first, then fallback
    if (geminiAvailable && model) {
      try {
        const expenseCats = walletCategories.filter(c => c.type === 'expense' || !c.type);
        const incomeCats = walletCategories.filter(c => c.type === 'income');

        const categoryPrompt = `
Bạn là AI phân tích danh mục cho giao dịch tài chính.

DANH MỤC CHI TIÊU CÓ TRONG VÍ "${wallet.name}":
${expenseCats.map(c => `- ${c.name} (${c.icon || '📝'}) - Mô tả: ${c.description || 'Không có'} (ID: ${c._id})`).join('\n')}

DANH MỤC THU NHẬP CÓ TRONG "${wallet.name}":
${incomeCats.map(c => `- ${c.name} (${c.icon || '💰'}) - Mô tả: ${c.description || 'Không có'} (ID: ${c._id})`).join('\n')}

CÂU NÓI VỀ GIAO DỊCH: "${message}"

**QUAN TRỌNG:** 
- CHỈ chọn danh mục TỪ DANH SÁCH TRÊN
- categoryId PHẢI là ID trong dấu ngoặc (ID: ...), KHÔNG phải tên danh mục
- Nếu không tìm thấy danh mục phù hợp, trả về categoryId = null

**MAPPING KEYWORDS:**
- Ăn, uống, cafe, cơm, bún, phở, tối, sáng, trưa → Tìm danh mục có tên chứa "Ăn uống"
- Xăng, xe, taxi, grab → Tìm danh mục "Đi lại" hoặc "Xe cộ"
- Quần áo, giày dép, mua sắm → Tìm danh mục "Mua sắm"
- Điện, nước, internet → Tìm danh mục "Hóa đơn" hoặc "Tiện ích"

**VÍ DỤ:**
Input: "ăn tối 50k"
Danh sách có: "- Ăn uống (🍔) (ID: 507f1f77bcf86cd799439011)"
Output: {{"categoryId": "507f1f77bcf86cd799439011", "categoryName": "Ăn uống", "confidence": 0.9}}

Trả về JSON (KHÔNG markdown, CHỈ JSON):
{{
  "categoryId": "ID dạng 507f1f77bcf86cd799439011" hoặc null,
  "categoryName": "Tên danh mục" hoặc null,
  "confidence": 0-1,
  "reasoning": "giải thích"
}
`;

        const result = await model.generateContent(categoryPrompt);
        const response = await result.response;
        let text = response.text().trim();
        
        text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        console.log('🤖 Gemini category analysis raw:', text);
        
        const analysis = JSON.parse(text);
        
        console.log('📊 Parsed analysis:', {
          categoryId: analysis.categoryId,
          categoryName: analysis.categoryName,
          idType: typeof analysis.categoryId
        });
        
        // SỬA: Validate và fix categoryId
        let validatedCategoryId = null;
        let validatedCategoryName = null;
        
        if (analysis.categoryId && typeof analysis.categoryId === 'string') {
          // Nếu categoryId là tên danh mục, tìm ID thực
          const foundByName = walletCategories.find(c => 
            c.name.toLowerCase() === analysis.categoryId.toLowerCase()
          );
          
          if (foundByName) {
            console.log('🔧 Fixed: categoryId was name, found actual ID:', foundByName._id);
            validatedCategoryId = foundByName._id;
            validatedCategoryName = foundByName.name;
          } else {
            // Kiểm tra xem có phải ObjectId format không
            if (analysis.categoryId.match(/^[0-9a-fA-F]{24}$/)) {
              // Là ObjectId, kiểm tra có tồn tại không
              const foundById = walletCategories.find(c => 
                String(c._id) === String(analysis.categoryId)
              );
              
              if (foundById) {
                console.log('✅ Valid ObjectId found in wallet');
                validatedCategoryId = foundById._id;
                validatedCategoryName = foundById.name;
              } else {
                console.warn('⚠️ ObjectId not found in wallet categories');
              }
            } else {
              console.warn('⚠️ categoryId is neither valid name nor ObjectId:', analysis.categoryId);
            }
          }
        }

        // Nếu vẫn chưa tìm thấy, dùng categoryName để tìm
        if (!validatedCategoryId && analysis.categoryName) {
          const foundByName = walletCategories.find(c => 
            c.name.toLowerCase().includes(analysis.categoryName.toLowerCase()) ||
            analysis.categoryName.toLowerCase().includes(c.name.toLowerCase())
          );
          
          if (foundByName) {
            console.log('🔧 Found by categoryName:', foundByName.name);
            validatedCategoryId = foundByName._id;
            validatedCategoryName = foundByName.name;
          }
        }

        console.log('✅ Final validated result:', {
          categoryId: validatedCategoryId,
          categoryName: validatedCategoryName
        });

        return res.json({
          categoryId: validatedCategoryId,
          categoryName: validatedCategoryName,
          confidence: validatedCategoryId ? analysis.confidence : 0,
          reasoning: validatedCategoryId 
            ? (analysis.reasoning || 'Gemini AI đã phân tích dựa trên danh mục có trong ví')
            : 'Không tìm thấy danh mục phù hợp trong ví này'
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

module.exports = router;
