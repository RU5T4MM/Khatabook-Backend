const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/khatabook');
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
    // Seed default admin account if table is empty
    const User = require('../models/User');
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      console.log('[DB SEED] Creating default admin account...');
      await User.create({
        businessName: 'Khatabook Demo',
        ownerName: 'System Admin',
        phone: '9999999999',
        email: 'admin@khatabook.com',
        password: 'admin123', // Will be hashed automatically by UserSchema schema pre-save hooks
        role: 'admin',
        subscription: {
          plan: 'premium',
          status: 'active',
          expiresAt: new Date('2030-12-31')
        }
      });
      console.log('[DB SEED] Admin account created successfully! Login: admin@khatabook.com / admin123');
    }
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;

