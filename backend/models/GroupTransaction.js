const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  email: { type: String, required: false },
  shareAmount: { type: Number, default: 0 },
  percentage: { type: Number, default: 0 },
  settled: { type: Boolean, default: false }
}, { _id: false });

const groupTransactionSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  amount: { type: Number, required: true, default: 0 },
  transactionType: {
    type: String,
    enum: ['payer_single', 'payer_for_others', 'equal_split', 'percentage_split'],
    default: 'equal_split'
  },
  payer: { type: mongoose.Schema.Types.Mixed, required: false },
  participants: { type: [participantSchema], default: [] },
  percentages: { type: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, email: String, percentage: Number }], default: [] },
  category: { type: mongoose.Schema.Types.Mixed, required: false },
  perPerson: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.Mixed, required: false },
  date: { type: Date, default: Date.now },
  settled: { type: Boolean, default: false },
}, { timestamps: true });

groupTransactionSchema.index({ groupId: 1, createdAt: -1 });

module.exports = mongoose.models.GroupTransaction || mongoose.model('GroupTransaction', groupTransactionSchema);
    