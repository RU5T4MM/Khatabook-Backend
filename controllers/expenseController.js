const Expense = require('../models/Expense');

// Get all expenses for a user (with date filters)
exports.getExpenses = async (req, res) => {
  try {
    const { startDate, endDate, category } = req.query;
    const query = { userId: req.user.id };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    if (category) {
      query.category = category;
    }

    const expenses = await Expense.find(query).sort({ date: -1 });
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching expenses', error: error.message });
  }
};

// Add a new expense
exports.addExpense = async (req, res) => {
  try {
    const { amount, category, description, date, paymentMode } = req.body;
    if (!amount || !category) {
      return res.status(400).json({ message: 'Amount and category are required fields' });
    }

    const expense = await Expense.create({
      userId: req.user.id,
      amount: parseFloat(amount),
      category,
      description: description || '',
      paymentMode: paymentMode || 'cash',
      date: date ? new Date(date) : new Date()
    });

    res.status(201).json(expense);
  } catch (error) {
    res.status(500).json({ message: 'Error adding expense', error: error.message });
  }
};

// Delete an expense
exports.deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!expense) {
      return res.status(404).json({ message: 'Expense record not found' });
    }
    res.json({ message: 'Expense record deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting expense', error: error.message });
  }
};

// Get monthly expense summary (grouped by category)
exports.getExpenseSummary = async (req, res) => {
  try {
    const userId = req.user.id;
    const stats = await Expense.aggregate([
      { $match: { userId: new require('mongoose').Types.ObjectId(userId) } },
      {
        $group: {
          _id: '$category',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);

    // Format for response
    const formattedStats = stats.map(item => ({
      category: item._id,
      totalAmount: item.totalAmount,
      count: item.count
    }));

    res.json(formattedStats);
  } catch (error) {
    res.status(500).json({ message: 'Error generating expense summary', error: error.message });
  }
};
