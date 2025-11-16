const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CategorySchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: false
  },
  type: {
    type: String,
    enum: ['expense', 'income'],
    required: true
  },
  icon: {
    type: String,
    default: '❓'
  },
  owner: {
    // Changed from ObjectId to Mixed type to support both ObjectId and string IDs (for temp users)
    type: Schema.Types.Mixed,
    required: false // null means system category
  },
  wallet: {
    type: Schema.Types.ObjectId,
    ref: 'Wallet',
    required: false // null means global/shared category
  },
  createdBy: {
    type: String,
    enum: ['system', 'admin', 'user'],
    default: 'system'
  },
  creatorName: {
    type: String,
    default: 'Hệ thống'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Tạo compound index thay vì unique trên trường name
// Modified index to include owner for more flexibility
// This allows different users to have categories with the same name
CategorySchema.index({ name: 1, type: 1, owner: 1 }, { unique: true });

// Ensure index is created correctly when model is loaded
// This will be called when the model is first used
const Category = mongoose.model('Category', CategorySchema);

// Function to ensure correct index (can be called on startup)
Category.ensureIndexes = async function() {
  try {
    const collection = this.collection;
    
    // Get all indexes
    const indexes = await collection.indexes();
    
    // Check if old index exists (without owner)
    const oldIndex = indexes.find(idx => 
      idx.name === 'name_1_type_1' && 
      idx.key && 
      !idx.key.owner
    );
    
    if (oldIndex) {
      try {
        await collection.dropIndex('name_1_type_1');
      } catch (err) {
        // IndexNotFound is OK, it might have been dropped already
        // Silently ignore
      }
    }
    
    // Ensure new index exists
    try {
      await collection.createIndex(
        { name: 1, type: 1, owner: 1 }, 
        { unique: true, name: 'name_1_type_1_owner_1' }
      );
    } catch (err) {
      // Index might already exist, that's OK
      // Silently ignore
    }
  } catch (err) {
    // Silently ignore errors
  }
};

module.exports = Category;

// The Category schema already has these fields:
// owner: Mixed type to support both ObjectId and string IDs
// createdBy: String enum ('system', 'admin', 'user')
// creatorName: String for displaying the creator's name