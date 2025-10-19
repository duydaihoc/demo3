import React, { useState, useEffect } from 'react';
import './AiAssistant.css';

export default function AiAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { 
      id: 1, 
      text: 'Xin chào! Tôi là trợ lý AI tài chính.\n\nBạn có thể:\n• Chat tự nhiên: "ăn tối 20k", "cafe 50k", "mua xăng 200k"\n• Xem thống kê: "thống kê", "xem ví"\n• Sửa/xóa: "sửa giao dịch...", "xóa giao dịch..."\n\nTôi sẽ tự động hiểu và tạo giao dịch cho bạn!', 
      sender: 'ai' 
    }
  ]);
  const [input, setInput] = useState('');
  const [wallets, setWallets] = useState([]);
  const [awaitingWalletSelection, setAwaitingWalletSelection] = useState(false);
  const [pendingTransactionTitle, setPendingTransactionTitle] = useState('');
  const [pendingTransactionAmount, setPendingTransactionAmount] = useState(null);
  const [awaitingEditInstruction, setAwaitingEditInstruction] = useState(false);
  const [pendingEditTransaction, setPendingEditTransaction] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [awaitingTransactionSelection, setAwaitingTransactionSelection] = useState(false);
  const [matchingTransactions, setMatchingTransactions] = useState([]);
  const [awaitingDeleteSelection, setAwaitingDeleteSelection] = useState(false);
  const [deleteMatchingTransactions, setDeleteMatchingTransactions] = useState([]);
  const [awaitingDeleteConfirmation, setAwaitingDeleteConfirmation] = useState(false);
  const [categories, setCategories] = useState([]);

  const API_BASE = 'http://localhost:5000';
  const token = localStorage.getItem('token');

  // Fetch wallets and transactions on mount
  useEffect(() => {
    if (token) {
      fetch(`${API_BASE}/api/wallets`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => setWallets(data || []))
        .catch(err => console.error('Fetch wallets error:', err));

      fetch(`${API_BASE}/api/transactions`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => setTransactions(data || []))
        .catch(err => console.error('Fetch transactions error:', err));
    }
  }, [token]);

  // Fetch categories on mount
  useEffect(() => {
    if (token) {
      fetch(`${API_BASE}/api/categories`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => setCategories(data || []))
        .catch(err => console.error('Fetch categories error:', err));
    }
  }, [token]);

  const toggleModal = () => setIsOpen(!isOpen);

  // Helper: trích xuất số tiền từ title (hỗ trợ k, nghìn, vnd, etc.)
  const extractAmount = (title) => {
    const lowerTitle = (title || '').toLowerCase();
    // Regex để tìm số tiền: số + đơn vị (k, nghìn, vnd, đ, etc.)
    const amountRegex = /(\d+(?:\.\d+)?)\s*(k|nghìn|vnd|đ|vnđ|usd|\$)/gi;
    const matches = [...lowerTitle.matchAll(amountRegex)];
    if (matches.length > 0) {
      const match = matches[0]; // Lấy match đầu tiên
      let amount = parseFloat(match[1]);
      const unit = match[2].toLowerCase();
      
      // Chuyển đổi đơn vị
      if (unit === 'k') amount *= 1000;
      else if (unit === 'nghìn') amount *= 1000;
      else if (unit === 'usd' || unit === '$') amount *= 23000; // Giả sử tỷ giá 23k VND/USD
      
      return Math.round(amount);
    }
    return null; // Không tìm thấy
  };

  const sendMessage = () => {
    if (!input.trim()) return;
    const userMessage = { id: Date.now(), text: input, sender: 'user' };
    setMessages(prev => [...prev, userMessage]);
    setInput('');

    const lowerInput = input.toLowerCase().trim();

    // Check if user wants to view wallets
    if (lowerInput === 'xem ví' || lowerInput === 'xem tất cả ví') {
      const walletList = wallets.map(w => `- ${w.name}: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(w.initialBalance || 0)}`).join('\n');
      setTimeout(() => {
        setMessages(prev => [...prev, { id: Date.now(), text: `Danh sách ví của bạn:\n${walletList}`, sender: 'ai' }]);
      }, 500);
      return;
    }

    // Check if user wants to view specific wallet
    if (lowerInput.startsWith('xem ví ')) {
      const walletName = input.substring(8).trim();
      const wallet = wallets.find(w => w.name.toLowerCase() === walletName.toLowerCase());
      if (!wallet) {
        setTimeout(() => {
          setMessages(prev => [...prev, { id: Date.now(), text: `Không tìm thấy ví "${walletName}". Vui lòng kiểm tra tên ví.`, sender: 'ai' }]);
        }, 500);
        return;
      }
      setTimeout(() => {
        setMessages(prev => [...prev, {
          id: Date.now(),
          text: `Chi tiết ví "${wallet.name}":\n- Số tiền hiện tại: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(wallet.initialBalance || 0)}\n- Tiền tệ: ${wallet.currency || 'VND'}\n- Mô tả: ${wallet.description || 'Không có'}`,
          sender: 'ai'
        }]);
      }, 500);
      return;
    }

    // Check if user wants transaction statistics
    if (lowerInput === 'thống kê giao dịch' || lowerInput === 'thống kê') {
      const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + (t.amount || 0), 0);
      const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + (t.amount || 0), 0);
      const netBalance = totalIncome - totalExpense;
      const totalTransactions = transactions.length;
      setTimeout(() => {
        setMessages(prev => [...prev, {
          id: Date.now(),
          text: `Thống kê giao dịch tổng quan:\n- Tổng thu nhập: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalIncome)}\n- Tổng chi tiêu: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalExpense)}\n- Số dư: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(netBalance)}\n- Tổng số giao dịch: ${totalTransactions}`,
          sender: 'ai'
        }]);
      }, 500);
      return;
    }

    // Check if user wants statistics by wallet
    if (lowerInput.startsWith('thống kê giao dịch theo ví ')) {
      const walletName = input.substring(26).trim();
      const wallet = wallets.find(w => w.name.toLowerCase() === walletName.toLowerCase());
      if (!wallet) {
        setTimeout(() => {
          setMessages(prev => [...prev, { id: Date.now(), text: `Không tìm thấy ví "${walletName}".`, sender: 'ai' }]);
        }, 500);
        return;
      }
      const walletTransactions = transactions.filter(t => t.wallet && t.wallet._id === wallet._id);
      const income = walletTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + (t.amount || 0), 0);
      const expense = walletTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + (t.amount || 0), 0);
      setTimeout(() => {
        setMessages(prev => [...prev, {
          id: Date.now(),
          text: `Thống kê giao dịch cho ví "${wallet.name}":\n- Thu nhập: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(income)}\n- Chi tiêu: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(expense)}\n- Số dư: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(income - expense)}\n- Số giao dịch: ${walletTransactions.length}`,
          sender: 'ai'
        }]);
      }, 500);
      return;
    }

    // Check if user wants statistics by category
    if (lowerInput.startsWith('thống kê giao dịch theo danh mục ')) {
      const categoryName = input.substring(32).trim();
      const category = categories.find(c => c.name.toLowerCase().includes(categoryName.toLowerCase()));
      if (!category) {
        setTimeout(() => {
          setMessages(prev => [...prev, { id: Date.now(), text: `Không tìm thấy danh mục "${categoryName}".`, sender: 'ai' }]);
        }, 500);
        return;
      }
      const categoryTransactions = transactions.filter(t => t.category && t.category._id === category._id);
      const income = categoryTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + (t.amount || 0), 0);
      const expense = categoryTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + (t.amount || 0), 0);
      setTimeout(() => {
        setMessages(prev => [...prev, {
          id: Date.now(),
          text: `Thống kê giao dịch cho danh mục "${category.name}":\n- Thu nhập: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(income)}\n- Chi tiêu: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(expense)}\n- Số giao dịch: ${categoryTransactions.length}`,
          sender: 'ai'
        }]);
      }, 500);
      return;
    }

    // Tự động phát hiện giao dịch từ câu chat tự nhiên
    const detectTransaction = () => {
      const extractedAmount = extractAmount(input);
      
      // Các từ khóa giao dịch phổ biến
      const transactionKeywords = [
        'ăn', 'uống', 'cafe', 'cà phê', 'cơm', 'phở', 'bún',
        'mua', 'xăng', 'điện', 'nước', 'internet', 'thuê',
        'học', 'sách', 'thuốc', 'khám', 'phim', 'du lịch',
        'lương', 'thưởng', 'nhận', 'thu'
      ];
      
      const hasKeyword = transactionKeywords.some(k => lowerInput.includes(k));
      
      // Nếu có số tiền HOẶC có từ khóa giao dịch -> coi như muốn tạo giao dịch
      return (extractedAmount && extractedAmount > 0) || hasKeyword;
    };

    // Check if user wants to EDIT transaction (UU TIEN CHECK TRUOC!)
    if (lowerInput.startsWith('sửa ') || lowerInput.startsWith('sửa giao dịch ')) {
      const editQuery = lowerInput.startsWith('sửa giao dịch ') 
        ? input.substring(14).trim() 
        : input.substring(4).trim();
      
      if (!editQuery) {
        setTimeout(() => {
          setMessages(prev => [...prev, { id: Date.now(), text: '❌ Vui lòng nhập nội dung. Ví dụ: "sửa ăn tối thành 50k"', sender: 'ai' }]);
        }, 500);
        return;
      }

      // Parse: "sửa ăn tối thành 50k" -> query="ăn tối", newAmount=50000
      const parseEditCommand = (cmd) => {
        const lowerCmd = cmd.toLowerCase();
        let searchQuery = '';
        let newAmount = null;
        let newTitle = null;
        let newCategory = null;
        
        // Pattern: "<search> thành <amount>"
        const amountMatch = lowerCmd.match(/(.+?)\s+thành\s+(.+)/);
        if (amountMatch) {
          searchQuery = amountMatch[1].trim();
          const updatePart = amountMatch[2].trim();
          
          // Thử extract amount
          const extractedAmount = extractAmount(updatePart);
          if (extractedAmount) {
            newAmount = extractedAmount;
          } else {
            // Nếu không phải số tiền, có thể là tên mới
            newTitle = updatePart;
          }
        } else {
          searchQuery = cmd;
        }
        
        return { searchQuery, newAmount, newTitle, newCategory };
      };
      
      const parsed = parseEditCommand(editQuery);
      
      // Tìm kiếm giao dịch qua API
      searchAndEditTransaction(parsed);
      return;
    }

    // Check if user wants to DELETE transaction (UU TIEN CHECK TRUOC!)
    if (lowerInput.startsWith('xóa ') || lowerInput.startsWith('xóa giao dịch ')) {
      const deleteQuery = lowerInput.startsWith('xóa giao dịch ') 
        ? input.substring(14).trim() 
        : input.substring(4).trim();
      
      if (!deleteQuery) {
        setTimeout(() => {
          setMessages(prev => [...prev, { id: Date.now(), text: '❌ Vui lòng nhập nội dung. Ví dụ: "xóa ăn tối"', sender: 'ai' }]);
        }, 500);
        return;
      }
      
      // Sử dụng API search mới
      searchAndDeleteTransaction(deleteQuery);
      return;
    }

    // Check if user wants to create transaction (prefix)
    if (lowerInput.startsWith('tạo giao dịch ') || lowerInput.startsWith('tạo ')) {
      const title = lowerInput.startsWith('tạo giao dịch ') ? input.substring(14).trim() : input.substring(4).trim();
      if (!title) {
        setTimeout(() => {
          setMessages(prev => [...prev, { id: Date.now(), text: '❌ Vui lòng nhập nội dung giao dịch. Ví dụ: "tạo ăn tối 50k"', sender: 'ai' }]);
        }, 500);
        return;
      }

      const extractedAmount = extractAmount(title);
      setPendingTransactionTitle(title);
      setPendingTransactionAmount(extractedAmount);
      setAwaitingWalletSelection(true);
      
      setTimeout(() => {
        const walletButtons = wallets.map((w, i) => `${i + 1}. ${w.name}`);
        const amountText = extractedAmount 
          ? `💰 Số tiền: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(extractedAmount)}` 
          : '⚠️ Chưa phát hiện số tiền (sẽ để 0đ)';
        
        setMessages(prev => [...prev, { 
          id: Date.now(), 
          text: `✅ Đã hiểu: "${title}"\n${amountText}\n\n📂 Chọn ví:\n${walletButtons.join('\n')}\n\nTrả lời số thứ tự hoặc tên ví.`, 
          sender: 'ai' 
        }]);
      }, 500);
      return;
    }
    
    // Tự động phát hiện giao dịch từ câu chat tự nhiên (CHECK CUỐI CÙNG!)
    if (!awaitingWalletSelection && !awaitingEditInstruction && 
        !awaitingTransactionSelection && !awaitingDeleteSelection && 
        !awaitingDeleteConfirmation && detectTransaction()) {
      
      const extractedAmount = extractAmount(input);
      setPendingTransactionTitle(input.trim());
      setPendingTransactionAmount(extractedAmount);
      setAwaitingWalletSelection(true);
      
      setTimeout(() => {
        const walletButtons = wallets.map((w, i) => `${i + 1}. ${w.name}`);
        const amountText = extractedAmount 
          ? `💰 Số tiền: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(extractedAmount)}` 
          : '⚠️ Chưa phát hiện số tiền (sẽ để 0đ)';
        
        setMessages(prev => [...prev, { 
          id: Date.now(), 
          text: `🤖 Tôi hiểu bạn muốn tạo giao dịch:\n📝 Nội dung: "${input}"\n${amountText}\n\n📂 Chọn ví:\n${walletButtons.join('\n')}\n\nTrả lời số thứ tự hoặc tên ví.`, 
          sender: 'ai' 
        }]);
      }, 500);
      return;
    }

    // Đã xóa awaitingAmount flow - không cần nữa

    // Nếu awaiting wallet selection
    if (awaitingWalletSelection) {
      const inputTrimmed = input.trim();
      
      // Hỗ trợ chọn bằng số thứ tự
      let selectedWallet = null;
      const walletNumber = parseInt(inputTrimmed);
      if (!isNaN(walletNumber) && walletNumber > 0 && walletNumber <= wallets.length) {
        selectedWallet = wallets[walletNumber - 1];
      } else {
        // Chọn bằng tên
        selectedWallet = wallets.find(w => w.name.toLowerCase() === inputTrimmed.toLowerCase());
      }
      
      if (!selectedWallet) {
        setTimeout(() => {
          setMessages(prev => [...prev, { id: Date.now(), text: '❌ Ví không hợp lệ. Vui lòng chọn lại số thứ tự hoặc tên ví.', sender: 'ai' }]);
        }, 500);
        return;
      }

      // Hiển thị đang xử lý
      setTimeout(() => {
        setMessages(prev => [...prev, { id: Date.now(), text: '⏳ Đang tạo giao dịch...', sender: 'ai' }]);
      }, 300);

      // Call API to create transaction
      createTransaction(pendingTransactionTitle, selectedWallet._id, pendingTransactionAmount);
      setAwaitingWalletSelection(false);
      setPendingTransactionTitle('');
      setPendingTransactionAmount(null);
      return;
    }

    // Đã di chuyển logic "sửa" lên trên

    // If awaiting transaction selection (for edit)
    if (awaitingTransactionSelection) {
      const choice = parseInt(input.trim());
      if (isNaN(choice) || choice < 1 || choice > matchingTransactions.length) {
        setTimeout(() => {
          setMessages(prev => [...prev, { id: Date.now(), text: '❌ Số không hợp lệ. Vui lòng nhập 1-' + matchingTransactions.length, sender: 'ai' }]);
        }, 500);
        return;
      }

      const selectedTx = matchingTransactions[choice - 1];
      const parsed = pendingEditTransaction?.parsed;
      
      setAwaitingTransactionSelection(false);
      setMatchingTransactions([]);
      setPendingEditTransaction(null);
      
      // Nếu có parsed (từ auto-detect), tự động sửa
      if (parsed && (parsed.newAmount !== null || parsed.newTitle)) {
        const updates = {};
        if (parsed.newAmount !== null) updates.amount = parsed.newAmount;
        if (parsed.newTitle) updates.title = parsed.newTitle;
        
        editTransactionAI(selectedTx._id, updates, selectedTx);
      } else {
        // Không có parsed, hỏi muốn sửa gì
        setPendingEditTransaction(selectedTx);
        setAwaitingEditInstruction(true);
        setTimeout(() => {
          setMessages(prev => [...prev, {
            id: Date.now(),
            text: `✅ Đã chọn: "${selectedTx.title}" (${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(selectedTx.amount)})\n\nBạn muốn sửa gì?\nVí dụ: "thành 60k", "thành cafe buoi sang"`,
            sender: 'ai'
          }]);
        }, 500);
      }
      return;
    }

    // If awaiting edit instruction
    if (awaitingEditInstruction && pendingEditTransaction) {
      const instruction = input.trim();
      const tx = pendingEditTransaction;
      
      // Parse instruction: "thành 60k" or "thành cafe"
      const updates = {};
      
      if (instruction.toLowerCase().startsWith('thành ')) {
        const newValue = instruction.substring(5).trim();
        const extractedAmount = extractAmount(newValue);
        
        if (extractedAmount) {
          updates.amount = extractedAmount;
        } else {
          updates.title = newValue;
        }
      } else {
        // Thử parse tự do
        const extractedAmount = extractAmount(instruction);
        if (extractedAmount) {
          updates.amount = extractedAmount;
        } else {
          updates.title = instruction;
        }
      }
      
      setAwaitingEditInstruction(false);
      setPendingEditTransaction(null);
      
      editTransactionAI(tx._id, updates, tx);
      return;
    }

    // Check if user wants to delete transaction
    if (lowerInput.startsWith('xóa giao dịch ')) {
      const deleteQuery = input.substring(14).trim();
      if (!deleteQuery) {
        setTimeout(() => {
          setMessages(prev => [...prev, { id: Date.now(), text: 'Vui lòng nhập mô tả giao dịch cần xóa.', sender: 'ai' }]);
        }, 500);
        return;
      }

      // Parse delete query: "ăn uống 50k trong ví chính"
      const foundTransactions = findTransactionsToDelete(deleteQuery);
      if (foundTransactions.length === 0) {
        setTimeout(() => {
          setMessages(prev => [...prev, { id: Date.now(), text: 'Không tìm thấy giao dịch phù hợp để xóa.', sender: 'ai' }]);
        }, 500);
        return;
      }

      if (foundTransactions.length === 1) {
        // Chỉ có một, hỏi xác nhận xóa
        setPendingEditTransaction(foundTransactions[0]);
        setAwaitingDeleteConfirmation(true);
        setTimeout(() => {
          setMessages(prev => [...prev, {
            id: Date.now(),
            text: `Tôi đã tìm thấy giao dịch:\n- Tên: ${foundTransactions[0].title}\n- Số tiền: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(foundTransactions[0].amount)}\n- Ngày: ${new Date(foundTransactions[0].date || foundTransactions[0].createdAt).toLocaleDateString('vi-VN')}\n- Ví: ${foundTransactions[0].wallet?.name || 'N/A'}\n\nBạn có chắc chắn muốn xóa giao dịch này? (Trả lời "có" hoặc "không")`,
            sender: 'ai'
          }]);
        }, 500);
      } else {
        // Nhiều giao dịch, hỏi chọn cái nào
        setDeleteMatchingTransactions(foundTransactions);
        setAwaitingDeleteSelection(true);
        const options = foundTransactions.map((tx, idx) => `${idx + 1}. ${tx.title} - ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount)} (${tx.wallet?.name || 'N/A'}) - ${new Date(tx.date || tx.createdAt).toLocaleDateString('vi-VN')}`).join('\n');
        setTimeout(() => {
          setMessages(prev => [...prev, {
            id: Date.now(),
            text: `Tôi tìm thấy ${foundTransactions.length} giao dịch phù hợp:\n${options}\n\nNhập số thứ tự để chọn giao dịch cần xóa (ví dụ: 1)`,
            sender: 'ai'
          }]);
        }, 500);
      }
      return;
    }

    // If awaiting delete selection
    if (awaitingDeleteSelection) {
      const choice = parseInt(input.trim());
      if (isNaN(choice) || choice < 1 || choice > deleteMatchingTransactions.length) {
        setTimeout(() => {
          setMessages(prev => [...prev, { id: Date.now(), text: 'Số thứ tự không hợp lệ. Vui lòng nhập lại.', sender: 'ai' }]);
        }, 500);
        return;
      }

      const selectedTx = deleteMatchingTransactions[choice - 1];
      setPendingEditTransaction(selectedTx);
      setAwaitingDeleteSelection(false);
      setDeleteMatchingTransactions([]);
      setAwaitingDeleteConfirmation(true);
      setTimeout(() => {
        setMessages(prev => [...prev, {
          id: Date.now(),
          text: `Đã chọn giao dịch:\n- Tên: ${selectedTx.title}\n- Số tiền: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(selectedTx.amount)}\n- Ngày: ${new Date(selectedTx.date || selectedTx.createdAt).toLocaleDateString('vi-VN')}\n- Ví: ${selectedTx.wallet?.name || 'N/A'}\n\nBạn có chắc chắn muốn xóa giao dịch này? (Trả lời "có" hoặc "không")`,
          sender: 'ai'
        }]);
      }, 500);
      return;
    }

    // If awaiting delete confirmation
    if (awaitingDeleteConfirmation && pendingEditTransaction) {
      const lowerInput = input.toLowerCase().trim();
      if (lowerInput === 'có' || lowerInput === 'yes' || lowerInput === 'ok' || lowerInput === 'xóa') {
        deleteTransactionAI(pendingEditTransaction._id, pendingEditTransaction);
        setAwaitingDeleteConfirmation(false);
        setPendingEditTransaction(null);
      } else {
        setMessages(prev => [...prev, { id: Date.now(), text: '❌ Đã hủy xóa.', sender: 'ai' }]);
        setAwaitingDeleteConfirmation(false);
        setPendingEditTransaction(null);
      }
      return;
    }

    // Default AI response
    setTimeout(() => {
      const aiResponse = { id: Date.now(), text: '🤔 Tôi chưa hiểu yêu cầu này. Bạn có thể:\n\n💸 Tạo giao dịch: "ăn tối 50k", "cafe 30k"\n📊 Xem thống kê: "thống kê"\n📂 Xem ví: "xem ví"\n✏️ Sửa/xóa: "sửa giao dịch...", "xóa giao dịch..."', sender: 'ai' };
      setMessages(prev => [...prev, aiResponse]);
    }, 1000);
  };

  // Helper: Search and edit transaction
  const searchAndEditTransaction = async (parsed) => {
    try {
      setMessages(prev => [...prev, { id: Date.now(), text: '⏳ Đang tìm kiếm giao dịch...', sender: 'ai' }]);
      
      const res = await fetch(`${API_BASE}/api/ai/search-transactions?query=${encodeURIComponent(parsed.searchQuery)}&limit=5`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) throw new Error('Không thể tìm kiếm giao dịch');
      
      const foundTransactions = await res.json();
      
      if (foundTransactions.length === 0) {
        setMessages(prev => [...prev, { 
          id: Date.now(), 
          text: `❌ Không tìm thấy giao dịch chứa "${parsed.searchQuery}".\n\n💡 Thử tìm kiếm khác hoặc xem "thống kê"`, 
          sender: 'ai' 
        }]);
        return;
      }
      
      if (foundTransactions.length === 1) {
        // Chỉ 1 giao dịch -> tự động sửa
        const tx = foundTransactions[0];
        const updates = {};
        if (parsed.newAmount !== null) updates.amount = parsed.newAmount;
        if (parsed.newTitle) updates.title = parsed.newTitle;
        
        await editTransactionAI(tx._id, updates, tx);
      } else {
        // Nhiều giao dịch -> cho chọn
        setMatchingTransactions(foundTransactions);
        setAwaitingTransactionSelection(true);
        // Lưu parsed để dùng sau
        setPendingEditTransaction({ parsed });
        
        const options = foundTransactions.map((tx, idx) => 
          `${idx + 1}. ${tx.title} - ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount)} (${tx.wallet?.name || 'N/A'})`
        ).join('\n');
        
        setMessages(prev => [...prev, {
          id: Date.now(),
          text: `🔍 Tìm thấy ${foundTransactions.length} giao dịch:\n${options}\n\nChọn số thứ tự (1-${foundTransactions.length}):`,
          sender: 'ai'
        }]);
      }
    } catch (err) {
      console.error('Search transaction error:', err);
      setMessages(prev => [...prev, { id: Date.now(), text: `❌ Lỗi: ${err.message}`, sender: 'ai' }]);
    }
  };
  
  // Helper: Search and delete transaction
  const searchAndDeleteTransaction = async (query) => {
    try {
      setMessages(prev => [...prev, { id: Date.now(), text: '⏳ Đang tìm kiếm giao dịch...', sender: 'ai' }]);
      
      const res = await fetch(`${API_BASE}/api/ai/search-transactions?query=${encodeURIComponent(query)}&limit=5`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) throw new Error('Không thể tìm kiếm giao dịch');
      
      const foundTransactions = await res.json();
      
      if (foundTransactions.length === 0) {
        setMessages(prev => [...prev, { 
          id: Date.now(), 
          text: `❌ Không tìm thấy giao dịch chứa "${query}".`, 
          sender: 'ai' 
        }]);
        return;
      }
      
      if (foundTransactions.length === 1) {
        // Chỉ 1 giao dịch -> hỏi xác nhận
        const tx = foundTransactions[0];
        setPendingEditTransaction(tx);
        setAwaitingDeleteConfirmation(true);
        
        setTimeout(() => {
          setMessages(prev => [...prev, {
            id: Date.now(),
            text: `🗑️ Tìm thấy:\n📝 ${tx.title}\n💰 ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount)}\n💼 ${tx.wallet?.name || 'N/A'}\n\nXác nhận xóa? (Trả lời "có" hoặc "không")`,
            sender: 'ai'
          }]);
        }, 500);
      } else {
        // Nhiều giao dịch -> cho chọn
        setDeleteMatchingTransactions(foundTransactions);
        setAwaitingDeleteSelection(true);
        
        const options = foundTransactions.map((tx, idx) => 
          `${idx + 1}. ${tx.title} - ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount)} (${tx.wallet?.name || 'N/A'})`
        ).join('\n');
        
        setMessages(prev => [...prev, {
          id: Date.now(),
          text: `🔍 Tìm thấy ${foundTransactions.length} giao dịch:\n${options}\n\nChọn số thứ tự (1-${foundTransactions.length}):`,
          sender: 'ai'
        }]);
      }
    } catch (err) {
      console.error('Search transaction error:', err);
      setMessages(prev => [...prev, { id: Date.now(), text: `❌ Lỗi: ${err.message}`, sender: 'ai' }]);
    }
  };
  
  // Helper: Delete transaction using AI API
  const deleteTransactionAI = async (transactionId, txInfo) => {
    try {
      setMessages(prev => [...prev, { id: Date.now(), text: '⏳ Đang xóa giao dịch...', sender: 'ai' }]);
      
      const res = await fetch(`${API_BASE}/api/ai/delete-transaction`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ transactionId })
      });
      
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || 'Lỗi xóa giao dịch');
      }
      
      const data = await res.json();
      
      setMessages(prev => [...prev, {
        id: Date.now(),
        text: `✅ Đã xóa giao dịch thành công!\n\n🗑️ Đã xóa: "${data.deletedTransaction.title}"\n💰 Số tiền: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(data.deletedTransaction.amount)}\n\n💼 Ví: ${data.deletedTransaction.wallet}\n🔄 Số dư mới: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(data.aiDecisions.newWalletBalance)}`,
        sender: 'ai'
      }]);
      
      // Refresh transactions
      fetch(`${API_BASE}/api/transactions`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => setTransactions(data || []));
        
    } catch (err) {
      console.error('Delete transaction AI error:', err);
      setMessages(prev => [...prev, { id: Date.now(), text: `❌ Lỗi: ${err.message}`, sender: 'ai' }]);
    }
  };
  
  // Helper: Edit transaction using AI API  
  const editTransactionAI = async (transactionId, updates, oldTx) => {
    try {
      setMessages(prev => [...prev, { id: Date.now(), text: '⏳ Đang cập nhật giao dịch...', sender: 'ai' }]);
      
      const res = await fetch(`${API_BASE}/api/ai/edit-transaction`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ transactionId, updates })
      });
      
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || 'Lỗi cập nhật giao dịch');
      }
      
      const data = await res.json();
      
      // Hiển thị kết quả
      const changedFields = [];
      if (updates.amount !== undefined) {
        changedFields.push(`💰 Số tiền: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(oldTx.amount)} → ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(updates.amount)}`);
      }
      if (updates.title) {
        changedFields.push(`📝 Tên: "${oldTx.title}" → "${updates.title}"`);
      }
      if (updates.categoryName) {
        changedFields.push(`📁 Danh mục: → "${updates.categoryName}"`);
      }
      
      setMessages(prev => [...prev, {
        id: Date.now(),
        text: `✅ Đã cập nhật giao dịch thành công!\n\n${changedFields.join('\n')}\n\n💼 Ví: ${data.transaction.wallet.name}\n🔄 Số dư mới: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(data.transaction.wallet.initialBalance)}`,
        sender: 'ai'
      }]);
      
      // Refresh transactions
      fetch(`${API_BASE}/api/transactions`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => setTransactions(data || []));
        
    } catch (err) {
      console.error('Edit transaction AI error:', err);
      setMessages(prev => [...prev, { id: Date.now(), text: `❌ Lỗi: ${err.message}`, sender: 'ai' }]);
    }
  };
  
  const createTransaction = async (title, walletId, amount) => {
    try {
      const res = await fetch(`${API_BASE}/api/ai/create-transaction`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ title, walletId, amount })
      });

      const data = await res.json();

      if (data.aiMessage) {
        // AI trả về thông báo thay vì tạo giao dịch
        setMessages(prev => [...prev, { id: Date.now(), text: data.aiMessage, sender: 'ai' }]);
      } else if (res.ok) {
        // Thành công tạo giao dịch
        const typeEmoji = data.aiDecisions.guessedType === 'income' ? '💰' : '💸';
        const typeText = data.aiDecisions.guessedType === 'income' ? 'Thu nhập' : 'Chi tiêu';
        
        setMessages(prev => [...prev, {
          id: Date.now(),
          text: `✅ Tạo giao dịch thành công!\n\n${typeEmoji} ${typeText}: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)}\n📁 Danh mục: ${data.aiDecisions.selectedCategory}\n💼 Ví: ${data.transaction.wallet.name}\n📝 Nội dung: "${title}"\n\n🔄 Số dư mới: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format((data.transaction.wallet.balance || 0) + data.aiDecisions.balanceChange)}`,
          sender: 'ai'
        }]);
      } else {
        // Lỗi khác
        setMessages(prev => [...prev, { id: Date.now(), text: `❌ Lỗi tạo giao dịch: ${data.message || 'Lỗi không xác định'}`, sender: 'ai' }]);
      }
    } catch (err) {
      console.error('Create transaction error:', err);
      setMessages(prev => [...prev, { id: Date.now(), text: `❌ Lỗi tạo giao dịch: ${err.message}`, sender: 'ai' }]);
    }
  };

  const findTransactionsToEdit = (query) => {
    // Parse: "ăn uống 50k trong ví chính"
    const parts = query.split(' trong ví ');
    const titlePart = parts[0].trim();
    const walletName = parts[1]?.trim();

    // Extract amount from titlePart
    const amount = extractAmount(titlePart);
    const title = titlePart.replace(/\d+(?:\.\d+)?\s*(k|nghìn|vnd|đ|vnđ|usd|\$)/gi, '').trim();

    // Filter transactions
    return transactions.filter(tx => {
      const txTitle = (tx.title || '').toLowerCase().includes(title.toLowerCase());
      const txAmount = amount ? tx.amount === amount : true; // Nếu không có amount, bỏ qua
      const txWallet = walletName ? (tx.wallet?.name || '').toLowerCase() === walletName.toLowerCase() : true;
      return txTitle && txAmount && txWallet;
    });
  };

  const findTransactionsToDelete = (query) => {
    // Parse: "ăn uống 50k trong ví chính"
    const parts = query.split(' trong ví ');
    const titlePart = parts[0].trim();
    const walletName = parts[1]?.trim();

    // Extract amount from titlePart
    const amount = extractAmount(titlePart);
    const title = titlePart.replace(/\d+(?:\.\d+)?\s*(k|nghìn|vnd|đ|vnđ|usd|\$)/gi, '').trim();

    // Filter transactions
    return transactions.filter(tx => {
      const txTitle = (tx.title || '').toLowerCase().includes(title.toLowerCase());
      const txAmount = amount ? tx.amount === amount : true; // Nếu không có amount, bỏ qua
      const txWallet = walletName ? (tx.wallet?.name || '').toLowerCase() === walletName.toLowerCase() : true;
      return txTitle && txAmount && txWallet;
    });
  };

  const editTransaction = async (transaction, instruction) => {
    const lowerInstruction = instruction.toLowerCase();

    let updates = {};

    // Parse instruction
    if (lowerInstruction.includes('thay đổi số tiền thành')) {
      const newAmountStr = instruction.split('thay đổi số tiền thành')[1].trim();
      const newAmount = extractAmount(newAmountStr);
      if (newAmount) updates.amount = newAmount;
    } else if (lowerInstruction.includes('thay đổi danh mục thành')) {
      const newCategoryName = instruction.split('thay đổi danh mục thành')[1].trim();
      // Find category by name (simple match)
      const categories = await fetch(`${API_BASE}/api/categories`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => data || []);
      const category = categories.find(c => c.name.toLowerCase().includes(newCategoryName.toLowerCase()));
      if (category) updates.category = category._id;
    } else if (lowerInstruction.includes('thay đổi tên thành')) {
      const newTitle = instruction.split('thay đổi tên thành')[1].trim();
      if (newTitle) updates.title = newTitle;
    }

    if (Object.keys(updates).length === 0) {
      setMessages(prev => [...prev, { id: Date.now(), text: 'Tôi không hiểu yêu cầu sửa. Vui lòng thử lại.', sender: 'ai' }]);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/transactions/${transaction._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(updates)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || 'Lỗi sửa giao dịch');
      }

      const updated = await res.json();
      setMessages(prev => [...prev, {
        id: Date.now(),
        text: `✅ Giao dịch đã được sửa thành công!\n- Tên: ${updated.title}\n- Số tiền: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(updated.amount)}\n- Danh mục: ${updated.category?.name || 'N/A'}`,
        sender: 'ai'
      }]);

      // Refresh transactions
      fetch(`${API_BASE}/api/transactions`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => setTransactions(data || []));
    } catch (err) {
      console.error('Edit transaction error:', err);
      setMessages(prev => [...prev, { id: Date.now(), text: `❌ Lỗi sửa giao dịch: ${err.message}`, sender: 'ai' }]);
    }
  };

  const deleteTransaction = async (transaction) => {
    try {
      const res = await fetch(`${API_BASE}/api/transactions/${transaction._id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || 'Lỗi xóa giao dịch');
      }

      setMessages(prev => [...prev, {
        id: Date.now(),
        text: `✅ Giao dịch "${transaction.title}" đã được xóa thành công!`,
        sender: 'ai'
      }]);

      // Refresh transactions
      fetch(`${API_BASE}/api/transactions`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => setTransactions(data || []));
    } catch (err) {
      console.error('Delete transaction error:', err);
      setMessages(prev => [...prev, { id: Date.now(), text: `❌ Lỗi xóa giao dịch: ${err.message}`, sender: 'ai' }]);
    } finally {
      setAwaitingDeleteConfirmation(false);
      setPendingEditTransaction(null);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') sendMessage();
  };

  return (
    <>
      {/* Floating AI Button (improved: plus + AI label) */}
      <button
        className="ai-button"
        onClick={toggleModal}
        title="Trợ lý AI"
        aria-label="Mở Trợ lý AI"
      >
        <span className="ai-button-inner" aria-hidden>
          <span className="ai-plus"><i className="fas fa-plus"></i></span>
          <span className="ai-label">AI</span>
        </span>
      </button>
  
      {/* AI Modal */}
      {isOpen && (
        <div className="ai-modal-overlay" onClick={toggleModal}>
          <div className="ai-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ai-modal-header">
              <div style={{display:'flex', alignItems:'center', gap:8}}>
                <i className="fas fa-robot" style={{color:'#2a5298', fontSize:18}}></i>
                <div>
                  <h3 style={{margin:0}}>Trợ lý AI</h3>
                  <div className="ai-sub" style={{marginTop:2}}>Hỏi về nhóm, giao dịch hoặc công nợ</div>
                </div>
              </div>
              <button className="ai-close-btn" onClick={toggleModal} aria-label="Đóng">×</button>
            </div>
            <div className="ai-chat-container">
              <div className="ai-messages">
                {messages.map(msg => (
                  <div key={msg.id} className={`ai-message ${msg.sender}`}>
                    <div className="ai-message-bubble">{msg.text}</div>
                  </div>
                ))}
              </div>
              <div className="ai-input-container">
                <input
                  type="text"
                  placeholder="Chat tự nhiên: 'ăn tối 50k', 'cafe 30k', 'xem ví'..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="ai-input"
                />
                <button onClick={sendMessage} className="ai-send-btn">
                  <i className="fas fa-paper-plane"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
