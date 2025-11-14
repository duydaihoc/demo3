import React, { useState, useEffect, useRef } from 'react';
import './AiAssistant.css';
import { showNotification } from '../utils/notify'; // THÊM: import showNotification

export default function AiAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { 
      id: 1, 
      text: '👋 Xin chào! Tôi là trợ lý tài chính AI.\n\n🤖 Tôi có thể giúp bạn:\n• 💰 Tạo giao dịch thu/chi\n• ✏️ Sửa giao dịch đã có\n• 🗑️ Xóa giao dịch\n• 📊 Phân tích chi tiêu\n• 💡 Tư vấn tài chính\n\nHãy thử hỏi tôi nhé!', 
      sender: 'ai',
      timestamp: new Date(),
      geminiAvailable: true
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

  // THÊM: State cho tính cách chatbot (persona)
  // 'balanced' -> neutral, 'friendly' -> friendly, 'aggressive' -> aggressive
  const [persona, setPersona] = useState('balanced');

  // THÊM: Helper format tin nhắn theo tính cách hiện tại
  // context: { action: 'create'|'edit'|'delete', transaction, previousAmount?, walletName?, categoryName?, type? }
  const formatByPersona = (text, context = {}) => {
    const base = String(text || '');
    const { action, transaction, previousAmount, walletName, categoryName, type } = context;

    const txType = (type || transaction?.type || '').toLowerCase();
    const amount = Number(transaction?.amount || 0);

    // THÊM: Lấy tên giao dịch và format số tiền cho câu nhận xét
    const txTitleRaw = (transaction?.title || transaction?.description || '').trim();
    const txTitle = txTitleRaw || (txType === 'income' ? 'khoản thu này' : 'khoản chi này');
    const formattedAmount = amount
      ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)
      : '';

    // THÊM: Phát hiện một số loại chi tiêu đặc biệt (ví dụ: thuốc lá)
    const lowerTitle = txTitleRaw.toLowerCase();
    const lowerCategory = String(categoryName || '').toLowerCase();
    const isSmokingExpense =
      txType === 'expense' &&
      (lowerTitle.includes('thuốc lá') ||
       lowerTitle.includes('thuoc la') ||
       lowerCategory.includes('thuốc lá') ||
       lowerCategory.includes('thuoc la'));

    // Helper chọn ngẫu nhiên 1 câu trong danh sách
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    let extraLine = '';

    if (persona === 'friendly') {
      // Mẹ hiền: nhẹ nhàng, an ủi, khích lệ
      if (action === 'create') {
        if (txType === 'income') {
          extraLine = pick([
            `Mẹ mừng cho con với "${txTitle}" ${formattedAmount ? `(${formattedAmount}) ` : ''}, có thu nhập thì nhớ trích ra một phần để tiết kiệm nha.`,
            `Khoản thu "${txTitle}" ${formattedAmount ? `(${formattedAmount}) ` : ''}là tín hiệu tốt, mình tranh thủ gom dần cho quỹ an toàn của con nhé.`
          ]);
        } else if (isSmokingExpense) {
          extraLine = pick([
            `"${txTitle}" ${formattedAmount ? `(${formattedAmount}) ` : ''}không tốt cho sức khỏe đâu con, nếu được thì mình giảm dần để vừa tiết kiệm tiền vừa tốt cho bản thân nha.`,
            `Mẹ biết đôi khi con cần "${txTitle}", nhưng thử nghĩ nếu bớt ${formattedAmount || 'một phần nhỏ'} mỗi tháng, sau này con sẽ có khoản tiền đẹp hơn nhiều đó.`
          ]);
        } else {
          if (amount >= 1000000) {
            extraLine = pick([
              `"${txTitle}" ${formattedAmount ? `(${formattedAmount}) ` : ''}là khoản chi hơi lớn, nhưng nếu thật sự cần thì mẹ vẫn ủng hộ, chỉ cần con bù lại bằng tiết kiệm chỗ khác.`,
              `Chi cho "${txTitle}" cũng được, nhưng mình cùng xem lại ngân sách để không bị thiếu hụt cuối tháng nha.`
            ]);
          } else {
            extraLine = pick([
              `Khoản "${txTitle}" ${formattedAmount ? `(${formattedAmount}) ` : ''}cũng nhỏ thôi, miễn con theo dõi đều thì mọi thứ vẫn trong tầm kiểm soát.`,
              `Những khoản như "${txTitle}" dù nhỏ nhưng tích lại cũng thành nhiều, mình để ý dần để tránh lặt vặt quá nhiều nha.`
            ]);
          }
        }
      } else if (action === 'edit') {
        const oldAmount = Number(previousAmount || 0);
        const diff = amount - oldAmount;
        if (txType === 'expense') {
          if (diff > 0) {
            extraLine = pick([
              'Con tăng thêm khoản chi, nhớ cân nhắc kỹ để không vượt quá khả năng của mình nha.',
              'Tăng chi cũng được, miễn là con vẫn nắm rõ mình đang tiêu vào đâu.'
            ]);
          } else if (diff < 0) {
            extraLine = pick([
              `Con giảm bớt cho "${txTitle}", đó là quyết định rất tốt, mẹ khen con đó.`,
              `Cắt bớt chi cho "${txTitle}" là bước nhỏ nhưng có ích, cứ giữ thói quen này nha.`
            ]);
          } else {
            extraLine = 'Mẹ thấy con chỉnh lại cho đúng là được, miễn sổ sách rõ ràng là tốt rồi.';
          }
        } else if (txType === 'income') {
          if (diff > 0) {
            extraLine = 'Thu nhập tăng thêm chút xíu cũng đáng mừng, nhớ ưu tiên phần cho tương lai của con.';
          } else if (diff < 0) {
            extraLine = `Thu nhập của "${txTitle}" giảm, mình càng phải cẩn thận hơn với chi tiêu, mẹ luôn ở đây hỗ trợ con cân đối.`;
          } else {
            extraLine = 'Mẹ thấy con chỉnh lại giao dịch cho đúng là tốt, thông tin rõ ràng thì mới quản lý được.';
          }
        }
      } else if (action === 'delete') {
        extraLine = pick([
          `Xóa "${txTitle}" rồi, coi như mình dọn lại sổ sách cho gọn gàng, con nhớ duy trì thói quen kiểm tra như vậy nha.`,
          `Mẹ đã giúp con chỉnh sổ bằng cách xóa "${txTitle}", từ giờ mình theo dõi kỹ hơn để đỡ nhầm lẫn.`
        ]);
      }

      return `😊 [Chế độ mẹ hiền]\n${base}${extraLine ? `\n\n${extraLine}` : ''}`;
    }

    if (persona === 'aggressive') {
      // Mẹ nghiêm: thẳng thắn, hơi gắt nhưng vẫn quan tâm
      if (action === 'create') {
        if (txType === 'income') {
          extraLine = pick([
            `"${txTitle}" ${formattedAmount ? `(${formattedAmount}) ` : ''}là tiền vào thì tốt, nhưng đừng nghĩ vậy mà xài thoải mái, phải có kỷ luật nghe chưa.`,
            `Có thêm khoản thu như "${txTitle}" mà không biết giữ thì cũng như nước đổ lá môn, nhớ khóa bớt mấy khoản chi vô lý lại.`
          ]);
        } else if (isSmokingExpense) {
          extraLine = pick([
            `Chi cho "${txTitle}" ${formattedAmount ? `(${formattedAmount}) ` : ''}vừa hại sức khỏe vừa tốn tiền, mẹ mong con suy nghĩ lại nghiêm túc đi.`,
            `Nếu con bớt "${txTitle}" mỗi tháng, ví tiền và lá phổi của con đều đỡ khổ hơn rất nhiều đấy.`
          ]);
        } else {
          if (amount >= 1000000) {
            extraLine = pick([
              `"${txTitle}" ${formattedAmount ? `(${formattedAmount}) ` : ''}là khoản chi nặng tay lắm đó, lần sau trước khi bấm chi nhớ tự hỏi có thật sự cần không.`,
              `Tiêu cho "${txTitle}" vậy là hơi bạo tay rồi, phải siết lại nếu không cuối tháng mệt lắm đó.`
            ]);
          } else {
            extraLine = pick([
              `Những khoản kiểu "${txTitle}" dù nhỏ nhưng cộng lại nhiều lần là to đấy, đừng chủ quan.`,
              'Tiêu lặt vặt nhiều là thói quen xấu, sửa dần đi con.'
            ]);
          }
        }
      } else if (action === 'edit') {
        const oldAmount = Number(previousAmount || 0);
        const diff = amount - oldAmount;
        if (txType === 'expense') {
          if (diff > 0) {
            extraLine = pick([
              'Tăng thêm chi tiêu à? Nhớ là ví không phải cái giếng không đáy đâu.',
              'Chi đã nhiều còn tăng thêm, coi chừng cuối tháng than không còn tiền đó.'
            ]);
          } else if (diff < 0) {
            extraLine = pick([
              'Giảm chi là quyết định đúng, mẹ muốn thấy con giữ được kỷ luật này lâu dài.',
              'Được, cắt bớt chi tiêu như vậy mới là hướng đi nghiêm túc.'
            ]);
          } else {
            extraLine = 'Chỉnh sửa mà số tiền y như cũ, lần sau nhớ xem kỹ trước khi lưu cho đỡ mất công.';
          }
        } else if (txType === 'income') {
          if (diff > 0) {
            extraLine = 'Thu nhập tăng thì càng phải tranh thủ xây quỹ dự phòng, đừng vung tay ngay lập tức.';
          } else if (diff < 0) {
            extraLine = 'Thu nhập giảm mà còn tiêu như cũ là toang, phải tự kìm mình lại đó.';
          } else {
            extraLine = 'Dữ liệu sửa cho đúng là tốt, nhưng mẹ vẫn muốn thấy kế hoạch rõ ràng hơn của con.';
          }
        }
      } else if (action === 'delete') {
        extraLine = pick([
          'Xóa rồi đó, nhưng đừng tạo lung tung rồi xóa hoài, như vậy rất khó kiểm soát.',
          'Lần này mẹ cho xóa, nhưng sau phải ghi chép cẩn thận hơn, không là loạn sổ sách.'
        ]);
      }

      return `⚠️ [Chế độ mẹ nghiêm]\n${base}${extraLine ? `\n\n${extraLine}` : ''}`;
    }

    // Cân bằng: giữ nguyên nội dung cơ bản
    return base;
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
          // THÊM: gửi persona lên backend
          persona:
            persona === 'friendly'
              ? 'friendly'
              : persona === 'aggressive'
              ? 'aggressive'
              : 'neutral'
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Network response was not ok`);
      }

      const data = await response.json();
      console.log('✅ AI Response:', data);
      
      setGeminiStatus(data.geminiAvailable);
      
      // SỬA: Đảm bảo reply luôn có nội dung
      const replyText = data.reply || 'Xin lỗi, tôi không thể xử lý yêu cầu này.';
      
      const aiMessage = {
        id: Date.now() + 1,
        text: replyText,
        sender: 'ai',
        timestamp: new Date(),
        actionSuggestion: data.actionSuggestion,
        transactionSuggestion: data.transactionSuggestion,
        editSuggestion: data.editSuggestion,
        context: data.context,
        fallback: data.fallback,
        geminiAvailable: data.geminiAvailable,
        geminiError: data.geminiError,
        needsMoreInfo: data.needsMoreInfo
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
      
      let errorMessage = '😅 Xin lỗi, tôi đang gặp sự cố.\n\n';
      
      if (error.name === 'AbortError') {
        errorMessage += '⏱️ Phản hồi quá lâu, vui lòng thử lại.';
      } else if (error.message.includes('HTTP')) {
        errorMessage += '🌐 Không thể kết nối server.';
      } else {
        errorMessage += '⚠️ Lỗi hệ thống tạm thời.';
      }
      
      errorMessage += '\n\n💡 Hãy thử lại hoặc dùng tính năng khác!';
      
      const fallbackMessage = {
        id: Date.now() + 1,
        text: errorMessage,
        sender: 'ai',
        timestamp: new Date(),
        error: true
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
      
      // SỬA: Hiển thị title thay vì description + áp dụng tính cách với context giao dịch
      const successMessage = {
        id: Date.now() + 2,
        text: formatByPersona(
          `✅ **Đã tạo giao dịch thành công!**\n\n📝 ${result.transaction.title}\n💰 ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(result.transaction.amount)}\n📊 ${suggestedTransaction.categoryName || 'Không có danh mục'}\n💼 ${selectedWallet?.name || 'Ví'}\n\n${suggestedTransaction.type === 'expense' ? '💸 Chi tiêu' : '💰 Thu nhập'} đã được ghi nhận.`,
          {
            action: 'create',
            transaction: result.transaction,
            walletName: selectedWallet?.name,
            categoryName: suggestedTransaction.categoryName,
            type: suggestedTransaction.type
          }
        ),
        sender: 'ai',
        timestamp: new Date(),
        success: true
      };
      
      setMessages(prev => [...prev, successMessage]);
      
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
      
      // SỬA: Hiển thị title + áp dụng tính cách với context giao dịch
      const successMessage = {
        id: Date.now() + 2,
        text: formatByPersona(
          `✅ **Đã cập nhật giao dịch thành công!**\n\n📝 ${result.transaction.title}\n💰 ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(result.transaction.amount)}\n📊 ${result.transaction.category?.name || 'Không có danh mục'}\n💼 ${result.transaction.wallet?.name}\n\n✏️ Giao dịch đã được cập nhật.`,
          {
            action: 'edit',
            transaction: result.transaction,
            previousAmount: selectedTransactionToEdit.amount,
            walletName: result.transaction.wallet?.name,
            categoryName: result.transaction.category?.name,
            type: result.transaction.type
          }
        ),
        sender: 'ai',
        timestamp: new Date(),
        success: true
      };
      
      setMessages(prev => [...prev, successMessage]);
      
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
      
      // Hiển thị thông báo thành công + áp dụng tính cách với context giao dịch
      const successMessage = {
        id: Date.now() + 2,
        text: formatByPersona(
          `✅ **Đã xóa giao dịch thành công!**\n\n📝 ${result.deletedTransaction.title || result.deletedTransaction.description}\n💰 ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(result.deletedTransaction.amount)}\n💼 ${result.deletedTransaction.walletName}\n\n🔄 **Đã hoàn tiền vào ví**\n💳 Số dư mới: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(result.newWalletBalance)}`,
          {
            action: 'delete',
            transaction: result.deletedTransaction,
            walletName: result.deletedTransaction.walletName,
            categoryName: result.deletedTransaction.categoryName,
            type: result.deletedTransaction.type
          }
        ),
        sender: 'ai',
        timestamp: new Date(),
        success: true
      };
      
      setMessages(prev => [...prev, successMessage]);
      
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

  // SỬA: Quick actions ngắn gọn hơn
  const quickActions = [
    { text: 'Tạo giao dịch chi tiêu', icon: '💸' },
    { text: 'Phân tích chi tiêu tháng này', icon: '📊' },
    { text: 'Tư vấn tiết kiệm', icon: '💰' },
    { text: 'Xem tổng quan tài chính', icon: '📈' }
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
        className="ai-button tour-ai-component"
        onClick={toggleModal}
        title="chat bot"
        aria-label="chatbot"
      >
        <span className="ai-button-inner">
          <span className="ai-icon">
            <i className="fas fa-robot"></i>
          </span>
          <span className="ai-label">chatbot</span>
          <span className={`ai-status-indicator ${geminiStatus ? 'online' : 'offline'}`}></span>
        </span>
      </button>

      {/* Enhanced AI Modal */}
      {isOpen && (
        <div className="ai-modal-overlay" onClick={toggleModal}>
          <div
            className={`ai-modal ai-modal-enhanced persona-${persona}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ai-modal-header">
              <div className="ai-header-info">
                <div className="ai-avatar">
                  <i className="fas fa-robot"></i>
                </div>
                <div className="ai-header-text">
                  <h3>Trợ lý AI Tài chính</h3>
                  <div className="ai-status">
                    <span className={`ai-status-dot ${geminiStatus ? 'online' : 'offline'}`}></span>
                    {geminiStatus ? 'Đang hoạt động' : 'Chế độ dự phòng'}
                  </div>
                </div>
              </div>
              {/* THÊM: Chọn tính cách chatbot */}
              <div className="ai-persona-switch">
                <button
                  type="button"
                  className={`ai-persona-btn ${persona === 'balanced' ? 'active' : ''}`}
                  onClick={() => setPersona('balanced')}
                >
                  Cân bằng
                </button>
                <button
                  type="button"
                  className={`ai-persona-btn ${persona === 'friendly' ? 'active' : ''}`}
                  onClick={() => setPersona('friendly')}
                >
                  Thân thiện
                </button>
                <button
                  type="button"
                  className={`ai-persona-btn ${persona === 'aggressive' ? 'active' : ''}`}
                  onClick={() => setPersona('aggressive')}
                >
                  Hung dữ
                </button>
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
                        <div className={`ai-message-bubble ${msg.error ? 'error' : ''} ${msg.success ? 'success' : ''}`}>
                          {/* SỬA: Hiển thị text với line breaks */}
                          {msg.text.split('\n').map((line, i) => (
                            <React.Fragment key={i}>
                              {line}
                              {i < msg.text.split('\n').length - 1 && <br />}
                            </React.Fragment>
                          ))}
                        </div>
                        <div className="ai-message-time">
                          {formatTime(msg.timestamp)}
                        </div>
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
                          <span className="ai-typing-text">Đang xử lý...</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} style={{ height: 0, margin: 0, padding: 0 }} />
              </div>

              {/* Quick Actions - SỬA title */}
              {messages.length <= 1 && (
                <div className="ai-quick-actions">
                  <div className="ai-quick-title">💡 Gợi ý câu hỏi:</div>
                  <div className="ai-quick-buttons">
                    {quickActions.map((action, index) => (
                      <button
                        key={index}
                        className="ai-quick-btn"
                        onClick={() => handleQuickAction(action)}
                      >
                        <span className="ai-quick-icon">{action.icon}</span>
                        <span className="ai-quick-text">{action.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="ai-input-container">
                <div className="ai-input-wrapper">
                  <textarea
                    placeholder="Hỏi về tài chính, tạo/sửa/xóa giao dịch..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    className="ai-input"
                    rows={1}
                    disabled={isTyping}
                    style={{ margin: 0, padding: '4px 0' }}
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
                <div className="ai-input-footer" style={{ margin: '8px 0 0 0' }}>
                  <span className="ai-powered-by">
                    <i className="fas fa-bolt"></i>
                    Trợ lý AI thông minh
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
