/**
 * This script updates the Notification schema to add new transaction notification types
 * that are missing from the enum values.
 * 
 * Usage:
 * 1. Make sure MongoDB connection is configured in .env
 * 2. Run: node update-notification-schema.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { green, red, yellow, cyan } = require('chalk');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/billiamo')
  .then(() => console.log(cyan('Connected to MongoDB')))
  .catch(err => {
    console.error(red('Failed to connect to MongoDB'), err);
    process.exit(1);
  });

// Get the Notification model
const Notification = mongoose.model('Notification');

async function updateSchema() {
  try {
    console.log(yellow('Updating Notification schema...'));

    // Get the current schema
    const schema = Notification.schema;
    
    // Check if 'type' path exists and has enum
    if (!schema.path('type') || !schema.path('type').enumValues) {
      console.error(red('Error: Notification schema does not have a "type" field with enum values'));
      process.exit(1);
    }

    // Get current enum values
    const currentEnumValues = schema.path('type').enumValues;
    console.log(cyan('Current enum values:'), currentEnumValues);

    // Check if the values are already in the enum
    const missingValues = ['group.transaction.edited', 'group.transaction.deleted'].filter(
      type => !currentEnumValues.includes(type)
    );

    if (missingValues.length === 0) {
      console.log(green('All notification types are already in the enum. No update needed.'));
      process.exit(0);
    }

    // Add the new values to the enum
    schema.path('type').enumValues = [...currentEnumValues, ...missingValues];
    
    console.log(green('Successfully updated Notification schema with new notification types:'), missingValues);
    console.log(cyan('New enum values:'), schema.path('type').enumValues);

    // If you need to re-register the model (might be necessary in some cases)
    // mongoose.deleteModel('Notification');
    // mongoose.model('Notification', schema);

    console.log(yellow('Note: This update is temporary for this session only.'));
    console.log(yellow('To make it permanent, update the Notification.js model file directly.'));

    process.exit(0);
  } catch (error) {
    console.error(red('Error updating schema:'), error);
    process.exit(1);
  }
}

updateSchema();
