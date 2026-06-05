const Invoice = require('../models/Invoice');

// Get all invoices for a user
exports.getInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find({ userId: req.user.id }).sort({ date: -1 });
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching invoices', error: error.message });
  }
};

// Create a new GST invoice
exports.createInvoice = async (req, res) => {
  try {
    const {
      customerName,
      customerPhone,
      customerGSTIN,
      businessGSTIN,
      businessAddress,
      items,
      discount,
      notes
    } = req.body;

    if (!customerName || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Customer name and at least one item are required' });
    }

    // Auto-increment invoice number per merchant
    const lastInvoice = await Invoice.findOne({ userId: req.user.id }).sort({ createdAt: -1 });
    let nextNum = 1;
    if (lastInvoice && lastInvoice.invoiceNumber) {
      const match = lastInvoice.invoiceNumber.match(/(\d+)$/);
      if (match) {
        nextNum = parseInt(match[1]) + 1;
      }
    }
    const invoiceNumber = `INV-${String(nextNum).padStart(4, '0')}`;

    // Perform calculations
    let subTotal = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    const formattedItems = items.map(item => {
      const qty = parseFloat(item.quantity) || 1;
      const rate = parseFloat(item.rate) || 0;
      const taxRate = parseFloat(item.taxRate) || 0; // GST percentage e.g., 18
      const amount = qty * rate;
      subTotal += amount;

      // Tax calculation
      const taxVal = amount * (taxRate / 100);
      
      // Let's assume standard CGST + SGST (intra-state transaction)
      // For simplicity, we split standard GST into 50% CGST and 50% SGST
      cgst += taxVal / 2;
      sgst += taxVal / 2;

      return {
        name: item.name,
        quantity: qty,
        rate,
        taxRate,
        amount
      };
    });

    const disc = parseFloat(discount) || 0;
    const totalAmount = subTotal + cgst + sgst + igst - disc;

    const invoice = await Invoice.create({
      userId: req.user.id,
      invoiceNumber,
      customerName,
      customerPhone: customerPhone || '',
      customerGSTIN: customerGSTIN || '',
      businessGSTIN: businessGSTIN || '',
      businessAddress: businessAddress || '',
      items: formattedItems,
      subTotal: parseFloat(subTotal.toFixed(2)),
      cgst: parseFloat(cgst.toFixed(2)),
      sgst: parseFloat(sgst.toFixed(2)),
      igst: parseFloat(igst.toFixed(2)),
      discount: parseFloat(disc.toFixed(2)),
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      notes: notes || ''
    });

    res.status(201).json(invoice);
  } catch (error) {
    res.status(500).json({ message: 'Error creating invoice', error: error.message });
  }
};

// Delete an invoice record
exports.deleteInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting invoice', error: error.message });
  }
};

// Get single invoice details
exports.getInvoiceDetails = async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, userId: req.user.id });
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching invoice details', error: error.message });
  }
};
