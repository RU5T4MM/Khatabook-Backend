const Customer = require('../models/Customer');
const Transaction = require('../models/Transaction');
const fs = require('fs');
const path = require('path');

// --- Customer Controllers ---

// Get all customers for the authenticated merchant
exports.getCustomers = async (req, res) => {
  try {
    const customers = await Customer.find({ userId: req.user.id }).sort({ name: 1 });
    res.json(customers);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching customers', error: error.message });
  }
};

// Add a new customer
exports.addCustomer = async (req, res) => {
  try {
    const { name, phone, email, address, city, state, country, pincode, notes } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ message: 'Customer name and phone number are required' });
    }

    const customer = await Customer.create({
      userId: req.user.id,
      name,
      phone,
      email: email || '',
      address: address || '',
      city: city || '',
      state: state || '',
      country: country || '',
      pincode: pincode || '',
      notes: notes || '',
      totalBalance: 0
    });

    res.status(201).json(customer);
  } catch (error) {
    res.status(500).json({ message: 'Error adding customer', error: error.message });
  }
};

// Edit customer details
exports.updateCustomer = async (req, res) => {
  try {
    const { name, phone, email, address, city, state, country, pincode, notes } = req.body;
    const customer = await Customer.findOne({ _id: req.params.id, userId: req.user.id });
    
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    if (name) customer.name = name;
    if (phone) customer.phone = phone;
    if (email !== undefined) customer.email = email;
    if (address !== undefined) customer.address = address;
    if (city !== undefined) customer.city = city;
    if (state !== undefined) customer.state = state;
    if (country !== undefined) customer.country = country;
    if (pincode !== undefined) customer.pincode = pincode;
    if (notes !== undefined) customer.notes = notes;

    await customer.save();
    res.json(customer);
  } catch (error) {
    res.status(500).json({ message: 'Error updating customer', error: error.message });
  }
};

// Delete customer (and all related transactions)
exports.deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, userId: req.user.id });
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Delete transactions
    await Transaction.deleteMany({ customerId: customer._id });
    
    // Delete customer
    await Customer.deleteOne({ _id: customer._id });

    res.json({ message: 'Customer and all ledger history deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting customer', error: error.message });
  }
};

// --- Transaction / Ledger Controllers ---

// Get transaction history for a customer
exports.getTransactionsByCustomer = async (req, res) => {
  try {
    const transactions = await Transaction.find({
      customerId: req.params.customerId,
      userId: req.user.id
    }).sort({ date: -1 });

    res.json(transactions);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching ledger entries', error: error.message });
  }
};

// Add a credit or debit entry
exports.addTransaction = async (req, res) => {
  try {
    const { customerId, type, amount, description, date } = req.body;
    if (!customerId || !type || !amount) {
      return res.status(400).json({ message: 'Customer ID, transaction type (give/got), and amount are required' });
    }

    // Validate customer belongs to user
    const customer = await Customer.findOne({ _id: customerId, userId: req.user.id });
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Handle receipt file upload if present
    let billImage = '';
    if (req.file) {
      billImage = `/uploads/${req.file.filename}`;
    }

    // Create transaction
    const transaction = await Transaction.create({
      customerId,
      userId: req.user.id,
      type,
      amount: parseFloat(amount),
      description: description || '',
      billImage,
      date: date ? new Date(date) : new Date()
    });

    // Update customer balance:
    // give: customer owes merchant (balance increases)
    // got: customer paid merchant (balance decreases)
    const factor = type === 'give' ? 1 : -1;
    customer.totalBalance += factor * parseFloat(amount);
    await customer.save();

    res.status(201).json({ transaction, customerBalance: customer.totalBalance });
  } catch (error) {
    res.status(500).json({ message: 'Error creating transaction', error: error.message });
  }
};

// Delete a transaction (reverse customer balance)
exports.deleteTransaction = async (req, res) => {
  try {
    const transaction = await Transaction.findOne({ _id: req.params.id, userId: req.user.id });
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction entry not found' });
    }

    const customer = await Customer.findOne({ _id: transaction.customerId, userId: req.user.id });
    if (customer) {
      // Reverse transaction effect on customer balance
      // If we deleted a 'give', subtract it. If we deleted a 'got', add it back.
      const factor = transaction.type === 'give' ? -1 : 1;
      customer.totalBalance += factor * transaction.amount;
      await customer.save();
    }

    // Delete image file if it exists
    if (transaction.billImage) {
      const filePath = path.join(__dirname, '..', transaction.billImage);
      fs.unlink(filePath, (err) => {
        if (err) console.error('Failed to delete transaction receipt file:', err.message);
      });
    }

    await Transaction.deleteOne({ _id: transaction._id });
    res.json({ message: 'Ledger entry deleted and customer balance adjusted', customerBalance: customer ? customer.totalBalance : 0 });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting transaction', error: error.message });
  }
};

