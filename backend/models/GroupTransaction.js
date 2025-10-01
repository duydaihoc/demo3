const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // optional if unknown
  email: { type: String, trim: true, lowercase: true },
  shareAmount: { type: Number, required: true, default: 0 }, // amount owed by this participant
  settled: { type: Boolean, default: false }, // has participant settled their debt?
  settledAt: { type: Date }
}, { _id: false });

const groupTransactionSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  payer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // who paid
  amount: { type: Number, required: true }, // total amount paid
  perPerson: { type: Boolean, default: false }, // if true, `amount` is per-person and total will be amount * participants.length
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' }, // Thêm trường danh mục
  participants: [participantSchema], // list of people who owe (does not necessarily include payer)
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  date: { type: Date, default: Date.now },
  meta: { type: mongoose.Schema.Types.Mixed }
}, {
  timestamps: true
});

module.exports = mongoose.model('GroupTransaction', groupTransactionSchema);
