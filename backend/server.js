const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./database/connect');
const mongoose = require('mongoose'); // Import mongoose
const User = require('./models/User');
const Expense = require('./models/Expense');
const Category = require('./models/Category');
const Income = require('./models/Income');
const cors = require('cors'); // Add CORS package
const authRoutes = require('./routes/auth'); // Add auth routes import

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
  .then(() => console.log('MongoDB connected successfully')) // Xóa "lỗi gì" hoặc chuỗi không cần thiết
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

    res.status(201).json({ message: 'Sample data created successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create sample data', error: error.message });
  }
});

// Mount auth routes
app.use('/api/auth', authRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));