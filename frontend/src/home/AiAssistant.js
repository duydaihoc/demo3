import React, { useState, useEffect } from 'react';
import './AiAssistant.css';

export default function AiAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { id: 1, text: 'Xin chào! Tôi là trợ lý AI. Tôi có thể giúp bạn phân tích chi tiêu, đưa ra lời khuyên tài chính, hoặc tạo giao dịch. Hãy thử nhập "tạo giao dịch [tên giao dịch]" để bắt đầu!', sender: 'ai' }
  ]);
  const [input, setInput] = useState('');
  const [wallets, setWallets] = useState([]);
  const [awaitingWalletSelection, setAwaitingWalletSelection] = useState(false);
  const [pendingTransactionTitle, setPendingTransactionTitle] = useState('');
  const [awaitingAmount, setAwaitingAmount] = useState(false);
  const [pendingTransactionAmount, setPendingTransactionAmount] = useState(null);
  const [awaitingEditInstruction, setAwaitingEditInstruction] = useState(false);
  const [pendingEditTransaction, setPendingEditTransaction] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [awaitingTransactionSelection, setAwaitingTransactionSelection] = useState(false);
  const [matchingTransactions, setMatchingTransactions] = useState([]);
  const [awaitingDeleteSelection, setAwaitingDeleteSelection] = useState(false);
  const [deleteMatchingTransactions, setDeleteMatchingTransactions] = useState([]);
  const [awaitingDeleteConfirmation, setAwaitingDeleteConfirmation] = useState(false);

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

    // Check if user wants to create transaction
    const lowerInput = input.toLowerCase().trim();
    if (lowerInput.startsWith('tạo giao dịch ')) {
      const title = input.substring(14).trim(); // Remove "tạo giao dịch "
      if (!title) {
        setTimeout(() => {
          setMessages(prev => [...prev, { id: Date.now(), text: 'Vui lòng nhập tên giao dịch sau "tạo giao dịch". Ví dụ: tạo giao dịch mua cà phê', sender: 'ai' }]);
        }, 500);
        return;
      }

      // Trích xuất số tiền
      const extractedAmount = extractAmount(title);
      if (extractedAmount) {
        // Có số tiền, hỏi chọn ví
        setPendingTransactionTitle(title);
        setPendingTransactionAmount(extractedAmount);
        setAwaitingWalletSelection(true);
        setTimeout(() => {
          const walletOptions = wallets.map(w => `${w.name} (ID: ${w._id})`).join('\n');
          setMessages(prev => [...prev, { id: Date.now(), text: `Tôi đã trích xuất số tiền ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(extractedAmount)} từ "${title}".\nChọn ví cho giao dịch:\n${walletOptions}\n\nTrả lời bằng tên ví (ví dụ: ${wallets[0]?.name || 'Ví chính'})`, sender: 'ai' }]);
        }, 500);
      } else {
        // Không có số tiền, hỏi số tiền trước
        setPendingTransactionTitle(title);
        setAwaitingAmount(true);
        setTimeout(() => {
          setMessages(prev => [...prev, { id: Date.now(), text: `Tôi hiểu bạn muốn tạo giao dịch "${title}". Số tiền là bao nhiêu? (Ví dụ: 50k, 100000, 50 nghìn)`, sender: 'ai' }]);
        }, 500);
      }
      return;
    }

    // Nếu đang chờ số tiền
    if (awaitingAmount) {
      const amountStr = input.trim();
      const extractedAmount = extractAmount(amountStr);
      if (extractedAmount) {
        setPendingTransactionAmount(extractedAmount);
        setAwaitingAmount(false);
        setAwaitingWalletSelection(true);
        setTimeout(() => {
          const walletOptions = wallets.map(w => `${w.name} (ID: ${w._id})`).join('\n');
          setMessages(prev => [...prev, { id: Date.now(), text: `Đã hiểu số tiền ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(extractedAmount)}. Chọn ví:\n${walletOptions}\n\nTrả lời bằng tên ví (ví dụ: ${wallets[0]?.name || 'Ví chính'})`, sender: 'ai' }]);
        }, 500);
      } else {
        setTimeout(() => {
          setMessages(prev => [...prev, { id: Date.now(), text: 'Tôi không hiểu số tiền. Vui lòng nhập lại (ví dụ: 50k, 100000, 50 nghìn)', sender: 'ai' }]);
        }, 500);
      }
      return;
    }

    // Nếu awaiting wallet selection
    if (awaitingWalletSelection) {
      const selectedWalletName = input.trim();
      const selectedWallet = wallets.find(w => w.name.toLowerCase() === selectedWalletName.toLowerCase());
      if (!selectedWallet) {
        setTimeout(() => {
          setMessages(prev => [...prev, { id: Date.now(), text: 'Tên ví không hợp lệ. Vui lòng thử lại.', sender: 'ai' }]);
        }, 500);
        return;
      }

      // Call API to create transaction
      createTransaction(pendingTransactionTitle, selectedWallet._id, pendingTransactionAmount);
      setAwaitingWalletSelection(false);
      setPendingTransactionTitle('');
      setPendingTransactionAmount(null);
      return;
    }

    // Check if user wants to edit transaction
    if (lowerInput.startsWith('sửa giao dịch ')) {
      const editQuery = input.substring(14).trim();
      if (!editQuery) {
        setTimeout(() => {
          setMessages(prev => [...prev, { id: Date.now(), text: 'Vui lòng nhập mô tả giao dịch cần sửa.', sender: 'ai' }]);
        }, 500);
        return;
      }

      // Parse edit query: "ăn uống 50k trong ví chính"
      const foundTransactions = findTransactionsToEdit(editQuery);
      if (foundTransactions.length === 0) {
        setTimeout(() => {
          setMessages(prev => [...prev, { id: Date.now(), text: 'Không tìm thấy giao dịch phù hợp. Vui lòng kiểm tra lại mô tả.', sender: 'ai' }]);
        }, 500);
        return;
      }

      if (foundTransactions.length === 1) {
        // Chỉ có một, trực tiếp hỏi sửa gì
        setPendingEditTransaction(foundTransactions[0]);
        setAwaitingEditInstruction(true);
        setTimeout(() => {
          setMessages(prev => [...prev, {
            id: Date.now(),
            text: `Tôi đã tìm thấy giao dịch:\n- Tên: ${foundTransactions[0].title}\n- Số tiền: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(foundTransactions[0].amount)}\n- Ngày: ${new Date(foundTransactions[0].date || foundTransactions[0].createdAt).toLocaleDateString('vi-VN')}\n- Ví: ${foundTransactions[0].wallet?.name || 'N/A'}\n\nBạn muốn sửa gì? (Ví dụ: "thay đổi số tiền thành 60k", "thay đổi danh mục thành ăn uống")`,
            sender: 'ai'
          }]);
        }, 500);
      } else {
        // Nhiều giao dịch, hỏi chọn cái nào
        setMatchingTransactions(foundTransactions);
        setAwaitingTransactionSelection(true);
        const options = foundTransactions.map((tx, idx) => `${idx + 1}. ${tx.title} - ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount)} (${tx.wallet?.name || 'N/A'}) - ${new Date(tx.date || tx.createdAt).toLocaleDateString('vi-VN')}`).join('\n');
        setTimeout(() => {
          setMessages(prev => [...prev, {
            id: Date.now(),
            text: `Tôi tìm thấy ${foundTransactions.length} giao dịch phù hợp:\n${options}\n\nNhập số thứ tự để chọn giao dịch cần sửa (ví dụ: 1)`,
            sender: 'ai'
          }]);
        }, 500);
      }
      return;
    }

    // If awaiting transaction selection
    if (awaitingTransactionSelection) {
      const choice = parseInt(input.trim());
      if (isNaN(choice) || choice < 1 || choice > matchingTransactions.length) {
        setTimeout(() => {
          setMessages(prev => [...prev, { id: Date.now(), text: 'Số thứ tự không hợp lệ. Vui lòng nhập lại.', sender: 'ai' }]);
        }, 500);
        return;
      }

      const selectedTx = matchingTransactions[choice - 1];
      setPendingEditTransaction(selectedTx);
      setAwaitingTransactionSelection(false);
      setMatchingTransactions([]);
      setAwaitingEditInstruction(true);
      setTimeout(() => {
        setMessages(prev => [...prev, {
          id: Date.now(),
          text: `Đã chọn giao dịch:\n- Tên: ${selectedTx.title}\n- Số tiền: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(selectedTx.amount)}\n- Ngày: ${new Date(selectedTx.date || selectedTx.createdAt).toLocaleDateString('vi-VN')}\n- Ví: ${selectedTx.wallet?.name || 'N/A'}\n\nBạn muốn sửa gì? (Ví dụ: "thay đổi số tiền thành 60k", "thay đổi danh mục thành ăn uống")`,
          sender: 'ai'
        }]);
      }, 500);
      return;
    }

    // If awaiting edit instruction
    if (awaitingEditInstruction && pendingEditTransaction) {
      editTransaction(pendingEditTransaction, input.trim());
      setAwaitingEditInstruction(false);
      setPendingEditTransaction(null);
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
      const confirm = input.trim().toLowerCase();
      if (confirm === 'có' || confirm === 'yes' || confirm === 'ok') {
        deleteTransaction(pendingEditTransaction);
      } else {
        setMessages(prev => [...prev, { id: Date.now(), text: 'Đã hủy xóa giao dịch.', sender: 'ai' }]);
        setAwaitingDeleteConfirmation(false);
        setPendingEditTransaction(null);
      }
      return;
    }

    // Default AI response
    setTimeout(() => {
      const aiResponse = { id: Date.now(), text: 'Cảm ơn bạn đã hỏi! Tôi đang học cách trả lời tốt hơn. Hãy thử tạo giao dịch bằng cách nhập "tạo giao dịch [tên]".', sender: 'ai' };
      setMessages(prev => [...prev, aiResponse]);
    }, 1000);
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
        setMessages(prev => [...prev, {
          id: Date.now(),
          text: `✅ Giao dịch "${title}" đã được tạo thành công!\nSố tiền: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)}\nLoại: ${data.aiDecisions.guessedType}\nDanh mục: ${data.aiDecisions.selectedCategory}\nVí: ${data.transaction.wallet.name}`,
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
                  placeholder="Nhập câu hỏi hoặc 'tạo giao dịch [tên]'..."
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
