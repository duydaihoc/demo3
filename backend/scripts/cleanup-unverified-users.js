/**
 * Script cleanup: Xóa user chưa verify sau 24 giờ
 * 
 * Chạy script này định kỳ (cron job) để dọn dẹp user:
 * - Chưa verify (isVerified = false)
 * - Có verificationCode (đang chờ verify)
 * - Tạo từ > 24 giờ trước
 * 
 * Cách chạy: node scripts/cleanup-unverified-users.js
 * Hoặc setup cron: 0 0 * * * (chạy mỗi ngày lúc 00:00)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/moneywise';
    await mongoose.connect(mongoURI);
    console.log('✅ MongoDB connected\n');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const cleanupUnverifiedUsers = async () => {
  try {
    console.log('🧹 Bắt đầu dọn dẹp user chưa verify...\n');
    
    // Tính thời gian 24 giờ trước
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    console.log(`⏰ Xóa user tạo trước: ${twentyFourHoursAgo.toLocaleString()}\n`);
    
    // Tìm user chưa verify và đã tồn tại > 24h
    const usersToDelete = await User.find({
      isVerified: false,
      verificationCode: { $exists: true, $ne: null },
      createdAt: { $lt: twentyFourHoursAgo }
    });
    
    if (usersToDelete.length === 0) {
      console.log('✅ Không có user nào cần xóa!');
      return;
    }
    
    console.log(`📊 Tìm thấy ${usersToDelete.length} user chưa verify:\n`);
    
    // Xóa từng user và log
    let deletedCount = 0;
    for (const user of usersToDelete) {
      const age = Math.round((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60));
      console.log(`  ❌ ${user.email}`);
      console.log(`     Tạo lúc: ${user.createdAt.toLocaleString()}`);
      console.log(`     Tuổi: ${age} giờ`);
      console.log(`     Role: ${user.role}`);
      
      await User.findByIdAndDelete(user._id);
      deletedCount++;
    }
    
    console.log(`\n✅ Cleanup hoàn tất!`);
    console.log(`   Đã xóa: ${deletedCount} user`);
    
    // Thống kê sau cleanup
    const totalUsers = await User.countDocuments();
    const verifiedUsers = await User.countDocuments({ isVerified: true });
    const unverifiedUsers = await User.countDocuments({ isVerified: false });
    
    console.log(`\n📈 Thống kê sau cleanup:`);
    console.log(`   Tổng user: ${totalUsers}`);
    console.log(`   Đã verify: ${verifiedUsers}`);
    console.log(`   Chưa verify: ${unverifiedUsers}`);
    
  } catch (error) {
    console.error('❌ Lỗi cleanup:', error);
  }
};

const main = async () => {
  await connectDB();
  await cleanupUnverifiedUsers();
  
  console.log('\n🎉 Hoàn tất!');
  
  setTimeout(() => {
    mongoose.connection.close();
    process.exit(0);
  }, 1000);
};

// Chạy script
main();



