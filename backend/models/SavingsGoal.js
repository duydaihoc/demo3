const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ContributionSchema = new Schema({
  amount: {
    type: Number,
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  walletId: {
    type: Schema.Types.ObjectId,
    ref: 'Wallet',
    required: true
  },
  note: {
    type: String,
    default: ''
  }
});

const SavingsGoalSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  targetAmount: {
    type: Number,
    required: true
  },
  currentAmount: {
    type: Number,
    default: 0
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  targetDate: {
    type: Date
  },
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  walletId: {
    type: Schema.Types.ObjectId,
    ref: 'Wallet',
  },
  contributions: [ContributionSchema],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('SavingsGoal', SavingsGoalSchema);
