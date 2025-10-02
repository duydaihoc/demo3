const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./database/connect');
const mongoose = require('mongoose'); // Import mongoose
const User = require('./models/User');
const Expense = require('./models/Expense');
const Category = require('./models/Category');
const Income = require('./models/Income');
const Wallet = require('./models/Wallet'); // Import Wallet model
const Transaction = require('./models/Transaction'); // Import Transaction model
const SavingsGoal = require('./models/SavingsGoal'); // Import SavingsGoal model
const cors = require('cors'); // Add CORS package
const authRoutes = require('./routes/auth'); // Add auth routes import
const adminRoutes = require('./routes/admin'); // Import admin routes
const walletRoutes = require('./routes/wallet'); // Import wallet routes
const transactionRoutes = require('./routes/transactions'); // Import transaction routes
const categoryRoutes = require('./routes/Category'); // Import category routes
const savingsRoutes = require('./routes/SavingsGoal'); // Import savings goal routes
const groupRoutes = require('./routes/groups'); // Import group routes
const notificationRoutes = require('./routes/notifications'); // Import notification routes
const http = require('http');
let Server = null;
try {
  // try to load socket.io if installed
  Server = require('socket.io').Server;
} catch (err) {
  console.warn('socket.io not installed — realtime notifications disabled. To enable, run `npm install socket.io` in backend.');
}

dotenv.config();

const app = express();

// Enable CORS for all origins (adjust for production security)
app.use(cors());

// Parse JSON request bodies
app.use(express.json());

// Kiểm tra nếu MONGO_URI không được cấu hình
if (!process.env.MONGO_URI) {
  console.error('Error: MONGO_URI is not defined in .env file');
  process.exit(1); // Thoát nếu thiếu cấu hình
}

