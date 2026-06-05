const Razorpay = require('razorpay');
const crypto = require('crypto');
const User = require('../models/User');
const Subscription = require('../models/Subscription');

// Initialize Razorpay client with fallback check
let razorpay;
const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_MockKey123';
const keySecret = process.env.RAZORPAY_KEY_SECRET || 'MockSecretKey456';

const isMock = keyId.startsWith('rzp_test_MockKey') || !keyId;

if (!isMock) {
  try {
    razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret
    });
    console.log('Razorpay Gateway Initialized (Live/Test Mode)');
  } catch (error) {
    console.error('Failed to initialize Razorpay, running in Mock Payment Mode:', error.message);
    razorpay = null;
  }
} else {
  console.log('Razorpay running in Mock/Simulated Payment Mode');
}

// Create order for premium subscription
exports.createOrder = async (req, res) => {
  try {
    const { amount } = req.body; // Amount in INR (e.g. 499)
    if (!amount) {
      return res.status(400).json({ message: 'Amount is required' });
    }

    const amountInPaise = Math.round(amount * 100);

    if (razorpay && !isMock) {
      // Live/Sandbox Razorpay integration
      const options = {
        amount: amountInPaise,
        currency: 'INR',
        receipt: `receipt_sub_${req.user.id}_${Date.now()}`
      };

      const order = await razorpay.orders.create(options);
      return res.json({
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        mock: false
      });
    } else {
      // Mock order generation for local development
      const mockOrderId = `order_mock_${Math.random().toString(36).substring(2, 12)}`;
      console.log(`[PAYMENT SIMULATOR] Generated Mock Order: ${mockOrderId} for amount: ₹${amount}`);
      
      return res.json({
        id: mockOrderId,
        amount: amountInPaise,
        currency: 'INR',
        mock: true
      });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error generating subscription order', error: error.message });
  }
};

// Verify payment and upgrade user account
exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;

    if (!razorpay_order_id || !amount) {
      return res.status(400).json({ message: 'Missing order verification parameters' });
    }

    let isValid = false;

    if (razorpay && !isMock && !razorpay_order_id.startsWith('order_mock_')) {
      // Verify signature using HmacSHA256
      const body = razorpay_order_id + '|' + razorpay_payment_id;
      const expectedSignature = crypto
        .createHmac('sha256', keySecret)
        .update(body.toString())
        .digest('hex');

      isValid = expectedSignature === razorpay_signature;
    } else {
      // Mock validation logic always validates successfully for development ease
      isValid = true;
      console.log(`[PAYMENT SIMULATOR] Validating Mock Order payment for order ID: ${razorpay_order_id}`);
    }

    if (!isValid) {
      return res.status(400).json({ message: 'Payment verification failed' });
    }

    // Payment is valid! Upgrade merchant status to premium
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'Merchant not found' });
    }

    const expiryDays = 30; // standard 30 day premium duration
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    user.subscription = {
      plan: 'premium',
      status: 'active',
      expiresAt: expiresAt,
      razorpaySubscriptionId: razorpay_payment_id || 'mock_pay_id_1234'
    };

    await user.save();

    // Log the transaction history
    await Subscription.create({
      userId: req.user.id,
      plan: 'premium',
      amount: parseFloat(amount),
      status: 'active',
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id || 'mock_pay_id_1234',
      razorpaySignature: razorpay_signature || 'mock_sig_1234',
      expiresAt
    });

    res.json({
      message: 'Payment verified and account upgraded to Premium successfully!',
      user: {
        id: user._id,
        businessName: user.businessName,
        ownerName: user.ownerName,
        phone: user.phone,
        email: user.email,
        role: user.role,
        language: user.language,
        subscription: user.subscription
      }
    });

  } catch (error) {
    res.status(500).json({ message: 'Error verifying payment details', error: error.message });
  }
};
