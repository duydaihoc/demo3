/**
 * This script directly updates the MongoDB collection to add the new notification types
 * to the schema's enum values.
 * 
 * Usage:
 * 1. Make sure MongoDB connection is configured in .env
 * 2. Run: node update-notification-types.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/billiamo');
    console.log('MongoDB connected...');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
};

const updateNotificationSchema = async () => {
  try {
    await connectDB();
    
    console.log('Updating notification schema...');
    
    // Get the collection directly to bypass schema validation
    const db = mongoose.connection.db;
    
    // Update the schema definition in the database
    // This uses MongoDB's updateCollection command to modify the schema validator
    await db.command({
      collMod: 'notifications',
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['type'],
          properties: {
            type: {
              bsonType: 'string',
              enum: [
                'notification',
                'group',
                'group.transaction',
                'group.transaction.created',
                'group.transaction.updated',
                'group.transaction.debt',
                'group.transaction.debt.paid',
                'group.transaction.settled',
                // Add the new notification types
                'group.transaction.edited',
                'group.transaction.deleted'
              ]
            }
          }
        }
      }
    });
    
    console.log('Notification schema updated successfully.');
    
    // Close the connection
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
    
    process.exit(0);
  } catch (error) {
    console.error('Error updating notification schema:', error);
    process.exit(1);
  }
};

updateNotificationSchema();
