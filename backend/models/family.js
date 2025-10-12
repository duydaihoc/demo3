const mongoose = require('mongoose');

const familySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true // Đảm bảo tên gia đình là duy nhất
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
    joinedAt: {
      type: Date,
      default: Date.now
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

// Middleware để cập nhật updatedAt
familySchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Thêm index cho tìm kiếm nhanh
familySchema.index({ 'members.user': 1, 'members.role': 1 });

module.exports = mongoose.model('Family', familySchema);
