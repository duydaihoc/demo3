const express = require('express');
const mongoose = require('mongoose');
const Category = require('../models/Category');
const router = express.Router();

// @route   GET /api/categories
// @desc    Get all categories
// @access  Public
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find().sort({ type: 1, name: 1 });
    res.json(categories);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
});

// @route   POST /api/categories
// @desc    Create a new category
// @access  Public (sẽ thêm auth sau)
router.post('/', async (req, res) => {
  try {
    const { name, description, type, icon } = req.body;
    
    // Validation
    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'Tên danh mục là bắt buộc' });
    }
    
    if (!type || !['expense', 'income'].includes(type)) {
      return res.status(400).json({ message: 'Loại danh mục không hợp lệ' });
    }

    const newCategory = new Category({
      name: name.trim(),
      description: description || '',
      type,
      icon: icon || '❓'
    });

    const category = await newCategory.save();
    res.status(201).json(category);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
});

// @route   POST /api/categories/seed
// @desc    Seed default categories
// @access  Public
router.post('/seed', async (req, res) => {
  try {
    // Xóa tất cả danh mục hệ thống (không có owner)
    await Category.deleteMany({ owner: null });
    
    // Danh sách danh mục chi tiêu
    const expenseCategories = [
      { name: 'Ăn uống', description: 'Các chi phí ăn uống hàng ngày', type: 'expense', icon: '🍔' },
      { name: 'Di chuyển', description: 'Xăng xe, taxi, xe buýt', type: 'expense', icon: '🚗' },
      { name: 'Hóa đơn & Tiện ích', description: 'Điện, nước, internet', type: 'expense', icon: '📝' },
      { name: 'Mua sắm', description: 'Quần áo, đồ dùng', type: 'expense', icon: '🛍️' },
      { name: 'Giải trí', description: 'Phim ảnh, âm nhạc, chơi game', type: 'expense', icon: '🎮' },
      { name: 'Y tế', description: 'Thuốc men, khám bệnh', type: 'expense', icon: '💊' },
      { name: 'Giáo dục', description: 'Sách vở, học phí', type: 'expense', icon: '📚' },
      { name: 'Nhà cửa', description: 'Thuê nhà, sửa chữa', type: 'expense', icon: '🏠' },
      { name: 'Thú cưng', description: 'Thức ăn, chăm sóc thú cưng', type: 'expense', icon: '🐱' },
      { name: 'Quà tặng', description: 'Quà tặng cho người khác', type: 'expense', icon: '🎁' }
    ];
    
    // Danh sách danh mục thu nhập
    const incomeCategories = [
      { name: 'Lương', description: 'Thu nhập từ công việc chính', type: 'income', icon: '💰' },
      { name: 'Thưởng', description: 'Tiền thưởng, hoa hồng', type: 'income', icon: '🏆' },
      { name: 'Đầu tư', description: 'Lợi nhuận từ đầu tư', type: 'income', icon: '📈' },
      { name: 'Bán đồ', description: 'Thu từ bán đồ cũ', type: 'income', icon: '🏷️' },
      { name: 'Quà tặng', description: 'Tiền được tặng', type: 'income', icon: '🎁' },
      { name: 'Trợ cấp', description: 'Tiền trợ cấp, phụ cấp', type: 'income', icon: '📋' },
      { name: 'Lãi suất', description: 'Lãi từ ngân hàng', type: 'income', icon: '🏦' },
      { name: 'Freelance', description: 'Thu từ công việc tự do', type: 'income', icon: '💻' },
      { name: 'Cho thuê', description: 'Thu từ cho thuê tài sản', type: 'income', icon: '🔑' },
      { name: 'Thu nhập khác', description: 'Các nguồn thu khác', type: 'income', icon: '💵' }
    ];
    
    // Tạo tất cả danh mục chi tiêu
    await Category.insertMany(expenseCategories);
    
    // Tạo tất cả danh mục thu nhập
    await Category.insertMany(incomeCategories);
    
    res.status(201).json({ 
      message: 'Đã tạo 20 danh mục mặc định',
      totalCategories: expenseCategories.length + incomeCategories.length
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
});

module.exports = router;
