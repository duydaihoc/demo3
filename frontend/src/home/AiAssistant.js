import React, { useState, useEffect, useRef } from 'react';
import './AiAssistant.css';
import { showNotification } from '../utils/notify'; // THÊM: import showNotification

export default function AiAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { 
      id: 1, 
      text: '👋 Xin chào! Tôi là trợ lý tài chính cá nhân thông minh.\n\n✨ **Powered by Advanced Fallback AI**\n\n🤖 **Khả năng của tôi:**\n• 💬 Phân tích dữ liệu tài chính thực tế của bạn\n• 📊 Đưa ra lời khuyên quản lý tiền bạc cá nhân hóa\n• 💡 Gợi ý tiết kiệm và đầu tư phù hợp\n• 🔍 Trả lời các câu hỏi dựa trên tình hình tài chính hiện tại\n• 📈 Phân tích xu hướng và đưa ra cảnh báo\n\n🚀 **Hệ thống AI dự phòng thông minh**\nHãy hỏi tôi bất cứ điều gì về tài chính!', 
      sender: 'ai',
      timestamp: new Date(),
      geminiAvailable: false,
      aiMode: 'Advanced Fallback AI'
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [geminiStatus, setGeminiStatus] = useState(true);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [suggestedTransaction, setSuggestedTransaction] = useState(null);
  const [creatingTransaction, setCreatingTransaction] = useState(false);
  
  // THÊM: State cho việc chọn ví
  const [selectedWalletId, setSelectedWalletId] = useState('');
  const [wallets, setWallets] = useState([]);
  const [loadingWallets, setLoadingWallets] = useState(false);
  
  // THÊM: State cho danh mục của ví đã chọn
  const [walletCategories, setWalletCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(false);

  // THÊM: State cho edit transaction
  const [showEditModal, setShowEditModal] = useState(false);
  const [editSuggestion, setEditSuggestion] = useState(null);
  const [selectedTransactionToEdit, setSelectedTransactionToEdit] = useState(null);
  const [editForm, setEditForm] = useState({
    amount: '',
    description: '',
    categoryId: '',
    date: ''
  });
  const [editingSaving, setEditingSaving] = useState(false);

  // THÊM: State để track message gốc
  const [originalMessage, setOriginalMessage] = useState('');
  const [analyzingCategory, setAnalyzingCategory] = useState(false);

  // THÊM: State cho pending transaction (đang chờ thông tin)
  const [pendingTransaction, setPendingTransaction] = useState(null);

  // THÊM: State cho delete transaction
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteSuggestion, setDeleteSuggestion] = useState(null);
  const [selectedTransactionToDelete, setSelectedTransactionToDelete] = useState(null);
  const [deletingSaving, setDeletingSaving] = useState(false);

  // THÊM: Persona (tính cách chatbot)
  const personaOptions = [
    { key: 'neutral', label: 'Trung lập' },
    { key: 'friendly', label: 'Thân thiện' },
    { key: 'expert', label: 'Chuyên gia' },
    { key: 'serious', label: 'Nghiêm túc' },
    { key: 'humorous', label: 'Hài hước' }
  ];
  const [persona, setPersona] = useState('neutral');

  // THÊM: Helper tạo câu phản hồi theo tính cách
  const buildPersonaComment = (personaKey, action, info) => {
    const fmt = (n) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
    const amountText = info?.amount != null ? fmt(info.amount) : '';
    const desc = info?.description || info?.title || '';
    if (personaKey === 'serious') {
      if (action === 'create') return `⚠️ Chi tiêu: ${desc ? `${desc} - ` : ''}${amountText}. Hãy kỷ luật hơn. Chỉ lần này thôi đấy.`;
      if (action === 'edit') return `⚠️ Đã chỉnh sửa giao dịch. Hãy đảm bảo ghi chép chính xác lần sau.`;
      if (action === 'delete') return `⚠️ Đã xóa giao dịch. Tránh xóa nhầm, ảnh hưởng báo cáo.`;
    }
    if (personaKey === 'friendly') {
      if (action === 'create') return `😊 Ghi nhận xong ${desc ? `${desc} - ` : ''}${amountText}! Cố gắng giữ ngân sách nhé!`;
      if (action === 'edit') return `👍 Đã cập nhật giao dịch! Mọi thứ rõ ràng hơn rồi.`;
      if (action === 'delete') return `👌 Đã xóa giao dịch! Giữ dữ liệu gọn gàng nào.`;
    }
    if (personaKey === 'expert') {
      if (action === 'create') return `Khuyến nghị: theo dõi nhóm chi tiêu liên quan đến "${desc || 'chi tiêu'}" để tối ưu ${amountText}.`;
      if (action === 'edit') return `Lưu ý: cập nhật chính xác giúp phân tích theo thời gian ổn định hơn.`;
      if (action === 'delete') return `Gợi ý: hạn chế xóa; cân nhắc gắn cờ hoặc ghi chú để bảo toàn chuỗi thời gian.`;
    }
    if (personaKey === 'humorous') {
      if (action === 'create') return `😜 Lại tiêu ${amountText} cho ${desc || 'một điều thú vị'} à? Ví nói: "Nhẹ tay thôi nhé!"`;
      if (action === 'edit') return `🛠️ Tút lại giao dịch xong! Dữ liệu nay xịn sò hơn rồi.`;
      if (action === 'delete') return `🗑️ Xóa cái rụp! Dọn dẹp dữ liệu cũng như dọn phòng — sướng lắm!`;
    }
    // neutral
    if (action === 'create') return `Đã ghi nhận ${desc ? `${desc} - ` : ''}${amountText}.`;
    if (action === 'edit') return `Đã cập nhật giao dịch.`;
    if (action === 'delete') return `Đã xóa giao dịch.`;
    return '';
  };

  const messagesEndRef = useRef(null);

  const API_BASE = 'http://localhost:5000';
  const token = localStorage.getItem('token');

  // Auto scroll to bottom - FIX: Smooth scroll without delay
  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]); // FIX: Also scroll when typing state changes

  const toggleModal = () => setIsOpen(!isOpen);

  const sendMessage = async () => {
    if (!input.trim() || isTyping) return;
    
    const userMessage = { 
      id: Date.now(), 
      text: input.trim(), 
      sender: 'user',
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    
    // THÊM: Lưu message gốc nếu đang có pending transaction
    if (pendingTransaction) {
      // Kết hợp với pending transaction để có context đầy đủ
      setOriginalMessage(`${pendingTransaction.description} ${userMessage.text}`.trim());
    } else {
      setOriginalMessage(userMessage.text);
    }
    
    setInput('');
    setIsTyping(true);

    // Cập nhật conversation history
    const newHistory = [
      ...conversationHistory,
      { role: 'user', content: userMessage.text }
    ].slice(-10); // Giữ 10 tin nhắn gần nhất

    setConversationHistory(newHistory);

    try {
      console.log('🚀 Sending message to Gemini AI...');
      
      // Gọi AI API với enhanced timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout
      
      const response = await fetch(`${API_BASE}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          message: userMessage.text,
          conversationHistory: newHistory,
          pendingTransaction: pendingTransaction, // THÊM: gửi pending transaction nếu có
          persona
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Network response was not ok`);
      }

      const data = await response.json();
      console.log('✅ Received response:', {
        geminiAvailable: data.geminiAvailable,
        hasTransactionSuggestion: !!data.transactionSuggestion,
        needsMoreInfo: !!data.needsMoreInfo
      });
      
      // Update Gemini status
      setGeminiStatus(data.geminiAvailable);
      
      const aiMessage = {
        id: Date.now() + 1,
        text: data.reply,
        sender: 'ai',
        timestamp: new Date(),
        actionSuggestion: data.actionSuggestion,
        transactionSuggestion: data.transactionSuggestion,
        editSuggestion: data.editSuggestion,
        context: data.context,
        fallback: data.fallback,
        geminiAvailable: data.geminiAvailable,
        geminiError: data.geminiError,
        debug: data.debug,
        needsMoreInfo: data.needsMoreInfo // THÊM: flag cần thêm thông tin
      };

      setMessages(prev => [...prev, aiMessage]);
      
      // THÊM: Xử lý delete intent
      if (data.deleteSuggestion) {
        const found = Array.isArray(data.deleteSuggestion.foundTransactions) ? data.deleteSuggestion.foundTransactions : [];
        
        console.log('🗑️ Delete suggestion received:', {
          foundCount: found.length,
          multipleMatches: data.deleteSuggestion.multipleMatches,
          transactions: found
        });
        
        const normalizedDelete = {
          ...data.deleteSuggestion,
          multipleMatches: found.length > 1
        };
        
        setDeleteSuggestion(normalizedDelete);
        setShowDeleteModal(true);
        
        // Tự động chọn nếu chỉ có 1 kết quả
        if (found.length === 1) {
          console.log('✅ Auto-selecting single transaction to delete');
          selectTransactionToDelete(found[0]);
        }
      }

      // THÊM: Xử lý edit intent
      if (data.editSuggestion) {
        const found = Array.isArray(data.editSuggestion.foundTransactions) ? data.editSuggestion.foundTransactions : [];
        
        console.log('📝 Edit suggestion received:', {
          foundCount: found.length,
          multipleMatches: data.editSuggestion.multipleMatches,
          transactions: found
        });
        
        // SỬA: Normalize multipleMatches dựa vào số lượng thực tế
        const normalizedEdit = {
          ...data.editSuggestion,
          multipleMatches: found.length > 1 // Force recalculate
        };
        
        setEditSuggestion(normalizedEdit);
        setShowEditModal(true);
        
        // SỬA: Tự động chọn nếu CHỈ có 1 kết quả
        if (found.length === 1) {
          console.log('✅ Auto-selecting single transaction');
          selectTransactionToEdit(found[0]);
        }
      }

      // THÊM: Xử lý pending transaction
      if (data.needsMoreInfo && data.pendingTransaction) {
        setPendingTransaction(data.pendingTransaction);
        console.log('⏳ Waiting for more info:', data.pendingTransaction);
      } else if (data.transactionSuggestion && data.transactionSuggestion.confidence > 0.6) {
        // Reset pending nếu đã có đủ thông tin
        setPendingTransaction(null);
        
        setSuggestedTransaction(data.transactionSuggestion);
        // SỬA: Sử dụng originalMessage đã được set ở trên (có thể bao gồm cả pending context)
        
        // Reset selected wallet về ví đầu tiên
        if (wallets.length > 0) {
          setSelectedWalletId(wallets[0]._id);
          // THÊM: Phân tích danh mục với full context (bao gồm cả pending transaction nếu có)
          const contextForCategory = originalMessage || userMessage.text;
          await analyzeCategoryForWallet(wallets[0]._id, contextForCategory);
        }
        
        setShowTransactionModal(true);
      } else {
        // Reset pending nếu không còn tạo giao dịch
        setPendingTransaction(null);
      }
      
      // Cập nhật history với response
      setConversationHistory(prev => [
        ...prev,
        { role: 'assistant', content: data.reply }
      ].slice(-10));

    } catch (error) {
      console.error('❌ AI Error:', error);
      
      // Enhanced error handling
      let errorMessage = '😅 **Xin lỗi, tôi đang gặp sự cố kỹ thuật.**';
      
      if (error.name === 'AbortError') {
        errorMessage += '\n\n⏱️ **Timeout:** AI mất quá nhiều thời gian để phản hồi (>25s).';
      } else if (error.message.includes('HTTP')) {
        errorMessage += '\n\n🌐 **Lỗi kết nối:** Không thể kết nối đến server AI.';
      } else {
        errorMessage += '\n\n⚠️ **Lỗi hệ thống:** Dịch vụ AI tạm thời gián đoạn.';
      }
      
      errorMessage += '\n\n💡 **Bạn có thể:**\n• Kiểm tra kết nối mạng\n• Thử lại sau vài giây\n• Sử dụng các tính năng khác của ứng dụng\n\n🙏 Cảm ơn bạn đã thông cảm!';
      
      const fallbackMessage = {
        id: Date.now() + 1,
        text: errorMessage,
        sender: 'ai',
        timestamp: new Date(),
        error: true,
        fallback: true,
        geminiAvailable: false
      };
      
      setMessages(prev => [...prev, fallbackMessage]);
      setGeminiStatus(false);
    } finally {
      setIsTyping(false);
    }
  };

  // THÊM: Function để tạo giao dịch từ suggestion với ví đã chọn
  const createTransactionFromSuggestion = async () => {
    if (!suggestedTransaction) return;
    
    // Validate ví đã được chọn
    if (!selectedWalletId) {
      showNotification('Vui lòng chọn ví', 'error');
      return;
    }
    
    setCreatingTransaction(true);
    try {
      const response = await fetch(`${API_BASE}/api/ai/create-transaction`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          type: suggestedTransaction.type,
          amount: suggestedTransaction.amount,
          description: suggestedTransaction.description, // SỬA: Vẫn gọi là description ở frontend, backend sẽ map sang title
          categoryId: suggestedTransaction.categoryId,
          walletId: selectedWalletId
        })
      });

      if (!response.ok) {
        throw new Error('Không thể tạo giao dịch');
      }

      const result = await response.json();
      
      // Tìm tên ví đã chọn
      const selectedWallet = wallets.find(w => w._id === selectedWalletId);
      
      // SỬA: Hiển thị title thay vì description
      const successMessage = {
        id: Date.now() + 2,
        text: `✅ **Đã tạo giao dịch thành công!**\n\n📝 ${result.transaction.title}\n💰 ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(result.transaction.amount)}\n📊 ${suggestedTransaction.categoryName || 'Không có danh mục'}\n💼 ${selectedWallet?.name || 'Ví'}\n\n${suggestedTransaction.type === 'expense' ? '💸 Chi tiêu' : '💰 Thu nhập'} đã được ghi nhận.`,
        sender: 'ai',
        timestamp: new Date(),
        success: true
      };
      
      setMessages(prev => [...prev, successMessage]);

      // THÊM: Persona follow-up
      const personaMsg = buildPersonaComment(persona, 'create', {
        amount: result.transaction.amount,
        description: result.transaction.title
      });
      if (personaMsg) {
        setMessages(prev => [...prev, {
          id: Date.now() + 3,
          text: personaMsg,
          sender: 'ai',
          timestamp: new Date()
        }]);
      }
      
      // Đóng modal
      setShowTransactionModal(false);
      setSuggestedTransaction(null);
      setSelectedWalletId('');
      
      // Show notification
      alert('✅ Đã tạo giao dịch thành công!');
      
    } catch (error) {
      console.error('Error creating transaction:', error);
      showNotification(error.message || 'Không thể tạo giao dịch', 'error');
    } finally {
      setCreatingTransaction(false);
    }
  };

  // THÊM: Function chọn giao dịch để sửa
  const selectTransactionToEdit = (tx) => {
    setSelectedTransactionToEdit(tx);
    setEditForm({
      amount: editSuggestion.updates.amount || tx.amount || '',
      description: editSuggestion.updates.description || tx.description || '',
      categoryId: editSuggestion.updates.categoryId || '',
      date: editSuggestion.updates.date || tx.date || ''
    });
  };

  // THÊM: Function submit edit
  const submitEditTransaction = async () => {
    if (!selectedTransactionToEdit) return;
    
    setEditingSaving(true);
    try {
      const updates = {};
      
      // SỬA: Xử lý số tiền chính xác hơn, hỗ trợ số thập phân
      if (editForm.amount && editForm.amount.toString().trim() !== '') {
        // SỬA: Không loại bỏ dấu chấm để tránh hiểu nhầm "39.998" thành 39998
        const cleanedAmount = editForm.amount.toString();
        const amountValue = parseFloat(cleanedAmount);
        if (isNaN(amountValue) || amountValue < 0) {
          alert('❌ Số tiền không hợp lệ');
          setEditingSaving(false);
          return;
        }
        // Làm tròn về số nguyên
        updates.amount = Math.round(amountValue);
        console.log('💰 Frontend amount processing:', {
          input: editForm.amount,
          cleaned: cleanedAmount,
          parsed: amountValue,
          rounded: updates.amount
        });
      }
      
      if (editForm.description && editForm.description.trim() !== '') {
        updates.description = editForm.description.trim();
      }
      
      if (editForm.categoryId) {
        updates.categoryId = editForm.categoryId;
      }
      
      if (editForm.date) {
        updates.date = editForm.date;
      }

      console.log('📤 Sending updates:', updates);

      const response = await fetch(`${API_BASE}/api/ai/edit-transaction`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          transactionId: selectedTransactionToEdit.id,
          updates: updates
        })
      });

      if (!response.ok) {
        throw new Error('Không thể cập nhật giao dịch');
      }

      const result = await response.json();
      
      console.log('✅ Edit result:', result);
      
      // SỬA: Hiển thị title
      const successMessage = {
        id: Date.now() + 2,
        text: `✅ **Đã cập nhật giao dịch thành công!**\n\n📝 ${result.transaction.title}\n💰 ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(result.transaction.amount)}\n📊 ${result.transaction.category?.name || 'Không có danh mục'}\n💼 ${result.transaction.wallet?.name}\n\n✏️ Giao dịch đã được cập nhật.`,
        sender: 'ai',
        timestamp: new Date(),
        success: true
      };
      
      setMessages(prev => [...prev, successMessage]);

      // THÊM: Persona follow-up cho edit
      const personaMsg = buildPersonaComment(persona, 'edit', {
        amount: result.transaction.amount,
        description: result.transaction.title
      });
      if (personaMsg) {
        setMessages(prev => [...prev, {
          id: Date.now() + 3,
          text: personaMsg,
          sender: 'ai',
          timestamp: new Date()
        }]);
      }
      
      // Đóng modal
      setShowEditModal(false);
      setEditSuggestion(null);
      setSelectedTransactionToEdit(null);
      
      alert('✅ Đã cập nhật giao dịch thành công!');
      
    } catch (error) {
      console.error('Error editing transaction:', error);
      alert('❌ Không thể cập nhật giao dịch: ' + error.message);
    } finally {
      setEditingSaving(false);
    }
  };

  // THÊM: Function chọn giao dịch để xóa
  const selectTransactionToDelete = (tx) => {
    setSelectedTransactionToDelete(tx);
  };

  // THÊM: Function submit delete
  const submitDeleteTransaction = async () => {
    if (!selectedTransactionToDelete) return;
    
    setDeletingSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/ai/delete-transaction`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          transactionId: selectedTransactionToDelete.id
        })
      });

      if (!response.ok) {
        throw new Error('Không thể xóa giao dịch');
      }

      const result = await response.json();
      
      // Hiển thị thông báo thành công
      const successMessage = {
        id: Date.now() + 2,
        text: `✅ **Đã xóa giao dịch thành công!**\n\n📝 ${result.deletedTransaction.title || result.deletedTransaction.description}\n💰 ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(result.deletedTransaction.amount)}\n💼 ${result.deletedTransaction.walletName}\n\n🔄 **Đã hoàn tiền vào ví**\n💳 Số dư mới: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(result.newWalletBalance)}`,
        sender: 'ai',
        timestamp: new Date(),
        success: true
      };
      
      setMessages(prev => [...prev, successMessage]);

      // THÊM: Persona follow-up cho delete
      const personaMsg = buildPersonaComment(persona, 'delete', {
        amount: result.deletedTransaction.amount,
        description: result.deletedTransaction.title || result.deletedTransaction.description
      });
      if (personaMsg) {
        setMessages(prev => [...prev, {
          id: Date.now() + 3,
          text: personaMsg,
          sender: 'ai',
          timestamp: new Date()
        }]);
      }
      
      // Đóng modal
      setShowDeleteModal(false);
      setDeleteSuggestion(null);
      setSelectedTransactionToDelete(null);
      
      alert('✅ Đã xóa giao dịch và hoàn tiền thành công!');
      
    } catch (error) {
      console.error('Error deleting transaction:', error);
      alert('❌ Không thể xóa giao dịch: ' + error.message);
    } finally {
      setDeletingSaving(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Enhanced quick actions với Gemini context
  const quickActions = [
    { text: '📊 Phân tích tình hình tài chính của tôi', icon: '📊' },
    { text: '💰 Làm sao để tiết kiệm hiệu quả?', icon: '💰' },
    { text: '💡 Tư vấn đầu tư phù hợp với tôi', icon: '💡' },
    { text: '📈 Đánh giá xu hướng chi tiêu gần đây', icon: '📈' }
  ];

  const handleQuickAction = (action) => {
    setInput(action.text);
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // THÊM: Fetch danh sách ví của user
  const fetchWallets = async () => {
    setLoadingWallets(true);
    try {
      const response = await fetch(`${API_BASE}/api/wallets`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setWallets(data);
        
        // Tự động chọn ví đầu tiên nếu có
        if (data.length > 0 && !selectedWalletId) {
          setSelectedWalletId(data[0]._id);
        }
      }
    } catch (error) {
      console.error('Error fetching wallets:', error);
    } finally {
      setLoadingWallets(false);
    }
  };

  // THÊM: Fetch danh mục của ví khi chọn ví
  const fetchWalletCategories = async (walletId) => {
    if (!walletId || !token) return;
    
    setLoadingCategories(true);
    try {
      // Lấy thông tin ví với danh mục đã populate
      const response = await fetch(`${API_BASE}/api/wallets/${walletId}`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      if (response.ok) {
        const wallet = await response.json();
        
        // Lấy danh mục từ ví
        const categories = wallet.categories || [];
        
        // Thêm danh mục mặc định
        const defaultCategoriesRes = await fetch(`${API_BASE}/api/categories?isDefault=true`, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          }
        });
        
        if (defaultCategoriesRes.ok) {
          const defaultCategories = await defaultCategoriesRes.json();
          
          // Merge và loại bỏ duplicate
          const allCategories = [...defaultCategories, ...categories];
          const uniqueCategories = allCategories.filter((cat, index, self) =>
            index === self.findIndex((c) => String(c._id) === String(cat._id))
          );
          
          setWalletCategories(uniqueCategories);
        } else {
          setWalletCategories(categories);
        }
      }
    } catch (error) {
      console.error('Error fetching wallet categories:', error);
      setWalletCategories([]);
    } finally {
      setLoadingCategories(false);
    }
  };

  // THÊM: Function phân tích danh mục cho ví đã chọn
  const analyzeCategoryForWallet = async (walletId, message) => {
    if (!walletId || !message) return;
    
    setAnalyzingCategory(true);
    
    try {
      const response = await fetch(`${API_BASE}/api/ai/analyze-category-for-wallet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          message: message,
          walletId: walletId
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('📊 Category analysis result:', result);
        
        // Cập nhật suggested transaction với category được phân tích
        setSuggestedTransaction(prev => ({
          ...prev,
          categoryId: result.categoryId,
          categoryName: result.categoryName
        }));
      } else {
        console.error('Failed to analyze category for wallet');
      }
    } catch (error) {
      console.error('Error analyzing category:', error);
    } finally {
      setAnalyzingCategory(false);
    }
  };

  // Load wallets khi component mount
  useEffect(() => {
    if (token) {
      fetchWallets();
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // THÊM: useEffect để load danh mục khi chọn ví
  useEffect(() => {
    if (selectedWalletId) {
      fetchWalletCategories(selectedWalletId);
      
      // THÊM: Phân tích lại danh mục khi đổi ví (nếu đang trong modal tạo giao dịch)
      if (showTransactionModal && originalMessage) {
        analyzeCategoryForWallet(selectedWalletId, originalMessage);
      }
    } else {
      setWalletCategories([]);
    }
  }, [selectedWalletId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Enhanced AI Button với Gemini branding */}
      <button
        className="ai-button"
        onClick={toggleModal}
        title="Trợ lý AI Gemini"
        aria-label="Mở Trợ lý AI Gemini"
      >
        <span className="ai-button-inner">
          <span className="ai-icon">
            <i className="fas fa-robot"></i>
          </span>
          <span className="ai-label">Gemini</span>
          <span className={`ai-status-indicator ${geminiStatus ? 'online' : 'offline'}`}></span>
        </span>
      </button>

      {/* Enhanced AI Modal */}
      {isOpen && (
        <div className="ai-modal-overlay" onClick={toggleModal}>
          <div className="ai-modal ai-modal-enhanced" onClick={(e) => e.stopPropagation()}>
            <div className="ai-modal-header">
              <div className="ai-header-info">
                <div className="ai-avatar">
                  <i className="fas fa-robot"></i>
                </div>
                <div className="ai-header-text">
                  <h3>Gemini AI Assistant</h3>
                  <div className="ai-status">
                    <span className={`ai-status-dot ${geminiStatus ? 'online' : 'offline'}`}></span>
                    {geminiStatus ? 'Đang hoạt động với Gemini' : 'Chế độ dự phòng'}
                  </div>
                  {/* THÊM: Persona selector */}
                  <div className="ai-persona-selector" role="group" aria-label="Chọn tính cách chatbot">
                    {personaOptions.map(opt => (
                      <button
                        key={opt.key}
                        className={`ai-persona-pill ${persona === opt.key ? 'active' : ''}`}
                        onClick={() => setPersona(opt.key)}
                        type="button"
                        title={`Chọn phong cách: ${opt.label}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <button className="ai-close-btn" onClick={toggleModal} aria-label="Đóng">
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="ai-chat-container">
              <div className="ai-messages">
                {messages.map(msg => (
                  <div key={msg.id} className={`ai-message ${msg.sender}`}>
                    <div className="ai-message-wrapper">
                      {msg.sender === 'ai' && (
                        <div className="ai-message-avatar">
                          <i className="fas fa-robot"></i>
                        </div>
                      )}
                      <div className="ai-message-content">
                        <div className={`ai-message-bubble ${msg.error ? 'error' : ''} ${msg.fallback ? 'fallback' : ''}`}>
                          {msg.text}
                          {msg.fallback && !msg.error && (
                            <div className="ai-fallback-notice">
                              <i className="fas fa-robot"></i>
                              {msg.aiMode || 'Advanced Fallback AI'} - Phân tích dữ liệu thực tế
                            </div>
                          )}
                          {msg.geminiAvailable && !msg.fallback && (
                            <div className="ai-gemini-badge">
                              <i className="fas fa-sparkles"></i>
                              Powered by Gemini AI
                            </div>
                          )}
                        </div>
                        <div className="ai-message-time">
                          {formatTime(msg.timestamp)}
                        </div>
                        {msg.actionSuggestion?.suggested && (
                          <div className="ai-action-suggestion">
                            <div className="ai-suggestion-title">
                              <i className="fas fa-lightbulb"></i>
                              Gợi ý hành động
                            </div>
                            <button className="ai-suggestion-btn">
                              {msg.actionSuggestion.type === 'create_transaction' ? '➕ Tạo giao dịch' : '📊 Xem thống kê'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                
                {isTyping && (
                  <div className="ai-message ai">
                    <div className="ai-message-wrapper">
                      <div className="ai-message-avatar">
                        <i className="fas fa-robot"></i>
                      </div>
                      <div className="ai-message-content">
                        <div className="ai-typing-indicator">
                          <div className="ai-typing-dots">
                            <span></span>
                            <span></span>
                            <span></span>
                          </div>
                          <span className="ai-typing-text">
                            {geminiStatus ? 'Gemini AI đang suy nghĩ...' : 'Advanced AI đang phân tích...'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {/* FIX: Remove extra div, just use ref */}
                <div ref={messagesEndRef} style={{ height: 0, margin: 0, padding: 0 }} />
              </div>

              {/* Quick Actions */}
              {messages.length <= 1 && (
                <div className="ai-quick-actions">
                  <div className="ai-quick-title">💡 Câu hỏi gợi ý cho Gemini AI:</div>
                  <div className="ai-quick-buttons">
                    {quickActions.map((action, index) => (
                      <button
                        key={index}
                        className="ai-quick-btn"
                        onClick={() => handleQuickAction(action)}
                      >
                        <span className="ai-quick-icon">{action.icon}</span>
                        <span className="ai-quick-text">{action.text.replace(action.icon + ' ', '')}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="ai-input-container">
                <div className="ai-input-wrapper">
                  <textarea
                    placeholder={geminiStatus ? "Hỏi Gemini AI về tài chính, đầu tư, tiết kiệm..." : "Chat với trợ lý tài chính..."}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    className="ai-input"
                    rows={1}
                    disabled={isTyping}
                    style={{ margin: 0, padding: '4px 0' }} // FIX: Inline style to ensure no extra space
                  />
                  <button 
                    onClick={sendMessage} 
                    className="ai-send-btn"
                    disabled={!input.trim() || isTyping}
                  >
                    {isTyping ? (
                      <i className="fas fa-spinner fa-spin"></i>
                    ) : (
                      <i className="fas fa-paper-plane"></i>
                    )}
                  </button>
                </div>
                <div className="ai-input-footer" style={{ margin: '8px 0 0 0' }}> {/* FIX: Explicit margin */}
                  <span className="ai-powered-by">
                    <i className="fas fa-bolt"></i>
                    {geminiStatus ? 'Powered by Google Gemini ⚡' : 'Powered by Advanced Fallback AI 🤖'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* THÊM: Edit Transaction Modal */}
      {showEditModal && editSuggestion && (
        <div className="ai-modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="ai-modal ai-transaction-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ai-modal-header">
              <div className="ai-header-info">
                <div className="ai-avatar">
                  <i className="fas fa-edit"></i>
                </div>
                <div className="ai-header-text">
                  <h3>Sửa giao dịch</h3>
                  <div className="ai-status">
                    <span className="ai-status-dot online"></span>
                    {/* SỬA: Check số lượng thực tế */}
                    {editSuggestion.foundTransactions?.length > 1 && !selectedTransactionToEdit 
                      ? 'Chọn giao dịch cần sửa' 
                      : 'Xác nhận thông tin cập nhật'}
                  </div>
                </div>
              </div>
              <button className="ai-close-btn" onClick={() => setShowEditModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="ai-transaction-content">
              {/* SỬA: Hiển thị danh sách chỉ khi có >1 và chưa chọn */}
              {editSuggestion.foundTransactions?.length > 1 && !selectedTransactionToEdit && (
                <div className="ai-transaction-select">
                  <div className="ai-select-header">
                    <i className="fas fa-list"></i>
                    <h4>Tìm thấy {editSuggestion.foundTransactions.length} giao dịch có tên tương tự</h4>
                    <p>Vui lòng chọn giao dịch bạn muốn sửa:</p>
                  </div>
                  
                  <div className="ai-transaction-list">
                    {editSuggestion.foundTransactions.map((tx, index) => (
                      <div 
                        key={index} 
                        className="ai-transaction-option"
                        onClick={() => selectTransactionToEdit(tx)}
                      >
                        <div className="ai-option-header">
                          <span className="ai-option-number">#{index + 1}</span>
                          <span className="ai-option-title">{tx.description}</span>
                        </div>
                        <div className="ai-option-details">
                          <span className="ai-option-amount">
                            {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount)}
                          </span>
                          <span className="ai-option-date">
                            <i className="fas fa-calendar"></i>
                            {new Date(tx.date).toLocaleDateString('vi-VN')}
                          </span>
                          <span className="ai-option-wallet">
                            <i className="fas fa-wallet"></i>
                            {tx.wallet}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Form sửa - hiển thị khi đã chọn hoặc chỉ có 1 kết quả */}
              {selectedTransactionToEdit && (
                <div className="ai-edit-form">
                  <div className="ai-edit-current">
                    <h4>
                      <i className="fas fa-info-circle"></i>
                      Thông tin hiện tại
                    </h4>
                    <div className="ai-current-info">
                      <div className="ai-info-row">
                        <span className="ai-info-label">Mô tả:</span>
                        <span className="ai-info-value">{selectedTransactionToEdit.description}</span>
                      </div>
                      <div className="ai-info-row">
                        <span className="ai-info-label">Số tiền:</span>
                        <span className="ai-info-value">
                          {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(selectedTransactionToEdit.amount)}
                        </span>
                      </div>
                      <div className="ai-info-row">
                        <span className="ai-info-label">Ngày:</span>
                        <span className="ai-info-value">
                          {new Date(selectedTransactionToEdit.date).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                      {selectedTransactionToEdit.category && (
                        <div className="ai-info-row">
                          <span className="ai-info-label">Danh mục:</span>
                          <span className="ai-info-value">{selectedTransactionToEdit.category}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="ai-edit-new">
                    <h4>
                      <i className="fas fa-edit"></i>
                      Thông tin mới
                    </h4>
                    
                    <div className="ai-form-group">
                      <label>Mô tả</label>
                      <input
                        type="text"
                        value={editForm.description}
                        onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Nhập mô tả mới (để trống nếu không đổi)"
                      />
                    </div>

                    <div className="ai-form-group">
                      <label>Số tiền (VND)</label>
                      <input
                        type="number"
                        value={editForm.amount}
                        onChange={(e) => setEditForm(prev => ({ ...prev, amount: e.target.value }))}
                        placeholder="Nhập số tiền mới (để trống nếu không đổi)"
                      />
                    </div>

                    <div className="ai-form-group">
                      <label>Ngày</label>
                      <input
                        type="date"
                        value={editForm.date}
                        onChange={(e) => setEditForm(prev => ({ ...prev, date: e.target.value }))}
                      />
                    </div>
                  </div>

                  {editSuggestion.reasoning && (
                    <div className="ai-reasoning">
                      <i className="fas fa-lightbulb"></i>
                      <span>{editSuggestion.reasoning}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Không có kết quả */}
              {(!editSuggestion.foundTransactions || editSuggestion.foundTransactions.length === 0) && !selectedTransactionToEdit && (
                <div className="ai-transaction-empty">
                  <i className="fas fa-search"></i>
                  <p>Không tìm thấy giao dịch có tên chứa từ khóa của bạn.</p>
                  <small>Hãy thử với tên giao dịch chính xác hơn.</small>
                </div>
              )}

              <div className="ai-transaction-actions">
                <button 
                  className="ai-btn secondary"
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedTransactionToEdit(null);
                  }}
                  disabled={editingSaving}
                >
                  <i className="fas fa-times"></i>
                  {selectedTransactionToEdit && editSuggestion.multipleMatches ? 'Chọn lại' : 'Hủy'}
                </button>
                {selectedTransactionToEdit && (
                  <button 
                    className="ai-btn primary"
                    onClick={submitEditTransaction}
                    disabled={editingSaving}
                  >
                    {editingSaving ? (
                      <>
                        <i className="fas fa-spinner fa-spin"></i>
                        Đang cập nhật...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-check"></i>
                        Xác nhận cập nhật
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* THÊM: Delete Transaction Modal */}
      {showDeleteModal && deleteSuggestion && (
        <div className="ai-modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="ai-modal ai-transaction-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ai-modal-header">
              <div className="ai-header-info">
                <div className="ai-avatar">
                  <i className="fas fa-trash-alt"></i>
                </div>
                <div className="ai-header-text">
                  <h3>Xóa giao dịch</h3>
                  <div className="ai-status">
                    <span className="ai-status-dot online"></span>
                    {deleteSuggestion.foundTransactions?.length > 1 && !selectedTransactionToDelete 
                      ? 'Chọn giao dịch cần xóa' 
                      : 'Xác nhận xóa giao dịch'}
                  </div>
                </div>
              </div>
              <button className="ai-close-btn" onClick={() => setShowDeleteModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="ai-transaction-content">
              {/* Hiển thị danh sách nếu có >1 và chưa chọn */}
              {deleteSuggestion.foundTransactions?.length > 1 && !selectedTransactionToDelete && (
                <div className="ai-transaction-select">
                  <div className="ai-select-header">
                    <i className="fas fa-list"></i>
                    <h4>Tìm thấy {deleteSuggestion.foundTransactions.length} giao dịch có tên tương tự</h4>
                    <p>Vui lòng chọn giao dịch bạn muốn xóa:</p>
                  </div>
                  
                  <div className="ai-transaction-list">
                    {deleteSuggestion.foundTransactions.map((tx, index) => (
                      <div 
                        key={index} 
                        className="ai-transaction-option"
                        onClick={() => selectTransactionToDelete(tx)}
                      >
                        <div className="ai-option-header">
                          <span className="ai-option-number">#{index + 1}</span>
                          <span className="ai-option-title">{tx.description}</span>
                        </div>
                        <div className="ai-option-details">
                          <span className="ai-option-amount">
                            {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount)}
                          </span>
                          <span className="ai-option-date">
                            <i className="fas fa-calendar"></i>
                            {new Date(tx.date).toLocaleDateString('vi-VN')}
                          </span>
                          <span className="ai-option-wallet">
                            <i className="fas fa-wallet"></i>
                            {tx.wallet}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Form xác nhận xóa */}
              {selectedTransactionToDelete && (
                <div className="ai-delete-confirm">
                  <div className="ai-warning-box">
                    <i className="fas fa-exclamation-triangle"></i>
                    <h4>⚠️ Cảnh báo: Bạn sắp xóa giao dịch này</h4>
                  </div>

                  <div className="ai-delete-info">
                    <h4>
                      <i className="fas fa-info-circle"></i>
                      Thông tin giao dịch sẽ bị xóa
                    </h4>
                    <div className="ai-current-info">
                      <div className="ai-info-row">
                        <span className="ai-info-label">Mô tả:</span>
                        <span className="ai-info-value">{selectedTransactionToDelete.description}</span>
                      </div>
                      <div className="ai-info-row">
                        <span className="ai-info-label">Số tiền:</span>
                        <span className="ai-info-value">
                          {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(selectedTransactionToDelete.amount)}
                        </span>
                      </div>
                      <div className="ai-info-row">
                        <span className="ai-info-label">Ngày:</span>
                        <span className="ai-info-value">
                          {new Date(selectedTransactionToDelete.date).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                      <div className="ai-info-row">
                        <span className="ai-info-label">Ví:</span>
                        <span className="ai-info-value">{selectedTransactionToDelete.wallet}</span>
                      </div>
                      {selectedTransactionToDelete.category && (
                        <div className="ai-info-row">
                          <span className="ai-info-label">Danh mục:</span>
                          <span className="ai-info-value">{selectedTransactionToDelete.category}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="ai-refund-notice">
                    <i className="fas fa-undo"></i>
                    <span><strong>Hoàn tiền:</strong> Số tiền sẽ được hoàn trả về ví sau khi xóa</span>
                  </div>

                  {deleteSuggestion.reasoning && (
                    <div className="ai-reasoning">
                      <i className="fas fa-lightbulb"></i>
                      <span>{deleteSuggestion.reasoning}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Không có kết quả */}
              {(!deleteSuggestion.foundTransactions || deleteSuggestion.foundTransactions.length === 0) && !selectedTransactionToDelete && (
                <div className="ai-transaction-empty">
                  <i className="fas fa-search"></i>
                  <p>Không tìm thấy giao dịch có tên chứa từ khóa của bạn.</p>
                  <small>Hãy thử với tên giao dịch chính xác hơn.</small>
                </div>
              )}

              <div className="ai-transaction-actions">
                <button 
                  className="ai-btn secondary"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setSelectedTransactionToDelete(null);
                  }}
                  disabled={deletingSaving}
                >
                  <i className="fas fa-times"></i>
                  {selectedTransactionToDelete && deleteSuggestion.multipleMatches ? 'Chọn lại' : 'Hủy'}
                </button>
                {selectedTransactionToDelete && (
                  <button 
                    className="ai-btn danger"
                    onClick={submitDeleteTransaction}
                    disabled={deletingSaving}
                  >
                    {deletingSaving ? (
                      <>
                        <i className="fas fa-spinner fa-spin"></i>
                        Đang xóa...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-trash-alt"></i>
                        Xác nhận xóa
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Transaction Modal */}
      {showEditModal && editSuggestion && (
        <div className="ai-modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="ai-modal ai-transaction-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ai-modal-header">
              <div className="ai-header-info">
                <div className="ai-avatar">
                  <i className="fas fa-edit"></i>
                </div>
                <div className="ai-header-text">
                  <h3>Sửa giao dịch</h3>
                  <div className="ai-status">
                    <span className="ai-status-dot online"></span>
                    {/* SỬA: Check số lượng thực tế */}
                    {editSuggestion.foundTransactions?.length > 1 && !selectedTransactionToEdit 
                      ? 'Chọn giao dịch cần sửa' 
                      : 'Xác nhận thông tin cập nhật'}
                  </div>
                </div>
              </div>
              <button className="ai-close-btn" onClick={() => setShowEditModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="ai-transaction-content">
              {/* SỬA: Hiển thị danh sách chỉ khi có >1 và chưa chọn */}
              {editSuggestion.foundTransactions?.length > 1 && !selectedTransactionToEdit && (
                <div className="ai-transaction-select">
                  <div className="ai-select-header">
                    <i className="fas fa-list"></i>
                    <h4>Tìm thấy {editSuggestion.foundTransactions.length} giao dịch có tên tương tự</h4>
                    <p>Vui lòng chọn giao dịch bạn muốn sửa:</p>
                  </div>
                  
                  <div className="ai-transaction-list">
                    {editSuggestion.foundTransactions.map((tx, index) => (
                      <div 
                        key={index} 
                        className="ai-transaction-option"
                        onClick={() => selectTransactionToEdit(tx)}
                      >
                        <div className="ai-option-header">
                          <span className="ai-option-number">#{index + 1}</span>
                          <span className="ai-option-title">{tx.description}</span>
                        </div>
                        <div className="ai-option-details">
                          <span className="ai-option-amount">
                            {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount)}
                          </span>
                          <span className="ai-option-date">
                            <i className="fas fa-calendar"></i>
                            {new Date(tx.date).toLocaleDateString('vi-VN')}
                          </span>
                          <span className="ai-option-wallet">
                            <i className="fas fa-wallet"></i>
                            {tx.wallet}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Form sửa - hiển thị khi đã chọn hoặc chỉ có 1 kết quả */}
              {selectedTransactionToEdit && (
                <div className="ai-edit-form">
                  <div className="ai-edit-current">
                    <h4>
                      <i className="fas fa-info-circle"></i>
                      Thông tin hiện tại
                    </h4>
                    <div className="ai-current-info">
                      <div className="ai-info-row">
                        <span className="ai-info-label">Mô tả:</span>
                        <span className="ai-info-value">{selectedTransactionToEdit.description}</span>
                      </div>
                      <div className="ai-info-row">
                        <span className="ai-info-label">Số tiền:</span>
                        <span className="ai-info-value">
                          {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(selectedTransactionToEdit.amount)}
                        </span>
                      </div>
                      <div className="ai-info-row">
                        <span className="ai-info-label">Ngày:</span>
                        <span className="ai-info-value">
                          {new Date(selectedTransactionToEdit.date).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                      {selectedTransactionToEdit.category && (
                        <div className="ai-info-row">
                          <span className="ai-info-label">Danh mục:</span>
                          <span className="ai-info-value">{selectedTransactionToEdit.category}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="ai-edit-new">
                    <h4>
                      <i className="fas fa-edit"></i>
                      Thông tin mới
                    </h4>
                    
                    <div className="ai-form-group">
                      <label>Mô tả</label>
                      <input
                        type="text"
                        value={editForm.description}
                        onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Nhập mô tả mới (để trống nếu không đổi)"
                      />
                    </div>

                    <div className="ai-form-group">
                      <label>Số tiền (VND)</label>
                      <input
                        type="number"
                        value={editForm.amount}
                        onChange={(e) => setEditForm(prev => ({ ...prev, amount: e.target.value }))}
                        placeholder="Nhập số tiền mới (để trống nếu không đổi)"
                      />
                    </div>

                    <div className="ai-form-group">
                      <label>Ngày</label>
                      <input
                        type="date"
                        value={editForm.date}
                        onChange={(e) => setEditForm(prev => ({ ...prev, date: e.target.value }))}
                      />
                    </div>
                  </div>

                  {editSuggestion.reasoning && (
                    <div className="ai-reasoning">
                      <i className="fas fa-lightbulb"></i>
                      <span>{editSuggestion.reasoning}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Không có kết quả */}
              {(!editSuggestion.foundTransactions || editSuggestion.foundTransactions.length === 0) && !selectedTransactionToEdit && (
                <div className="ai-transaction-empty">
                  <i className="fas fa-search"></i>
                  <p>Không tìm thấy giao dịch có tên chứa từ khóa của bạn.</p>
                  <small>Hãy thử với tên giao dịch chính xác hơn.</small>
                </div>
              )}
              <div className="ai-transaction-actions">
                <button 
                  className="ai-btn secondary"
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedTransactionToEdit(null);
                  }}
                  disabled={editingSaving}
                >
                  <i className="fas fa-times"></i>
                  {selectedTransactionToEdit && editSuggestion.multipleMatches ? 'Chọn lại' : 'Hủy'}
                </button>
                {selectedTransactionToEdit && (
                  <button 
                    className="ai-btn primary"
                    onClick={submitEditTransaction}
                    disabled={editingSaving}
                  >
                    {editingSaving ? (
                      <>
                        <i className="fas fa-spinner fa-spin"></i>
                        Đang cập nhật...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-check"></i>
                        Xác nhận cập nhật
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Confirmation Modal - CẬP NHẬT */}
      {showTransactionModal && suggestedTransaction && (
        <div className="ai-modal-overlay" onClick={() => setShowTransactionModal(false)}>
          <div className="ai-modal ai-transaction-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ai-modal-header">
              <div className="ai-header-info">
                <div className="ai-avatar">
                  <i className="fas fa-money-bill-wave"></i>
                </div>
                <div className="ai-header-text">
                  <h3>Xác nhận tạo giao dịch</h3>
                  <div className="ai-status">
                    <span className="ai-status-dot online"></span>
                    AI đã phân tích ý định của bạn
                  </div>
                </div>
              </div>
              <button className="ai-close-btn" onClick={() => setShowTransactionModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="ai-transaction-content">
              <div className="ai-transaction-preview">
                <div className="ai-confidence-bar">
                  <div className="ai-confidence-label">
                    Độ tin cậy: {Math.round(suggestedTransaction.confidence * 100)}%
                  </div>
                  <div className="ai-confidence-progress">
                    <div 
                      className="ai-confidence-fill"
                      style={{ width: `${suggestedTransaction.confidence * 100}%` }}
                    ></div>
                  </div>
                </div>

                <div className="ai-transaction-details">
                  <div className="ai-detail-row">
                    <span className="ai-detail-label">
                      <i className="fas fa-exchange-alt"></i> Loại giao dịch
                    </span>
                    <span className={`ai-detail-value ${suggestedTransaction.type}`}>
                      {suggestedTransaction.type === 'expense' ? '💸 Chi tiêu' : '💰 Thu nhập'}
                    </span>
                  </div>

                  <div className="ai-detail-row">
                    <span className="ai-detail-label">
                      <i className="fas fa-coins"></i> Số tiền
                    </span>
                    <span className="ai-detail-value amount">
                      {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(suggestedTransaction.amount)}
                    </span>
                  </div>

                  <div className="ai-detail-row">
                    <span className="ai-detail-label">
                      <i className="fas fa-file-alt"></i> Mô tả
                    </span>
                    <span className="ai-detail-value">
                      {suggestedTransaction.description}
                    </span>
                  </div>

                  <div className="ai-detail-row">
                    <span className="ai-detail-label">
                      <i className="fas fa-tag"></i> Danh mục
                    </span>
                    <span className="ai-detail-value">
                      {suggestedTransaction.categoryName || 'Không có'}
                    </span>
                  </div>

                  {/* THÊM: Dropdown chọn ví */}
                  <div className="ai-detail-row ai-wallet-select-row">
                    <span className="ai-detail-label">
                      <i className="fas fa-wallet"></i> Chọn ví <span style={{ color: '#ef4444', fontWeight: 'bold' }}>*</span>
                    </span>
                    <select 
                      className="ai-wallet-select"
                      value={selectedWalletId}
                      onChange={(e) => setSelectedWalletId(e.target.value)}
                      disabled={loadingWallets}
                    >
                      <option value="">-- Chọn ví --</option>
                      {wallets.map(wallet => (
                        <option key={wallet._id} value={wallet._id}>
                          {wallet.name} ({new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(wallet.initialBalance || 0)})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* THÊM: Hiển thị danh mục của ví đã chọn */}
                  {selectedWalletId && (
                    <div className="ai-detail-row ai-category-select-row">
                      <span className="ai-detail-label">
                        <i className="fas fa-tag"></i> Danh mục
                      </span>
                      {loadingCategories || analyzingCategory ? (
                        <div className="ai-loading-inline">
                          <i className="fas fa-spinner fa-spin"></i> Đang phân tích danh mục cho ví này...
                        </div>
                      ) : (
                        <span className="ai-detail-value">
                          {(() => {
                            // Tìm danh mục được AI suggest TRONG ví đã chọn
                            const suggestedCat = walletCategories.find(
                              c => String(c._id) === String(suggestedTransaction.categoryId)
                            );
                            
                            if (suggestedCat) {
                              return `${suggestedCat.icon || '📝'} ${suggestedCat.name}`;
                            } else if (suggestedTransaction.categoryName) {
                              // AI suggest danh mục nhưng không có trong ví này
                              return (
                                <span style={{ color: '#f59e0b', fontSize: '13px' }}>
                                  <i className="fas fa-exclamation-triangle"></i> Không tìm thấy danh mục phù hợp trong ví này
                                </span>
                              );
                            } else {
                              return 'Không có danh mục';
                            }
                          })()}
                        </span>
                      )}
                    </div>
                  )}

                  {/* THÊM: Thông báo nếu danh mục không khớp */}
                  {selectedWalletId && !loadingCategories && !analyzingCategory && suggestedTransaction.categoryId && (
                    !walletCategories.some(c => String(c._id) === String(suggestedTransaction.categoryId)) && (
                      <div className="ai-category-warning">
                        <i className="fas fa-info-circle"></i>
                        <span>
                          Ví <strong>{wallets.find(w => w._id === selectedWalletId)?.name}</strong> không có danh mục phù hợp. 
                          Giao dịch sẽ được tạo không có danh mục.
                        </span>
                      </div>
                    )
                  )}
                </div>

                {suggestedTransaction.reasoning && (
                  <div className="ai-reasoning">
                    <i className="fas fa-lightbulb"></i>
                    <span>{suggestedTransaction.reasoning}</span>
                  </div>
                )}
              </div>

              <div className="ai-transaction-actions">
                <button 
                  className="ai-btn secondary"
                  onClick={() => {
                    setShowTransactionModal(false);
                    setSelectedWalletId('');
                    setWalletCategories([]);
                  }}
                  disabled={creatingTransaction}
                >
                  <i className="fas fa-times"></i>
                  Hủy
                </button>
                <button 
                  className="ai-btn primary"
                  onClick={createTransactionFromSuggestion}
                  disabled={creatingTransaction || !selectedWalletId}
                >
                  {creatingTransaction ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i>
                      Đang tạo...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-check"></i>
                      Xác nhận tạo giao dịch
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
