const mongoose = require('mongoose');

const familySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
    // Removed unique: true to allow multiple families with the same name
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    email: {
      type: String,
      trim: true,
      lowercase: true
    },
    role: {
      type: String,
      enum: ['owner', 'member'],
      default: 'member'
    },
    // Thêm trường familyRole để lưu vai trò trong gia đình (bố, mẹ, chị...)
    familyRole: {
      type: String,
      trim: true,
      default: ''
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  budget: {
    type: Number,
    default: 0
  },
  budgets: [{
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    amount: { type: Number, required: true },
    date: { type: Date, required: true },
    note: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    // NEW: Thêm trường để track reset
    lastResetAt: { type: Date },
    resetCount: { type: Number, default: 0 }
  }],
  // NEW: Thêm lịch sử ngân sách
  budgetHistory: [{
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    amount: { type: Number, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    spent: { type: Number, default: 0 },
    note: { type: String, default: '' },
    resetAt: { type: Date, default: Date.now }
  }],
  // NEW: Thêm danh sách mua sắm
  shoppingList: [{
    name: { type: String, required: true, trim: true },
    quantity: { type: Number, default: 1, min: 1 },
    notes: { type: String, default: '', trim: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' }, // THÊM: danh mục cho sản phẩm
    purchased: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now },
    purchasedAt: { type: Date },
    purchasedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // THÊM: Thông tin thanh toán
    purchaseAmount: { type: Number },
    purchaseWalletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet' },
    purchaseType: { type: String, enum: ['personal', 'family'], default: 'personal' }, // personal: ví cá nhân, family: quỹ gia đình
    purchaseTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'FamilyTransaction' }, // ID của giao dịch đã tạo khi mua
    purchaseWalletTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' } // ID của wallet transaction (nếu mua bằng ví cá nhân)
  }],
  // NEW: Thêm danh sách việc cần làm
  todoList: [{
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    priority: { 
      type: String, 
      enum: ['low', 'medium', 'high'], 
      default: 'medium' 
    },
    completed: { type: Boolean, default: false }, // Trạng thái tổng thể
    dueDate: { type: Date },
    assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    // tracking completion status cho từng assignee
    completionStatus: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      completed: { type: Boolean, default: false },
      completedAt: { type: Date },
      _id: false
    }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // THÊM: Flag để đánh dấu công việc đã quá hạn
    isExpired: { type: Boolean, default: false }
  }],
  // NEW: Thêm danh sách hình ảnh hóa đơn
  receiptImages: [{
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    path: { type: String, required: true },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true },
    description: { type: String, default: '', trim: true },
    amount: { type: Number }, // Số tiền trên hóa đơn (tùy chọn)
    date: { type: Date }, // Ngày của hóa đơn (tùy chọn)
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' }, // Danh mục của hóa đơn
    tags: [{ type: String, trim: true }], // Tags để phân loại (grocery, restaurant, gas, etc.)
    linkedTransaction: { type: mongoose.Schema.Types.ObjectId, ref: 'FamilyTransaction' }, // Liên kết với giao dịch gia đình
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedAt: { type: Date, default: Date.now },
    isVerified: { type: Boolean, default: false }, // Xác minh bởi owner
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: { type: Date },
    metadata: {
      // Thông tin bổ sung từ OCR hoặc AI
      extractedText: { type: String },
      vendor: { type: String }, // Tên cửa hàng/nhà cung cấp
      totalAmount: { type: Number },
      taxAmount: { type: Number },
      items: [{ // Danh sách sản phẩm/dịch vụ trên hóa đơn
        name: { type: String },
        quantity: { type: Number },
        price: { type: Number },
        total: { type: Number }
      }]
    }
  }],
  color: {
    colors: [String],
    direction: {
      type: String,
      default: '135deg'
    }
  },
  description: {
    type: String,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Index cho tìm kiếm
familySchema.index({ 'members.user': 1 });
familySchema.index({ 'members.email': 1 });
familySchema.index({ owner: 1 });

// Compound unique index: mỗi owner chỉ có thể tạo một gia đình với tên đó
// Nhưng các owner khác vẫn có thể tạo gia đình cùng tên
familySchema.index({ name: 1, owner: 1 }, { unique: true });

// Middleware để cập nhật updatedAt
familySchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Thêm index cho tìm kiếm nhanh
familySchema.index({ 'members.user': 1, 'members.role': 1 });

// Export the Family model, checking if it already exists to avoid OverwriteModelError
const Family = mongoose.models.Family || mongoose.model('Family', familySchema);

// Migration: Drop old name_1 index and ensure compound index exists
const migrateIndexes = async () => {
  try {
    if (mongoose.connection.readyState === 1) {
      const indexes = await Family.collection.getIndexes();
      
      // Drop old name_1 unique index if exists
      if (indexes.name_1) {
        await Family.collection.dropIndex('name_1');
        // Index migration completed silently
      }
      
      // Ensure compound index exists (will be created automatically by schema)
      // No logging needed
    } else {
      mongoose.connection.once('connected', migrateIndexes);
    }
  } catch (err) {
    if (err.code !== 27) { // 27 = IndexNotFound
      // Silent error handling
    }
  }
};

// Run migration when connection is ready
if (mongoose.connection.readyState === 1) {
  migrateIndexes();
} else {
  mongoose.connection.once('connected', migrateIndexes);
}

module.exports = Family;
