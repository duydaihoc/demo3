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

  const API_BASE = 'http://localhost:5000';
  const token = localStorage.getItem('token');

  // Fetch wallets on mount
  useEffect(() => {
    if (token) {
      fetch(`${API_BASE}/api/wallets`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => setWallets(data || []))
        .catch(err => console.error('Fetch wallets error:', err));
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

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || 'Lỗi tạo giao dịch');
      }

      const data = await res.json();
      setMessages(prev => [...prev, {
        id: Date.now(),
        text: `✅ Giao dịch "${title}" đã được tạo thành công!\nSố tiền: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)}\nLoại: ${data.aiDecisions.guessedType}\nDanh mục: ${data.aiDecisions.selectedCategory}\nVí: ${data.transaction.wallet.name}`,
        sender: 'ai'
      }]);
    } catch (err) {
      console.error('Create transaction error:', err);
      setMessages(prev => [...prev, { id: Date.now(), text: `❌ Lỗi tạo giao dịch: ${err.message}`, sender: 'ai' }]);
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
