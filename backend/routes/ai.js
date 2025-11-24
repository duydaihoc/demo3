require('dotenv').config();
const express = require('express');
const router = express.Router();
const { auth, requireAuth } = require('../middleware/auth');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const Category = require('../models/Category');
const multer = require('multer');

// ======================== GEMINI AI SETUP ========================
let model = null;
let geminiAvailable = false;
let embeddingModel = null; // THÊM: model embedding
const userVectorStores = new Map(); // THÊM: Map lưu index FAISS và metadata

// THÊM: Cấu hình multer để nhận ảnh hóa đơn (lưu trên memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

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
  
  // THÊM: Phát hiện yêu cầu gợi ý chi tiêu TRƯỚC (ưu tiên cao nhất)
  const spendingSuggestionKeywords = [
    'gợi ý chi tiêu',
    'goi y chi tieu',
    'nên chi gì',
    'nen chi gi',
    'chi tiêu gì',
    'chi tieu gi',
    'gợi ý tiêu',
    'nên mua gì',
    'nen mua gi',
    'có thể chi',
    'co the chi',
    'nên tiêu',
    'nen tieu',
    'gợi ý mua',
    'goi y mua',
    'nên mua',
    'nen mua'
  ];
  const isSpendingSuggestion = spendingSuggestionKeywords.some(k => lower.includes(k));
  
  // THÊM: Trích xuất số tiền từ message nếu có
  let suggestedAmount = null;
  if (isSpendingSuggestion) {
    suggestedAmount = extractAmount(message);
  }
  
  // Nếu là gợi ý chi tiêu, KHÔNG coi là stats hoặc advice thông thường
  if (isSpendingSuggestion) {
    return {
      advice: false,
      stats: false,
      spendingSuggestion: true,
      suggestedAmount: suggestedAmount
    };
  }
  
  const adviceKeywords = ['lời khuyên', 'tiết kiệm', 'đầu tư', 'kế hoạch', 'mục tiêu', 'gợi ý', 'hướng đi'];
  const statsKeywords = [
    'thống kê',
    'báo cáo',
    'phân tích',
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
  
  // LƯU Ý: "chi tiêu" chỉ được thêm vào statsKeywords nếu KHÔNG phải là gợi ý chi tiêu
  // và có kèm theo từ khóa thống kê/phân tích
  const hasStatsContext = lower.includes('thống kê') || lower.includes('phân tích') || 
                          lower.includes('báo cáo') || lower.includes('tổng kết');
  const isStatsWithExpense = hasStatsContext && (lower.includes('chi tiêu') || lower.includes('chi tieu'));
  
  return {
    advice: adviceKeywords.some(k => lower.includes(k)),
    stats: statsKeywords.some(k => lower.includes(k)) || isStatsWithExpense,
    spendingSuggestion: false, // Đã xử lý ở trên
    suggestedAmount: null
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

**QUAN TRỌNG - PHÂN TÍCH KỸ Ý ĐỊNH:** 
- TRƯỚC TIÊN: Kiểm tra xem câu nói có phải là YÊU CẦU GỢI Ý, PHÂN TÍCH, SỬA, XÓA không
- CHỈ phân tích loại giao dịch (thu/chi), số tiền và mô tả. KHÔNG phân tích danh mục hay ví.
- NẾU người dùng chỉ nói ý định chung (ví dụ: "tạo chi tiêu", "tạo thu nhập") mà KHÔNG có tên cụ thể và số tiền, thì set hasIntent = false
- CHỈ set hasIntent = true khi có ĐỦ cả: loại giao dịch, số tiền VÀ tên giao dịch cụ thể

**LOẠI TRỪ CÁC TRƯỜNG HỢP SAU (set hasIntent = false):**
- "gợi ý chi tiêu", "nên chi gì", "chi tiêu gì", "gợi ý mua", "nên mua gì" → YÊU CẦU GỢI Ý
- "phân tích chi tiêu", "phân tích sâu", "chi tiết chi tiêu" → YÊU CẦU PHÂN TÍCH
- "sửa giao dịch", "chỉnh giao dịch", "đổi giao dịch" → YÊU CẦU SỬA
- "xóa giao dịch", "hủy giao dịch" → YÊU CẦU XÓA
- "hủy việc tạo/sửa/xóa" → HỦY HÀNH ĐỘNG
- "thống kê", "báo cáo", "tổng quan" → YÊU CẦU THỐNG KÊ

CÂU NÓI CỦA NGƯỜI DÙNG: "${message}"

HƯỚNG DẪN PHÂN TÍCH (theo thứ tự):
1. **Bước 1 - Kiểm tra loại yêu cầu:**
   - Nếu có từ khóa "gợi ý", "phân tích", "sửa", "xóa", "thống kê" → set hasIntent = false ngay, KHÔNG phân tích tiếp
   
2. **Bước 2 - Xác định loại giao dịch:**
   - "expense" (chi tiêu) hoặc "income" (thu nhập)
   
3. **Bước 3 - Trích xuất số tiền:**
   - Chuyển đổi k, nghìn, triệu → số nguyên
   - BẮT BUỘC phải có số tiền
   
4. **Bước 4 - Tạo mô tả:**
   - Mô tả ngắn gọn, cụ thể
   - KHÔNG được là từ khóa chung: "chi tiêu", "thu nhập", "giao dịch"
   - Phải là tên cụ thể: "ăn tối", "mua sách", "nhận lương"

CÁC TRƯỜNG HỢP KHÔNG ĐỦ THÔNG TIN (set hasIntent = false):
- "tạo chi tiêu" → thiếu tên và số tiền
- "tạo thu nhập" → thiếu tên và số tiền
- "chi tiêu 100k" → thiếu tên cụ thể (chỉ có loại và số tiền)
- "thu nhập 5 triệu" → thiếu tên cụ thể
- "gợi ý chi tiêu" → đây là yêu cầu gợi ý, không phải tạo giao dịch
- "phân tích chi tiêu" → đây là yêu cầu phân tích, không phải tạo giao dịch

CÁC TRƯỜNG HỢP ĐỦ THÔNG TIN (set hasIntent = true):
- "ăn tối 200k" → có đủ: tên (ăn tối), số tiền (200k), loại (chi tiêu)
- "mua sách 500 nghìn" → có đủ: tên (mua sách), số tiền (500k), loại (chi tiêu)
- "nhận lương 10 triệu" → có đủ: tên (nhận lương), số tiền (10tr), loại (thu nhập)
- "đổ xăng 150k" → có đủ: tên (đổ xăng), số tiền (150k), loại (chi tiêu)

Trả về JSON (KHÔNG markdown, CHỈ JSON):
{
  "hasIntent": true/false,
  "type": "expense" hoặc "income" (chỉ khi hasIntent = true),
  "amount": số tiền (số, không đơn vị) (chỉ khi hasIntent = true),
  "description": "mô tả ngắn gọn" (chỉ khi hasIntent = true, KHÔNG được là từ khóa chung),
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
    
    // LOẠI TRỪ: Kiểm tra xem có phải là "hủy hành động" không (hủy việc tạo/sửa/xóa)
    const isCancelAction = lowerMessage.includes('hủy việc') || lowerMessage.includes('huy viec') ||
                           lowerMessage.includes('đã hủy việc') || lowerMessage.includes('da huy viec') ||
                           lowerMessage.includes('hủy việc tạo') || lowerMessage.includes('hủy việc sửa') ||
                           lowerMessage.includes('hủy việc xóa') || lowerMessage.includes('hủy hành động') ||
                           lowerMessage.includes('đã hủy') || lowerMessage.includes('da huy');
    
    if (isCancelAction) {
      // Đây là hủy hành động, không phải tạo giao dịch
      return { complete: false, missing: null };
    }
    
    // Nếu đang có pending transaction, check xem message có cung cấp thông tin còn thiếu không
    if (pendingTransaction) {
      console.log('🔍 Processing pending transaction:', {
        currentPending: pendingTransaction,
        message: message
      });
      
      const amount = extractAmount(message);
      
      // Trích xuất tên giao dịch từ message (loại bỏ số tiền và các từ khóa chung)
      let description = message.trim();
      const removeKeywords = [
        'tạo giao dịch', 'thêm giao dịch', 'ghi giao dịch', 
        'tạo', 'thêm', 'ghi', 'nhận', 'thu', 'chi', 'tiêu'
      ];
      removeKeywords.forEach(keyword => {
        description = description.replace(new RegExp(keyword, 'gi'), '').trim();
      });
      
      // Loại bỏ số tiền khỏi description để kiểm tra xem có tên mới không
      let descriptionWithoutAmount = description;
      if (amount) {
        const amountStr = amount.toString();
        const amountPatterns = [
          new RegExp(amountStr.replace(/\B(?=(\d{3})+(?!\d))/g, ','), 'gi'),
          new RegExp(amountStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.'), 'gi'),
          new RegExp(`${(amount / 1000).toFixed(0)}k`, 'gi'),
          new RegExp(`${(amount / 1000).toFixed(0)} nghìn`, 'gi'),
          new RegExp(`${(amount / 1000000).toFixed(0)} triệu`, 'gi'),
        ];
        amountPatterns.forEach(pattern => {
          descriptionWithoutAmount = descriptionWithoutAmount.replace(pattern, '').trim();
        });
      }
      
      // Kiểm tra description có phải là từ khóa chung chung không
      const genericKeywords = [
        'chi tiêu', 'chitieu', 'chi', 'expense',
        'thu nhập', 'thunhap', 'thu', 'income',
        'giao dịch', 'giaodich', 'giao dich'
      ];
      const isGenericDescription = genericKeywords.some(keyword => 
        descriptionWithoutAmount.toLowerCase().trim() === keyword.toLowerCase()
      );
      
      // QUAN TRỌNG: Sử dụng description từ pendingTransaction nếu đã có, hoặc description mới nếu hợp lệ
      const finalDescription = (
        (!isGenericDescription && descriptionWithoutAmount.trim() !== '') 
          ? descriptionWithoutAmount.trim() 
          : (pendingTransaction.description || null)
      );
      
      // Xác định thông tin hiện có
      const hasAmount = !!amount || !!pendingTransaction.amount;
      const finalAmount = amount || pendingTransaction.amount || null;
      const hasDescription = !!finalDescription && !genericKeywords.some(keyword => 
        finalDescription.toLowerCase().trim() === keyword.toLowerCase()
      );
      
      // Nếu có đủ cả hai, trả về complete
      if (hasAmount && hasDescription) {
        return {
          complete: true,
          transaction: {
            ...pendingTransaction,
            amount: finalAmount,
            description: finalDescription,
            fullContext: `${finalDescription} ${finalAmount}`.trim()
          }
        };
      }
      
      // Nếu thiếu một hoặc cả hai
      let missing = [];
      if (!hasAmount) missing.push('amount');
      if (!hasDescription) missing.push('description');
      
      // Cập nhật pending transaction với thông tin mới (giữ lại thông tin cũ nếu chưa có mới)
      const updatedPending = {
        ...pendingTransaction,
        description: finalDescription,
        amount: finalAmount
      };
      
      console.log('📝 Updated pending transaction:', {
        updatedPending: updatedPending,
        missing: missing,
        hasAmount: hasAmount,
        hasDescription: hasDescription
      });
      
      return {
        complete: false,
        missing: missing.length === 1 ? missing[0] : 'both',
        pendingTransaction: updatedPending
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
    
    // LOẠI TRỪ: Kiểm tra xem có phải là "gợi ý chi tiêu" không (KHÔNG phải tạo giao dịch)
    const spendingSuggestionKeywords = [
      'gợi ý chi tiêu', 'goi y chi tieu',
      'nên chi gì', 'nen chi gi',
      'chi tiêu gì', 'chi tieu gi',
      'gợi ý tiêu', 'goi y tieu',
      'nên mua gì', 'nen mua gi',
      'có thể chi', 'co the chi',
      'nên tiêu', 'nen tieu',
      'gợi ý mua', 'goi y mua'
    ];
    const isSpendingSuggestionRequest = spendingSuggestionKeywords.some(k => lowerMessage.includes(k));
    
    // Nếu là yêu cầu gợi ý chi tiêu, KHÔNG coi là tạo giao dịch
    if (isSpendingSuggestionRequest) {
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
      
      // Phát hiện các từ khóa chung chung (chỉ là ý định, không có tên cụ thể)
      const genericKeywords = [
        'chi tiêu', 'chitieu', 'chi', 'expense',
        'thu nhập', 'thunhap', 'thu', 'income',
        'giao dịch', 'giaodich', 'giao dich',
        'tạo', 'thêm', 'ghi'
      ];
      
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
      
      // Kiểm tra xem description có phải là từ khóa chung chung không
      const isGenericDescription = genericKeywords.some(keyword => 
        description.toLowerCase().trim() === keyword.toLowerCase() || 
        description.toLowerCase().trim() === ''
      );
      
      // Nếu thiếu số tiền HOẶC description quá chung chung, cần hỏi lại
      if (!amount || isGenericDescription) {
        // Xác định thiếu gì
        let missing = [];
        if (!amount) missing.push('amount');
        if (isGenericDescription || !description || description.trim() === '') {
          missing.push('description');
        }
        
        return {
          complete: false,
          missing: missing.length === 1 ? missing[0] : 'both', // 'amount', 'description', hoặc 'both'
          pendingTransaction: {
            type: type,
            description: isGenericDescription ? null : (description || null), // null nếu quá chung chung
            hasDescription: !isGenericDescription && !!description
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
  
  if (!description || description.trim() === '') {
    // Thiếu cả tên và số tiền
    return `💡 **Tôi hiểu bạn muốn tạo giao dịch ${type === 'income' ? 'thu nhập' : 'chi tiêu'}:**

❓ **Vui lòng cung cấp:**
1. 📝 **Tên giao dịch** (ví dụ: "ăn tối", "mua sách", "nhận lương")
2. 💰 **Số tiền** (ví dụ: "50k", "500 nghìn", "2 triệu")

Bạn có thể trả lời một lần như: "ăn tối 200k" hoặc trả lời từng phần.`;
  }
  
  return `💡 **Tôi hiểu bạn muốn tạo giao dịch:**

📝 ${description}
${type === 'income' ? '💰 Thu nhập' : '💸 Chi tiêu'}

❓ **Số tiền là bao nhiêu?**

Ví dụ: "50k", "50 nghìn", "500.000đ", "2 triệu"`;
}

// THÊM: Helper function phân tích danh mục cho message (sử dụng Gemini) - CẢI THIỆN
async function analyzeCategoryForMessage(message, categories, model, hintedType = null, userHistory = null) {
  try {
    const expenseCats = categories.filter(c => c.type === 'expense' || !c.type);
    const incomeCats = categories.filter(c => c.type === 'income');

    // Phân tích message để trích xuất thông tin
    const lowerMessage = message.toLowerCase();
    const amount = extractAmount(message);
    const hasAmount = amount !== null;
    
    // Tạo context về lịch sử giao dịch nếu có
    let historyContext = '';
    if (userHistory && userHistory.length > 0) {
      // Phân tích pattern từ lịch sử
      const similarTransactions = userHistory.filter(t => {
        const txDesc = (t.title || t.description || '').toLowerCase();
        const txAmount = t.amount || 0;
        
        // Tìm giao dịch tương tự về mô tả hoặc số tiền
        const descSimilar = txDesc.split(' ').some(word => 
          word.length > 3 && lowerMessage.includes(word)
        );
        const amountSimilar = hasAmount && Math.abs(txAmount - amount) < amount * 0.5;
        
        return descSimilar || amountSimilar;
      }).slice(0, 5);
      
      if (similarTransactions.length > 0) {
        const categoryFrequency = new Map();
        similarTransactions.forEach(t => {
          if (t.category && t.category.name) {
            const catName = t.category.name;
            categoryFrequency.set(catName, (categoryFrequency.get(catName) || 0) + 1);
          }
        });
        
        const topCategories = Array.from(categoryFrequency.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([name]) => name);
        
        if (topCategories.length > 0) {
          historyContext = `\n\n**LỊCH SỬ GIAO DỊCH TƯƠNG TỰ:**
- Tìm thấy ${similarTransactions.length} giao dịch tương tự
- Danh mục thường dùng cho loại giao dịch này: ${topCategories.join(', ')}
- Hãy ưu tiên chọn danh mục từ danh sách trên nếu phù hợp.`;
        }
      }
    }

    const categoryPrompt = `
Bạn là AI chuyên gia phân tích danh mục cho giao dịch tài chính. Nhiệm vụ của bạn là PHÂN TÍCH SÂU và CHỌN DANH MỤC CHÍNH XÁC NHẤT.

DANH MỤC CHI TIÊU CÓ SẴN:
${expenseCats.map(c => `- ${c.name}${c.icon ? ` (${c.icon})` : ''} - Mô tả: ${c.description || 'Không có mô tả'} (ID: ${c._id})`).join('\n')}

DANH MỤC THU NHẬP CÓ SẴN:
${incomeCats.map(c => `- ${c.name}${c.icon ? ` (${c.icon})` : ''} - Mô tả: ${c.description || 'Không có mô tả'} (ID: ${c._id})`).join('\n')}

CÂU NÓI VỀ GIAO DỊCH: "${message}"
${hintedType ? `\nLOẠI GIAO DỊCH: ${hintedType === 'expense' ? 'Chi tiêu' : 'Thu nhập'}` : ''}
${hasAmount ? `\nSỐ TIỀN: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)}` : ''}
${historyContext}

**QUAN TRỌNG - PHÂN TÍCH SÂU:**
1. **PHÂN TÍCH NGỮ CẢNH:**
   - Đọc kỹ mô tả giao dịch, tìm từ khóa chính
   - Xem xét số tiền (nếu có) để suy đoán loại giao dịch
   - Phân tích thời gian/địa điểm nếu có trong mô tả

2. **SO SÁNH VỚI DANH MỤC:**
   - Đọc MÔ TẢ của từng danh mục, không chỉ tên
   - Tìm danh mục có mô tả KHỚP NHẤT với giao dịch
   - Nếu có lịch sử tương tự, ưu tiên danh mục đã dùng trước đó

3. **MAPPING KEYWORDS THÔNG MINH:**
   - Ăn, uống, nhậu, cafe, trà sữa, cơm, bún, phở, tối, sáng, trưa, buffet, nhà hàng → Tìm danh mục "Ăn uống" hoặc tương tự
   - Xăng, đổ xăng, xe, taxi, grab, uber, bus, tàu, máy bay, vé → Tìm "Đi lại", "Xe cộ", "Giao thông"
   - Quần áo, giày dép, phụ kiện, mua sắm, shopping, thời trang → Tìm "Mua sắm", "Quần áo", "Thời trang"
   - Điện, nước, internet, wifi, điện thoại, tiền nhà, thuê nhà → Tìm "Hóa đơn", "Tiện ích", "Nhà ở"
   - Phim, game, giải trí, vui chơi, karaoke, bar, club → Tìm "Giải trí", "Vui chơi"
   - Sức khỏe, bệnh viện, thuốc, khám, y tế, phòng khám → Tìm "Sức khỏe", "Y tế"
   - Học, sách, khóa học, trường, học phí, giáo dục → Tìm "Học tập", "Giáo dục"
   - Lương, thưởng, nhận tiền, tiền lương, thu nhập → Tìm "Lương", "Thu nhập"
   - Tiết kiệm, đầu tư, gửi tiết kiệm → Tìm "Tiết kiệm", "Đầu tư"

4. **XỬ LÝ TRƯỜNG HỢP ĐẶC BIỆT:**
   - Nếu mô tả mơ hồ (ví dụ: "chi tiêu 100k"), phân tích dựa trên số tiền và lịch sử
   - Nếu có nhiều danh mục phù hợp, chọn danh mục CỤ THỂ NHẤT (ví dụ: "Cafe" thay vì "Ăn uống" nếu có)
   - Nếu không có danh mục phù hợp 100%, chọn danh mục GẦN NHẤT hoặc null

**VÍ DỤ PHÂN TÍCH:**
Input: "ăn tối nhà hàng 200k"
- Từ khóa: "ăn tối", "nhà hàng"
- Số tiền: 200,000 VND (mức trung bình cho bữa ăn)
- Phân tích: Đây là chi tiêu ăn uống tại nhà hàng
- Chọn: Danh mục "Ăn uống" (ID: ...)

Input: "đổ xăng xe máy 150k"
- Từ khóa: "đổ xăng", "xe máy"
- Số tiền: 150,000 VND (phù hợp với đổ xăng)
- Phân tích: Chi tiêu cho phương tiện đi lại
- Chọn: Danh mục "Đi lại" hoặc "Xe cộ" (ID: ...)

Trả về JSON (KHÔNG markdown, CHỈ JSON):
{
  "categoryId": "ID dạng 507f1f77bcf86cd799439011" hoặc null,
  "categoryName": "Tên danh mục" hoặc null,
  "confidence": 0-1 (độ tự tin, cao hơn nếu có lịch sử tương tự),
  "reasoning": "Giải thích chi tiết tại sao chọn danh mục này, dựa trên mô tả, số tiền, và lịch sử (nếu có)"
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
    
    // THÊM: Kiểm tra ý định XÓA - LOẠI TRỪ các trường hợp "hủy việc tạo/sửa/xóa" (hủy hành động, không phải xóa giao dịch)
    const isCancelAction = lowerMessageEarly.includes('hủy việc') || lowerMessageEarly.includes('huy viec') ||
                           lowerMessageEarly.includes('đã hủy việc') || lowerMessageEarly.includes('da huy viec') ||
                           lowerMessageEarly.includes('hủy việc tạo') || lowerMessageEarly.includes('hủy việc sửa') ||
                           lowerMessageEarly.includes('hủy việc xóa') || lowerMessageEarly.includes('hủy hành động');
    
    // Chỉ coi là xóa giao dịch nếu có từ khóa xóa/hủy NHƯNG KHÔNG phải là hủy hành động
    const isDeleteIntentEarly = !isCancelAction && (
      lowerMessageEarly.includes('xóa') || lowerMessageEarly.includes('xoá') || 
      (lowerMessageEarly.includes('hủy') && !lowerMessageEarly.includes('hủy việc')) ||
      (lowerMessageEarly.includes('bỏ') && !lowerMessageEarly.includes('bỏ việc'))
    );

    // THÊM: Kiểm tra gợi ý chi tiêu TRƯỚC (ưu tiên cao nhất)
    const earlyAdviceStatsIntent = detectAdviceOrStatsIntent(message);
    const isSpendingSuggestionEarly = earlyAdviceStatsIntent.spendingSuggestion;
    
    // Chỉ kiểm tra incomplete transaction khi KHÔNG phải sửa/xóa VÀ KHÔNG phải gợi ý chi tiêu
    const incompleteCheck = !isEditIntentEarly && !isDeleteIntentEarly && !isSpendingSuggestionEarly 
      ? detectIncompleteTransaction(message, pendingTransaction) 
      : { complete: false, missing: null };
    
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
          
          // Lấy lịch sử giao dịch để phân tích pattern
          const userHistory = await Transaction.find({ 
            wallet: { $in: wallets.map(w => w._id) } 
          })
            .populate('category', 'name')
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();
          
          const categoryAnalysis = await analyzeCategoryForMessage(
            contextForAnalysis,
            categories,
            model,
            incompleteCheck.transaction.type || null,
            userHistory
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
    
    // Xử lý khi thiếu thông tin
    if (incompleteCheck.missing && incompleteCheck.pendingTransaction) {
      let promptReply = '';
      const { type, description, amount } = incompleteCheck.pendingTransaction;
      
      if (incompleteCheck.missing === 'both') {
        // Thiếu cả tên và số tiền
        promptReply = `💡 **Tôi hiểu bạn muốn tạo giao dịch ${type === 'income' ? 'thu nhập' : 'chi tiêu'}:**

❓ **Vui lòng cung cấp:**
1. 📝 **Tên giao dịch** (ví dụ: "ăn tối", "mua sách", "nhận lương")
2. 💰 **Số tiền** (ví dụ: "50k", "500 nghìn", "2 triệu")

Bạn có thể trả lời một lần như: "ăn tối 200k" hoặc trả lời từng phần.`;
      } else if (incompleteCheck.missing === 'description') {
        // Thiếu tên giao dịch (nhưng có thể đã có số tiền)
        let infoText = '';
        if (amount) {
          infoText = `\n💰 Số tiền đã có: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)}\n`;
        }
        promptReply = `💡 **Tôi hiểu bạn muốn tạo giao dịch ${type === 'income' ? 'thu nhập' : 'chi tiêu'}:**
${infoText}
❓ **Tên giao dịch là gì?**

Ví dụ: "ăn tối", "mua sách", "nhận lương", "đổ xăng"...`;
      } else if (incompleteCheck.missing === 'amount') {
        // Thiếu số tiền (nhưng đã có tên)
        let infoText = '';
        if (description) {
          infoText = `\n📝 Tên giao dịch: ${description}\n`;
        }
        promptReply = `💡 **Tôi hiểu bạn muốn tạo giao dịch ${type === 'income' ? 'thu nhập' : 'chi tiêu'}:**
${infoText}
❓ **Số tiền là bao nhiêu?**

Ví dụ: "50k", "50 nghìn", "500.000đ", "2 triệu"`;
      }
      
      // Lưu ngữ cảnh hỏi thêm thông tin
      try {
        await addToVectorStore(userId, `Hỏi bổ sung ${incompleteCheck.missing} cho giao dịch chưa đủ thông tin`, { 
          type: 'needs_more_info', 
          missing: incompleteCheck.missing 
        });
      } catch (memErr) {
        console.warn('⚠️ Need-more-info memory failed:', memErr.message);
      }
      
      console.log('📋 Returning needsMoreInfo response:', {
        missing: incompleteCheck.missing,
        pendingTransaction: incompleteCheck.pendingTransaction
      });
      
      return res.json({
        reply: styleResponseByPersona(personaKey, promptReply),
        needsMoreInfo: true,
        pendingTransaction: incompleteCheck.pendingTransaction, // QUAN TRỌNG: Luôn trả về pendingTransaction đã cập nhật
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
        
        // THÊM: Phát hiện yêu cầu phân tích chi tiêu sâu hơn
        const lowerMessageForAnalysis = message.toLowerCase();
        const isDeepSpendingAnalysis = lowerMessageForAnalysis.includes('phân tích chi tiêu') || 
                                        lowerMessageForAnalysis.includes('phan tich chi tieu') ||
                                        lowerMessageForAnalysis.includes('phân tích sâu') ||
                                        lowerMessageForAnalysis.includes('chi tiết chi tiêu') ||
                                        lowerMessageForAnalysis.includes('đi sâu vào chi tiêu');
        
        // THÊM: Phát hiện yêu cầu phân tích theo ví cụ thể
        let targetWalletId = null;
        let targetWalletName = null;
        if (isDeepSpendingAnalysis) {
          // Tìm tên ví trong message
          for (const wallet of wallets) {
            const walletNameLower = wallet.name.toLowerCase();
            if (lowerMessageForAnalysis.includes(walletNameLower)) {
              targetWalletId = wallet._id;
              targetWalletName = wallet.name;
              break;
            }
          }
        }
        
        let statsSummaryBlock = '';
        let deepSpendingAnalysis = '';
        
        if (isDeepSpendingAnalysis) {
          // Phân tích chi tiêu sâu hơn
          try {
            const analysisResult = await performDeepSpendingAnalysis(
              userId, 
              targetWalletId, 
              recentTransactions,
              wallets,
              model
            );
            deepSpendingAnalysis = analysisResult;
          } catch (err) {
            console.error('Error in deep spending analysis:', err);
            // Fallback to basic stats
            const computed = computeBasicStats(recentTransactions);
            const fmt = (n) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
            const top = computed.topCategories.map(c => `${c.name} (${fmt(c.amount)})`).join(', ');
            statsSummaryBlock = `\nTHỐNG KÊ ${computed.inLastDays} NGÀY:\n- Thu nhập: ${fmt(computed.totals.income)}\n- Chi tiêu: ${fmt(computed.totals.expense)}\n- Cân đối: ${fmt(computed.net)}\n- Top danh mục: ${top}`;
          }
        } else if (adviceStatsIntent.stats) {
          const computed = computeBasicStats(recentTransactions);
          const fmt = (n) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
          const top = computed.topCategories.map(c => `${c.name} (${fmt(c.amount)})`).join(', ');
          statsSummaryBlock = `\nTHỐNG KÊ ${computed.inLastDays} NGÀY:\n- Thu nhập: ${fmt(computed.totals.income)}\n- Chi tiêu: ${fmt(computed.totals.expense)}\n- Cân đối: ${fmt(computed.net)}\n- Top danh mục: ${top}`;
        }
        
        // THÊM: Xử lý gợi ý chi tiêu
        let spendingSuggestionBlock = '';
        if (adviceStatsIntent.spendingSuggestion) {
          try {
            // Lấy thêm giao dịch để phân tích (60 ngày)
            const extendedTransactions = await Transaction.find({ 
              wallet: { $in: wallets.map(w => w._id) } 
            })
              .populate('wallet', 'name')
              .populate('category', 'name icon type')
              .sort({ createdAt: -1 })
              .limit(100);
            
            const suggestionResult = await generateSpendingSuggestions(
              userId,
              extendedTransactions,
              wallets,
              adviceStatsIntent.suggestedAmount,
              model
            );
            spendingSuggestionBlock = suggestionResult;
          } catch (err) {
            console.error('Error generating spending suggestions:', err);
            spendingSuggestionBlock = 'Không thể tạo gợi ý chi tiêu lúc này.';
          }
        }
        
        // THÊM: Lịch sử hội thoại để giữ mạch trò chuyện
        const transcript = buildConversationTranscript(conversationHistory, 8);
        
        // THÊM: Kiểm tra ý định XÓA giao dịch TRƯỚC - LOẠI TRỪ các trường hợp "hủy việc tạo/sửa/xóa"
        const lowerMessage = message.toLowerCase();
        const isCancelAction = lowerMessage.includes('hủy việc') || lowerMessage.includes('huy viec') ||
                               lowerMessage.includes('đã hủy việc') || lowerMessage.includes('da huy viec') ||
                               lowerMessage.includes('hủy việc tạo') || lowerMessage.includes('hủy việc sửa') ||
                               lowerMessage.includes('hủy việc xóa') || lowerMessage.includes('hủy hành động');
        
        // Chỉ kiểm tra delete intent nếu KHÔNG phải là hủy hành động
        if (!isCancelAction && (
          lowerMessage.includes('xóa') || lowerMessage.includes('xoá') || 
          (lowerMessage.includes('hủy') && !lowerMessage.includes('hủy việc')) ||
          (lowerMessage.includes('bỏ') && !lowerMessage.includes('bỏ việc'))
        )) {
          
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
        
        // Nếu không phải sửa/xóa VÀ không phải câu hỏi thống kê/đánh giá tổng quan/gợi ý chi tiêu,
        // mới phân tích ý định tạo giao dịch.
        if (!editSuggestion && !deleteSuggestion && !adviceStatsIntent.stats && !adviceStatsIntent.advice && !adviceStatsIntent.spendingSuggestion) {
          const intentAnalysis = await analyzeBasicTransactionIntent(
            message, 
            model
          );
          
          if (intentAnalysis.success) {
            // KIỂM TRA: Description không được là từ khóa chung chung
            const genericKeywords = [
              'chi tiêu', 'chitieu', 'chi', 'expense',
              'thu nhập', 'thunhap', 'thu', 'income',
              'giao dịch', 'giaodich', 'giao dich',
              'tạo', 'thêm', 'ghi'
            ];
            const isGenericDescription = genericKeywords.some(keyword => 
              intentAnalysis.description.toLowerCase().trim() === keyword.toLowerCase() ||
              intentAnalysis.description.trim() === ''
            );
            
            // Nếu description quá chung chung, KHÔNG tạo suggestion
            if (isGenericDescription) {
              console.log('⚠️ Description quá chung chung, không tạo transaction suggestion');
              // Không set transactionSuggestion, để AI hỏi lại
            } else {
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

              // THÊM: Phân tích danh mục tự động cho giao dịch tạo từ chat
              try {
                const contextForCategory = `${message} | ${intentAnalysis.description}`;
                let catId = null;
                let catName = null;

                if (geminiAvailable && model) {
                // Lấy lịch sử giao dịch để phân tích pattern
                const userHistory = await Transaction.find({ 
                  wallet: { $in: wallets.map(w => w._id) } 
                })
                  .populate('category', 'name')
                  .sort({ createdAt: -1 })
                  .limit(50)
                  .lean();
                
                const catAnalysis = await analyzeCategoryForMessage(
                  contextForCategory,
                  categories,
                  model,
                  intentAnalysis.type,
                  userHistory
                );
                  catId = catAnalysis.categoryId;
                  catName = catAnalysis.categoryName;
                } else {
                  const fallbackCat = analyzeCategoryWithFallback(
                    contextForCategory,
                    categories,
                    intentAnalysis.type
                  );
                  catId = fallbackCat.categoryId;
                  catName = fallbackCat.categoryName;
                }

                transactionSuggestion.categoryId = catId;
                transactionSuggestion.categoryName = catName;

                console.log('📊 Category for basic intent:', {
                  categoryId: catId,
                  categoryName: catName
                });
              } catch (catErr) {
                console.warn('⚠️ Category analysis for basic transaction intent failed:', catErr.message);
              }
            }
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
Bạn là trợ lý tài chính cá nhân thông minh, có khả năng hiểu ngữ cảnh và ý định của người dùng một cách chính xác.

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
${recentTransactions.slice(0, 10).map(t => `- ${t.title || t.description || 'Giao dịch'}: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(t.amount)} (${t.type === 'income' ? 'Thu' : 'Chi'})`).join('\n')}

LỊCH SỬ HỘI THOẠI (mới nhất ở cuối):
${transcript}
${statsSummaryBlock}
${deepSpendingAnalysis ? `\n\nPHÂN TÍCH CHI TIÊU CHI TIẾT:\n${deepSpendingAnalysis}` : ''}
${spendingSuggestionBlock ? `\n\nGỢI Ý CHI TIÊU THÔNG MINH:\n${spendingSuggestionBlock}` : ''}

${deleteSuggestion ? 'YÊU CẦU XÓA GIAO DỊCH: Có ý định xóa, xử lý theo hướng dẫn trước.' :
 editSuggestion ? 'YÊU CẦU SỬA GIAO DỊCH: Có ý định cập nhật giao dịch.' :
 transactionSuggestion ? 'Ý ĐỊNH TẠO GIAO DỊCH MỚI: Hỏi xác nhận.' : ''}

**QUAN TRỌNG - PHÂN TÍCH CÂU HỎI CỦA NGƯỜI DÙNG:**

Trước khi trả lời, hãy PHÂN TÍCH KỸ câu hỏi để hiểu đúng ý định:

1. **PHÂN BIỆT CÁC LOẠI YÊU CẦU:**
   - "gợi ý chi tiêu", "nên chi gì", "chi tiêu gì" → YÊU CẦU GỢI Ý, KHÔNG phải tạo giao dịch
   - "phân tích chi tiêu", "phân tích sâu" → YÊU CẦU PHÂN TÍCH, KHÔNG phải tạo giao dịch
   - "tạo chi tiêu", "thêm giao dịch" → YÊU CẦU TẠO GIAO DỊCH (nhưng thiếu thông tin)
   - "ăn tối 200k", "mua sách 500k" → YÊU CẦU TẠO GIAO DỊCH (đủ thông tin)
   - "sửa giao dịch X", "xóa giao dịch Y" → YÊU CẦU SỬA/XÓA
   - "hủy việc tạo/sửa/xóa" → HỦY HÀNH ĐỘNG, KHÔNG phải yêu cầu mới

2. **SỬ DỤNG NGỮ CẢNH:**
   - Đọc kỹ LỊCH SỬ HỘI THOẠI để hiểu mạch trò chuyện
   - Nếu có PHÂN TÍCH CHI TIÊU CHI TIẾT hoặc GỢI Ý CHI TIÊU THÔNG MINH ở trên, hãy SỬ DỤNG chúng để trả lời
   - Tận dụng NGỮ CẢNH LIÊN QUAN (RAG) nếu phù hợp

3. **HIỂU ĐÚNG Ý ĐỊNH:**
   - Nếu người dùng hỏi "gợi ý chi tiêu" → Họ muốn GỢI Ý, KHÔNG muốn tạo giao dịch ngay
   - Nếu người dùng nói "tạo chi tiêu" → Họ muốn tạo giao dịch nhưng thiếu thông tin, cần hỏi lại
   - Nếu người dùng nói "ăn tối 200k" → Họ muốn tạo giao dịch với đủ thông tin

CÂU HỎI CỦA NGƯỜI DÙNG: "${message}"

**HƯỚNG DẪN TRẢ LỜI:**

1. **Nếu là YÊU CẦU GỢI Ý CHI TIÊU:**
   - Sử dụng GỢI Ý CHI TIÊU THÔNG MINH ở trên (nếu có)
   - Đưa ra các gợi ý CỤ THỂ, THỰC TẾ với tên, số tiền, danh mục, lý do
   - KHÔNG tạo giao dịch, chỉ gợi ý

2. **Nếu là YÊU CẦU PHÂN TÍCH CHI TIÊU:**
   - Sử dụng PHÂN TÍCH CHI TIÊU CHI TIẾT ở trên (nếu có)
   - Phân tích SÂU SẮC: xu hướng, danh mục, ví, bất thường
   - Đưa ra nhận xét và gợi ý cụ thể

3. **Nếu là YÊU CẦU TẠO GIAO DỊCH:**
   - Nếu thiếu thông tin (chỉ có "tạo chi tiêu") → Hỏi lại tên và số tiền
   - Nếu đủ thông tin → Xác nhận và hướng dẫn tạo

4. **Nếu là YÊU CẦU SỬA/XÓA:**
   - Xử lý theo hướng dẫn đã có ở trên

5. **Nếu là HỦY HÀNH ĐỘNG:**
   - Xác nhận chính xác loại hành động đã hủy
   - Hỏi xem họ cần gì tiếp theo

6. **Nếu là CÂU HỎI THÔNG THƯỜNG:**
   - Trả lời dựa trên dữ liệu tài chính có sẵn
   - Đưa ra lời khuyên thực tế nếu được yêu cầu
   - Tóm tắt thống kê nếu được yêu cầu

**LƯU Ý:**
- Luôn đọc kỹ LỊCH SỬ HỘI THOẠI để hiểu ngữ cảnh
- Sử dụng các dữ liệu phân tích/gợi ý đã có ở trên
- Trả lời ngắn gọn, rõ ràng, có số liệu cụ thể
- Tận dụng NGỮ CẢNH LIÊN QUAN khi phù hợp
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
      // Fallback: nếu là xóa, tạo deleteSuggestion - LOẠI TRỪ các trường hợp "hủy việc tạo/sửa/xóa"
      const lowerMessage = message.toLowerCase();
      const isCancelAction = lowerMessage.includes('hủy việc') || lowerMessage.includes('huy viec') ||
                             lowerMessage.includes('đã hủy việc') || lowerMessage.includes('da huy viec') ||
                             lowerMessage.includes('hủy việc tạo') || lowerMessage.includes('hủy việc sửa') ||
                             lowerMessage.includes('hủy việc xóa') || lowerMessage.includes('hủy hành động');
      
      // Chỉ kiểm tra delete intent nếu KHÔNG phải là hủy hành động
      if (!isCancelAction && (
        lowerMessage.includes('xóa') || lowerMessage.includes('xoá') || 
        (lowerMessage.includes('hủy') && !lowerMessage.includes('hủy việc')) ||
        (lowerMessage.includes('bỏ') && !lowerMessage.includes('bỏ việc'))
      )) {
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

  // THÊM: Handle cancel actions (hủy việc tạo/sửa/xóa)
  const isCancelAction = lowerMessage.includes('hủy việc') || lowerMessage.includes('huy viec') ||
                         lowerMessage.includes('đã hủy việc') || lowerMessage.includes('da huy viec') ||
                         lowerMessage.includes('hủy việc tạo') || lowerMessage.includes('hủy việc sửa') ||
                         lowerMessage.includes('hủy việc xóa') || lowerMessage.includes('hủy hành động') ||
                         lowerMessage.includes('đã hủy') || lowerMessage.includes('da huy');

  if (isCancelAction) {
    let actionType = 'hành động';
    if (lowerMessage.includes('tạo')) actionType = 'tạo giao dịch';
    else if (lowerMessage.includes('sửa')) actionType = 'sửa giao dịch';
    else if (lowerMessage.includes('xóa')) actionType = 'xóa giao dịch';

    const base = `✅ **Đã hiểu!** Tôi thấy bạn đã hủy việc ${actionType}.

💬 Bạn có cần tôi hỗ trợ gì khác không? Ví dụ:
• 📝 Tạo giao dịch mới
• 📊 Phân tích tình hình tài chính
• 💰 Tư vấn tiết kiệm
• 📈 Xem thống kê chi tiêu${quotaMessage}`;

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
      createdAt: new Date(),
      createdBy: userId // QUAN TRỌNG: Lưu người tạo giao dịch
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
    await transaction.populate('createdBy', 'name email _id'); // QUAN TRỌNG: Populate createdBy

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

// ======================== RECEIPT OCR ENDPOINT ========================
// THÊM: POST /api/ai/receipt - đọc ảnh hóa đơn và trích xuất giao dịch
router.post('/receipt', auth, upload.single('receipt'), async (req, res) => {
  try {
    const userId = req.user._id;
    const personaKey = (req.body && req.body.persona) || 'neutral';

    if (!req.file) {
      return res.status(400).json({ error: 'Missing receipt image file' });
    }

    if (!geminiAvailable || !model) {
      return res.status(503).json({
        error: 'Gemini AI hiện không khả dụng để phân tích ảnh hóa đơn',
        geminiAvailable: false
      });
    }

    // Lấy context danh mục & ví của user
    const wallets = await Wallet.find({ owner: userId }).populate('categories');
    const categories = await Category.find({ 
      $or: [{ isDefault: true }, { user: userId }] 
    });

    // Chuẩn bị dữ liệu ảnh cho Gemini (multimodal)
    const inlineImage = {
      inlineData: {
        data: req.file.buffer.toString('base64'),
        mimeType: req.file.mimetype || 'image/png'
      }
    };

    const ocrPrompt = `
Bạn đang xem **ảnh hóa đơn / bill / receipt**. 
Hãy đọc và trích xuất thông tin giao dịch tài chính chính như sau:

YÊU CẦU:
- Tập trung vào tổng tiền phải trả (TOTAL / TỔNG CỘNG / THÀNH TIỀN / GRAND TOTAL)
- Đơn vị mặc định là VND nếu không ghi rõ
- Xác định đây là "expense" (chi tiêu) hay "income" (thu nhập). Đa số hóa đơn mua hàng là "expense"
- Tạo một mô tả ngắn gọn cho giao dịch (ví dụ: "Ăn tối nhà hàng A", "Mua đồ siêu thị", "Tiền điện tháng 10")

TRẢ VỀ THUẦN JSON (KHÔNG markdown, KHÔNG giải thích):
{
  "hasIntent": true/false,
  "type": "expense" hoặc "income",
  "amount": số tiền (số, không có dấu phẩy, không đơn vị),
  "description": "mô tả ngắn gọn",
  "confidence": số từ 0 đến 1 (độ tự tin),
  "reasoning": "giải thích ngắn gọn cách bạn đọc hóa đơn"
}

Lưu ý:
- Nếu có nhiều dòng, ưu tiên tổng tiền cuối cùng
- Nếu không chắc, đặt "hasIntent": false
`;

    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            { text: ocrPrompt },
            inlineImage
          ]
        }
      ]
    });

    const response = await result.response;
    let text = (await response.text()).trim();
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let analysis;
    try {
      analysis = JSON.parse(text);
    } catch (e) {
      console.error('❌ Failed to parse receipt JSON:', e.message, 'raw:', text);
      return res.status(500).json({
        error: 'Không thể đọc được dữ liệu từ hóa đơn',
        details: e.message,
        geminiAvailable
      });
    }

    if (!analysis.hasIntent || !analysis.amount || analysis.confidence <= 0.5) {
      const baseReply = `😅 Tôi chưa đọc rõ được hóa đơn này.\n\nHãy thử chụp lại với ánh sáng tốt hơn, không bị mờ/chéo hoặc nhập tay giúp tôi số tiền và nội dung nhé.`;
      return res.json({
        reply: styleResponseByPersona(personaKey, baseReply),
        transactionSuggestion: null,
        needsMoreInfo: false,
        geminiAvailable,
        timestamp: new Date().toISOString()
      });
    }

    const amount = Math.round(Number(analysis.amount) || 0);
    if (!amount || amount <= 0) {
      const baseReply = `Tôi đã đọc được hóa đơn nhưng không chắc về số tiền tổng.\nBạn có thể nhập lại số tiền giúp tôi được không?`;
      return res.json({
        reply: styleResponseByPersona(personaKey, baseReply),
        transactionSuggestion: null,
        needsMoreInfo: true,
        geminiAvailable,
        timestamp: new Date().toISOString()
      });
    }

    const type = analysis.type === 'income' ? 'income' : 'expense';
    const description = analysis.description || (type === 'income' ? 'Thu nhập từ hóa đơn' : 'Chi tiêu theo hóa đơn');

    // Phân tích danh mục cho mô tả này
    let categoryId = null;
    let categoryName = null;
    try {
      if (geminiAvailable && model) {
        const catAnalysis = await analyzeCategoryForMessage(
          description,
          categories,
          model,
          type
        );
        categoryId = catAnalysis.categoryId;
        categoryName = catAnalysis.categoryName;
      } else {
        const fallbackCat = analyzeCategoryWithFallback(description, categories, type);
        categoryId = fallbackCat.categoryId;
        categoryName = fallbackCat.categoryName;
      }
    } catch (catErr) {
      console.warn('⚠️ Receipt category analysis failed:', catErr.message);
    }

    const fmt = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
    const baseReply = `📷 **Đã đọc xong hóa đơn của bạn!**

📝 ${description}
💰 ${fmt.format(amount)}
${type === 'income' ? '💵 Thu nhập' : '💸 Chi tiêu'}
${categoryName ? `📊 Danh mục gợi ý: ${categoryName}` : ''}

✨ Hãy chọn ví để tôi tạo giao dịch giúp bạn nhé.`;

    const styledReply = styleResponseByPersona(personaKey, baseReply);

    // Gợi ý giao dịch giống với luồng chat text
    const transactionSuggestion = {
      type,
      amount,
      description,
      categoryId,
      categoryName,
      walletId: null,
      walletName: null,
      confidence: analysis.confidence || 0.8,
      reasoning: analysis.reasoning || 'Đọc tổng tiền và nội dung từ hóa đơn'
    };

    // Lưu ngữ cảnh vào semantic memory
    try {
      const summary = `Giao dịch từ hóa đơn (${type}): ${description} - ${fmt.format(amount)}${categoryName ? ` | Danh mục: ${categoryName}` : ''}`;
      await addToVectorStore(userId, summary, { type: 'receipt_suggestion' });
    } catch (memErr) {
      console.warn('⚠️ Receipt memory failed:', memErr.message);
    }

    return res.json({
      reply: styledReply,
      transactionSuggestion,
      needsMoreInfo: false,
      geminiAvailable,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Receipt endpoint error:', error);
    return res.status(500).json({
      error: 'Không thể phân tích hóa đơn',
      details: error.message,
      geminiAvailable
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
    // LOẠI TRỪ: Kiểm tra xem có phải là "hủy hành động" không (hủy việc tạo/sửa/xóa)
    const lower = (message || '').toLowerCase();
    const isCancelAction = lower.includes('hủy việc') || lower.includes('huy viec') ||
                           lower.includes('đã hủy việc') || lower.includes('da huy viec') ||
                           lower.includes('hủy việc tạo') || lower.includes('hủy việc sửa') ||
                           lower.includes('hủy việc xóa') || lower.includes('hủy hành động');
    
    if (isCancelAction) {
      console.log('⚠️ analyzeDeleteTransactionIntent: This is cancel action, not delete transaction');
      return { success: false, reason: 'Đây là hủy hành động, không phải xóa giao dịch' };
    }
    
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
    
    // LOẠI TRỪ: Kiểm tra xem có phải là "hủy hành động" không (hủy việc tạo/sửa/xóa)
    const isCancelAction = lower.includes('hủy việc') || lower.includes('huy viec') ||
                           lower.includes('đã hủy việc') || lower.includes('da huy viec') ||
                           lower.includes('hủy việc tạo') || lower.includes('hủy việc sửa') ||
                           lower.includes('hủy việc xóa') || lower.includes('hủy hành động');
    
    if (isCancelAction) {
      console.log('⚠️ This is cancel action, not delete transaction');
      return null;
    }
    
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

    // Dùng Gemini tạo các insight "trợ lý tài chính thông minh" từ thống kê
    // Wrap in try-catch để không làm crash endpoint nếu AI insights fail
    let aiItems = [];
    try {
      aiItems = await buildAiSpendingInsights(payload, req.user.name || 'bạn');
    } catch (aiErr) {
      console.warn('⚠️ AI insights generation failed, continuing without AI items:', aiErr.message);
      // Continue without AI items - không crash endpoint
    }

    return res.json({
      ok: true,
      ...payload,
      aiItems
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

// THÊM: Dùng Gemini để tạo insight "trợ lý tài chính thông minh" từ thống kê
async function buildAiSpendingInsights(statsPayload, userName = 'bạn') {
  try {
    if (!geminiAvailable || !model) {
      console.log('⚠️ Gemini not available for AI insights');
      return [];
    }

    const { months, totals, topCategories, nightSpending, suggestions } = statsPayload || {};
    const monthLines = (months || []).map((m, idx) => {
      const t = totals && totals[idx] ? totals[idx] : { expense: 0, income: 0 };
      return `- ${m.label}: Chi ${t.expense} VND, Thu ${t.income} VND`;
    }).join('\n');

    const topCatLines = (topCategories || []).map(c =>
      `- ${c.name}: ${c.total} VND (${c.share || 0}%)`
    ).join('\n');

    const nightLine = nightSpending
      ? `Chi tiêu ban đêm tháng hiện tại: ${nightSpending.current || 0} VND; tháng trước: ${nightSpending.previous || 0} VND; thay đổi: ${nightSpending.changePct || 0}%.`
      : '';

    const ruleSug = Array.isArray(suggestions) && suggestions.length
      ? suggestions.map(s => `- ${s}`).join('\n')
      : '(Chưa có gợi ý rule-based)';

    const prompt = `
Bạn là **trợ lý tài chính cá nhân thông minh** cho người dùng tên là "${userName}".

Dưới đây là dữ liệu tóm tắt về thu/chi 3 tháng gần đây:

THÁNG:
${monthLines || '(không có dữ liệu)'}

TOP DANH MỤC CHI TIÊU THÁNG HIỆN TẠI:
${topCatLines || '(không có dữ liệu)'}

CHI TIÊU BAN ĐÊM:
${nightLine || '(không có dữ liệu)'}

GỢI Ý QUY TẮC CÓ SẴN (rule-based):
${ruleSug}

NHIỆM VỤ:
- Phân tích dữ liệu trên và tạo ra tối đa 4 insight ngắn gọn bằng tiếng Việt.
- Mỗi insight nên rất thực tế, tập trung vào thói quen chi tiêu và gợi ý hành động cụ thể.
- Phân loại insight theo một trong các loại: "TREND", "FORECAST", "ALERT", "FOCUS":
  - TREND: Xu hướng chi tiêu/thu nhập.
  - FORECAST: Dự báo nếu giữ nhịp hiện tại.
  - ALERT: Cảnh báo rủi ro, chi tiêu bất thường.
  - FOCUS: Gợi ý ưu tiên (danh mục nên xem lại, ví nên theo dõi, v.v.).

ĐỊNH DẠNG TRẢ VỀ:
- TRẢ VỀ THUẦN JSON, KHÔNG markdown, KHÔNG giải thích thêm.
- Cấu trúc:
{
  "items": [
    { "type": "TREND", "text": "nội dung insight 1" },
    { "type": "ALERT", "text": "nội dung insight 2" }
  ]
}

YÊU CẦU:
- Mỗi "text" <= 2 câu, dễ hiểu với người dùng phổ thông.
- Không nhắc đến từ "AI" hay "mô hình ngôn ngữ".
`;

    // Add timeout to prevent hanging
    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Gemini API timeout after 15 seconds')), 15000)
      )
    ]);
    
    const response = await result.response;
    let text = (await response.text()).trim();
    text = text.replace(/```json\n?/g, '').replace(/```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      console.warn('⚠️ Failed to parse AI insights JSON:', e.message, 'raw:', text);
      return [];
    }

    if (!parsed || !Array.isArray(parsed.items)) return [];

    return parsed.items
      .map(item => {
        if (!item || (!item.text && !item.title)) return null;
        const rawType = String(item.type || '').toUpperCase();
        const allowed = ['TREND', 'FORECAST', 'ALERT', 'FOCUS'];
        const type = allowed.includes(rawType) ? rawType : 'TREND';
        const text = String(item.text || item.title || '').trim();
        if (!text) return null;
        return { type, text };
      })
      .filter(Boolean);
  } catch (err) {
    // Log error but don't crash - return empty array gracefully
    if (err.message && err.message.includes('timeout')) {
      console.warn('⚠️ buildAiSpendingInsights timeout:', err.message);
    } else if (err.message && err.message.includes('fetch failed')) {
      console.warn('⚠️ buildAiSpendingInsights network error:', err.message);
    } else {
      console.error('❌ buildAiSpendingInsights error:', err.message || err);
    }
    return [];
  }
}

// THÊM: Hàm phân tích chi tiêu sâu hơn
async function performDeepSpendingAnalysis(userId, walletId, recentTransactions, wallets, model) {
  try {
    if (!geminiAvailable || !model) {
      return 'Gemini không khả dụng, sử dụng phân tích cơ bản.';
    }

    // Lọc giao dịch theo ví nếu có
    let transactionsToAnalyze = recentTransactions;
    if (walletId) {
      transactionsToAnalyze = recentTransactions.filter(t => 
        t.wallet && String(t.wallet._id || t.wallet) === String(walletId)
      );
    }

    // Chỉ lấy giao dịch chi tiêu
    const expenses = transactionsToAnalyze.filter(t => t.type === 'expense');
    
    if (expenses.length === 0) {
      return 'Không có giao dịch chi tiêu để phân tích.';
    }

    // Tính toán các metrics
    const now = new Date();
    const start30 = new Date(now);
    start30.setDate(start30.getDate() - 30);
    const start7 = new Date(now);
    start7.setDate(start7.getDate() - 7);
    
    const expenses30 = expenses.filter(t => new Date(t.date || t.createdAt) >= start30);
    const expenses7 = expenses.filter(t => new Date(t.date || t.createdAt) >= start7);
    
    const total30 = expenses30.reduce((sum, t) => sum + (t.amount || 0), 0);
    const total7 = expenses7.reduce((sum, t) => sum + (t.amount || 0), 0);
    const avgPerDay30 = total30 / 30;
    const avgPerDay7 = total7 / 7;
    
    // Phân tích theo danh mục
    const byCategory = new Map();
    expenses30.forEach(t => {
      const catName = t.category?.name || 'Khác';
      byCategory.set(catName, (byCategory.get(catName) || 0) + (t.amount || 0));
    });
    
    const topCategories = Array.from(byCategory.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, amount]) => ({ name, amount, share: (amount / total30 * 100).toFixed(1) }));
    
    // Phân tích theo ví (nếu không filter theo ví)
    const byWallet = new Map();
    if (!walletId) {
      expenses30.forEach(t => {
        const walletName = t.wallet?.name || 'Không xác định';
        byWallet.set(walletName, (byWallet.get(walletName) || 0) + (t.amount || 0));
      });
    }
    
    // Tìm giao dịch lớn nhất
    const largestExpense = expenses30.reduce((max, t) => 
      (t.amount || 0) > (max.amount || 0) ? t : max, expenses30[0] || {}
    );
    
    // Phân tích theo ngày trong tuần
    const byDayOfWeek = new Map();
    expenses30.forEach(t => {
      const date = new Date(t.date || t.createdAt);
      const dayName = date.toLocaleDateString('vi-VN', { weekday: 'long' });
      byDayOfWeek.set(dayName, (byDayOfWeek.get(dayName) || 0) + (t.amount || 0));
    });
    
    const fmt = (n) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
    
    // Tạo prompt cho AI
    const analysisPrompt = `
Bạn là chuyên gia phân tích tài chính. Phân tích CHI TIẾT và SÂU SẮC dữ liệu chi tiêu sau:

${walletId ? `PHẠM VI: Chỉ phân tích ví "${wallets.find(w => String(w._id) === String(walletId))?.name || 'N/A'}"` : 'PHẠM VI: Tất cả các ví'}

THỐNG KÊ 30 NGÀY:
- Tổng chi tiêu: ${fmt(total30)}
- Trung bình/ngày: ${fmt(avgPerDay30)}
- Số giao dịch: ${expenses30.length}

THỐNG KÊ 7 NGÀY GẦN ĐÂY:
- Tổng chi tiêu: ${fmt(total7)}
- Trung bình/ngày: ${fmt(avgPerDay7)}
- So với 30 ngày: ${avgPerDay7 > avgPerDay30 ? 'TĂNG' : avgPerDay7 < avgPerDay30 ? 'GIẢM' : 'ỔN ĐỊNH'} ${avgPerDay30 > 0 ? `${Math.abs(((avgPerDay7 - avgPerDay30) / avgPerDay30 * 100).toFixed(1))}%` : ''}

TOP 5 DANH MỤC CHI TIÊU:
${topCategories.map((c, i) => `${i + 1}. ${c.name}: ${fmt(c.amount)} (${c.share}%)`).join('\n')}

${!walletId ? `CHI TIÊU THEO VÍ:\n${Array.from(byWallet.entries()).map(([name, amount]) => `- ${name}: ${fmt(amount)}`).join('\n')}` : ''}

GIAO DỊCH LỚN NHẤT:
- ${largestExpense.title || largestExpense.description || 'N/A'}: ${fmt(largestExpense.amount || 0)} (${largestExpense.category?.name || 'Không có danh mục'})

CHI TIÊU THEO NGÀY TRONG TUẦN:
${Array.from(byDayOfWeek.entries()).map(([day, amount]) => `- ${day}: ${fmt(amount)}`).join('\n')}

NHIỆM VỤ:
Phân tích CHI TIẾT và đưa ra:
1. **Xu hướng**: Chi tiêu đang tăng/giảm/ổn định? Tốc độ thay đổi?
2. **Phân tích danh mục**: Danh mục nào chi nhiều nhất? Có bất thường không? Tỷ lệ có hợp lý không?
3. **So sánh**: So sánh 7 ngày gần đây với 30 ngày (tăng/giảm bao nhiêu %)
4. **Phát hiện bất thường**: Có giao dịch lớn bất thường không? Chi tiêu theo ngày trong tuần có pattern gì?
5. **Gợi ý cụ thể**: Dựa trên phân tích, đưa ra 2-3 gợi ý cụ thể để tối ưu chi tiêu

Trả lời bằng tiếng Việt, ngắn gọn nhưng đầy đủ thông tin, có số liệu cụ thể.
`;

    const result = await Promise.race([
      model.generateContent(analysisPrompt),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 20000)
      )
    ]);
    
    const response = await result.response;
    return response.text().trim();
    
  } catch (error) {
    console.error('Error in performDeepSpendingAnalysis:', error);
    return `Lỗi khi phân tích chi tiêu: ${error.message}`;
  }
}

// THÊM: Hàm tạo gợi ý chi tiêu thông minh
async function generateSpendingSuggestions(userId, recentTransactions, wallets, availableAmount, model) {
  try {
    if (!geminiAvailable || !model) {
      return 'Gemini không khả dụng, không thể tạo gợi ý chi tiêu.';
    }

    // Lấy giao dịch chi tiêu trong 60 ngày gần đây
    const now = new Date();
    const start60 = new Date(now);
    start60.setDate(start60.getDate() - 60);
    
    const expenses = recentTransactions.filter(t => 
      t.type === 'expense' && new Date(t.date || t.createdAt) >= start60
    );
    
    // Tính tổng số dư hiện tại
    const totalBalance = wallets.reduce((sum, w) => sum + (w.initialBalance || 0), 0);
    
    // Số tiền có thể chi tiêu (nếu không có số tiền cụ thể, dùng 30% số dư)
    const budget = availableAmount || Math.floor(totalBalance * 0.3);
    
    // Phân tích pattern chi tiêu
    const byCategory = new Map();
    const byAmountRange = { small: [], medium: [], large: [] };
    const categoryFrequency = new Map();
    
    expenses.forEach(t => {
      const catName = t.category?.name || 'Khác';
      const amount = t.amount || 0;
      
      // Phân loại theo danh mục
      byCategory.set(catName, (byCategory.get(catName) || 0) + amount);
      categoryFrequency.set(catName, (categoryFrequency.get(catName) || 0) + 1);
      
      // Phân loại theo mức giá
      if (amount < 50000) byAmountRange.small.push(t);
      else if (amount < 200000) byAmountRange.medium.push(t);
      else byAmountRange.large.push(t);
    });
    
    // Top danh mục thường dùng
    const topCategories = Array.from(categoryFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);
    
    // Tính mức giá trung bình theo danh mục
    const avgByCategory = new Map();
    expenses.forEach(t => {
      const catName = t.category?.name || 'Khác';
      if (!avgByCategory.has(catName)) {
        avgByCategory.set(catName, []);
      }
      avgByCategory.get(catName).push(t.amount || 0);
    });
    
    const categoryAverages = Array.from(avgByCategory.entries()).map(([name, amounts]) => {
      const avg = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
      return { name, average: Math.round(avg), count: amounts.length };
    }).sort((a, b) => b.count - a.count);
    
    // Phân tích theo thời điểm
    const byDayOfWeek = new Map();
    expenses.forEach(t => {
      const date = new Date(t.date || t.createdAt);
      const dayName = date.toLocaleDateString('vi-VN', { weekday: 'long' });
      byDayOfWeek.set(dayName, (byDayOfWeek.get(dayName) || 0) + 1);
    });
    
    const mostActiveDay = Array.from(byDayOfWeek.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Không có dữ liệu';
    
    const fmt = (n) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
    
    // Tạo prompt cho AI
    const suggestionPrompt = `
Bạn là chuyên gia tư vấn tài chính cá nhân. Dựa trên dữ liệu sau, đưa ra 3-5 gợi ý chi tiêu THỰC TẾ và PHÙ HỢP.

SỐ TIỀN CÓ THỂ CHI TIÊU: ${fmt(budget)}
${availableAmount ? '(Người dùng đã chỉ định số tiền này)' : '(Tự động tính 30% số dư hiện tại)'}

TỔNG SỐ DƯ HIỆN TẠI: ${fmt(totalBalance)}

LỊCH SỬ CHI TIÊU 60 NGÀY GẦN ĐÂY:
- Tổng số giao dịch: ${expenses.length}
- Top 5 danh mục thường dùng: ${topCategories.join(', ')}

MỨC GIÁ TRUNG BÌNH THEO DANH MỤC:
${categoryAverages.slice(0, 8).map(c => `- ${c.name}: ${fmt(c.average)} (${c.count} lần)`).join('\n')}

PHÂN LOẠI THEO MỨC GIÁ:
- Chi tiêu nhỏ (< 50k): ${byAmountRange.small.length} giao dịch
- Chi tiêu trung bình (50k - 200k): ${byAmountRange.medium.length} giao dịch
- Chi tiêu lớn (> 200k): ${byAmountRange.large.length} giao dịch

NGÀY CHI TIÊU NHIỀU NHẤT: ${mostActiveDay}

NHIỆM VỤ:
Đưa ra 3-5 gợi ý chi tiêu CỤ THỂ, THỰC TẾ dựa trên:
1. **Số tiền có sẵn**: Gợi ý phù hợp với ${fmt(budget)} (có thể chia nhỏ thành nhiều gợi ý)
2. **Lịch sử chi tiêu**: Dựa vào danh mục và mức giá người dùng thường chi
3. **Thời điểm**: Xem xét ngày trong tuần, tháng hiện tại
4. **Đa dạng**: Gợi ý cả chi tiêu nhỏ, trung bình và lớn (nếu số tiền đủ)
5. **Thực tế**: Gợi ý những thứ người dùng thực sự có thể mua/chi tiêu

ĐỊNH DẠNG GỢI Ý:
Mỗi gợi ý bao gồm:
- Tên gợi ý (ví dụ: "Ăn tối tại nhà hàng", "Mua sách", "Đổ xăng")
- Số tiền dự kiến (phù hợp với lịch sử)
- Danh mục (dựa trên lịch sử)
- Lý do (tại sao phù hợp)

Trả lời bằng tiếng Việt, ngắn gọn nhưng đầy đủ thông tin, có số liệu cụ thể.
${expenses.length < 5 ? '\nLƯU Ý: Dữ liệu lịch sử ít, hãy đưa ra gợi ý dựa trên số tiền và các danh mục phổ biến.' : ''}
`;

    const result = await Promise.race([
      model.generateContent(suggestionPrompt),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 20000)
      )
    ]);
    
    const response = await result.response;
    return response.text().trim();
    
  } catch (error) {
    console.error('Error in generateSpendingSuggestions:', error);
    return `Lỗi khi tạo gợi ý chi tiêu: ${error.message}`;
  }
}


// ======================== FALLBACK ANALYZE INTENT ========================
// THÊM: Helper phân tích ý intention xóa giao dịch
async function analyzeDeleteTransactionIntent(message, userId, wallets, categories, model) {
  try {
    // LOẠI TRỪ: Kiểm tra xem có phải là "hủy hành động" không (hủy việc tạo/sửa/xóa)
    const lower = (message || '').toLowerCase();
    const isCancelAction = lower.includes('hủy việc') || lower.includes('huy viec') ||
                           lower.includes('đã hủy việc') || lower.includes('da huy viec') ||
                           lower.includes('hủy việc tạo') || lower.includes('hủy việc sửa') ||
                           lower.includes('hủy việc xóa') || lower.includes('hủy hành động');
    
    if (isCancelAction) {
      console.log('⚠️ analyzeDeleteTransactionIntent: This is cancel action, not delete transaction');
      return { success: false, reason: 'Đây là hủy hành động, không phải xóa giao dịch' };
    }
    
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
    
    // LOẠI TRỪ: Kiểm tra xem có phải là "hủy hành động" không (hủy việc tạo/sửa/xóa)
    const isCancelAction = lower.includes('hủy việc') || lower.includes('huy viec') ||
                           lower.includes('đã hủy việc') || lower.includes('da huy viec') ||
                           lower.includes('hủy việc tạo') || lower.includes('hủy việc sửa') ||
                           lower.includes('hủy việc xóa') || lower.includes('hủy hành động');
    
    if (isCancelAction) {
      console.log('⚠️ This is cancel action, not delete transaction');
      return null;
    }
    
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

    // Lấy lịch sử giao dịch của ví này để phân tích pattern
    const userHistory = await Transaction.find({ wallet: walletId })
      .populate('category', 'name')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    console.log(`Analyzing category for wallet "${wallet.name}" with ${walletCategories.length} categories`);
    console.log(`Found ${userHistory.length} recent transactions in this wallet`);
    console.log(`Message: "${message}"`);

    // Try Gemini first, then fallback
    if (geminiAvailable && model) {
      try {
        const result = await analyzeCategoryForMessage(
          message,
          walletCategories,
          model,
          null,
          userHistory
        );
        
        return res.json(result);

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