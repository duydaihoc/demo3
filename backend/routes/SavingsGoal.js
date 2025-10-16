const express = require('express');
const router = express.Router();
const SavingsGoal = require('../models/SavingsGoal');
const Wallet = require('../models/Wallet');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// lightweight JWT payload parser (no verification) to extract user id if token provided
function parseJwt(token) {
  try {
    const payload = token.split('.')[1];
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(b64, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch (err) {
    return {};
  }
}

// Middleware to extract user id from Authorization header if present
function getUserIdFromHeader(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const p = parseJwt(token);
  return p && (p.id || p._id || p.sub) ? (p.id || p._id || p.sub) : null;
}

// GET /api/savings - list goals for authenticated user
router.get('/', async (req, res) => {
  try {
    const userId = getUserIdFromHeader(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });

    const goals = await SavingsGoal.find({ owner: userId })
      .populate('walletId', 'name currency balance')
      .sort({ createdAt: -1 })
      .lean();

    // Tính toán status cho mỗi mục tiêu
    const now = new Date();
    const goalsWithStatus = goals.map(goal => {
      let status = goal.status || 'active';
      let notification = null;

      // Nếu đã hoàn thành hoặc quá hạn, cập nhật status
      if (goal.currentAmount >= goal.targetAmount) {
        status = 'completed';
        notification = {
          type: 'completed',
          message: 'Mục tiêu đã đạt được số tiền yêu cầu!',
          action: 'report'
        };
      } else if (goal.targetDate && new Date(goal.targetDate) < now) {
        status = 'overdue';
        notification = {
          type: 'overdue',
          message: 'Mục tiêu đã đến ngày hạn!',
          action: 'report'
        };
      }

      return {
        ...goal,
        status,
        notification
      };
    });

    res.json(goalsWithStatus);
  } catch (err) {
    console.error('Error fetching goals:', err);
    res.status(500).json({
      message: 'Lỗi khi tải danh sách mục tiêu',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// POST /api/savings - create a new savings goal (no transactions)
router.post('/', async (req, res) => {
  try {
    const authOwner = getUserIdFromHeader(req);
    if (!authOwner) return res.status(401).json({ message: 'Chưa đăng nhập' });

    const { name, targetAmount, targetDate, color } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ message: 'Tên mục tiêu không được để trống' });
    const amount = Number(targetAmount);
    if (isNaN(amount) || amount <= 0) return res.status(400).json({ message: 'Số tiền mục tiêu phải lớn hơn 0' });
    if (!targetDate || isNaN(new Date(targetDate).getTime())) return res.status(400).json({ message: 'Ngày đạt mục tiêu không hợp lệ' });

    const newGoal = new SavingsGoal({
      name: name.trim(),
      targetAmount: amount,
      currentAmount: 0,
      startDate: new Date(),
      targetDate: new Date(targetDate),
      owner: authOwner,
      color: color || '#4CAF50',
      contributions: []
    });

    const saved = await newGoal.save();
    const populated = await SavingsGoal.findById(saved._id).populate('walletId', 'name currency').lean();
    res.status(201).json(populated);
  } catch (err) {
    console.error('Error creating goal:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        message: 'Dữ liệu không hợp lệ',
        errors: Object.values(err.errors).map(e => e.message)
      });
    }
    res.status(500).json({
      message: 'Có lỗi xảy ra khi tạo mục tiêu',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// GET /api/savings/:id - get a single goal (owner only)
router.get('/:id', async (req, res) => {
  try {
    const userId = getUserIdFromHeader(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });

    const goal = await SavingsGoal.findOne({ _id: req.params.id, owner: userId })
      .populate('walletId', 'name currency balance')
      .lean();

    if (!goal) return res.status(404).json({ message: 'Không tìm thấy mục tiêu' });
    res.json(goal);
  } catch (err) {
    console.error('Error fetching goal:', err);
    res.status(500).json({
      message: 'Lỗi khi tải thông tin mục tiêu',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// POST /api/savings/:id/deposit - deposit into a goal from a wallet (non-transactional)
router.post('/:id/deposit', async (req, res) => {
  try {
    const userId = getUserIdFromHeader(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });

    const { amount, walletId, note } = req.body;
    const goalId = req.params.id;

    if (!walletId) return res.status(400).json({ message: 'Vui lòng chọn ví' });
    const depositAmount = Number(amount);
    if (isNaN(depositAmount) || depositAmount <= 0) return res.status(400).json({ message: 'Số tiền không hợp lệ' });

    const goal = await SavingsGoal.findById(goalId);
    if (!goal) return res.status(404).json({ message: 'Mục tiêu không tồn tại' });
    if (String(goal.owner) !== String(userId)) return res.status(403).json({ message: 'Không có quyền thực hiện thao tác này' });

    const wallet = await Wallet.findById(walletId);
    if (!wallet) return res.status(404).json({ message: 'Ví không tồn tại' });
    if (String(wallet.owner) !== String(userId)) return res.status(403).json({ message: 'Bạn không sở hữu ví này' });

    // Check if wallet has initialBalance field but no balance field
    // This handles wallets created before balance field was added
    if (wallet.initialBalance !== undefined && wallet.balance === undefined) {
      wallet.balance = wallet.initialBalance;
    }

    // Get the effective balance, prioritizing balance field if it exists
    const walletBalance = typeof wallet.balance === 'number' ? wallet.balance : (wallet.initialBalance || 0);
    
    if (walletBalance < depositAmount) {
      return res.status(400).json({
        message: 'Số dư trong ví không đủ',
        currentBalance: walletBalance,
        requiredAmount: depositAmount
      });
    }

    // Update both initialBalance and balance to ensure compatibility with all app parts
    wallet.balance = walletBalance - depositAmount;
    wallet.initialBalance = walletBalance - depositAmount;
    
    // Create a transaction record in wallet's transactions array if it exists
    if (Array.isArray(wallet.transactions)) {
      wallet.transactions.push({
        type: 'expense',
        amount: depositAmount,
        date: new Date(),
        category: 'savings', // You might want a special category for this
        description: note || `Nạp tiền vào mục tiêu: ${goal.name}`
      });
    }
    
    await wallet.save();

    goal.currentAmount = (goal.currentAmount || 0) + depositAmount;
    goal.contributions.push({
      amount: depositAmount,
      date: new Date(),
      walletId: wallet._id,
      note: note || `Nạp tiền vào mục tiêu ${goal.name}`
    });
    if (!goal.walletId) goal.walletId = wallet._id;
    await goal.save();

    // Notify any event listeners about the wallet update
    try {
      const io = req.app.get('socketio');
      if (io) {
        io.emit('wallet-updated', {
          walletId: wallet._id,
          newBalance: wallet.balance
        });
      }
    } catch (socketErr) {
      console.error('Socket notification error:', socketErr);
    }

    const updatedGoal = await SavingsGoal.findById(goalId).populate('walletId', 'name currency balance').lean();

    res.status(200).json({
      message: 'Nạp tiền thành công',
      goal: updatedGoal,
      wallet: {
        _id: wallet._id,
        name: wallet.name,
        balance: wallet.balance,
        initialBalance: wallet.initialBalance
      }
    });
  } catch (err) {
    console.error('Deposit error:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        message: 'Dữ liệu không hợp lệ',
        errors: Object.values(err.errors).map(e => e.message)
      });
    }
    res.status(500).json({
      message: 'Có lỗi xảy ra khi nạp tiền',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// DELETE /api/savings/:id - delete a goal (non-transactional)
router.delete('/:id', async (req, res) => {
  try {
    const userId = getUserIdFromHeader(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });

    const goal = await SavingsGoal.findOne({ _id: req.params.id, owner: userId });
    if (!goal) return res.status(404).json({ message: 'Không tìm thấy mục tiêu' });

    // Track how much money is returned to each wallet
    const walletReturns = {};
    const returnSummary = [];
    
    // Process all contributions to return money to original wallets
    if (Array.isArray(goal.contributions) && goal.contributions.length > 0) {
      for (const contribution of goal.contributions) {
        if (contribution.walletId && contribution.amount) {
          const walletId = String(contribution.walletId);
          const amount = Number(contribution.amount) || 0;
          
          // Add to wallet tracking
          if (!walletReturns[walletId]) {
            walletReturns[walletId] = 0;
          }
          walletReturns[walletId] += amount;
        }
      }
      
      // Now update all wallets with their returns
      for (const [walletId, amount] of Object.entries(walletReturns)) {
        try {
          const wallet = await Wallet.findById(walletId);
          if (wallet && amount > 0) {
            // Add the money back to the wallet
            wallet.balance = (wallet.balance || 0) + amount;
            wallet.initialBalance = (wallet.initialBalance || 0) + amount;
            
            // Create a transaction record if applicable
            if (Array.isArray(wallet.transactions)) {
              wallet.transactions.push({
                type: 'income',
                amount,
                date: new Date(),
                category: 'savings_return',
                description: `Hoàn tiền từ mục tiêu đã xóa: ${goal.name}`
              });
            }
            
            await wallet.save();
            
            // Add to summary for response
            returnSummary.push({
              walletId,
              walletName: wallet.name || 'Unknown',
              amount
            });
          }
        } catch (walletErr) {
          console.error(`Error returning funds to wallet ${walletId}:`, walletErr);
          // Continue with other wallets even if one fails
        }
      }
    } 
    // For backward compatibility: if no contributions but there's a walletId and currentAmount
    else if (goal.walletId && goal.currentAmount > 0) {
      try {
        const wallet = await Wallet.findById(goal.walletId);
        if (wallet) {
          wallet.balance = (wallet.balance || 0) + goal.currentAmount;
          wallet.initialBalance = (wallet.initialBalance || 0) + goal.currentAmount;
          
          if (Array.isArray(wallet.transactions)) {
            wallet.transactions.push({
              type: 'income',
              amount: goal.currentAmount,
              date: new Date(),
              category: 'savings_return',
              description: `Hoàn tiền từ mục tiêu đã xóa: ${goal.name}`
            });
          }
          
          await wallet.save();
          
          returnSummary.push({
            walletId: String(goal.walletId),
            walletName: wallet.name || 'Unknown',
            amount: goal.currentAmount
          });
        }
      } catch (err) {
        console.error('Error returning funds to wallet:', err);
      }
    }
    
    // Delete the goal after returning all money
    await SavingsGoal.deleteOne({ _id: goal._id });

    res.json({
      message: 'Đã xóa mục tiêu thành công',
      returnedAmount: goal.currentAmount,
      walletReturns: returnSummary
    });
  } catch (err) {
    console.error('Error deleting goal:', err);
    res.status(500).json({
      message: 'Lỗi khi xóa mục tiêu',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// PUT /api/savings/:id - update goal (owner only)
router.put('/:id', async (req, res) => {
  try {
    const userId = getUserIdFromHeader(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });

    const { name, targetAmount, targetDate, color } = req.body;
    const updates = {};
    if (typeof name !== 'undefined') updates.name = String(name).trim();
    if (typeof targetAmount !== 'undefined') {
      const amt = Number(targetAmount);
      if (isNaN(amt) || amt <= 0) return res.status(400).json({ message: 'Số tiền mục tiêu không hợp lệ' });
      updates.targetAmount = amt;
    }
    if (typeof targetDate !== 'undefined') {
      if (!targetDate || isNaN(new Date(targetDate).getTime())) return res.status(400).json({ message: 'Ngày đạt mục tiêu không hợp lệ' });
      updates.targetDate = new Date(targetDate);
    }
    if (typeof color !== 'undefined') updates.color = color;

    const goal = await SavingsGoal.findById(req.params.id);
    if (!goal) return res.status(404).json({ message: 'Mục tiêu không tồn tại' });
    if (String(goal.owner) !== String(userId)) return res.status(403).json({ message: 'Không có quyền cập nhật mục tiêu này' });

    // apply updates
    Object.assign(goal, updates);
    const saved = await goal.save();
    const populated = await SavingsGoal.findById(saved._id).populate('walletId', 'name currency balance').lean();
    res.json(populated);
  } catch (err) {
    console.error('Update goal error:', err);
    res.status(500).json({
      message: 'Lỗi khi cập nhật mục tiêu',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// PUT /api/savings/:id/report - báo cáo hoàn thành mục tiêu
router.put('/:id/report', async (req, res) => {
  try {
    const userId = getUserIdFromHeader(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });

    const goal = await SavingsGoal.findOne({ _id: req.params.id, owner: userId });
    if (!goal) return res.status(404).json({ message: 'Mục tiêu không tồn tại' });

    // Cập nhật status thành completed
    goal.status = 'completed';
    goal.completedAt = new Date();
    await goal.save();

    const populated = await SavingsGoal.findById(goal._id).populate('walletId', 'name currency balance').lean();
    res.json({
      message: 'Đã báo cáo hoàn thành mục tiêu',
      goal: populated
    });
  } catch (err) {
    console.error('Error reporting goal:', err);
    res.status(500).json({
      message: 'Lỗi khi báo cáo mục tiêu',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// GET /api/savings/:id/report-pdf - Xuất PDF báo cáo hoàn thành mục tiêu
router.get('/:id/report-pdf', async (req, res) => {
  try {
    const userId = getUserIdFromHeader(req);
    if (!userId) return res.status(401).json({ message: 'Chưa đăng nhập' });

    const goal = await SavingsGoal.findOne({ _id: req.params.id, owner: userId })
      .populate('walletId', 'name')
      .populate('contributions.walletId', 'name');

    if (!goal) return res.status(404).json({ message: 'Mục tiêu không tồn tại' });

    // Tạo PDF document với font mặc định (Helvetica) - font chuẩn mà mọi PDF reader đều hỗ trợ
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50
    });

    // Không set font tùy chỉnh, dùng font mặc định Helvetica
    // Lưu ý: Font mặc định không hỗ trợ tiếng Việt tốt, text có thể hiển thị sai
    // Để hỗ trợ tiếng Việt, cần cài font Unicode như DejaVu Sans vào thư mục fonts/

    // Tạo tên file an toàn (loại bỏ dấu và ký tự đặc biệt)
    const safeName = goal.name
      .normalize('NFD') // Tách dấu ra khỏi ký tự
      .replace(/[\u0300-\u036f]/g, '') // Loại bỏ dấu
      .replace(/[^a-zA-Z0-9\s-]/g, '') // Loại bỏ ký tự đặc biệt
      .replace(/\s+/g, '-') // Thay khoảng trắng bằng dấu gạch ngang
      .toLowerCase();
    
    const filename = `bao-cao-muc-tieu-${safeName}.pdf`;
    
    // Set headers cho response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');

    // Pipe PDF vào response
    doc.pipe(res);

    // Header
    doc.fontSize(24).fillColor('#2a5298')
       .text('BAO CAO HOAN THANH MUC TIEU TIET KIEM', { align: 'center' });
    
    doc.moveDown(2);

    // Thông tin mục tiêu
    doc.fontSize(16).fillColor('#000')
       .text('Thong tin muc tieu:', { underline: true });
    doc.moveDown(0.5);
    
    doc.fontSize(12).fillColor('#333');
    // Loại bỏ dấu khỏi tên mục tiêu và dùng format tiền đơn giản
    const goalNameNoAccent = goal.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    doc.text(`Ten muc tieu: ${goalNameNoAccent}`);
    doc.text(`Muc tieu so tien: ${goal.targetAmount.toLocaleString('vi-VN')} VND`);
    doc.text(`So tien hien tai: ${goal.currentAmount.toLocaleString('vi-VN')} VND`);
    doc.text(`Ngay bat dau: ${new Date(goal.startDate).toLocaleDateString('vi-VN')}`);
    doc.text(`Ngay ket thuc: ${goal.targetDate ? new Date(goal.targetDate).toLocaleDateString('vi-VN') : 'Chua dat'}`);
    doc.text(`Ngay hoan thanh: ${goal.completedAt ? new Date(goal.completedAt).toLocaleDateString('vi-VN') : 'Chua hoan thanh'}`);
    doc.text(`Trang thai: ${goal.status === 'completed' ? 'Da hoan thanh' : goal.status === 'overdue' ? 'Qua han' : 'Dang thuc hien'}`);
    
    if (goal.walletId) {
      doc.text(`Vi chinh: ${goal.walletId.name}`);
    }

    doc.moveDown(2);

    // Thống kê đóng góp
    doc.fontSize(16).fillColor('#000')
       .text('Thong ke dong gop:', { underline: true });
    doc.moveDown(0.5);

    if (goal.contributions && goal.contributions.length > 0) {
      const totalContributions = goal.contributions.length;
      const totalAmount = goal.contributions.reduce((sum, c) => sum + (c.amount || 0), 0);
      const avgContribution = totalAmount / totalContributions;

      doc.fontSize(12).fillColor('#333');
      doc.text(`Tong so lan dong gop: ${totalContributions}`);
      doc.text(`Tong so tien dong gop: ${totalAmount.toLocaleString('vi-VN')} VND`);
      doc.text(`So tien trung binh moi lan: ${avgContribution.toLocaleString('vi-VN')} VND`);
      
      doc.moveDown(1);

      // Bảng chi tiết đóng góp
      doc.fontSize(14).fillColor('#000')
         .text('Chi tiet cac lan dong gop:', { underline: true });
      doc.moveDown(0.5);

      // Header bảng
      const tableTop = doc.y;
      doc.fontSize(10);
      doc.text('Ngay', 50, tableTop);
      doc.text('So tien', 150, tableTop);
      doc.text('Vi', 250, tableTop);
      doc.text('Ghi chu', 350, tableTop);
      
      // Dòng kẻ
      doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();
      
      // Dữ liệu bảng
      let yPosition = tableTop + 25;
      doc.fontSize(9);
      
      goal.contributions.forEach((contribution, index) => {
        if (yPosition > 700) { // Nếu gần cuối trang, xuống dòng
          doc.addPage();
          yPosition = 50;
        }
        
        const date = new Date(contribution.date).toLocaleDateString('vi-VN');
        const amount = `${contribution.amount.toLocaleString('vi-VN')} VND`;
        const wallet = contribution.walletId ? contribution.walletId.name : 'N/A';
        const note = contribution.note || '';
        
        doc.text(date, 50, yPosition);
        doc.text(amount, 150, yPosition);
        doc.text(wallet, 250, yPosition);
        doc.text(note, 350, yPosition, { width: 150 });
        
        yPosition += 20;
      });
    } else {
      doc.fontSize(12).fillColor('#666')
         .text('Chua co dong gop nao.');
    }

    doc.moveDown(2);

    // Footer
    doc.fontSize(10).fillColor('#666')
       .text(`Bao cao duoc tao vao: ${new Date().toLocaleString('vi-VN')}`, { align: 'center' });
    doc.text('Ung dung Quan ly Tai chinh Ca nhan', { align: 'center' });

    // Kết thúc PDF
    doc.end();

  } catch (err) {
    console.error('Error generating PDF:', err);
    res.status(500).json({ message: 'Loi khi tao bao cao PDF' });
  }
});

module.exports = router;
