const mongoose = require('mongoose');

const CustomerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    default: ''
  },
  address: {
    type: String,
    trim: true,
    default: ''
  },
  city: {
    type: String,
    trim: true,
    default: ''
  },
  state: {
    type: String,
    trim: true,
    default: ''
  },
  country: {
    type: String,
    trim: true,
    default: ''
  },
  pincode: {
    type: String,
    trim: true,
    default: ''
  },
  notes: {
    type: String,
    trim: true,
    default: ''
  },
  totalBalance: {
    type: Number,
    default: 0 // positive: customer owes merchant (Udhaar), negative: merchant owes customer (Advance)
  }
}, {
  timestamps: true
});

// Index to search customers quickly by user and name/phone
CustomerSchema.index({ userId: 1, name: 'text', phone: 'text' });

module.exports = mongoose.model('Customer', CustomerSchema);
