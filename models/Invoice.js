const mongoose = require('mongoose');

const InvoiceItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  rate: {
    type: Number,
    required: true,
    min: 0
  },
  taxRate: {
    type: Number, // GST percentage e.g., 0, 5, 12, 18, 28
    default: 0
  },
  amount: {
    type: Number,
    required: true
  }
});

const InvoiceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  invoiceNumber: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  customerName: {
    type: String,
    required: true,
    trim: true
  },
  customerPhone: {
    type: String,
    trim: true,
    default: ''
  },
  customerGSTIN: {
    type: String,
    trim: true,
    default: ''
  },
  businessGSTIN: {
    type: String,
    trim: true,
    default: ''
  },
  businessAddress: {
    type: String,
    trim: true,
    default: ''
  },
  items: [InvoiceItemSchema],
  subTotal: {
    type: Number,
    required: true
  },
  cgst: {
    type: Number,
    default: 0
  },
  sgst: {
    type: Number,
    default: 0
  },
  igst: {
    type: Number,
    default: 0
  },
  discount: {
    type: Number,
    default: 0
  },
  totalAmount: {
    type: Number,
    required: true
  },
  notes: {
    type: String,
    trim: true,
    default: ''
  }
}, {
  timestamps: true
});

// Compound index to ensure uniqueness of invoice number per merchant
InvoiceSchema.index({ userId: 1, invoiceNumber: 1 }, { unique: true });

module.exports = mongoose.model('Invoice', InvoiceSchema);
