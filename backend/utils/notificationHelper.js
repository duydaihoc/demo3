/**
 * Notification helper utility to handle invalid notification types.
 * This provides a temporary solution until the schema can be updated.
 */

/**
 * Maps unsupported notification types to supported ones and adds metadata
 * to preserve the original intent.
 * 
 * @param {string} originalType - The original notification type
 * @returns {Object} Object with normalized type and metadata
 */
const normalizeNotificationType = (originalType) => {
  // Check if this is one of the problematic types
  if (originalType === 'group.transaction.edited' || originalType === 'group.transaction.deleted') {
    // Map to a valid base type
    return {
      type: 'group.transaction', // Use a valid base type
      metadata: {
        originalType: originalType,
        action: originalType.split('.').pop() // 'edited' or 'deleted'
      }
    };
  }
  
  // Return the original type if it's already valid
  return {
    type: originalType,
    metadata: {}
  };
};

/**
 * Creates a notification with proper type normalization to avoid validation errors
 * 
 * @param {Object} notificationModel - Mongoose Notification model
 * @param {Object} notificationData - The notification data to create
 * @returns {Promise<Object>} The created notification
 */
const createSafeNotification = async (notificationModel, notificationData) => {
  try {
    // Normalize the notification type
    const { type, metadata } = normalizeNotificationType(notificationData.type);
    
    // Create a modified notification data with the normalized type
    const safeNotificationData = {
      ...notificationData,
      type,
      // Store the original type and action in the data field
      data: {
        ...(notificationData.data || {}),
        _originalType: notificationData.type,
        action: metadata.action
      }
    };
    
    // Create the notification with the safe data
    const notification = await notificationModel.create(safeNotificationData);
    return notification;
  } catch (error) {
    console.warn(`Failed to create notification: ${error.message}`);
    return null;
  }
};

module.exports = {
  normalizeNotificationType,
  createSafeNotification
};
