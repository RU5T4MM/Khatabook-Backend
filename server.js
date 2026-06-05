require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const connectDB = async () => {
  const db = require('./config/db');
  await db();
};
const User = require('./models/User');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve Static Uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Connect to Database
connectDB();

// API Routes
const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);

// --- Background Cron Scheduler ---
// Run every day at midnight (00:00) to check for expired subscriptions
cron.schedule('0 0 * * *', async () => {
  try {
    console.log('[CRON] Running daily subscription status checks...');
    const now = new Date();
    
    // Revert users whose subscription expiresAt has passed, and plan is still premium
    const result = await User.updateMany(
      {
        'subscription.plan': 'premium',
        'subscription.expiresAt': { $lt: now }
      },
      {
        $set: {
          'subscription.plan': 'free',
          'subscription.status': 'expired'
        }
      }
    );
    console.log(`[CRON] Completed subscription scan. Reverted ${result.modifiedCount} expired accounts.`);
  } catch (error) {
    console.error('[CRON] Error during subscription scan:', error.message);
  }
});

// Simulated Daily Backup Cron
// Run every week on Sunday at 02:00 AM
cron.schedule('0 2 * * 0', async () => {
  try {
    console.log('[CRON] Initiating automated weekly system backup...');
    const adminController = require('./controllers/adminController');
    // Mock request/response objects to invoke backup
    const mockReq = { body: {} };
    const mockRes = {
      json: (data) => console.log(`[CRON BACKUP SUCCESS] File: ${data.filename}`),
      status: (code) => ({ json: (data) => console.error(`[CRON BACKUP FAILED] Code ${code}:`, data.message) })
    };
    await adminController.backupDatabase(mockReq, mockRes);
  } catch (error) {
    console.error('[CRON] Automated backup error:', error.message);
  }
});

// --- Serve Frontend Client in Production ---
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../client', 'dist', 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('Khatabook Business Ledger API is running...');
  });
}

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Error Handler]:', err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'An internal server error occurred',
    error: process.env.NODE_ENV === 'development' ? err.stack : {}
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
