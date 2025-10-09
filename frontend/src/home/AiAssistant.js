import React, { useState } from 'react';
import './AiAssistant.css';

export default function AiAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { id: 1, text: 'Xin chào! Tôi là trợ lý AI. Tôi có thể giúp bạn phân tích chi tiêu, đưa ra lời khuyên tài chính, hoặc trả lời câu hỏi về ứng dụng.', sender: 'ai' }
  ]);
  const [input, setInput] = useState('');

  const toggleModal = () => setIsOpen(!isOpen);

  const sendMessage = () => {
    if (!input.trim()) return;
    const newMessage = { id: Date.now(), text: input, sender: 'user' };
    setMessages([...messages, newMessage]);
    setInput('');

    // Simulate AI response (replace with actual AI integration later)
    setTimeout(() => {
      const aiResponse = { id: Date.now() + 1, text: 'Cảm ơn bạn đã hỏi! Tôi đang học cách trả lời tốt hơn. Hãy thử hỏi về chi tiêu hoặc ngân sách.', sender: 'ai' };
      setMessages(prev => [...prev, aiResponse]);
    }, 1000);
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
                    <div className="ai-message-text">{msg.text}</div>
                  </div>
                ))}
              </div>
              <div className="ai-input-container">
                <input
                  type="text"
                  placeholder="Nhập câu hỏi của bạn..."
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