// Edit transaction details (and recalculate customer balance)
exports.updateTransaction = async (req, res) => {
  try {
    const { amount, description, date, type } = req.body;
    const transaction = await Transaction.findOne({ _id: req.params.id, userId: req.user.id });
    
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction entry not found' });
    }

    const customer = await Customer.findOne({ _id: transaction.customerId, userId: req.user.id });
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // 1. Reverse the effect of the old transaction amount & type on the customer balance
    // If the old type was 'give', we subtract it. If it was 'got', we add it back.
    const oldFactor = transaction.type === 'give' ? -1 : 1;
    customer.totalBalance += oldFactor * transaction.amount;

    // 2. Handle receipt file upload if a new one is sent
    if (req.file) {
      // Delete old receipt image if it exists
      if (transaction.billImage) {
        const filePath = path.join(__dirname, '..', transaction.billImage);
        fs.unlink(filePath, (err) => {
          if (err) console.error('Failed to delete old transaction receipt file:', err.message);
        });
      }
      transaction.billImage = `/uploads/${req.file.filename}`;
    }

    // 3. Apply new values to transaction
    if (amount !== undefined) transaction.amount = parseFloat(amount);
    if (description !== undefined) transaction.description = description;
    if (date !== undefined) transaction.date = date ? new Date(date) : transaction.date;
    if (type !== undefined) transaction.type = type;

    await transaction.save();

    // 4. Apply the effect of the new transaction amount & type to the customer balance
    // If the new type is 'give', we add it. If it is 'got', we subtract it.
    const newFactor = transaction.type === 'give' ? 1 : -1;
    customer.totalBalance += newFactor * transaction.amount;
    await customer.save();

    res.json({ transaction, customerBalance: customer.totalBalance });
  } catch (error) {
    res.status(500).json({ message: 'Error updating transaction', error: error.message });
  }
};


// Sync multiple offline transactions
exports.syncTransactions = async (req, res) => {
  try {
    const { transactions } = req.body; // Array of transactions synced offline
    if (!Array.isArray(transactions)) {
      return res.status(400).json({ message: 'Invalid payload, expected array' });
    }

    const results = [];

    for (const tx of transactions) {
      // Find or create customer by phone (since local client created it offline)
      let customer;
      if (tx.customerPhone) {
        customer = await Customer.findOne({ phone: tx.customerPhone, userId: req.user.id });
        if (!customer) {
          customer = await Customer.create({
            userId: req.user.id,
            name: tx.customerName || 'Offline Customer',
            phone: tx.phone,
            totalBalance: 0
          });
        }
      } else if (tx.customerId) {
        customer = await Customer.findOne({ _id: tx.customerId, userId: req.user.id });
      }

      if (!customer) continue;

      // Check if transaction was already synced to avoid duplicates
      const exists = await Transaction.findOne({
        userId: req.user.id,
        customerId: customer._id,
        amount: tx.amount,
        type: tx.type,
        date: new Date(tx.date),
        description: tx.description
      });

      if (!exists) {
        const transaction = await Transaction.create({
          customerId: customer._id,
          userId: req.user.id,
          type: tx.type,
          amount: parseFloat(tx.amount),
          description: tx.description || '',
          date: tx.date ? new Date(tx.date) : new Date()
        });

        const factor = tx.type === 'give' ? 1 : -1;
        customer.totalBalance += factor * parseFloat(tx.amount);
        await customer.save();

        results.push(transaction);
      }
    }

    res.json({ message: 'Sync operations complete', itemsSynced: results.length });
  } catch (error) {
    res.status(500).json({ message: 'Error syncing ledger', error: error.message });
  }
};

// Get Dashboard Summary Analytics
exports.getDashboardSummary = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Total Customers Count
    const totalCustomers = await Customer.countDocuments({ userId });

    // 2. Total Credit and Debit Calculations
    const customers = await Customer.find({ userId });
    let totalCredit = 0; // You will get (positive totalBalance)
    let totalDebit = 0;  // You will give (negative totalBalance)
    
    customers.forEach(c => {
      if (c.totalBalance > 0) {
        totalCredit += c.totalBalance;
      } else if (c.totalBalance < 0) {
        totalDebit += Math.abs(c.totalBalance);
      }
    });

    const netBalance = totalCredit - totalDebit;

    // 3. Recent Customers (Last 5)
    const recentCustomers = await Customer.find({ userId })
      .sort({ createdAt: -1 })
      .limit(5);

    // 4. Recent Transactions (Last 5)
    const recentTransactions = await Transaction.find({ userId })
      .populate('customerId', 'name phone')
      .sort({ date: -1, createdAt: -1 })
      .limit(5);

    // 5. Chart Data (Last 7 days aggregated)
    const chartData = [];
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const oneDay = 24 * 60 * 60 * 1000;
    const now = new Date();

    // Fetch transactions in last 7 days
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - 6);

    const txs = await Transaction.find({
      userId,
      date: { $gte: startDate }
    });

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const dayName = daysOfWeek[d.getDay()];

      // Filter txs on this specific date
      const dayTxs = txs.filter(t => {
        const tDate = new Date(t.date);
        return tDate.toDateString() === d.toDateString();
      });

      let cashIn = 0;  // got (credit)
      let cashOut = 0; // give (debit)

      dayTxs.forEach(t => {
        if (t.type === 'got') {
          cashIn += t.amount;
        } else if (t.type === 'give') {
          cashOut += t.amount;
        }
      });

      chartData.push({
        name: dayName,
        CashIn: cashIn,
        CashOut: cashOut
      });
    }

    res.json({
      totalCustomers,
      totalCredit,
      totalDebit,
      netBalance,
      recentCustomers,
      recentTransactions,
      chartData
    });
  } catch (error) {
    res.status(500).json({ message: 'Error generating dashboard summary', error: error.message });
  }
};
