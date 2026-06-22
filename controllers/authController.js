const User = require('../models/User');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

// In-memory cache for OTP codes (phone -> { otp, expires })
const otpCache = new Map();

// Helper to generate JWT
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET || 'supersecretkhatabookkey123!@#',
    { expiresIn: '30d' }
  );
};

// Signup
exports.signup = async (req, res) => {
  try {
    const { businessName, ownerName, phone, email, password, role } = req.body;

    // Check if user exists
    const userExists = await User.findOne({ $or: [{ email }, { phone }] });
    if (userExists) {
      return res.status(400).json({ message: 'User with this email or phone already exists' });
    }

    // Auto-promote first user or admin@khatabook.com to admin
    let userRole = role || 'user';
    if (email.toLowerCase() === 'admin@khatabook.com') {
      userRole = 'admin';
    } else {
      const userCount = await User.countDocuments();
      if (userCount === 0) {
        userRole = 'admin';
      }
    }

    const user = await User.create({
      businessName,
      ownerName,
      phone,
      email,
      password,
      role: userRole
    });

    const token = generateToken(user);
    res.status(201).json({
      token,
      user: {
        id: user._id,
        businessName: user.businessName,
        ownerName: user.ownerName,
        phone: user.phone,
        email: user.email,
        address: user.address,
        role: user.role,
        language: user.language,
        subscription: user.subscription
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error during signup', error: error.message });
  }
};

// Email Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (user.isBlocked) {
      return res.status(403).json({ message: 'Your account is blocked. Contact administrator.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = generateToken(user);
    res.json({
      token,
      user: {
        id: user._id,
        businessName: user.businessName,
        ownerName: user.ownerName,
        phone: user.phone,
        email: user.email,
        address: user.address,
        role: user.role,
        language: user.language,
        subscription: user.subscription
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error during login', error: error.message });
  }
};

// Send OTP
exports.sendOtp = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ message: 'Phone number is required' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 5 * 60 * 1000; // 5 mins expiry

    otpCache.set(phone, { otp, expires });

    // Output to console for testing
    console.log(`\n========================================`);
    console.log(`[OTP SERVICE SIMULATOR]`);
    console.log(`SMS Sent to: ${phone}`);
    console.log(`Verification OTP Code: ${otp}`);
    console.log(`========================================\n`);

    res.json({ 
      message: 'OTP sent successfully (Simulated)', 
      otpCode: otp // Returning it in development so frontend can pre-fill or user can see it
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error sending OTP', error: error.message });
  }
};

// Verify OTP & Login/Register
exports.verifyOtp = async (req, res) => {
  try {
    const { phone, otp, businessName, ownerName, email } = req.body;
    
    if (!phone || !otp) {
      return res.status(400).json({ message: 'Phone and OTP are required' });
    }

    const cached = otpCache.get(phone);
    if (!cached) {
      return res.status(400).json({ message: 'OTP expired or not requested' });
    }

    if (Date.now() > cached.expires) {
      otpCache.delete(phone);
      return res.status(400).json({ message: 'OTP expired' });
    }

    if (cached.otp !== otp && otp !== '999999') { // 999999 is master override for testing
      return res.status(400).json({ message: 'Invalid OTP code' });
    }

    // OTP is valid, clear it
    otpCache.delete(phone);

    // Find if user already exists
    let user = await User.findOne({ phone });

    if (!user) {
      // If user does not exist, check if we got registration fields
      if (!businessName || !ownerName || !email) {
        return res.status(200).json({ 
          newUser: true, 
          message: 'Phone verified. Registration required.',
          phone
        });
      }

      // Check if email already taken
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return res.status(400).json({ message: 'User with this email already exists' });
      }

      // Create new user
      const userCount = await User.countDocuments();
      const role = (userCount === 0 || email.toLowerCase() === 'admin@khatabook.com') ? 'admin' : 'user';

      // Auto-generate random secure password for OTP accounts
      const randomPassword = Math.random().toString(36).slice(-10);

      user = await User.create({
        businessName,
        ownerName,
        phone,
        email,
        password: randomPassword,
        role
      });
    }

    if (user.isBlocked) {
      return res.status(403).json({ message: 'Your account is blocked. Contact administrator.' });
    }

    const token = generateToken(user);
    res.json({
      token,
      user: {
        id: user._id,
        businessName: user.businessName,
        ownerName: user.ownerName,
        phone: user.phone,
        email: user.email,
        address: user.address,
        role: user.role,
        language: user.language,
        subscription: user.subscription
      }
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error verifying OTP', error: error.message });
  }
};

// Forgot Password Request
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'No user registered with this email' });
    }

    // Check if email configuration is present in environment
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.error('EMAIL_USER or EMAIL_PASS environment variables are missing');
      return res.status(500).json({ 
        message: 'Email service configuration (EMAIL_USER and EMAIL_PASS) is missing on the server environment. Please configure them in your production hosting panel.' 
      });
    }

    // Generate random 6-digit reset token
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    user.resetPasswordToken = resetCode;
    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 mins expiry
    await user.save();

    // Send actual email using nodemailer with short timeouts to prevent infinite hanging
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      tls: {
        rejectUnauthorized: false // Bypasses SSL certificate mismatch checks in cloud environments
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });

    const mailOptions = {
      from: `"Nahid Group Ledger" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Password Reset Verification Code - Nahid Group Ledger',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #059669; text-align: center;">Nahid Group Ledger</h2>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p>Hello,</p>
          <p>We received a request to reset the password for your Nahid Group Ledger account.</p>
          <p>Please use the following 6-digit verification code to reset your password. This code will expire in 15 minutes.</p>
          <div style="text-align: center; margin: 30px 0;">
            <span style="font-size: 24px; font-weight: bold; letter-spacing: 4px; padding: 10px 20px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 4px; color: #15803d;">
              ${resetCode}
            </span>
          </div>
          <p>If you did not request a password reset, please ignore this email or contact support if you have concerns.</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="font-size: 12px; color: #64748b; text-align: center;">© 2026 Nahid Group Ledger. All rights reserved.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    console.log(`\n========================================`);
    console.log(`[PASSWORD RESET EMAIL SENT]`);
    console.log(`Email Sent to: ${email}`);
    console.log(`Temporary Reset Password Code: ${resetCode}`);
    console.log(`========================================\n`);

    res.json({ 
      message: 'Temporary reset password code has been sent to your email.'
    });
  } catch (error) {
    console.error('Nodemailer error details:', error);
    res.status(500).json({ 
      message: 'Failed to send reset email. Verify your server allows SMTP outbound traffic and SMTP variables are correct.',
      error: error.message 
    });
  }
};

// Reset Password Confirm
exports.resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ message: 'Email, code, and new password are required' });
    }

    const user = await User.findOne({ 
      email, 
      resetPasswordToken: code,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired password reset code' });
    }

    // Set new password (will be hashed by User pre-save hook)
    user.password = newPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.json({ message: 'Password has been reset successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error resetting password', error: error.message });
  }
};

// Profile details
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching profile', error: error.message });
  }
};

// Update profile & language
exports.updateProfile = async (req, res) => {
  try {
    const { businessName, ownerName, language, email, phone, address } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (businessName) user.businessName = businessName;
    if (ownerName) user.ownerName = ownerName;
    if (language) user.language = language;
    if (email) user.email = email;
    if (phone) user.phone = phone;
    if (address !== undefined) user.address = address;

    await user.save();

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        businessName: user.businessName,
        ownerName: user.ownerName,
        phone: user.phone,
        email: user.email,
        address: user.address,
        role: user.role,
        language: user.language,
        subscription: user.subscription
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error updating profile', error: error.message });
  }
};
