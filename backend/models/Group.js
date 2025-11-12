const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: '',
    trim: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdBy: {
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
      required: true,
      lowercase: true,
      trim: true
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'member'],
      default: 'member'
    },
    invited: {
      type: Boolean,
      default: false
    },
    joinedAt: {
      type: Date
    },
    invitedAt: {
      type: Date
    }
  }],
  color: {
    type: String,
    default: '#4CAF50'
  },
  isPublic: { type: Boolean, default: false },
  shareSettings: {
    enabled: { type: Boolean, default: false },
    shareKey: { type: String, unique: true, sparse: true }, // Link chia sẻ duy nhất
    allowedData: {
      transactions: { type: Boolean, default: true },
      members: { type: Boolean, default: false }, // Chỉ hiển thị số lượng, không hiển thị tên
      statistics: { type: Boolean, default: true },
      charts: { type: Boolean, default: true }
    },
    createdAt: { type: Date },
    expiresAt: { type: Date } // Tùy chọn hết hạn
  }
}, {
  timestamps: true
});

const Group = mongoose.model('Group', groupSchema);

module.exports = Group;
