const mongoose = require('mongoose');

const familyBalanceSchema = new mongoose.Schema({
  familyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Family',
    required: true
  },
  familyBalance: {
    type: Number,
    default: 0
  },
  // Thêm các trường mới cho thu nhập/chi tiêu
  familyIncome: {
    type: Number,
    default: 0
  },
  familyExpense: {
    type: Number,
    default: 0
  },
  totalIncome: {
    type: Number,
    default: 0
  },
  totalExpense: {
    type: Number,
    default: 0
  },
  memberBalances: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    userName: String, // Tên hiển thị của thành viên
    userEmail: String, // Email của thành viên
    balance: {
      type: Number,
      default: 0
    }
  }],
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Phương thức để cập nhật số dư
familyBalanceSchema.statics.updateBalance = async function(familyId, userId, amount, transactionType, transactionScope) {
  // Tìm hoặc tạo record số dư của gia đình
  let familyBalance = await this.findOne({ familyId });
  
  if (!familyBalance) {
    familyBalance = new this({
      familyId,
      familyBalance: 0,
      memberBalances: []
    });
  }
  
  // Xác định số tiền cập nhật (thu nhập: cộng, chi tiêu: trừ)
  const updateAmount = transactionType === 'income' ? amount : -amount;
  
  // Cập nhật số dư theo phạm vi giao dịch
  if (transactionScope === 'family') {
    // Cập nhật số dư gia đình
    familyBalance.familyBalance += updateAmount;
  } else {
    // Cập nhật số dư cá nhân
    const memberIndex = familyBalance.memberBalances.findIndex(
      m => String(m.userId) === String(userId)
    );
    
    if (memberIndex >= 0) {
      // Thành viên đã tồn tại trong danh sách
      familyBalance.memberBalances[memberIndex].balance += updateAmount;
      // console.log(`Updated member balance: userId=${userId}, newBalance=${familyBalance.memberBalances[memberIndex].balance}`);
    } else {
      // Tìm user để lấy thêm thông tin name và email
      let userName = '', userEmail = '';
      try {
        const User = mongoose.model('User');
        const user = await User.findById(userId).select('name email');
        if (user) {
          userName = user.name || '';
          userEmail = user.email || '';
        }
      } catch (err) {
        console.error("Error fetching user info for balance:", err);
      }

      // Thêm thành viên mới vào danh sách
      familyBalance.memberBalances.push({
        userId,
        userName,
        userEmail,
        balance: updateAmount
      });
      // console.log(`Added new member balance: userId=${userId}, balance=${updateAmount}`);
    }
  }
  
  familyBalance.updatedAt = new Date();
  return await familyBalance.save();
};

// Thêm static method getBalance vào schema
familyBalanceSchema.statics.getBalance = async function(familyId) {
  try {
    let balance = await this.findOne({ familyId });
    
    if (!balance) {
      balance = new this({
        familyId,
        familyBalance: 0,
        memberBalances: [],
        totalIncome: 0,
        totalExpense: 0,
        familyIncome: 0,
        familyExpense: 0
      });
      await balance.save();
    }
    
    // Tính toán thu nhập và chi tiêu gia đình từ giao dịch
    const FamilyTransaction = require('./FamilyTransaction');
    
    // Lấy tất cả giao dịch gia đình EXCLUDE transfer activities (nạp/rút)
    const familyTransactions = await FamilyTransaction.find({
      familyId,
      transactionScope: 'family',
      // loại trừ các giao dịch có tag 'transfer' (nạp/rút)
      tags: { $ne: 'transfer' }
    });
    
    let familyIncome = 0;
    let familyExpense = 0;
    
    familyTransactions.forEach(tx => {
      if (tx.type === 'income') {
        familyIncome += Number(tx.amount || 0);
      } else if (tx.type === 'expense') {
        familyExpense += Number(tx.amount || 0);
      }
    });
    
    // Cập nhật balance
    balance.familyIncome = familyIncome;
    balance.familyExpense = familyExpense;
    
    // Tính tổng thu nhập và chi tiêu tất cả (bao gồm cả cá nhân)
    const allTransactions = await FamilyTransaction.find({ familyId });
    let totalIncome = 0;
    let totalExpense = 0;
    
    allTransactions.forEach(tx => {
      if (tx.type === 'income') {
        totalIncome += Number(tx.amount || 0);
      } else if (tx.type === 'expense') {
        totalExpense += Number(tx.amount || 0);
      }
    });
    
    balance.totalIncome = totalIncome;
    balance.totalExpense = totalExpense;
    
    await balance.save();
    
    return balance;
  } catch (error) {
    console.error('Error getting family balance:', error);
    throw error;
  }
};

// Tạo model sau khi đã định nghĩa static methods
const FamilyBalance = mongoose.model('FamilyBalance', familyBalanceSchema);

module.exports = FamilyBalance;
