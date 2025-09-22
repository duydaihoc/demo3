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

    // Helper to check ObjectId
    const isObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

    // Priority 1: authenticated user (from token middleware)
    if (req.user && (req.user.id || req.user._id)) {
      const uid = req.user.id || req.user._id;
      // store actual ObjectId
      categoryData.owner = isObjectId(uid) ? mongoose.Types.ObjectId(uid) : uid;
      if (req.user.role === 'admin') {
        categoryData.createdBy = 'admin';
        categoryData.creatorName = req.user.name || 'Quản trị viên';
      } else {
        categoryData.createdBy = 'user';
        categoryData.creatorName = req.user.name || 'Người dùng';
      }
    } 
    // Priority 2: frontend provided owner / creatorName
    else if (owner) {
      // If owner is a valid ObjectId string -> use it and try to resolve name
      if (isObjectId(owner)) {
        categoryData.owner = mongoose.Types.ObjectId(owner);
        categoryData.createdBy = createdBy === 'admin' ? 'admin' : 'user';
        if (creatorName) {
          categoryData.creatorName = creatorName;
        } else {
          // try to lookup user name by id
          try {
            const u = await User.findById(owner).select('name');
            categoryData.creatorName = (u && u.name) ? u.name : (createdBy === 'admin' ? 'Quản trị viên' : 'Người dùng');
          } catch (err) {
            categoryData.creatorName = creatorName || (createdBy === 'admin' ? 'Quản trị viên' : 'Người dùng');
          }
        }
      } 
      // owner is not an ObjectId (likely temp_...) -> try to resolve by creatorName
      else {
        // If creatorName provided, attempt to find a matching user in DB
        if (creatorName) {
          try {
            // Try find by exact name first, then by email as fallback
            let foundUser = await User.findOne({ name: creatorName }).select('_id name email');
            if (!foundUser) {
              foundUser = await User.findOne({ email: creatorName }).select('_id name email');
            }
            if (foundUser) {
              // convert to real ObjectId owner
              categoryData.owner = foundUser._id;
              categoryData.createdBy = 'user';
              categoryData.creatorName = foundUser.name || creatorName;
            } else {
              // no matching user found — keep temp owner string
              categoryData.owner = owner;
              categoryData.createdBy = createdBy === 'admin' ? 'admin' : 'user';
              // prefer provided creatorName, or mark as temporary user
              categoryData.creatorName = creatorName || (owner.startsWith('temp_') ? 'Người dùng tạm' : 'Người dùng');
            }
          } catch (err) {
            // lookup failed — keep temp owner and provided creatorName
            categoryData.owner = owner;
            categoryData.createdBy = createdBy === 'admin' ? 'admin' : 'user';
            categoryData.creatorName = creatorName || (owner.startsWith('temp_') ? 'Người dùng tạm' : 'Người dùng');
          }
        } else {
          // No creatorName — keep temp owner
          categoryData.owner = owner;
          categoryData.createdBy = createdBy === 'admin' ? 'admin' : 'user';
          categoryData.creatorName = owner.startsWith('temp_') ? 'Người dùng tạm' : (creatorName || 'Người dùng');
        }
      }
    } 
    // Priority 3: no owner provided => system category
    else {
      categoryData.createdBy = 'system';
      categoryData.creatorName = 'Hệ thống';
    }

    console.log('Creating category with data:', categoryData);
    const newCategory = new Category(categoryData);
    const category = await newCategory.save();
    
    res.status(201).json(category);
  } catch (err) {
    console.error('Error creating category:', err);
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
