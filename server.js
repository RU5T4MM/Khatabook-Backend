require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
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

// --- Serve Frontend Client or API Status Page ---
if (process.env.NODE_ENV === 'production') {
  const clientDistPath = path.join(__dirname, '../client/dist');
  const indexPath = path.resolve(clientDistPath, 'index.html');
  
  if (fs.existsSync(indexPath)) {
    app.use(express.static(clientDistPath));
    app.get('*', (req, res) => {
      res.sendFile(indexPath);
    });
  } else {
    app.get('*', (req, res) => {
      res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nahid Group Ledger API - Online</title>
    <style>
        body {
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);
            color: #1f2937;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
        }
        .container {
            text-align: center;
            background: rgba(255, 255, 255, 0.9);
            backdrop-filter: blur(10px);
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
            max-width: 480px;
            width: 90%;
            border: 1px solid rgba(229, 231, 235, 0.5);
        }
        .status-badge {
            background-color: #dcfce7;
            color: #16a34a;
            padding: 6px 14px;
            border-radius: 9999px;
            font-weight: 600;
            font-size: 13px;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 24px;
            border: 1px solid #bbf7d0;
        }
        .status-dot {
            width: 8px;
            height: 8px;
            background-color: #16a34a;
            border-radius: 50%;
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(22, 163, 74, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(22, 163, 74, 0); }
        }
        h1 {
            font-size: 24px;
            font-weight: 700;
            margin: 0 0 12px 0;
            color: #111827;
        }
        p {
            color: #4b5563;
            line-height: 1.6;
            margin: 0 0 32px 0;
            font-size: 15px;
        }
        .btn {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            padding: 14px 28px;
            border-radius: 10px;
            text-decoration: none;
            font-weight: 600;
            display: inline-block;
            transition: transform 0.2s, box-shadow 0.2s;
            box-shadow: 0 4px 12px rgba(5, 150, 105, 0.2);
        }
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(5, 150, 105, 0.3);
        }
        .footer {
            margin-top: 32px;
            font-size: 11px;
            color: #9ca3af;
            letter-spacing: 0.5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="status-badge">
            <span class="status-dot"></span>
            API Server Active
        </div>
        <h1>Nahid Group Ledger</h1>
        <p>The backend API database and server services are running successfully. Click below to access your client portal.</p>
        <a href="https://nahidgroup.vercel.app" target="_blank" class="btn">Go to Frontend Portal</a>
        <div class="footer">© 2026 NAHID GROUP LEDGER. ALL RIGHTS RESERVED.</div>
    </div>
</body>
</html>
      `);
    });
  }
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
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
