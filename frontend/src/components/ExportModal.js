import React, { useState } from 'react';
import './ExportModal.css';

function ExportModal({ 
  isOpen, 
  onClose, 
  selectedWallet, 
  walletName, 
  periodText,
  wallets,
  transactions,
  token
}) {
  const [exportFormat, setExportFormat] = useState('csv');
  const [loading, setLoading] = useState(false);
  const [includeDetails, setIncludeDetails] = useState(true);
  const [reportType, setReportType] = useState('personal'); // 'personal', 'group', 'family', 'all'
  
  if (!isOpen) return null;

  // Export report function
  const exportReport = async (format = 'csv', includeDetails = true, reportType = 'personal') => {
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      // Decode user from token if available
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      // Enhanced JWT parsing to get more user info
      const parseJwt = (tkn) => {
        try {
          const payload = tkn.split('.')[1];
          const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
          const json = decodeURIComponent(atob(b64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
          return JSON.parse(json);
        } catch (err) {
          return {};
        }
      };

      const user = token ? parseJwt(token) : {};
      
      // Fetch full user profile for better info (name, etc)
      let userProfile = { ...user };
      try {
        if (token) {
          const profileRes = await fetch('http://localhost:5000/api/users/me', { headers });
          if (profileRes.ok) {
            const profileData = await profileRes.json();
            userProfile = { ...userProfile, ...profileData };
          }
        }
      } catch (err) {
        console.warn('Could not fetch user profile for export, using token data', err);
      }

      // Compute a reliable display username:
      // prefer explicit username fields, then common variants, finally fall back to the local-part of the email
      const displayUsername = userProfile.username
        || userProfile.userName
        || userProfile.preferred_username
        || userProfile.login
        || (typeof userProfile.email === 'string' ? userProfile.email.split('@')[0] : null);

      // Fetch categories - all user-created categories
      let categories = [];
      try {
        const cRes = await fetch('http://localhost:5000/api/categories', { headers });
        if (cRes.ok) {
          const allCategories = await cRes.json();
          const uid = userProfile && (userProfile.id || userProfile._id);
          if (uid) {
            // Keep categories either created by or owned by this user
            categories = allCategories.filter(c => {
              const owner = c.owner;
              const createdBy = c.createdBy;
              const ownerId = owner && (typeof owner === 'object' ? (owner._id || owner.id) : owner);
              const creatorId = createdBy && (typeof createdBy === 'object' ? (createdBy._id || createdBy.id) : createdBy);
              
              return (ownerId && String(ownerId) === String(uid)) || 
                     (creatorId && String(creatorId) === String(uid));
            });
          } else {
            categories = allCategories;
          }
        }
      } catch (err) {
        console.warn('Could not fetch categories for export', err);
      }

      // Helper function to determine transaction type (same logic as TransactionsPage.js)
      const getTransactionType = (tx) => {
        const isGroupTx = tx.groupTransaction === true;
        const isFamilyTransfer = tx.metadata && tx.metadata.source === 'family_transfer';
        const isFamilyPersonal = tx.metadata && tx.metadata.source === 'family_personal';
        const isFamilyTx = !!(tx.metadata && (tx.metadata.familyId || tx.metadata.familyTransactionId || isFamilyTransfer || isFamilyPersonal));
        
        if (isGroupTx) return { type: 'group', isPending: tx.isPending === true };
        if (isFamilyTx) return { type: 'family', isTransfer: isFamilyTransfer, isPersonal: isFamilyPersonal };
        return { type: 'personal' };
      };

      // Fetch group and family metadata for display
      let groups = [];
      let families = [];
      
      if (reportType === 'group' || reportType === 'all') {
        try {
          const groupsRes = await fetch('http://localhost:5000/api/groups', { headers });
          if (groupsRes.ok) {
            groups = await groupsRes.json();
          }
        } catch (err) {
          console.warn('Could not fetch groups for export', err);
        }
      }

      if (reportType === 'family' || reportType === 'all') {
        try {
          const familiesRes = await fetch('http://localhost:5000/api/families', { headers });
          if (familiesRes.ok) {
            families = await familiesRes.json();
          }
        } catch (err) {
          console.warn('Could not fetch families for export', err);
        }
      }

      // Create maps for quick lookup
      const groupMap = {};
      groups.forEach(g => {
        groupMap[String(g._id)] = { name: g.name || 'Không tên', color: g.color || '' };
      });

      const familyMap = {};
      families.forEach(f => {
        familyMap[String(f._id)] = { name: f.name || 'Không tên' };
      });

      // Process all transactions from the main transactions list
      // The transactions list already contains personal, group, and family transactions
      // We just need to classify and filter them based on reportType
      const allTxs = (transactions || []).map(tx => {
        const txType = getTransactionType(tx);
        let sourceType = txType.type;
        let sourceName = '';
        
        if (txType.type === 'group') {
          const groupId = tx.groupId || (tx.group && (typeof tx.group === 'string' ? tx.group : tx.group._id));
          const groupInfo = groupId ? groupMap[String(groupId)] : null;
          sourceName = groupInfo ? groupInfo.name : (tx.groupName || 'Nhóm');
        } else if (txType.type === 'family') {
          const familyId = tx.metadata?.familyId || (tx.familyId && (typeof tx.familyId === 'string' ? tx.familyId : tx.familyId._id));
          const familyInfo = familyId ? familyMap[String(familyId)] : null;
          sourceName = familyInfo ? familyInfo.name : (tx.metadata?.familyName || 'Gia đình');
        }
        
        return {
          ...tx,
          _txType: txType,
          sourceType,
          sourceName
        };
      });
      // Filter transactions by report type and date
      const monthTxs = allTxs.filter(tx => {
        // Filter by report type
        if (reportType === 'personal' && tx._txType.type !== 'personal') return false;
        if (reportType === 'group' && tx._txType.type !== 'group') return false;
        if (reportType === 'family' && tx._txType.type !== 'family') return false;
        // 'all' includes everything, no filter needed
        
        // Filter by date
        const txDate = tx.date ? new Date(tx.date) : null;
        if (!txDate || txDate < monthStart || txDate >= monthEnd) return false;
        
        // Filter by wallet if selected
        if (selectedWallet && selectedWallet !== 'all') {
          const walletId = tx.wallet?._id || tx.wallet;
          return String(walletId) === String(selectedWallet);
        }
        
        return true;
      });

      // Get today's transactions with same filters
      const today = new Date();
      const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
      const endToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
      const todayTxs = allTxs.filter(tx => {
        // Filter by report type
        if (reportType === 'personal' && tx._txType.type !== 'personal') return false;
        if (reportType === 'group' && tx._txType.type !== 'group') return false;
        if (reportType === 'family' && tx._txType.type !== 'family') return false;
        
        // Filter by date
        const txDate = tx.date ? new Date(tx.date) : null;
        if (!txDate) return false;
        if (txDate < startToday || txDate > endToday) return false;
        
        // Filter by wallet if selected
        if (selectedWallet && selectedWallet !== 'all') {
          const walletId = tx.wallet?._id || tx.wallet;
          return String(walletId) === String(selectedWallet);
        }
        
        return true;
      });

      // Map wallets and categories for name lookup
      const walletMap = {};
      (wallets || []).forEach(w => { 
        walletMap[String(w._id)] = w.name || w._id; 
      });
      
      const categoryMap = {};
      (categories || []).forEach(c => {
        categoryMap[String(c._id)] = c.name || c._id;
      });

      // Calculate monthly summary for better financial analysis
      const summary = {
        income: 0,
        expense: 0,
        currencies: {}
      };
      
      monthTxs.forEach(tx => {
        const amount = Number(tx.amount) || 0;
        const currency = (tx.wallet && tx.wallet.currency) || (tx.currency) || 'VND';
        
        if (tx.type === 'income') {
          summary.income += amount;
          summary.currencies[currency] = summary.currencies[currency] || { income: 0, expense: 0 };
          summary.currencies[currency].income += amount;
        } else {
          summary.expense += amount;
          summary.currencies[currency] = summary.currencies[currency] || { income: 0, expense: 0 };
          summary.currencies[currency].expense += amount;
        }
      });
      
      // For CSV cell escaping, using a more direct approach without formatCurrency
      const escapeCell = (cell) => {
        if (cell === null || cell === undefined) return '""';
        const s = String(cell);
        // If the value contains comma, quotes, or newline, wrap in quotes and escape existing quotes
        if (s.includes('"') || s.includes(',') || s.includes('\n')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };

      // Build CSV sections with more detailed headers
      const sections = [];

      // Export file metadata
      const reportTypeLabels = {
        personal: 'Cá nhân',
        group: 'Nhóm',
        family: 'Gia đình',
        all: 'Tất cả'
      };
      sections.push([['# Báo cáo tài chính ' + reportTypeLabels[reportType] || 'Cá nhân']]);
      sections.push([['# Được xuất ngày:', new Date().toLocaleString()]]);
      sections.push([['# Kỳ báo cáo:', `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`]]);
      sections.push([['# Loại báo cáo:', reportTypeLabels[reportType] || 'Cá nhân']]);
      sections.push([[]]);

      // Metadata section (user info) - Enhanced with profile data
      sections.push([['## Thông tin người dùng']]);
      sections.push([['Tên đầy đủ', userProfile.name || userProfile.fullName || 'N/A']]);
      sections.push([['Tên người dùng', displayUsername || 'N/A']]);
      sections.push([['Email', userProfile.email || 'N/A']]);
      sections.push([['Vai trò', userProfile.role || 'User']]);
      sections.push([['ID', userProfile.id || userProfile._id || 'N/A']]);
      sections.push([[]]);

      // Wallets section - Include all wallet data with more detail (only for personal/all)
      if (reportType === 'personal' || reportType === 'all') {
        sections.push([['## Ví của người dùng']]);
        sections.push([['ID', 'Tên ví', 'Loại tiền', 'Số dư ban đầu', 'Ghi chú']]);
        (wallets || []).forEach(w => {
          sections.push([[
            w._id || '', 
            w.name || 'Không tên', 
            w.currency || 'VND',
            w.initialBalance != null ? w.initialBalance : 0,
            w.notes || ''
          ]]);
        });
        sections.push([[]]);
      }

      // Groups section (only for group/all)
      if ((reportType === 'group' || reportType === 'all') && groups.length > 0) {
        sections.push([['## Nhóm']]);
        sections.push([['ID', 'Tên nhóm', 'Màu sắc', 'Số thành viên', 'Số giao dịch']]);
        groups.forEach(g => {
          const groupTxsCount = monthTxs.filter(tx => {
            if (tx._txType.type !== 'group') return false;
            const groupId = tx.groupId || (tx.group && (typeof tx.group === 'string' ? tx.group : tx.group._id));
            return String(groupId) === String(g._id);
          }).length;
          sections.push([[
            g._id || '',
            g.name || 'Không tên',
            g.color || '',
            g.members ? (Array.isArray(g.members) ? g.members.length : 0) : 0,
            groupTxsCount
          ]]);
        });
        sections.push([[]]);
      }

      // Families section (only for family/all)
      if ((reportType === 'family' || reportType === 'all') && families.length > 0) {
        sections.push([['## Gia đình']]);
        sections.push([['ID', 'Tên gia đình', 'Số thành viên', 'Số giao dịch']]);
        families.forEach(f => {
          const familyTxsCount = monthTxs.filter(tx => {
            if (tx._txType.type !== 'family') return false;
            const familyId = tx.metadata?.familyId || (tx.familyId && (typeof tx.familyId === 'string' ? tx.familyId : tx.familyId._id));
            return String(familyId) === String(f._id);
          }).length;
          sections.push([[
            f._id || '',
            f.name || 'Không tên',
            f.members ? (Array.isArray(f.members) ? f.members.length : 0) : 0,
            familyTxsCount
          ]]);
        });
        sections.push([[]]);
      }

      // Categories section - Include all user-created categories
      sections.push([['## Danh mục']]);
      sections.push([['ID', 'Tên danh mục', 'Loại', 'Icon', 'Người tạo', 'Ngày tạo']]);
      (categories || []).forEach(c => {
        sections.push([[
          c._id || '',
          c.name || 'Không tên',
          c.type || 'expense',
          c.icon || '',
          c.creatorName || userProfile.name || 'Bạn',
          c.createdAt ? new Date(c.createdAt).toLocaleString() : 'N/A'
        ]]);
      });
      sections.push([[]]);

      // Today's transactions section with more detailed info
      sections.push([['## Giao dịch hôm nay', `(${new Date().toLocaleDateString()})`]]);
      sections.push([['Ngày', 'Tiêu đề', 'Số tiền', 'Loại', 'Nguồn', 'Ví/Nhóm/Gia đình', 'Danh mục', 'Loại tiền', 'Ghi chú', 'Trạng thái']]);
      todayTxs.forEach(tx => {
        const date = tx.date ? (new Date(tx.date)).toLocaleString() : '';
        const title = tx.title || tx.description || 'Không tiêu đề';
        const walletName = (tx.wallet && typeof tx.wallet !== 'string') ? 
          (tx.wallet.name || '') : (walletMap[String(tx.wallet)] || tx.wallet || 'Không xác định');
        
        const categoryName = tx.category && (typeof tx.category !== 'string') ? 
          (tx.category.name || '') : (categoryMap[String(tx.category)] || tx.category || 'Không xác định');
        
        const type = tx.type === 'income' ? 'Thu nhập' : 'Chi tiêu';
        const amount = tx.amount != null ? Number(tx.amount) : 0;
        const currency = (tx.wallet && tx.wallet.currency) || (tx.currency) || 'VND';
        const note = includeDetails ? (tx.note || tx.description || '') : '';
        
        // Determine source type and name (already set in allTxs processing)
        const sourceType = tx.sourceType || 'Cá nhân';
        let sourceName = tx.sourceName || walletName;
        
        // Add additional info for group transactions
        let additionalInfo = '';
        let status = '';
        if (tx._txType.type === 'group') {
          if (tx._txType.isPending) {
            additionalInfo = ' (Chưa thanh toán)';
            status = 'Chưa thanh toán';
          } else {
            status = 'Đã thanh toán';
          }
          if (tx.groupRole) {
            const roleText = tx.groupRole === 'payer' ? 'Người tạo' : 
                           tx.groupRole === 'receiver' ? 'Người nhận' : 
                           tx.groupRole === 'participant' ? 'Người nợ' : '';
            if (roleText) additionalInfo += ` - ${roleText}`;
          }
        } else if (tx._txType.type === 'family') {
          if (tx._txType.isTransfer) {
            const direction = tx.metadata?.direction;
            if (direction === 'to-family') {
              additionalInfo = ' (Nạp vào quỹ)';
              status = 'Nạp quỹ';
            } else if (direction === 'from-family') {
              additionalInfo = ' (Nhận từ quỹ)';
              status = 'Rút quỹ';
            } else {
              status = 'Giao dịch quỹ';
            }
          } else if (tx._txType.isPersonal) {
            additionalInfo = ' (Giao dịch cá nhân trong gia đình)';
            status = 'Cá nhân trong gia đình';
          } else {
            status = 'Giao dịch gia đình';
          }
        } else {
          status = 'Bình thường';
        }
        
        sections.push([[date, title + additionalInfo, amount, type, sourceType, sourceName, categoryName, currency, note, status]]);
      });
      sections.push([[]]);

      // Month transactions section with the same detailed format
      sections.push([['## Giao dịch trong tháng', `(Tháng ${now.getMonth() + 1}/${now.getFullYear()})`]]);
      sections.push([['Ngày', 'Tiêu đề', 'Số tiền', 'Loại', 'Nguồn', 'Ví/Nhóm/Gia đình', 'Danh mục', 'Loại tiền', 'Ghi chú', 'Trạng thái']]);
      monthTxs.forEach(tx => {
        const date = tx.date ? (new Date(tx.date)).toLocaleString() : '';
        const title = tx.title || tx.description || 'Không tiêu đề';
        const walletName = (tx.wallet && typeof tx.wallet !== 'string') ? 
          (tx.wallet.name || '') : (walletMap[String(tx.wallet)] || tx.wallet || 'Không xác định');
        
        const categoryName = tx.category && (typeof tx.category !== 'string') ? 
          (tx.category.name || '') : (categoryMap[String(tx.category)] || tx.category || 'Không xác định');
        
        const type = tx.type === 'income' ? 'Thu nhập' : 'Chi tiêu';
        const amount = tx.amount != null ? Number(tx.amount) : 0;
        const currency = (tx.wallet && tx.wallet.currency) || (tx.currency) || 'VND';
        const note = includeDetails ? (tx.note || tx.description || '') : '';
        
        // Determine source type and name (already set in allTxs processing)
        const sourceType = tx.sourceType || 'Cá nhân';
        let sourceName = tx.sourceName || walletName;
        
        // Add additional info for group transactions
        let additionalInfo = '';
        let status = '';
        if (tx._txType.type === 'group') {
          if (tx._txType.isPending) {
            additionalInfo = ' (Chưa thanh toán)';
            status = 'Chưa thanh toán';
          } else {
            status = 'Đã thanh toán';
          }
          if (tx.groupRole) {
            const roleText = tx.groupRole === 'payer' ? 'Người tạo' : 
                           tx.groupRole === 'receiver' ? 'Người nhận' : 
                           tx.groupRole === 'participant' ? 'Người nợ' : '';
            if (roleText) additionalInfo += ` - ${roleText}`;
          }
        } else if (tx._txType.type === 'family') {
          if (tx._txType.isTransfer) {
            const direction = tx.metadata?.direction;
            if (direction === 'to-family') {
              additionalInfo = ' (Nạp vào quỹ)';
              status = 'Nạp quỹ';
            } else if (direction === 'from-family') {
              additionalInfo = ' (Nhận từ quỹ)';
              status = 'Rút quỹ';
            } else {
              status = 'Giao dịch quỹ';
            }
          } else if (tx._txType.isPersonal) {
            additionalInfo = ' (Giao dịch cá nhân trong gia đình)';
            status = 'Cá nhân trong gia đình';
          } else {
            status = 'Giao dịch gia đình';
          }
        } else {
          status = 'Bình thường';
        }
        
        sections.push([[date, title + additionalInfo, amount, type, sourceType, sourceName, categoryName, currency, note, status]]);
      });

      // Add summary section
      sections.push([[]]);
      sections.push([['## Tổng kết tháng']]);
      sections.push([['Tiền tệ', 'Thu nhập', 'Chi tiêu', 'Chênh lệch']]);
      
      Object.keys(summary.currencies).forEach(curr => {
        const data = summary.currencies[curr];
        sections.push([[
          curr,
          data.income,
          data.expense,
          data.income - data.expense
        ]]);
      });
      
      // Flatten sections into CSV string with improved formatting
      const csvLines = [];
      sections.forEach(block => {
        block.forEach(row => {
          if (row.length === 0) {
            csvLines.push(''); // blank line
          } else {
            const line = row.map(cell => escapeCell(cell)).join(',');
            csvLines.push(line);
          }
        });
      });

      // Add UTF-8 BOM for Excel compatibility with Vietnamese characters
      const csvContent = '\uFEFF' + csvLines.join('\n');

      // Create a better filename with user info
      const safeName = (displayUsername || userProfile.email || userProfile.name || 'user')
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_-]/g, '');
      
      const filename = `bao-cao-tai-chinh-${safeName}-${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

      // For CSV export, create download
      if (format === 'csv') {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        
        link.href = url;
        link.setAttribute('download', `${filename}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else if (format === 'print') {
        // Print functionality (keep existing implementation)
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
          alert('Vui lòng cho phép mở cửa sổ pop-up để sử dụng tính năng này.');
          return;
        }

        // Title depends on single-wallet vs all-wallets
        const walletTitle = selectedWallet !== 'all' 
          ? wallets.find(w => String(w._id) === selectedWallet)?.name || 'Ví đã chọn'
          : 'Tất cả ví';

        const title = `Báo cáo giao dịch - ${walletTitle} - Tháng ${now.getMonth() + 1}/${now.getFullYear()}`;

        // Helper: build rows HTML for a list of transactions
        const buildTableHtml = (txList) => {
          if (!txList || txList.length === 0) return '<div class="no-data">Không có giao dịch</div>';
          const headers = ['Ngày', 'Tiêu đề', 'Nguồn', 'Ví/Nhóm/Gia đình', 'Danh mục', 'Loại', 'Số tiền', 'Tiền tệ', 'Ghi chú', 'Trạng thái'];
          const headerHtml = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
          const bodyHtml = `<tbody>${txList.map(tx => {
            const date = tx.date ? (new Date(tx.date)).toLocaleString() : '';
            let titleRow = tx.title || tx.description || '';
            const wName = (tx.wallet && typeof tx.wallet !== 'string') ? (tx.wallet.name || '') : (walletMap[String(tx.wallet)] || tx.wallet || '');
            const catName = tx.category && (typeof tx.category !== 'string') ? (tx.category.name || '') : (categoryMap[String(tx.category)] || tx.category || '');
            const typeRow = tx.type || '';
            const amount = tx.amount != null ? Number(tx.amount).toLocaleString() : '';
            const currency = (tx.wallet && tx.wallet.currency) || (tx.currency) || '';
            const note = includeDetails ? (tx.note || tx.description || '') : '';
            
            // Determine source type and name
            const sourceType = tx.sourceType || 'Cá nhân';
            const sourceName = tx.sourceName || wName;
            
            // Add additional info and status
            let additionalInfo = '';
            let status = '';
            if (tx._txType && tx._txType.type === 'group') {
              if (tx._txType.isPending) {
                additionalInfo = ' (Chưa thanh toán)';
                status = 'Chưa thanh toán';
              } else {
                status = 'Đã thanh toán';
              }
              if (tx.groupRole) {
                const roleText = tx.groupRole === 'payer' ? 'Người tạo' : 
                               tx.groupRole === 'receiver' ? 'Người nhận' : 
                               tx.groupRole === 'participant' ? 'Người nợ' : '';
                if (roleText) additionalInfo += ` - ${roleText}`;
              }
            } else if (tx._txType && tx._txType.type === 'family') {
              if (tx._txType.isTransfer) {
                const direction = tx.metadata?.direction;
                if (direction === 'to-family') {
                  additionalInfo = ' (Nạp vào quỹ)';
                  status = 'Nạp quỹ';
                } else if (direction === 'from-family') {
                  additionalInfo = ' (Nhận từ quỹ)';
                  status = 'Rút quỹ';
                } else {
                  status = 'Giao dịch quỹ';
                }
              } else if (tx._txType.isPersonal) {
                additionalInfo = ' (Giao dịch cá nhân trong gia đình)';
                status = 'Cá nhân trong gia đình';
              } else {
                status = 'Giao dịch gia đình';
              }
            } else {
              status = 'Bình thường';
            }
            
            titleRow = titleRow + additionalInfo;
            
            return `<tr>
              <td>${date}</td>
              <td>${titleRow}</td>
              <td>${sourceType}</td>
              <td>${sourceName}</td>
              <td>${catName}</td>
              <td>${typeRow === 'income' ? 'Thu nhập' : 'Chi tiêu'}</td>
              <td class="${typeRow === 'income' ? 'income' : 'expense'}">${amount} ${currency}</td>
              <td>${currency}</td>
              <td>${note}</td>
              <td>${status}</td>
            </tr>`;
          }).join('')}</tbody>`;
          return `<table border="0" cellpadding="0" cellspacing="0">${headerHtml}${bodyHtml}</table>`;
        };

        // If printing all wallets, build per-wallet sections
        let bodySections = '';
        if (selectedWallet === 'all') {
          // combined "All wallets" table
          bodySections += `<h2>Tất cả giao dịch (Tháng)</h2>${buildTableHtml(monthTxs)}`;

          // group monthTxs by wallet id (including unknown)
          const grouped = {};
          monthTxs.forEach(tx => {
            const wid = (tx.wallet && (typeof tx.wallet === 'string' ? tx.wallet : (tx.wallet._id || tx.wallet))) || 'unknown';
            grouped[wid] = grouped[wid] || [];
            grouped[wid].push(tx);
          });

          // ensure we show wallets in user's wallet order, then any unknowns
          const walletOrder = (wallets || []).map(w => String(w._id));
          const shown = new Set();
          walletOrder.forEach(wid => {
            const txsFor = grouped[wid] || [];
            shown.add(wid);
            const wName = wallets.find(w => String(w._id) === wid)?.name || wid;
            bodySections += `<h3>Ví: ${wName} — ${txsFor.length} giao dịch</h3>${buildTableHtml(txsFor)}`;
          });

          // remaining groups (unknown or wallets outside user's list)
          Object.keys(grouped).forEach(wid => {
            if (shown.has(wid)) return;
            const txsFor = grouped[wid];
            const wName = walletMap[wid] || 'Không xác định';
            bodySections += `<h3>Ví: ${wName} — ${txsFor.length} giao dịch</h3>${buildTableHtml(txsFor)}`;
          });
        } else {
          // single wallet: reuse monthTxs (already filtered)
          bodySections = `<h2>${walletTitle} — Giao dịch trong tháng</h2>${buildTableHtml(monthTxs)}`;
        }

        const htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>${title}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              h1 { color: #2a5298; margin-bottom: 8px; }
              h2 { color: #1f2937; margin-top: 18px; margin-bottom: 8px; }
              h3 { color: #374151; margin-top: 12px; margin-bottom: 6px; font-weight: 700; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
              th { background: #f8fafc; color: #334155; text-align: left; padding: 8px; border-bottom: 1px solid #e2e8f0; }
              td { padding: 8px; border-bottom: 1px solid #e6edf3; vertical-align: top; }
              .income { color: #10b981; }
              .expense { color: #ef4444; }
              .report-info { margin-bottom: 12px; }
              .no-data { color: #6b7280; padding: 12px 0; }
              @media print { .no-print { display: none; } body { margin: 0; padding: 12px; } }
            </style>
          </head>
          <body>
            <div class="no-print" style="text-align: right; margin-bottom: 12px;">
              <button onclick="window.print()">In báo cáo</button>
              <button onclick="window.close()">Đóng</button>
            </div>
            <h1>${title}</h1>
            <div class="report-info">
              <div><strong>Người xuất:</strong> ${displayUsername || userProfile.name || ''} ${userProfile.email ? `(${userProfile.email})` : ''}</div>
              <div><strong>Kỳ báo cáo:</strong> ${now.getMonth() + 1}/${now.getFullYear()}</div>
              <div><strong>Số giao dịch (tháng):</strong> ${monthTxs.length}</div>
              <div><strong>Ngày xuất:</strong> ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</div>
            </div>
            ${bodySections}
            <div style="margin-top: 24px; font-size: 0.9em; color: #64748b; text-align: center;">
              © ${new Date().getFullYear()} Báo cáo tài chính cá nhân
            </div>
            <script>window.onload = function() { setTimeout(() => window.print(), 500); }</script>
          </body>
          </html>
        `;
        printWindow.document.open();
        printWindow.document.write(htmlContent);
        printWindow.document.close();
      } else {
        throw new Error(`Định dạng "${format}" không được hỗ trợ.`);
      }
    } catch (err) {
      console.error('Export failed', err);
      throw err; // Re-throw to be handled by the modal
    }
  };

      const handleExport = async () => {
    setLoading(true);
    try {
      await exportReport(exportFormat, includeDetails, reportType);
      setTimeout(() => onClose(), 800); // Close after successful export
    } catch (err) {
      console.error('Export error:', err);
      alert('Lỗi khi xuất báo cáo: ' + (err.message || ''));
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="export-modal-overlay">
      <div className="export-modal">
        <div className="export-modal-header">
          <h2 className="export-modal-title">Xuất Báo Cáo</h2>
          <button className="export-modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="export-modal-body">
          <div className="export-info">
            <div className="export-info-item">
              <strong>Ví:</strong> {walletName || 'Tất cả ví'}
            </div>
            <div className="export-info-item">
              <strong>Kỳ báo cáo:</strong> {periodText || 'Tháng hiện tại'}
            </div>
          </div>
          
          <div className="export-data-summary">
            <h4>Dữ liệu sẽ được xuất:</h4>
            <ul className="export-data-list">
              <li>Thông tin người dùng</li>
              <li>Danh sách ví của bạn</li>
              <li>Danh mục đã tạo</li>
              <li>Giao dịch trong ngày hôm nay</li>
              <li>Giao dịch trong tháng</li>
            </ul>
          </div>
          
          <div className="export-options">
            <h3>Chọn Loại Báo Cáo</h3>
            <div className="export-format-options" style={{ marginBottom: '24px' }}>
              <label className={`export-format-option ${reportType === 'personal' ? 'selected' : ''}`}>
                <input 
                  type="radio" 
                  name="reportType" 
                  value="personal" 
                  checked={reportType === 'personal'}
                  onChange={() => setReportType('personal')}
                />
                <div className="format-icon">
                  <span className="material-icon">👤</span>
                </div>
                <div className="format-info">
                  <div className="format-name">Cá nhân</div>
                  <div className="format-desc">Chỉ xuất dữ liệu cá nhân của bạn</div>
                </div>
              </label>
              
              <label className={`export-format-option ${reportType === 'group' ? 'selected' : ''}`}>
                <input 
                  type="radio" 
                  name="reportType" 
                  value="group" 
                  checked={reportType === 'group'}
                  onChange={() => setReportType('group')}
                />
                <div className="format-icon">
                  <span className="material-icon">👥</span>
                </div>
                <div className="format-info">
                  <div className="format-name">Nhóm</div>
                  <div className="format-desc">Xuất dữ liệu từ các nhóm của bạn</div>
                </div>
              </label>
              
              <label className={`export-format-option ${reportType === 'family' ? 'selected' : ''}`}>
                <input 
                  type="radio" 
                  name="reportType" 
                  value="family" 
                  checked={reportType === 'family'}
                  onChange={() => setReportType('family')}
                />
                <div className="format-icon">
                  <span className="material-icon">🏠</span>
                </div>
                <div className="format-info">
                  <div className="format-name">Gia đình</div>
                  <div className="format-desc">Xuất dữ liệu từ các gia đình của bạn</div>
                </div>
              </label>
              
              <label className={`export-format-option ${reportType === 'all' ? 'selected' : ''}`}>
                <input 
                  type="radio" 
                  name="reportType" 
                  value="all" 
                  checked={reportType === 'all'}
                  onChange={() => setReportType('all')}
                />
                <div className="format-icon">
                  <span className="material-icon">📊</span>
                </div>
                <div className="format-info">
                  <div className="format-name">Tất cả</div>
                  <div className="format-desc">Xuất tất cả dữ liệu (cá nhân + nhóm + gia đình)</div>
                </div>
              </label>
            </div>
            
            <h3>Chọn Định dạng</h3>
            
            <div className="export-format-options">
              <label className={`export-format-option ${exportFormat === 'csv' ? 'selected' : ''}`}>
                <input 
                  type="radio" 
                  name="format" 
                  value="csv" 
                  checked={exportFormat === 'csv'}
                  onChange={() => setExportFormat('csv')}
                />
                <div className="format-icon">
                  <span className="material-icon">📄</span>
                </div>
                <div className="format-info">
                  <div className="format-name">CSV</div>
                  <div className="format-desc">Định dạng dữ liệu dạng bảng, dễ mở với Excel</div>
                </div>
              </label>
              
              <label className={`export-format-option ${exportFormat === 'print' ? 'selected' : ''}`}>
                <input 
                  type="radio" 
                  name="format" 
                  value="print" 
                  checked={exportFormat === 'print'}
                  onChange={() => setExportFormat('print')}
                />
                <div className="format-icon">
                  <span className="material-icon">🖨️</span>
                </div>
                <div className="format-info">
                  <div className="format-name">In trực tiếp</div>
                  <div className="format-desc">Mở trang in trong trình duyệt</div>
                </div>
              </label>
            </div>
            
            <div className="export-options-additional">
              <label className="checkbox-label">
                <input 
                  type="checkbox"
                  checked={includeDetails}
                  onChange={() => setIncludeDetails(!includeDetails)}
                />
                <span>Bao gồm các ghi chú và thông tin chi tiết</span>
              </label>
            </div>
          </div>
        </div>
        
        <div className="export-modal-footer">
          <button className="export-cancel-btn" onClick={onClose} disabled={loading}>
            Hủy
          </button>
          <button className="export-submit-btn" onClick={handleExport} disabled={loading}>
            {loading ? 'Đang xuất...' : 'Xuất Báo Cáo'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ExportModal;
                    


