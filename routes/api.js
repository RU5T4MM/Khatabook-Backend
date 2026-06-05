const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Import Controllers
const authController = require('../controllers/authController');
const ledgerController = require('../controllers/ledgerController');
const expenseController = require('../controllers/expenseController');
const invoiceController = require('../controllers/invoiceController');
const paymentController = require('../controllers/paymentController');
const adminController = require('../controllers/adminController');

// Import Middlewares
const { auth, adminOnly } = require('../middleware/auth');

// --- Setup Multer for Bill uploads ---
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only images (JPEG, JPG, PNG) and PDFs are allowed'));
  }
});

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================
router.post('/auth/signup', authController.signup);
router.post('/auth/login', authController.login);
router.post('/auth/send-otp', authController.sendOtp);
router.post('/auth/verify-otp', authController.verifyOtp);
router.post('/auth/forgot-password', authController.forgotPassword);
router.get('/auth/profile', auth, authController.getProfile);
router.put('/auth/profile', auth, authController.updateProfile);

// ==========================================
// CUSTOMER ROUTES
// ==========================================
router.get('/customers', auth, ledgerController.getCustomers);
router.post('/customers', auth, ledgerController.addCustomer);
router.put('/customers/:id', auth, ledgerController.updateCustomer);
router.delete('/customers/:id', auth, ledgerController.deleteCustomer);

// ==========================================
// LEDGER / TRANSACTION ROUTES
// ==========================================
router.get('/ledger/customer/:customerId', auth, ledgerController.getTransactionsByCustomer);
router.post('/ledger', auth, upload.single('billImage'), ledgerController.addTransaction);
router.delete('/ledger/:id', auth, ledgerController.deleteTransaction);
router.post('/ledger/sync', auth, ledgerController.syncTransactions);

// ==========================================
// EXPENSE ROUTES
// ==========================================
router.get('/expenses', auth, expenseController.getExpenses);
router.post('/expenses', auth, expenseController.addExpense);
router.delete('/expenses/:id', auth, expenseController.deleteExpense);
router.get('/expenses/summary', auth, expenseController.getExpenseSummary);

// ==========================================
// INVOICE ROUTES
// ==========================================
router.get('/invoices', auth, invoiceController.getInvoices);
router.post('/invoices', auth, invoiceController.createInvoice);
router.get('/invoices/:id', auth, invoiceController.getInvoiceDetails);
router.delete('/invoices/:id', auth, invoiceController.deleteInvoice);

// ==========================================
// RAZORPAY PAYMENT ROUTES
// ==========================================
router.post('/payments/order', auth, paymentController.createOrder);
router.post('/payments/verify', auth, paymentController.verifyPayment);

// ==========================================
// ADMIN CONTROL ROUTES
// ==========================================
router.get('/admin/analytics', auth, adminOnly, adminController.getAnalytics);
router.get('/admin/users', auth, adminOnly, adminController.getUsers);
router.put('/admin/users/:id/block', auth, adminOnly, adminController.toggleUserBlock);
router.put('/admin/users/:id/plan', auth, adminOnly, adminController.updateUserPlan);
router.post('/admin/backup', auth, adminOnly, adminController.backupDatabase);
router.post('/admin/restore', auth, adminOnly, adminController.restoreDatabase);

module.exports = router;
