const mongoose = require('mongoose');

const FriendRequestSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // optional
  recipientEmail: { type: String, required: true, index: true },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  respondedAt: { type: Date }
});

module.exports = mongoose.model('FriendRequest', FriendRequestSchema);
