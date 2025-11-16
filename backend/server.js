const express = require('express');
const connectDB = require('./database/connect');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const authRoutes = require('./routes/auth'); // Add auth routes import
const adminRoutes = require('./routes/admin'); // Import admin routes
const walletRoutes = require('./routes/wallet'); // Import wallet routes
const transactionRoutes = require('./routes/transactions'); // Import transaction routes
const categoryRoutes = require('./routes/Category'); // Import category routes
const savingsRoutes = require('./routes/SavingsGoal'); // Import savings goal routes
const groupRoutes = require('./routes/groups'); // Import group routes
const notificationRoutes = require('./routes/notifications'); // Import notification routes
const aiRoutes = require('./routes/ai'); // Import AI routes
const familyRoutes = require('./routes/family'); // Import family routes
const userRoutes = require('./routes/user'); // Import user routes
const http = require('http');
let Server = null;
try {
  // try to load socket.io if installed
  Server = require('socket.io').Server;
} catch (err) {
  console.warn('socket.io not installed — realtime notifications disabled. To enable, run `npm install socket.io` in backend.');
}

// Load environment variables
require('dotenv').config();

// Add debug log
console.log('🔍 Environment loaded');
console.log('📝 GEMINI_API_KEY status:', process.env.GEMINI_API_KEY ? 'Present' : 'Missing');

// Set default environment
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

// Set default JWT secret if not provided
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secretKey';

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
  .then(() => {
    console.log('MongoDB connected successfully');
    // Note: Default categories are already created in database
    // If you need to recreate them, use a migration script or admin panel
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
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
// Mount AI routes
app.use('/api/ai', aiRoutes);
// Mount family routes (includes family management)
app.use('/api/family', familyRoutes);
// Mount user routes
app.use('/api/users', userRoutes);

// Mount family transactions routes (includes transactions endpoints)
app.use('/api/family', require('./routes/familyTransactions'));

// Mount group transactions routes (must come after groupRoutes mounting so group routes unaffected)
app.use('/api/groups', require('./routes/groupTransactions')); // routes in groupTransactions.js use '/:groupId/transactions'

// Mount notification routes
app.use('/api/notifications', notificationRoutes);
// Mount friends routes
app.use('/api/friends', require('./routes/friends'));
// Mount backup routes (admin only)
app.use('/api/backup', require('./routes/backup'));

// Tạo thư mục uploads nếu chưa tồn tại
const uploadsDir = path.join(__dirname, 'uploads');
const receiptsDir = path.join(uploadsDir, 'receipts');
const groupPostsDir = path.join(uploadsDir, 'group-posts');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

if (!fs.existsSync(receiptsDir)) {
  fs.mkdirSync(receiptsDir, { recursive: true });
}

if (!fs.existsSync(groupPostsDir)) {
  fs.mkdirSync(groupPostsDir, { recursive: true });
}

// Serve static files cho uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Redirect public share URL to frontend (avoid white page when opening backend link)
app.get('/public/group/:shareKey', (req, res) => {
  const frontendBase = process.env.FRONTEND_URL || 'http://localhost:3000';
  return res.redirect(`${frontendBase}/public/group/${req.params.shareKey}`);
});

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