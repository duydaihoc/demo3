const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SupportSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User' }, // Người dùng hỗ trợ (nếu đã đăng nhập)
  email: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  message: { type: String, default: '' },
  type: { 
    type: String, 
    enum: ['support', 'feature-request'], 
    default: 'support' 
  }, // Loại: hỗ trợ hoặc yêu cầu tính năng
  featureCategories: [{ type: String }], // Các mục yêu cầu tính năng: ví, giao dịch, danh mục, gia đình, nhóm, mục tiêu, khả năng liên kết
  personalInfo: {
    usageTime: { type: String, default: '' }, // Thời gian sử dụng
    purpose: { type: String, default: '' } // Mục đích sử dụng
  },
  status: { 
    type: String, 
    enum: ['pending', 'reviewed', 'contacted', 'completed'], 
    default: 'pending' 
  },
  createdAt: { type: Date, default: Date.now },
  reviewedAt: { type: Date },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' }
});

SupportSchema.index({ createdAt: -1 });
SupportSchema.index({ status: 1 });

module.exports = mongoose.model('Support', SupportSchema);

