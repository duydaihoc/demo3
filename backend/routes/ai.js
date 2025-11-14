require('dotenv').config();
const express = require('express');
const router = express.Router();
const { auth, requireAuth } = require('../middleware/auth');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const Category = require('../models/Category');

// ======================== GEMINI AI SETUP ========================
let model = null;
let geminiAvailable = false;
let embeddingModel = null; // THÊM: model embedding
const userVectorStores = new Map(); // THÊM: Map lưu index FAISS và metadata

try {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (GEMINI_API_KEY && GEMINI_API_KEY.trim() !== '') {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.trim());
    // ✅ Dùng model mới nhất, tránh lỗi 404
    model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); 
    embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" }); // THÊM: embedding model
    geminiAvailable = true;
    console.log('✅ Gemini AI initialized successfully (model: gemini-2.0-flash)');
  } else {
    console.warn('⚠️ GEMINI_API_KEY không tồn tại trong file .env');
  }
} catch (error) {
  console.error('❌ Error initializing Gemini AI:', error.message);
  geminiAvailable = false;
}

// THÊM: Import faiss-node (cần npm install faiss-node)
let faiss = null;
try {
  faiss = require('faiss-node');
  console.log('✅ FAISS loaded');
} catch (e) {
  console.warn('⚠️ FAISS not installed. Run: npm install faiss-node');
}

// ======================== Helper functions ========================

// THÊM: Semantic memory (FAISS + Embeddings)
const EMBEDDING_DIM = 768; // text-embedding-004 dimension

async function embedText(text) {
  try {
    if (!embeddingModel || !text) return null;
    const result = await embeddingModel.embedContent({
      content: { parts: [{ text: String(text).slice(0, 8000) }] }
    });
    const values = result?.embedding?.values || [];
    if (!Array.isArray(values) || values.length === 0) return null;
    return Float32Array.from(values);
  } catch (err) {
    console.warn('⚠️ embedText failed:', err.message);
    return null;
  }
}

// THÊM: Detect intents for advice/statistics
function detectAdviceOrStatsIntent(message) {
  const lower = (message || '').toLowerCase();
  const adviceKeywords = ['lời khuyên', 'tiết kiệm', 'đầu tư', 'kế hoạch', 'mục tiêu', 'gợi ý', 'hướng đi'];
  const statsKeywords = [
    'thống kê',
    'báo cáo',
    'phân tích',
    'chi tiêu',
    'thu nhập',
    'tổng kết',
    'tháng này',
    'tuần này',
    'năm nay',
    // THÊM: các cụm thường dùng khi muốn ĐÁNH GIÁ / TỔNG QUAN, không phải tạo giao dịch
    'đánh giá',
    'đánh giá thu nhập',
    'đánh giá chi tiêu',
    'tổng quan',
    'tổng quan tài chính',
    'xem tổng quan'
  ];
  return {
    advice: adviceKeywords.some(k => lower.includes(k)),
    stats: statsKeywords.some(k => lower.includes(k))
  };
}

// THÊM: Build short conversation transcript for prompt (last N turns)
function buildConversationTranscript(conversationHistory = [], maxTurns = 8) {
  try {
    const recent = conversationHistory.slice(-maxTurns);
    if (!recent.length) return '(Không có lịch sử hội thoại)';
    return recent
      .map(turn => {
        const role = turn.role === 'assistant' ? 'AI' : 'User';
        const text = String(turn.content || '').replace(/\n/g, ' ').slice(0, 500);
        return `${role}: ${text}`;
      })
      .join('\n');
  } catch {
    return '(Không thể tạo transcript)';
  }
}

// THÊM: Compute simple stats from transactions
function computeBasicStats(transactions = [], now = new Date()) {
  const start30 = new Date(now);
  start30.setDate(start30.getDate() - 30);
  const inLast30 = transactions.filter(t => new Date(t.date || t.createdAt) >= start30);
  const totals = inLast30.reduce((acc, t) => {
    if (t.type === 'income') acc.income += t.amount || 0; else acc.expense += t.amount || 0;
    return acc;
  }, { income: 0, expense: 0 });
  const net = totals.income - totals.expense;
  const byCategory = new Map();
  inLast30.forEach(t => {
    const name = t.category?.name || (t.type === 'income' ? 'Thu khác' : 'Chi khác');
    byCategory.set(name, (byCategory.get(name) || 0) + (t.amount || 0));
  });
  const topCategories = Array.from(byCategory.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, amount]) => ({ name, amount }));
  return { inLastDays: 30, totals, net, topCategories, count: inLast30.length };
}

