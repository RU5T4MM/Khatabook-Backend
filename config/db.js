const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/khatabook';
    const conn = await mongoose.connect(mongoUri);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
    // Seed default admin account if table is empty
    const User = require('../models/User');
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      console.log('[DB SEED] Creating default admin account...');
      await User.create({
        businessName: 'Nahid Group Manpower',
        ownerName: 'Nahid',
        phone: '9999999999',
        email: 'groupnahid@gmail.com',
        password: 'admin123', // Will be hashed automatically by UserSchema schema pre-save hooks
        role: 'admin',
        address: '1st GF 105/211/3, opp. Hotel Deep, beside Navrang Hotel, Husainganj, Lucknow, Uttar Pradesh 226001',
        subscription: {
          plan: 'premium',
          status: 'active',
          expiresAt: new Date('2030-12-31')
        }
      });
      console.log('[DB SEED] Admin account created successfully! Login: groupnahid@gmail.com / admin123');
    }
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;

