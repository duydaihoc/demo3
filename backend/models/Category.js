const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CategorySchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: false
  },
  type: {
    type: String,
    enum: ['expense', 'income'],
    required: true
  },
  icon: {
    type: String,
    default: '❓'
  },
  owner: {
    // Changed from ObjectId to Mixed type to support both ObjectId and string IDs (for temp users)
    type: Schema.Types.Mixed,
    required: false // null means system category
  },
  wallet: {
    type: Schema.Types.ObjectId,
    ref: 'Wallet',
    required: false // null means global/shared category
  },
  createdBy: {
    type: String,
    enum: ['system', 'admin', 'user'],
    default: 'system'
  },
  creatorName: {
    type: String,
    default: 'Hệ thống'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Tạo compound index thay vì unique trên trường name
// Modified index to include owner for more flexibility
CategorySchema.index({ name: 1, type: 1, owner: 1 }, { unique: true });

module.exports = mongoose.model('Category', CategorySchema);

// The Category schema already has these fields:
// owner: Mixed type to support both ObjectId and string IDs
// createdBy: String enum ('system', 'admin', 'user')
// creatorName: String for displaying the creator's name