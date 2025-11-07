const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'user'], default: 'user' },
    friends: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    ],
    // THÊM: Flag để đánh dấu user mới
    isNewUser: { type: Boolean, default: true },
    // THÊM: Lưu thời gian user đã xem tour
    hasSeenTour: { type: Boolean, default: false }
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);

module.exports = User;