// THÊM: Áp dụng giọng điệu theo persona
function styleResponseByPersona(personaKey, text) {
  try {
    const persona = (personaKey || 'neutral');
    let out = String(text || '');
    if (persona === 'serious') {
      out = out.replace(/[😅😊😜👌👍⚡🤖💡📈📊💰💵💸🔮✅🗑️🛠️]/g, '')
               .replace(/\n\n+/g, '\n');
      out = `Lưu ý: ${out}`;
    } else if (persona === 'friendly') {
      // Mẹ hiền: nhẹ nhàng, an ủi, khích lệ
      out = out.replace(/\n\n+/g, '\n\n');
      out = `😊 [Chế độ mẹ hiền]\n${out}\n\n💬 Mẹ nói nhẹ nè: con cứ hỏi thoải mái, mình cùng tìm cách tốt nhất cho con nhé.`;
    } else if (persona === 'expert') {
      // Rõ ràng, súc tích, giảm emoji
      out = out.replace(/[😅😊😜👌👍⚡🤖💡📈📊💰💵💸🔮✅🗑️🛠️]/g, '')
               .replace(/\n\n+/g, '\n');
      out = `Khuyến nghị (chuyên gia):\n${out}`;
    } else if (persona === 'aggressive') {
      // Mẹ nghiêm: thẳng thắn, hơi gắt nhưng vẫn quan tâm
      out = out.replace(/[😅😊😜👌👍⚡🤖💡📈📊💰💵💸🔮✅🗑️🛠️]/g, '')
               .replace(/\n\n+/g, '\n');
      out = `⚠️ [Chế độ mẹ nghiêm]\n${out}\n\n👀 Nếu con cứ chi tiêu kiểu này thì rất khó ổn định đó, phải siết lại nghiêm túc ngay!`;
    } else if (persona === 'humorous') {
      out = `😄 ${out}\n(Đùa chút cho bớt căng thẳng!)`;
    }
    return out;
  } catch {
    return text;
  }
}

function ensureUserVectorStore(userId) {
  if (!userId) return null;
  if (!userVectorStores.has(String(userId))) {
    if (!faiss) {
      userVectorStores.set(String(userId), { index: null, dim: EMBEDDING_DIM, items: [] });
      return userVectorStores.get(String(userId));
    }
    const index = new faiss.IndexFlatIP(EMBEDDING_DIM);
    userVectorStores.set(String(userId), { index, dim: EMBEDDING_DIM, items: [] });
  }
  return userVectorStores.get(String(userId));
}

async function addToVectorStore(userId, text, metadata = {}) {
  try {
    const store = ensureUserVectorStore(userId);
    if (!store) return;
    const vector = await embedText(text);
    const item = {
      text: String(text || ''),
      metadata: { ...metadata, ts: metadata.ts || Date.now() }
    };
    // Luôn lưu items để có fallback theo thời gian nếu thiếu FAISS/embeds
    store.items.push(item);
    if (!vector || !faiss || !store.index) return; // fallback-only mode
    // Chuẩn hóa cos-sim: IndexFlatIP giả định vector đã được normalize
    const norm = Math.hypot(...vector);
    const normalized = norm > 0 ? Float32Array.from(vector.map(v => v / norm)) : vector;
    store.index.add(normalized);
  } catch (e) {
    console.warn('⚠️ addToVectorStore error:', e.message);
  }
}

