const express = require('express');
const mongoose = require('mongoose');
const Category = require('../models/Category');
// Add User model import
const User = mongoose.model('User', require('../models/User').schema);
const router = express.Router();

// Keep middleware but modify how we handle user data
const extractUserInfo = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = require('jsonwebtoken').verify(token, 'secretKey');
      req.user = decoded;
    } catch (err) {
      console.warn('Invalid token in request:', err.message);
    }
  }
  
  // If we have user in request already (e.g. from another middleware), use it
  if (!req.user && req.locals && req.locals.user) {
    req.user = req.locals.user;
  }
  
  next();
};

router.use(extractUserInfo);

// @route   GET /api/categories
// @desc    Get all categories
// @access  Public
router.get('/', async (req, res) => {
  try {
    // Populate owner thông tin để hiển thị trong admin
    const categories = await Category.find()
      .populate('owner', 'name email _id')
      .sort({ type: 1, name: 1 });
      
    // Map to properly include owner info
    const enhancedCategories = categories.map(cat => {
      const category = cat.toObject();
      
      // Ensure owner info is available for UI display
      if (category.owner) {
        // If owner is populated object
        if (typeof category.owner === 'object') {
          if (!category.creatorName && category.owner.name) {
            category.creatorName = category.owner.name;
          }
          // Ensure owner ID is visible to frontend
          category.ownerId = category.owner._id || category.owner.id;
        } 
        // If owner is just an ID
        else {
          category.ownerId = category.owner;
        }
        
        // If we have owner but no createdBy, set it
        if (!category.createdBy) {
          category.createdBy = 'user';
        }
      }
      
      return category;
    });
    
    res.json(enhancedCategories);
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
    const { name, description, type, icon, owner, createdBy, creatorName } = req.body;
    
    // Validation
    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'Tên danh mục là bắt buộc' });
    }
    
    if (!type || !['expense', 'income'].includes(type)) {
      return res.status(400).json({ message: 'Loại danh mục không hợp lệ' });
    }

    const categoryData = {
      name: name.trim(),
      description: description || '',
      type,
      icon: icon || '❓',
    };

    // Handle owner ID and creator information with proper consistency
    if (req.user && (req.user.id || req.user._id)) {
      // For authenticated users
      categoryData.owner = req.user.id || req.user._id;
      
      if (req.user.role === 'admin') {
        categoryData.createdBy = 'admin';
        categoryData.creatorName = 'Quản trị viên';
      } else {
        categoryData.createdBy = 'user';
        categoryData.creatorName = req.user.name || 'Người dùng';
      }
    } 
    else if (owner) {
      // For frontend-provided owner
      categoryData.owner = owner;
      
      // Ensure consistency between createdBy and creatorName
      if (createdBy === 'admin') {
        categoryData.createdBy = 'admin';
        categoryData.creatorName = 'Quản trị viên';
      } else {
        categoryData.createdBy = 'user';
        
        // Use provided creatorName or try to look it up
        if (creatorName && createdBy !== 'admin' && creatorName !== 'Quản trị viên') {
          categoryData.creatorName = creatorName;
        } else if (mongoose.Types.ObjectId.isValid(owner)) {
          try {
            const user = await User.findById(owner).select('name');
            if (user && user.name) {
              categoryData.creatorName = user.name;
            } else {
              categoryData.creatorName = 'Người dùng';
            }
          } catch (err) {
            console.log('Could not find user name, using default');
            categoryData.creatorName = 'Người dùng';
          }
        } else if (typeof owner === 'string' && owner.startsWith('temp_')) {
          categoryData.creatorName = 'Người dùng tạm';
        }
      }
    } else {
      // System category (no owner)
      categoryData.createdBy = 'system';
      categoryData.creatorName = 'Hệ thống';
    }

    console.log('Creating category with data:', categoryData);
    const newCategory = new Category(categoryData);
    const category = await newCategory.save();
    
    res.status(201).json(category);
  } catch (err) {
    console.error('Error creating category:', err);
    // trả lỗi rõ hơn khi duplicate key
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Danh mục đã tồn tại' });
    }
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
      { name: 'Ăn uống', description: 'Các chi phí ăn uống hàng ngày', type: 'expense', icon: '🍔', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
      { name: 'Di chuyển', description: 'Xăng xe, taxi, xe buýt', type: 'expense', icon: '🚗', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
      { name: 'Hóa đơn & Tiện ích', description: 'Điện, nước, internet', type: 'expense', icon: '📝', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
      { name: 'Mua sắm', description: 'Quần áo, đồ dùng', type: 'expense', icon: '🛍️', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
      { name: 'Giải trí', description: 'Phim ảnh, âm nhạc, chơi game', type: 'expense', icon: '🎮', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
      { name: 'Y tế', description: 'Thuốc men, khám bệnh', type: 'expense', icon: '💊', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
      { name: 'Giáo dục', description: 'Sách vở, học phí', type: 'expense', icon: '📚', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
      { name: 'Nhà cửa', description: 'Thuê nhà, sửa chữa', type: 'expense', icon: '🏠', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
      { name: 'Thú cưng', description: 'Thức ăn, chăm sóc thú cưng', type: 'expense', icon: '🐱', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
      { name: 'Quà tặng', description: 'Quà tặng cho người khác', type: 'expense', icon: '🎁', owner: null, createdBy: 'system', creatorName: 'Hệ thống' }
    ];
    
    // Danh sách danh mục thu nhập
    const incomeCategories = [
      { name: 'Lương', description: 'Thu nhập từ công việc chính', type: 'income', icon: '💰', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
      { name: 'Thưởng', description: 'Tiền thưởng, hoa hồng', type: 'income', icon: '🏆', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
      { name: 'Đầu tư', description: 'Lợi nhuận từ đầu tư', type: 'income', icon: '📈', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
      { name: 'Bán đồ', description: 'Thu từ bán đồ cũ', type: 'income', icon: '🏷️', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
      { name: 'Quà tặng', description: 'Tiền được tặng', type: 'income', icon: '🎁', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
      { name: 'Trợ cấp', description: 'Tiền trợ cấp, phụ cấp', type: 'income', icon: '📋', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
      { name: 'Lãi suất', description: 'Lãi từ ngân hàng', type: 'income', icon: '🏦', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
      { name: 'Freelance', description: 'Thu từ công việc tự do', type: 'income', icon: '💻', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
      { name: 'Cho thuê', description: 'Thu từ cho thuê tài sản', type: 'income', icon: '🔑', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
      { name: 'Thu nhập khác', description: 'Các nguồn thu khác', type: 'income', icon: '💵', owner: null, createdBy: 'system', creatorName: 'Hệ thống' }
    ];
    
    // Tạo tất cả danh mục chi tiêu
    await Category.insertMany(expenseCategories);
    
    // Tạo tất cả danh mục thu nhập
    await Category.insertMany(incomeCategories);
    
    res.status(201).json({ 
      message: 'Đã tạo 20 danh mục hệ thống mặc định',
      totalCategories: expenseCategories.length + incomeCategories.length
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
});

// @route   PUT /api/categories/:id
// @desc    Update a category
// @access  Public (sẽ thêm auth sau)
router.put('/:id', async (req, res) => {
  try {
    const { name, description, type, icon } = req.body;
    
    // Validation
    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'Tên danh mục là bắt buộc' });
    }
    
    if (!type || !['expense', 'income'].includes(type)) {
      return res.status(400).json({ message: 'Loại danh mục không hợp lệ' });
    }

    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Không tìm thấy danh mục' });
    }

    category.name = name.trim();
    category.description = description || '';
    category.type = type;
    category.icon = icon || '❓';
    category.updatedAt = Date.now();

    const updatedCategory = await category.save();
    res.json(updatedCategory);
  } catch (err) {
    console.error(err.message);
    // Trả lỗi rõ hơn khi duplicate key
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Danh mục đã tồn tại' });
    }
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
});

// @route   DELETE /api/categories/:id
// @desc    Delete a category
// @access  Public (sẽ thêm auth sau)
router.delete('/:id', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Không tìm thấy danh mục' });
    }

    // Replace deprecated remove() with deleteOne()
    await Category.deleteOne({ _id: req.params.id });
    res.json({ message: 'Đã xóa danh mục thành công' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
});

module.exports = router;
