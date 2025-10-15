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

// Phương thức để lấy số dư
familyBalanceSchema.statics.getBalance = async function(familyId) {
  let balance = await this.findOne({ familyId })
    .populate('memberBalances.userId', 'name email');
  
  if (!balance) {
    balance = new this({
      familyId,
      familyBalance: 0,
      memberBalances: []
    });
    await balance.save();
  }
  
  return balance;
};

const FamilyBalance = mongoose.model('FamilyBalance', familyBalanceSchema);

module.exports = FamilyBalance;