async function searchVectorStore(userId, query, topK = 5) {
  try {
    const store = ensureUserVectorStore(userId);
    if (!store || store.items.length === 0) return [];
    const qVec = await embedText(query);
    if (faiss && store.index && qVec) {
      const norm = Math.hypot(...qVec);
      const qNorm = norm > 0 ? Float32Array.from(qVec.map(v => v / norm)) : qVec;
      const { distances, labels } = store.index.search(qNorm, Math.min(topK, store.items.length));
      const results = [];
      for (let i = 0; i < labels.length; i++) {
        const idx = labels[i];
        if (idx >= 0 && store.items[idx]) {
          results.push({
            text: store.items[idx].text,
            metadata: store.items[idx].metadata,
            dist: distances[i]
          });
        }
      }
      return results;
    }
    // Fallback: trả về theo thời gian gần nhất
    return store.items
      .slice(-topK)
      .reverse()
      .map(it => ({ text: it.text, metadata: it.metadata, dist: 0 }));
  } catch (e) {
    console.warn('⚠️ searchVectorStore error:', e.message);
    return [];
  }
}

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
    
    // BỎ QUA: nếu là câu hỏi thống kê/đánh giá/tổng quan, không nên coi là tạo giao dịch
    const statsLikeKeywords = [
      'thống kê',
      'báo cáo',
      'tổng kết',
      'phân tích',
      'đánh giá',
      'đánh giá thu nhập',
      'đánh giá chi tiêu',
      'tổng quan',
      'tổng quan tài chính',
      'xem tổng quan',
      'xem thu nhập',
      'xem chi tiêu'
    ];
    const isStatsLike = statsLikeKeywords.some(keyword => lowerMessage.includes(keyword));
    if (isStatsLike) {
      return { complete: false, missing: null };
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

// THÊM: Helper function phân tích danh mục cho message (sử dụng Gemini)
async function analyzeCategoryForMessage(message, categories, model, hintedType = null) {
  try {
    const expenseCats = categories.filter(c => c.type === 'expense' || !c.type);
    const incomeCats = categories.filter(c => c.type === 'income');

    const categoryPrompt = `
Bạn là AI phân tích danh mục cho giao dịch tài chính.

DANH MỤC CHI TIÊU CÓ SẴN:
${expenseCats.map(c => `- ${c.name} (${c.icon || '📝'}) - Mô tả: ${c.description || 'Không có'} (ID: ${c._id})`).join('\n')}

DANH MỤC THU NHẬP CÓ SẴN:
${incomeCats.map(c => `- ${c.name} (${c.icon || '💰'}) - Mô tả: ${c.description || 'Không có'} (ID: ${c._id})`).join('\n')}

CÂU NÓI VỀ GIAO DỊCH: "${message}"

**QUAN TRỌNG:** 
- CHỈ chọn danh mục TỪ DANH SÁCH TRÊN
- categoryId PHẢI là ID trong dấu ngoặc (ID: ...), KHÔNG phải tên danh mục
- Nếu không tìm thấy danh mục phù hợp, trả về categoryId = null

**MAPPING KEYWORDS:**
- Ăn, uống, cafe, cơm, bún, phở, tối, sáng, trưa → "Ăn uống"
- Xăng, xe, taxi, grab → "Đi lại" hoặc "Xe cộ"
- Quần áo, giày dép, mua sắm → "Mua sắm" hoặc "Quần áo"
- Điện, nước, internet, điện thoại → "Hóa đơn" hoặc "Tiện ích"

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
      const foundByName = categories.find(c => 
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
          const foundById = categories.find(c => 
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
      const foundByName = categories.find(c => 
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

    return {
      categoryId: validatedCategoryId,
      categoryName: validatedCategoryName,
      confidence: validatedCategoryId ? analysis.confidence : 0,
      reasoning: validatedCategoryId 
        ? (analysis.reasoning || 'Gemini AI đã phân tích dựa trên danh mục có trong ví')
        : 'Không tìm thấy danh mục phù hợp trong ví này'
    };
  } catch (error) {
    console.error('❌ Gemini category analysis error:', error);
    // Fallback AI trực tiếp với full context
    const fallbackResult = analyzeCategoryWithFallback(
      message, 
      categories
    );
    
    return {
      categoryId: fallbackResult.categoryId,
      categoryName: fallbackResult.categoryName,
      confidence: fallbackResult.confidence,
      reasoning: fallbackResult.reasoning + ' (Fallback AI)',
      fallback: true
    };
  }
}

// ======================== MAIN AI ENDPOINT ========================
router.post('/chat', auth, async (req, res) => {
  try {
    const { message, conversationHistory = [], selectedWalletId, pendingTransaction, persona } = req.body;
    const userId = req.user._id;
    const personaKey = (persona || 'neutral');

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
      // Lưu ngữ cảnh gợi ý tạo giao dịch
      try {
        const summary = `Gợi ý giao dịch (${incompleteCheck.transaction.type}): ${incompleteCheck.transaction.description} - ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(incompleteCheck.transaction.amount)}${categoryName ? ` | Danh mục: ${categoryName}` : ''}`;
        await addToVectorStore(userId, summary, { type: 'transaction_suggestion' });
      } catch (memErr) {
        console.warn('⚠️ Suggest memory failed:', memErr.message);
      }
      const baseReply = `✅ **Đã ghi nhận thông tin giao dịch:**

📝 ${incompleteCheck.transaction.description}
💰 ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(incompleteCheck.transaction.amount)}
${incompleteCheck.transaction.type === 'income' ? '💵 Thu nhập' : '💸 Chi tiêu'}
${categoryName ? `📊 ${categoryName}` : ''}

✨ Hãy xác nhận để tạo giao dịch!`;
      const styledReply = styleResponseByPersona(personaKey, baseReply);
      return res.json({
        reply: styledReply,
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
      
      // Lưu ngữ cảnh hỏi thêm thông tin
      try {
        await addToVectorStore(userId, 'Hỏi bổ sung số tiền cho giao dịch chưa đủ thông tin', { type: 'needs_more_info', missing: 'amount' });
      } catch (memErr) {
        console.warn('⚠️ Need-more-info memory failed:', memErr.message);
      }
      return res.json({
        reply: styleResponseByPersona(personaKey, promptReply),
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
        
        // THÊM: RAG semantic context từ bộ nhớ người dùng
        const semanticContext = await searchVectorStore(userId, message, 7);
        // THÊM: Ý định lời khuyên / thống kê và tính sẵn thống kê 30 ngày
        const adviceStatsIntent = detectAdviceOrStatsIntent(message);
        let statsSummaryBlock = '';
        if (adviceStatsIntent.stats) {
          const computed = computeBasicStats(recentTransactions);
          const fmt = (n) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
          const top = computed.topCategories.map(c => `${c.name} (${fmt(c.amount)})`).join(', ');
          statsSummaryBlock = `\nTHỐNG KÊ ${computed.inLastDays} NGÀY:\n- Thu nhập: ${fmt(computed.totals.income)}\n- Chi tiêu: ${fmt(computed.totals.expense)}\n- Cân đối: ${fmt(computed.net)}\n- Top danh mục: ${top}`;
        }
        // THÊM: Lịch sử hội thoại để giữ mạch trò chuyện
        const transcript = buildConversationTranscript(conversationHistory, 8);
        
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
        
        // Nếu không phải sửa/xóa VÀ không phải câu hỏi thống kê/đánh giá tổng quan,
        // mới phân tích ý định tạo giao dịch.
        if (!editSuggestion && !deleteSuggestion && !adviceStatsIntent.stats && !adviceStatsIntent.advice) {
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
        
        // Tạo hướng dẫn tính cách (persona)
        const personaMap = {
          neutral: 'Phong cách trung lập, rõ ràng, lịch sự.',
          friendly: 'Giọng điệu thân thiện, khích lệ, dễ gần.',
          expert: 'Giọng điệu chuyên gia, súc tích, dựa trên dữ liệu, có cấu trúc.',
          serious: 'Giọng điệu nghiêm túc, đi thẳng vào trọng tâm, ít cảm xúc.',
          humorous: 'Giọng điệu vui vẻ, dí dỏm nhưng vẫn lịch sự và ngắn gọn.',
          aggressive: 'Giọng điệu thẳng thắn, hơi gắt, tập trung vào cảnh báo và kỷ luật tài chính (nhưng vẫn tôn trọng).'
        };
        const personaKey = (persona || 'neutral');
        const personaInstruction = personaMap[personaKey] || personaMap.neutral;

        // Tạo context prompt cho Gemini
        const contextPrompt = `
Bạn là trợ lý tài chính cá nhân thông minh.

PHONG CÁCH TRẢ LỜI (Persona): ${personaInstruction}

NGỮ CẢNH LIÊN QUAN (RAG - vector search):
${semanticContext.length === 0 ? '(Không tìm thấy ngữ cảnh tương tự)' : semanticContext.map(c => `- ${c.text} ${c.metadata?.type ? `(type: ${c.metadata.type})` : ''} ${typeof c.dist === 'number' ? `(sim: ${c.dist.toFixed(2)})` : ''}`).join('\n')}

THÔNG TIN NGƯỜI DÙNG:
- Tên: ${req.user.name || 'Người dùng'}
- Email: ${req.user.email || 'Không có'}

TÌNH HÌNH TÀI CHÍNH:
- Số ví: ${wallets.length}
- Tổng số dư: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(context.totalBalance)}

