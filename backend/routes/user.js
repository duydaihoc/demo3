const express = require('express');
const router = express.Router();
const User = require('../models/User');

// GET /api/users/create-test
// Creates or returns a test user
router.get('/create-test', async (req, res) => {
  try {
    let testUser = await User.findOne({ email: 'test@example.com' });
    if (!testUser) {
      testUser = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      });
      console.log('Created test user with ID:', testUser._id);
    } else {
      console.log('Using existing test user with ID:', testUser._id);
    }

    res.json({
      userId: testUser._id,
      name: testUser.name,
      email: testUser.email
    });
  } catch (err) {
    console.error('Error creating test user:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
