const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TransactionSchema = new Schema({
  wallet: {
    type: Schema.Types.ObjectId,
    ref: 'Wallet',
    required: true
  },
  category: {
    type: Schema.Types.ObjectId,
    ref: 'Category'
  },
  type: {
    type: String,
    enum: ['income', 'expense'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    default: 0
  },
  currency: {
    type: String,
    default: 'VND'
  },
  title: {
    type: String,
    trim: true,
    default: ''
  },
  description: {
    type: String,
    default: ''
  },
  date: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  metadata: {
    type: Schema.Types.Mixed
  },
  note: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Add an index to speed common queries (wallet + date)
TransactionSchema.index({ wallet: 1, date: -1 });

module.exports = mongoose.model('Transaction', TransactionSchema);