// Connect to MongoDB
connectDB()
  .then(async () => {
    console.log('MongoDB connected successfully');
    
    // Tự động tạo các danh mục mặc định khi server khởi động
    try {
      // Kiểm tra xem đã có danh mục nào chưa
      const categoriesCount = await Category.countDocuments();
      console.log(`Đã có ${categoriesCount} danh mục trong cơ sở dữ liệu`);
      
      if (categoriesCount < 20) {
        console.log('Tiếp tục tạo thêm danh mục còn thiếu...');
        
        // Lấy các danh mục hiện có
        const existingCategories = await Category.find({}, 'name type');
        const existingNames = existingCategories.map(cat => `${cat.name}-${cat.type}`);
        
        // Danh sách tất cả danh mục mặc định
        const allDefaultCategories = [
          { name: 'Ăn uống', description: 'Các chi phí ăn uống hàng ngày', type: 'expense', icon: '🍔', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
          { name: 'Di chuyển', description: 'Xăng xe, taxi, xe buýt', type: 'expense', icon: '🚗', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
          { name: 'Hóa đơn & Tiện ích', description: 'Điện, nước, internet', type: 'expense', icon: '📝', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
          { name: 'Mua sắm', description: 'Quần áo, đồ dùng', type: 'expense', icon: '🛍️', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
          { name: 'Giải trí', description: 'Phim ảnh, âm nhạc, chơi game', type: 'expense', icon: '🎮', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
          { name: 'Y tế', description: 'Thuốc men, khám bệnh', type: 'expense', icon: '💊', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
          { name: 'Giáo dục', description: 'Sách vở, học phí', type: 'expense', icon: '📚', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
          { name: 'Nhà cửa', description: 'Thuê nhà, sửa chữa', type: 'expense', icon: '🏠', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
          { name: 'Thú cưng', description: 'Thức ăn, chăm sóc thú cưng', type: 'expense', icon: '🐱', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
          { name: 'Quà tặng (Chi)', description: 'Quà tặng cho người khác', type: 'expense', icon: '🎁', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
          { name: 'Lương', description: 'Thu nhập từ công việc chính', type: 'income', icon: '💰', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
          { name: 'Thưởng', description: 'Tiền thưởng, hoa hồng', type: 'income', icon: '🏆', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
          { name: 'Đầu tư', description: 'Lợi nhuận từ đầu tư', type: 'income', icon: '📈', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
          { name: 'Bán đồ', description: 'Thu từ bán đồ cũ', type: 'income', icon: '🏷️', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
          { name: 'Tiền được tặng', description: 'Tiền được người khác tặng', type: 'income', icon: '🎁', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
          { name: 'Trợ cấp', description: 'Tiền trợ cấp, phụ cấp', type: 'income', icon: '📋', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
          { name: 'Lãi suất', description: 'Lãi từ ngân hàng', type: 'income', icon: '🏦', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
          { name: 'Freelance', description: 'Thu từ công việc tự do', type: 'income', icon: '💻', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
          { name: 'Cho thuê', description: 'Thu từ cho thuê tài sản', type: 'income', icon: '🔑', owner: null, createdBy: 'system', creatorName: 'Hệ thống' },
          { name: 'Thu nhập khác', description: 'Các nguồn thu khác', type: 'income', icon: '💵', owner: null, createdBy: 'system', creatorName: 'Hệ thống' }
        ];
        
        // Lọc ra các danh mục chưa tồn tại
        const categoriesToCreate = allDefaultCategories.filter(cat => 
          !existingNames.includes(`${cat.name}-${cat.type}`)
        );
        
        console.log(`Cần tạo thêm ${categoriesToCreate.length} danh mục`);
        
        if (categoriesToCreate.length > 0) {
          await Category.insertMany(categoriesToCreate);
          console.log('Đã tạo bổ sung các danh mục hệ thống còn thiếu');
          
          // Đếm lại để xác nhận
          const updatedCount = await Category.countDocuments();
          console.log(`Hiện tại có ${updatedCount} danh mục trong cơ sở dữ liệu`);
        }
      }
    } catch (error) {
      console.error('Lỗi khi tạo danh mục mặc định:', error.message);
    }
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1); // Exit the process with failure
  });

// Middleware kiểm tra kết nối MongoDB
app.use((req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(500).json({ message: 'MongoDB is not connected' });
  }
  next();
});

app.get('/', (req, res) => {
  res.send('API is running...');
});

// Tạo schema và model tạm thời
const sampleSchema = new mongoose.Schema({ name: String });
const Sample = mongoose.model('Sample', sampleSchema);

// Route để tạo dữ liệu mẫu
app.get('/create-sample', async (req, res) => {
  try {
    const sample = new Sample({ name: 'Sample Data' });
    await sample.save();
    res.status(201).json({ message: 'Sample data created successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create sample data', error: error.message });
  }
});

// Route để tạo dữ liệu mẫu cho tất cả các bảng
app.get('/create-sample-data', async (req, res) => {
  try {
    // Tạo dữ liệu mẫu cho User
    const user = new User({ name: 'John Doe', email: 'john@example.com', password: '123456' });
    await user.save();

    // Tạo dữ liệu mẫu cho Category
    const category = new Category({ name: 'Food', description: 'Food-related expenses' });
    await category.save();

    // Tạo dữ liệu mẫu cho Wallet
    const wallet = new Wallet({
      name: 'Ví chính',
      currency: 'VND',
      initialBalance: 1000000,
      owner: user._id
    });
    await wallet.save();

    // Tạo dữ liệu mẫu cho Expense
    const expense = new Expense({
      user: user._id,
      title: 'Lunch',
      amount: 15,
      category: category.name,
    });
    await expense.save();

    // Tạo dữ liệu mẫu cho Income
    const income = new Income({
      user: user._id,
      source: 'Salary',
      amount: 1000,
    });
    await income.save();

    // Tạo transaction mẫu (liên kết tới wallet và category vừa tạo)
    try {
      const transaction = new Transaction({
        wallet: wallet._id,
        category: category._id,
        type: 'expense',
        amount: 150000,
        title: 'Chi tiêu mẫu',
        description: 'Giao dịch mẫu để kiểm tra',
        date: new Date(),
        createdBy: user._id
      });
      await transaction.save();
    } catch (txErr) {
      console.warn('Không thể tạo transaction mẫu:', txErr.message);
    }
    
    // Create sample SavingsGoal linked to user and wallet (if possible)
    try {
      const goal = new SavingsGoal({
        name: 'Quỹ nghỉ dưỡng',
        targetAmount: 5000000,
        currentAmount: 1000000,
        owner: user._id,
        walletId: wallet._id,
        contributions: [{ amount: 1000000, walletId: wallet._id, note: 'Khởi tạo' }]
      });
      await goal.save();
      console.log('Created sample savings goal');
    } catch (sgErr) {
      console.warn('Không thể tạo savings goal mẫu:', sgErr.message);
    }

    res.status(201).json({ message: 'Sample data created successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create sample data', error: error.message });
  }
});

// Mount auth routes
app.use('/api/auth', authRoutes);
// Mount admin routes
app.use('/api/admin', adminRoutes);
// Mount wallet routes
app.use('/api/wallets', walletRoutes);
// Mount transaction routes
app.use('/api/transactions', transactionRoutes);
// Mount category routes
app.use('/api/categories', categoryRoutes);
// Mount savings goals routes so frontend can POST/GET /api/savings
app.use('/api/savings', savingsRoutes);
// Mount group routes
app.use('/api/groups', groupRoutes);

// Mount group transactions routes (must come after groupRoutes mounting so group routes unaffected)
app.use('/api/groups', require('./routes/groupTransactions')); // routes in groupTransactions.js use '/:groupId/transactions'

// Mount notification routes
app.use('/api/notifications', notificationRoutes);
// Mount friends routes
app.use('/api/friends', require('./routes/friends')); // <-- added

// create http server and attach socket.io if available
const server = http.createServer(app);
let io = null;
if (Server) {
  io = new Server(server, { cors: { origin: '*' } });
  // expose io to routes via app
  app.set('io', io);

  io.on('connection', (socket) => {
    // client should emit 'join' with userId after connecting
    socket.on('join', (userId) => {
      if (userId) socket.join(String(userId));
    });

    socket.on('disconnect', () => { /* no-op */ });
  });

  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => console.log(`Server running on port ${PORT} (with socket.io)`));
} else {
  // fallback: run express app without socket.io
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT} (socket.io not available)`));
}