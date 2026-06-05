const User = require('../models/User');
const Customer = require('../models/Customer');
const Transaction = require('../models/Transaction');
const Expense = require('../models/Expense');
const Invoice = require('../models/Invoice');
const Subscription = require('../models/Subscription');
const fs = require('fs');
const path = require('path');

// Get overall analytics dashboard
exports.getAnalytics = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const premiumUsers = await User.countDocuments({ 'subscription.plan': 'premium' });
    const freeUsers = totalUsers - premiumUsers;
    const blockedUsers = await User.countDocuments({ isBlocked: true });

    const totalCustomers = await Customer.countDocuments();
    const totalTransactions = await Transaction.countDocuments();
    const totalExpenses = await Expense.countDocuments();
    const totalInvoices = await Invoice.countDocuments();

    // Fetch monthly stats or recent subscription transactions
    const recentSubscribers = await Subscription.find()
      .populate('userId', 'businessName ownerName email phone')
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      metrics: {
        totalUsers,
        premiumUsers,
        freeUsers,
        blockedUsers,
        totalCustomers,
        totalTransactions,
        totalExpenses,
        totalInvoices
      },
      recentSubscribers
    });
  } catch (error) {
    res.status(500).json({ message: 'Error generating admin analytics', error: error.message });
  }
};

// List all users in system
exports.getUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users list', error: error.message });
  }
};

// Block/Unblock user
exports.toggleUserBlock = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent blocking own admin account
    if (user._id.toString() === req.user.id.toString()) {
      return res.status(400).json({ message: 'You cannot block your own account' });
    }

    user.isBlocked = !user.isBlocked;
    await user.save();

    res.json({ message: `User account has been successfully ${user.isBlocked ? 'blocked' : 'unblocked'}`, user });
  } catch (error) {
    res.status(500).json({ message: 'Error updating block state', error: error.message });
  }
};

// Manually update user plan / overwrite subscription
exports.updateUserPlan = async (req, res) => {
  try {
    const { plan, durationDays } = req.body;
    if (!plan || !['free', 'premium'].includes(plan)) {
      return res.status(400).json({ message: 'Invalid plan name' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (plan === 'premium') {
      const days = parseInt(durationDays) || 30;
      user.subscription = {
        plan: 'premium',
        status: 'active',
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
        razorpaySubscriptionId: 'admin_manual_grant'
      };
    } else {
      user.subscription = {
        plan: 'free',
        status: 'none',
        expiresAt: null,
        razorpaySubscriptionId: null
      };
    }

    await user.save();
    res.json({ message: `User subscription upgraded to ${plan}`, user });
  } catch (error) {
    res.status(500).json({ message: 'Error updating user plan', error: error.message });
  }
};

// Backup Database
exports.backupDatabase = async (req, res) => {
  try {
    const users = await User.find();
    const customers = await Customer.find();
    const transactions = await Transaction.find();
    const expenses = await Expense.find();
    const invoices = await Invoice.find();
    const subscriptions = await Subscription.find();

    const backupData = {
      timestamp: new Date().toISOString(),
      users,
      customers,
      transactions,
      expenses,
      invoices,
      subscriptions
    };

    const backupsDir = path.join(__dirname, '..', 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    const filename = `backup_${Date.now()}.json`;
    const filepath = path.join(backupsDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(backupData, null, 2), 'utf-8');

    res.json({
      message: 'Database backup created successfully',
      filename,
      filepath,
      collectionsCount: {
        users: users.length,
        customers: customers.length,
        transactions: transactions.length,
        expenses: expenses.length,
        invoices: invoices.length,
        subscriptions: subscriptions.length
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Database backup failed', error: error.message });
  }
};

// Restore Database from file
exports.restoreDatabase = async (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) {
      return res.status(400).json({ message: 'Backup filename is required' });
    }

    const filepath = path.join(__dirname, '..', 'backups', filename);
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ message: 'Backup file not found' });
    }

    const rawData = fs.readFileSync(filepath, 'utf-8');
    const backupData = JSON.parse(rawData);

    // Clear and restore users
    if (backupData.users) {
      await User.deleteMany({});
      await User.insertMany(backupData.users);
    }
    // Restore others
    if (backupData.customers) {
      await Customer.deleteMany({});
      await Customer.insertMany(backupData.customers);
    }
    if (backupData.transactions) {
      await Transaction.deleteMany({});
      await Transaction.insertMany(backupData.transactions);
    }
    if (backupData.expenses) {
      await Expense.deleteMany({});
      await Expense.insertMany(backupData.expenses);
    }
    if (backupData.invoices) {
      await Invoice.deleteMany({});
      await Invoice.insertMany(backupData.invoices);
    }
    if (backupData.subscriptions) {
      await Subscription.deleteMany({});
      await Subscription.insertMany(backupData.subscriptions);
    }

    res.json({ message: 'Database state restored successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Database restore operation failed', error: error.message });
  }
};