GIAO DỊCH GẦN ĐÂY:
${recentTransactions.slice(0, 10).map(t => `- ${t.title}: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(t.amount)} (${t.type === 'income' ? 'Thu' : 'Chi'})`).join('\n')}

LỊCH SỬ HỘI THOẠI (mới nhất ở cuối):
${transcript}
${statsSummaryBlock}

${deleteSuggestion ? 'YÊU CẦU XÓA GIAO DỊCH: Có ý định xóa, xử lý theo hướng dẫn trước.' :
 editSuggestion ? 'YÊU CẦU SỬA GIAO DỊCH: Có ý định cập nhật giao dịch.' :
 transactionSuggestion ? 'Ý ĐỊNH TẠO GIAO DỊCH MỚI: Hỏi xác nhận.' : ''}

CÂU HỎI: ${message}

Hãy trả lời ngắn gọn, rõ ràng, tận dụng NGỮ CẢNH LIÊN QUAN nếu phù hợp.
Nếu người dùng yêu cầu lời khuyên, đưa ra 2-4 khuyến nghị thực tế dựa trên số liệu của họ (ưu tiên danh mục chi tiêu cao, chênh lệch thu-chi, số dư ví). Nếu yêu cầu thống kê, hãy tóm tắt số liệu và nêu 1-2 insight chính.
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
        // Áp dụng persona cho phản hồi từ Gemini
        aiReply = styleResponseByPersona(personaKey, aiReply);
        
        console.log('✅ Gemini Pro response received successfully');
        
      } catch (geminiErrorCatch) {
        console.error('❌ Gemini API Error:', geminiErrorCatch.message);
        geminiError = geminiErrorCatch.message;
        fallback = true;
        aiReply = generateAdvancedFallbackResponse(message, context, req.user, geminiError, personaKey);
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
      aiReply = generateAdvancedFallbackResponse(message, context, req.user, null, personaKey);
    }

    // LƯU NGỮ CẢNH: Ghi nhớ câu của user và phản hồi AI
    try {
      await addToVectorStore(userId, message, { type: 'user_message' });
      if (aiReply) await addToVectorStore(userId, aiReply, { type: 'ai_reply' });
    } catch (memErr) {
      console.warn('⚠️ Memory store failed:', memErr.message);
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
    
    const emergencyResponse = generateEmergencyResponse(req.body.message, req.user, error, (req.body && req.body.persona) || 'neutral');
    
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
function generateAdvancedFallbackResponse(message, context, user, geminiError, personaKey = 'neutral') {
  const lowerMessage = message.toLowerCase().trim();
  
  // Enhanced fallback với quota detection
  let quotaMessage = '';
  if (geminiError && geminiError.includes('quota')) {
    quotaMessage = '\n\n🚫 **Đã hết quota Gemini API hôm nay** (200 requests miễn phí). Đang sử dụng AI dự phòng thông minh.\n\n💡 **Để có trải nghiệm tốt hất:** Có thể nâng cấp lên Gemini Pro hoặc chờ reset quota vào ngày mai.';
  }
  
  // Analyze transaction intent with fallback
  const transactionAnalysis = analyzeTransactionWithFallback(message);
  
  if (transactionAnalysis && transactionAnalysis.success) {
    const base = `🤖 **AI Dự phòng thông minh đã phân tích:**

📝 **Giao dịch được phát hiện:**
• Loại: ${transactionAnalysis.type === 'expense' ? '💸 Chi tiêu' : '💰 Thu nhập'}
• Số tiền: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(transactionAnalysis.amount)}
• Mô tả: ${transactionAnalysis.description}
• Độ tin cậy: ${Math.round(transactionAnalysis.confidence * 100)}%

💡 **Để tạo giao dịch:** Hãy chọn ví và danh mục phù hợp từ giao diện xác nhận.${quotaMessage}

🔮 **AI dự phòng:** Tôi có thể phân tích và tạo giao dịch cơ bản, trả lời câu hỏi về tài chính dựa trên dữ liệu thực tế của bạn!`;
    return styleResponseByPersona(personaKey, base);
  }
  
  // Financial advice and analysis
  if (lowerMessage.includes('tình hình') || lowerMessage.includes('phân tích') || lowerMessage.includes('tài chính')) {
    const base = `📊 **Tình hình tài chính hiện tại:**

💼 **Tổng quan:**
• Số ví đang quản lý: ${context.walletsCount}
• Tổng số dư: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(context.totalBalance)}
• Giao dịch gần đây: ${context.recentTransactionsCount} giao dịch

💡 **Gợi ý từ AI dự phòng:**
• Theo dõi chi tiêu hàng ngày để kiểm soát tốt hơn
• Đặt ngân sách cho từng danh mục
• Xem xét tăng tiết kiệm nếu có thể${quotaMessage}

🎯 **Để phân tích chi tiết hơn:** Hãy hỏi về danh mục cụ thể hoặc khoảng thời gian nhất định.`;
    return styleResponseByPersona(personaKey, base);
  }
  
  // Savings advice
  if (lowerMessage.includes('tiết kiệm') || lowerMessage.includes('save')) {
    const base = `💰 **Lời khuyên tiết kiệm từ AI dự phòng:**

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
    return styleResponseByPersona(personaKey, base);
  }
  
  // Investment advice
  if (lowerMessage.includes('đầu tư') || lowerMessage.includes('invest')) {
    const base = `📈 **Tư vấn đầu tư cơ bản từ AI:**

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
    return styleResponseByPersona(personaKey, base);
  }
  
  // Default response
  const baseDefault = `🤖 **AI Dự phòng thông minh** ${user?.name ? `xin chào ${user.name}` : 'xin chào'}!

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
  return styleResponseByPersona(personaKey, baseDefault);
}

// THÊM: Emergency response generator khi có lỗi
function generateEmergencyResponse(message, user, error, personaKey = 'neutral') {
  const errorMessage = error?.message || 'Lỗi không xác định';
  const userName = user?.name || 'Bạn';
  
  // Kiểm tra nếu là lỗi liên quan đến detectIncompleteTransaction
  if (errorMessage.includes('detectIncompleteTransaction')) {
    const base = `❌ **Đã xảy ra lỗi khi xử lý yêu cầu của bạn**

Xin lỗi ${userName}, hệ thống đang gặp sự cố kỹ thuật khi phân tích giao dịch.

**Thông tin lỗi:** ${errorMessage}

💡 **Gợi ý:**
- Vui lòng thử lại sau vài giây
- Đảm bảo bạn đã nhập đầy đủ thông tin (ví dụ: "ăn tối 50k")
- Nếu vấn đề vẫn tiếp tục, vui lòng liên hệ hỗ trợ

🔄 **Thử lại với:** "ăn tối 50k" hoặc "nhận lương 10 triệu"`;
    return styleResponseByPersona(personaKey, base);
  }
  
  const baseDefault = `❌ **Đã xảy ra lỗi khi xử lý yêu cầu của bạn**

Xin lỗi ${userName}, hệ thống đang gặp sự cố kỹ thuật.

**Thông tin lỗi:** ${errorMessage}

💡 **Gợi ý:**
- Vui lòng thử lại sau vài giây
- Kiểm tra lại kết nối mạng của bạn
- Nếu vấn đề vẫn tiếp tục, vui lòng liên hệ hỗ trợ

🔄 **Thử lại với:** "ăn tối 50k" hoặc "nhận lương 10 triệu"`;
  return styleResponseByPersona(personaKey, baseDefault);
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

    // THÊM: Lưu ngữ cảnh tạo giao dịch vào semantic memory
    try {
      const summary = `Tạo giao dịch ${type === 'income' ? 'thu' : 'chi'}: ${transaction.title} - ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)}${transaction.category ? ` | Danh mục: ${transaction.category.name || ''}` : ''} | Ví: ${wallet.name}`;
      await addToVectorStore(req.user._id, summary, { type: 'transaction_create', transactionId: String(transaction._id) });
    } catch (memErr) {
      console.warn('⚠️ Store create memory failed:', memErr.message);
    }

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

    // THÊM: Lưu ngữ cảnh sửa giao dịch vào semantic memory
    try {
      const summary = `Sửa giao dịch: ${tx.title} - ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount)} | Ví: ${tx.wallet?.name}${tx.category ? ` | Danh mục: ${tx.category.name}` : ''}`;
      await addToVectorStore(req.user._id, summary, { type: 'transaction_edit', transactionId: String(tx._id) });
    } catch (memErr) {
      console.warn('⚠️ Store edit memory failed:', memErr.message);
    }
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

    // THÊM: Lưu ngữ cảnh xóa giao dịch vào semantic memory
    try {
      const summary = `Xóa giao dịch: ${deletedTxInfo.title || 'Giao dịch'} - ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(deletedTxInfo.amount)} | Ví: ${deletedTxInfo.walletName}${deletedTxInfo.categoryName ? ` | Danh mục: ${deletedTxInfo.categoryName}` : ''}`;
      await addToVectorStore(req.user._id, summary, { type: 'transaction_delete', transactionId: String(deletedTxInfo.id) });
    } catch (memErr) {
      console.warn('⚠️ Store delete memory failed:', memErr.message);
    }
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

// ======================== POST /api/ai/insights ========================
// Endpoint phân tích và cung cấp thông tin chi tiết về giao dịch
router.get('/insights', auth, requireAuth, async (req, res) => {
  try {
    const userId = req.user._id;
    const monthsParam = Math.max(1, Math.min(6, parseInt(req.query.months || '3', 10)));
    const months = buildMonthsWindow(monthsParam);

    // Time window bounds (from earliest month start to last month end)
    const from = months[0].start;
    const to = months[months.length - 1].end;

    // Wallet filter for current user
    let walletFilter = {};
    if (req.query.walletId) {
      walletFilter = { _id: req.query.walletId };
    }
    const wallets = await Wallet.find({ owner: userId, ...walletFilter }).select('_id').lean();
    const walletIds = wallets.map(w => w._id);

    // Pull transactions within time window for user's wallets, or by user field if available
    const txQuery = {
      date: { $gte: from, $lt: to }
    };
    if (walletIds.length > 0) {
      txQuery.wallet = { $in: walletIds };
    } else {
      // fallback if wallet ownership not used in your schema
      txQuery.user = userId;
    }

    const txs = await Transaction.find(txQuery)
      .populate('category', 'name icon type')
      .populate('wallet', 'name currency')
      .lean();

    const payload = aggregateInsights(txs || [], months);
    return res.json({
      ok: true,
      ...payload
    });
  } catch (err) {
    console.error('AI insights error:', err);
    res.status(500).json({ ok: false, message: 'Failed to compute insights', error: err.message });
  }
});

// ======================== Helper functions (tiếp theo) ========================

// Helper: month boundaries
function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);
}

// Helper: build months window (latest at end)
function buildMonthsWindow(count = 3) {
  const now = new Date();
  const arr = [];
  for (let i = count - 1; i >= 0; i--) {
    const head = new Date(now.getFullYear(), now.getMonth() - i, 1);
    arr.push({
      label: head.toLocaleDateString('vi-VN', { month: '2-digit', year: '2-digit' }),
      start: startOfMonth(head),
      end: endOfMonth(head)
    });
  }
  return arr;
}

// Helper: aggregate insights
function aggregateInsights(transactions, months) {
  const perMonthTotals = months.map(() => ({ expense: 0, income: 0 }));
  const perMonthByCat = months.map(() => ({}));
  const perMonthNightExpense = months.map(() => 0);

  transactions.forEach(t => {
    if (!t?.date) return;
    const d = new Date(t.date);
    const idx = months.findIndex(m => d >= m.start && d < m.end);
    if (idx === -1) return;

    const amt = Number(t.amount) || 0;
    if (t.type === 'income') {
      perMonthTotals[idx].income += amt;
    } else if (t.type === 'expense') {
      perMonthTotals[idx].expense += amt;
      const catName = (t.category && t.category.name) || 'Khác';
      perMonthByCat[idx][catName] = (perMonthByCat[idx][catName] || 0) + amt;
      const hr = d.getHours();
      if (hr < 6 || hr >= 21) perMonthNightExpense[idx] += amt;
    }
  });

  // Current vs previous month stats
  const curIdx = months.length - 1;
  const prevIdx = months.length - 2;
  const curTotalExp = perMonthTotals[curIdx]?.expense || 0;
  const curCatMap = perMonthByCat[curIdx] || {};
  const prevCatMap = perMonthByCat[prevIdx] || {};
  const nightCur = perMonthNightExpense[curIdx] || 0;
  const nightPrev = perMonthNightExpense[prevIdx] || 0;

  // Top category share
  let topCat = 'Khác';
  let topAmt = 0;
  const entries = Object.entries(curCatMap).sort((a, b) => b[1] - a[1]);
  if (entries.length) {
    [topCat, topAmt] = entries[0];
  }
  const topShare = curTotalExp > 0 ? Math.round((topAmt / curTotalExp) * 100) : 0;
  let topDeltaTxt = '';
  if (months.length >= 2) {
    const prevTotalExp = perMonthTotals[prevIdx]?.expense || 0;
    const prevTopAmt = prevCatMap[topCat] || 0;
    const prevShare = prevTotalExp > 0 ? Math.round((prevTopAmt / prevTotalExp) * 100) : 0;
    const diff = topShare - prevShare;
    if (diff !== 0) topDeltaTxt = diff > 0 ? `, tăng ${diff}% so với tháng trước` : `, giảm ${Math.abs(diff)}% so với tháng trước`;
  }

  // Night spending change
  let nightChangePct = 0;
  if (months.length >= 2 && nightPrev > 0) {
    nightChangePct = Math.round(((nightCur - nightPrev) / nightPrev) * 100);
  }

  // Suggestions
  const suggestions = [];
  if (curTotalExp > 0) {
    suggestions.push(`Bạn chi ${topShare}% cho ${topCat}${topDeltaTxt}.`);
    if (topShare >= 30) {
      suggestions.push(`Gợi ý: đặt mục tiêu tiết kiệm 5–10% cho danh mục ${topCat} trong tháng tới.`);
    }
  }
  if (months.length >= 2 && Math.abs(nightChangePct) >= 20) {
    suggestions.push(`Chi tiêu ban đêm ${nightChangePct >= 0 ? 'tăng' : 'giảm'} ${Math.abs(nightChangePct)}% so với tháng trước.`);
  }

  // Line dataset for chart (expense focus)
  const lineData = {
    labels: months.map(m => m.label),
    datasets: [
      {
        label: 'Chi tiêu theo tháng',
        data: perMonthTotals.map(x => x.expense),
        borderColor: 'rgba(231, 76, 60, 0.9)',
        backgroundColor: 'rgba(231, 76, 60, 0.25)',
        tension: 0.35,
        pointRadius: 3,
        pointHoverRadius: 4
      }
    ]
  };

  // Top categories breakdown current month
  const topCategories = entries.slice(0, 6).map(([name, total]) => ({
    name,
    total,
    share: curTotalExp > 0 ? Math.round((total / curTotalExp) * 100) : 0
  }));

  return {
    months,
    totals: perMonthTotals,
    topCategories,
    nightSpending: { current: nightCur, previous: nightPrev, changePct: nightChangePct },
    suggestions,
    lineData
  };
}

/**
 * GET /api/ai/insights
 * Query:
 * - months: number of months window (1..6), default 3
 * - walletId: optional filter by a specific wallet
 */
router.get('/insights', auth, requireAuth, async (req, res) => {
  try {
    const userId = req.user._id;
    const monthsParam = Math.max(1, Math.min(6, parseInt(req.query.months || '3', 10)));
    const months = buildMonthsWindow(monthsParam);

    // Time window bounds (from earliest month start to last month end)
    const from = months[0].start;
    const to = months[months.length - 1].end;

    // Wallet filter for current user
    let walletFilter = {};
    if (req.query.walletId) {
      walletFilter = { _id: req.query.walletId };
    }
    const wallets = await Wallet.find({ owner: userId, ...walletFilter }).select('_id').lean();
    const walletIds = wallets.map(w => w._id);

    // Pull transactions within time window for user's wallets, or by user field if available
    const txQuery = {
      date: { $gte: from, $lt: to }
    };
    if (walletIds.length > 0) {
      txQuery.wallet = { $in: walletIds };
    } else {
      // fallback if wallet ownership not used in your schema
      txQuery.user = userId;
    }

    const txs = await Transaction.find(txQuery)
      .populate('category', 'name icon type')
      .populate('wallet', 'name currency')
      .lean();

    const payload = aggregateInsights(txs || [], months);
    return res.json({
      ok: true,
      ...payload
    });
  } catch (err) {
    console.error('AI insights error:', err);
    res.status(500).json({ ok: false, message: 'Failed to compute insights', error: err.message });
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

// ======================== POST /api/ai/insights ========================
// Endpoint phân tích và cung cấp thông tin chi tiết về giao dịch
router.get('/insights', auth, requireAuth, async (req, res) => {
  try {
    const userId = req.user._id;
    const monthsParam = Math.max(1, Math.min(6, parseInt(req.query.months || '3', 10)));
    const months = buildMonthsWindow(monthsParam);

    // Time window bounds (from earliest month start to last month end)
    const from = months[0].start;
    const to = months[months.length - 1].end;

    // Wallet filter for current user
    let walletFilter = {};
    if (req.query.walletId) {
      walletFilter = { _id: req.query.walletId };
    }
    const wallets = await Wallet.find({ owner: userId, ...walletFilter }).select('_id').lean();
    const walletIds = wallets.map(w => w._id);

    // Pull transactions within time window for user's wallets, or by user field if available
    const txQuery = {
      date: { $gte: from, $lt: to }
    };
    if (walletIds.length > 0) {
      txQuery.wallet = { $in: walletIds };
    } else {
      // fallback if wallet ownership not used in your schema
      txQuery.user = userId;
    }

    const txs = await Transaction.find(txQuery)
      .populate('category', 'name icon type')
      .populate('wallet', 'name currency')
      .lean();

    const payload = aggregateInsights(txs || [], months);
    return res.json({
      ok: true,
      ...payload
    });
  } catch (err) {
    console.error('AI insights error:', err);
    res.status(500).json({ ok: false, message: 'Failed to compute insights', error: err.message });
  }
});

// ======================== Helper functions (tiếp theo) ========================

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
        const fallbackResult = analyzeCategoryWithFallback(
          message, 
          walletCategories
        );
        
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
      const fallbackResult = analyzeCategoryWithFallback(
        message, 
        walletCategories
      );
      
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