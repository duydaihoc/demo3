const mongoose = require('mongoose');

const familyTransactionSchema = new mongoose.Schema({
  familyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Family',
    required: true
  },
  type: {
    type: String,
    enum: ['income', 'expense'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  transactionScope: {
    type: String,
    enum: ['personal', 'family'],
    default: 'family'
  },
  date: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  creatorName: {
    type: String,
    default: ''
  },
  attachments: [{
    filename: String,
    path: String,
    mimetype: String,
    size: Number,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  tags: [String]
}, {
  timestamps: true
});

// Đánh index để tối ưu truy vấn
familyTransactionSchema.index({ familyId: 1, date: -1 });
familyTransactionSchema.index({ createdBy: 1 });
familyTransactionSchema.index({ type: 1 });

// Phương thức để tạo ra danh sách giao dịch theo tháng/năm
familyTransactionSchema.statics.getMonthlyTransactions = async function(familyId, year, month) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  return this.find({
    familyId,
    date: { $gte: startDate, $lte: endDate }
  })
  .populate('category', 'name icon')
  .populate('createdBy', 'name email')
  .sort({ date: -1 });
};

// Phương thức để tạo ra báo cáo tổng hợp theo danh mục
familyTransactionSchema.statics.getCategorySummary = async function(familyId, startDate, endDate, type = 'expense') {
  return this.aggregate([
    {
      $match: {
        familyId: mongoose.Types.ObjectId(familyId),
        type,
        date: { $gte: new Date(startDate), $lte: new Date(endDate) }
      }
    },
    {
      $lookup: {
        from: 'categories',
        localField: 'category',
        foreignField: '_id',
        as: 'categoryData'
      }
    },
    {
      $unwind: '$categoryData'
    },
    {
      $group: {
        _id: '$category',
        categoryName: { $first: '$categoryData.name' },
        categoryIcon: { $first: '$categoryData.icon' },
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { totalAmount: -1 }
    }
  ]);
};

const FamilyTransaction = mongoose.model('FamilyTransaction', familyTransactionSchema);

module.exports = FamilyTransaction;
