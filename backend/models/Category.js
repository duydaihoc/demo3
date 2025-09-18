const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CategorySchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true,
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
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: false // null means system category
  },
  wallet: {
    type: Schema.Types.ObjectId,
    ref: 'Wallet',
    required: false // null means global/shared category
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

module.exports = mongoose.model('Category', CategorySchema);