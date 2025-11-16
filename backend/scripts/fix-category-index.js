const mongoose = require('mongoose');
const Category = require('../models/Category');

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/quanlychitieu';

async function fixIndex() {
  try {
    await mongoose.connect(MONGODB_URI);

    // Call ensureIndexes function
    await Category.ensureIndexes();

    // Verify indexes
    const collection = Category.collection;
    const indexes = await collection.indexes();

    process.exit(0);
  } catch (err) {
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

fixIndex();

