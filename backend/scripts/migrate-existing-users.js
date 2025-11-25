/**
 * Script migration: Cập nhật tất cả user cũ thành verified
 * 
 * Chạy script này 1 lần để:
 * 1. Đánh dấu tất cả user cũ (không có field isVerified) thành verified = true
 * 2. Đảm bảo admin luôn là verified
 * 
 * Cách chạy: node scripts/migrate-existing-users.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

// Kết nối MongoDB
const connectDB = async () => {
  try {
    // Sử dụng connection string từ env hoặc localhost
    const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/moneywise';
    console.log('🔗 Đang kết nối:', mongoURI.replace(/\/\/.*:.*@/, '//***:***@')); // Hide credentials
    await mongoose.connect(mongoURI);
    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Migration function
const migrateUsers = async () => {
  try {
    console.log('🔄 Bắt đầu migration...\n');
    
    // 1. Tìm tất cả user CŨ (không có verificationCode = user tạo trước khi có feature)
    // Hoặc user là admin
    const usersToUpdate = await User.find({
      $or: [
        { isVerified: { $exists: false } },
        { isVerified: null },
        { 
          isVerified: false,
          verificationCode: { $exists: false }
        },
        {
          isVerified: false,
          verificationCode: null
        },
        { role: 'admin' }
      ]
    });
    
    console.log(`📊 Tìm thấy ${usersToUpdate.length} user cần cập nhật:`);
    
    if (usersToUpdate.length === 0) {
      console.log('✅ Không có user nào cần migration!');
      return;
    }
    
    // 2. Cập nhật từng user
    let updatedCount = 0;
    let adminCount = 0;
    
    for (const user of usersToUpdate) {
      user.isVerified = true;
      user.verificationCode = undefined;
      user.verificationCodeExpiry = undefined;
      await user.save();
      
      updatedCount++;
      if (user.role === 'admin') {
        adminCount++;
      }
      
      console.log(`  ✓ ${user.email} (${user.role}) → verified: true`);
    }
    
    console.log(`\n✅ Migration hoàn tất!`);
    console.log(`   - Tổng số user đã cập nhật: ${updatedCount}`);
    console.log(`   - Trong đó admin: ${adminCount}`);
    console.log(`   - User thường: ${updatedCount - adminCount}`);
    
    // 3. Kiểm tra lại
    console.log('\n🔍 Kiểm tra lại database...');
    const totalUsers = await User.countDocuments();
    const verifiedUsers = await User.countDocuments({ isVerified: true });
    const unverifiedUsers = await User.countDocuments({ isVerified: false });
    
    console.log(`   - Tổng user: ${totalUsers}`);
    console.log(`   - Đã verified: ${verifiedUsers}`);
    console.log(`   - Chưa verified: ${unverifiedUsers} (user mới đăng ký)`);
    
  } catch (error) {
    console.error('❌ Lỗi migration:', error);
  }
};

// Main
const main = async () => {
  await connectDB();
  await migrateUsers();
  
  console.log('\n🎉 Xong! Bạn có thể đóng script này.');
  console.log('💡 Giờ các user cũ và admin có thể đăng nhập bình thường.');
  
  // Đợi 2 giây rồi thoát
  setTimeout(() => {
    mongoose.connection.close();
    process.exit(0);
  }, 2000);
};

// Chạy script
main();

