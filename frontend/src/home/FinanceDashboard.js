import React, { useEffect, useState, useRef, useCallback } from 'react';
import './FinanceDashboard.css';
// Import Chart.js
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';
import { Pie, Bar } from 'react-chartjs-2';
import ExportModal from '../components/ExportModal';

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

export default function FinanceDashboard() {
  const [loading, setLoading] = useState(true);
  const [walletTotals, setWalletTotals] = useState({});
  const [incomeByCurrency, setIncomeByCurrency] = useState({});
  const [expenseByCurrency, setExpenseByCurrency] = useState({});
  const [topCategories, setTopCategories] = useState([]);
  const [recentTxs, setRecentTxs] = useState([]);
  const [error, setError] = useState(null);
  // New states for chart
  const [wallets, setWallets] = useState([]);
  const [selectedWallet, setSelectedWallet] = useState('all');
  const [chartData, setChartData] = useState({
    pieData: null,
    barData: null
  });
  // Reference for transactions
  const allTransactionsRef = useRef([]);
  // Add state for pie chart type toggle
  const [pieChartType, setPieChartType] = useState('expense'); // 'expense' or 'income'
  // Add state for export modal
  const [showExportModal, setShowExportModal] = useState(false);

  const formatCurrency = (amount, currency) => {
    try {
      return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: currency || 'VND' }).format(amount);
    } catch {
      return `${amount} ${currency || ''}`;
    }
  };

  // Function to prepare chart data based on transactions and selected wallet
  const prepareChartData = useCallback((transactions, selectedWalletId = 'all') => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    
    // Filter transactions by date and wallet (if selected)
    const filteredTxs = transactions.filter(tx => {
      const txDate = tx.date ? new Date(tx.date) : null;
      if (!txDate || txDate < monthStart || txDate >= monthEnd) return false;
      if (selectedWalletId !== 'all') {
        const walletId = tx.wallet?._id || tx.wallet;
        return String(walletId) === String(selectedWalletId);
      }
      return true;
    });
    
    // Prepare data for bar chart (income vs expense)
    let totalIncome = 0;
    let totalExpense = 0;
    filteredTxs.forEach(tx => {
      const amount = Number(tx.amount) || 0;
      if (tx.type === 'income') totalIncome += amount;
      else totalExpense += amount;
    });
    
    const barData = {
      labels: ['Thu nhập', 'Chi tiêu'],
      datasets: [
        {
          label: 'VND',
          data: [totalIncome, totalExpense],
          backgroundColor: [
            'rgba(39, 174, 96, 0.7)',
            'rgba(231, 76, 60, 0.7)'
          ],
          borderColor: [
            'rgba(39, 174, 96, 1)',
            'rgba(231, 76, 60, 1)'
          ],
          borderWidth: 1,
        }
      ]
    };
    
    // Group transactions by category for pie chart - handle both expense and income
    const expensesByCategory = {};
    const incomesByCategory = {};
    const categoryIcons = {};
    const categoryColors = {};
    
    // Define a color palette
    const expenseColorPalette = [
      'rgba(231, 76, 60, 0.7)', 'rgba(255, 99, 132, 0.7)',
      'rgba(255, 159, 64, 0.7)', 'rgba(255, 206, 86, 0.7)',
      'rgba(153, 102, 255, 0.7)', 'rgba(121, 85, 72, 0.7)',
      'rgba(75, 192, 192, 0.7)'
    ];
    
    const incomeColorPalette = [
      'rgba(39, 174, 96, 0.7)', 'rgba(54, 162, 235, 0.7)', 
      'rgba(75, 192, 192, 0.7)', 'rgba(33, 150, 243, 0.7)', 
      'rgba(76, 175, 80, 0.7)', 'rgba(156, 39, 176, 0.7)',
      'rgba(46, 204, 113, 0.7)'
    ];
    
    // Process all transactions and separate by type
    filteredTxs.forEach(tx => {
      const category = tx.category;
      if (!category) return;
      
      const catId = category._id || category;
      const catName = category.name || 'Khác';
      const catIcon = category.icon || '📊';
      const amount = Number(tx.amount) || 0;
      
      if (tx.type === 'expense') {
        if (!expensesByCategory[catId]) {
          expensesByCategory[catId] = {
            id: catId,
            name: catName,
            icon: catIcon,
            total: 0
          };
          // Assign color from palette or generate one
          const colorIndex = Object.keys(expensesByCategory).length % expenseColorPalette.length;
          categoryColors[catId] = expenseColorPalette[colorIndex];
          categoryIcons[catId] = catIcon;
        }
        expensesByCategory[catId].total += amount;
      } else if (tx.type === 'income') {
        if (!incomesByCategory[catId]) {
          incomesByCategory[catId] = {
            id: catId,
            name: catName,
            icon: catIcon,
            total: 0
          };
          // Assign color from income palette
          const colorIndex = Object.keys(incomesByCategory).length % incomeColorPalette.length;
          categoryColors[catId] = incomeColorPalette[colorIndex];
          categoryIcons[catId] = catIcon;
        }
        incomesByCategory[catId].total += amount;
      }
    });
    
    // Convert to array and sort by total for both expense and income
    const expenseCats = Object.values(expensesByCategory).sort((a, b) => b.total - a.total);
    const incomeCats = Object.values(incomesByCategory).sort((a, b) => b.total - a.total);
      
    // Prepare pie chart data based on currently selected type
    let pieData;
    
    if (pieChartType === 'expense') {
      pieData = {
        labels: expenseCats.map(cat => cat.name),
        datasets: [{
          data: expenseCats.map(cat => cat.total),
          backgroundColor: expenseCats.map(cat => categoryColors[cat.id]),
          borderColor: expenseCats.map(cat => categoryColors[cat.id].replace('0.7', '1')),
          borderWidth: 1
        }],
        // Store icons for custom rendering
        icons: expenseCats.map(cat => cat.icon)
      };
    } else { // income
      pieData = {
        labels: incomeCats.map(cat => cat.name),
        datasets: [{
          data: incomeCats.map(cat => cat.total),
          backgroundColor: incomeCats.map(cat => categoryColors[cat.id]),
          borderColor: incomeCats.map(cat => categoryColors[cat.id].replace('0.7', '1')),
          borderWidth: 1
        }],
        // Store icons for custom rendering
        icons: incomeCats.map(cat => cat.icon)
      };
    }
    
    return { barData, pieData };
  }, [pieChartType]); // Add pieChartType as a dependency

  useEffect(() => {
    const ctrl = new AbortController();
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem('token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        // Fetch wallets and transactions
        const [wRes, tRes] = await Promise.all([
          fetch('http://localhost:5000/api/wallets', { headers, signal: ctrl.signal }),
          fetch('http://localhost:5000/api/transactions', { headers, signal: ctrl.signal })
        ]);

        if (!wRes.ok) throw new Error('Không thể tải ví');
        if (!tRes.ok) throw new Error('Không thể tải giao dịch');

        const wallets = await wRes.json();
        const txs = await tRes.json();
        
        // Store all transactions for chart filtering
        allTransactionsRef.current = txs;
        
        // Set wallets for dropdown
        setWallets(wallets || []);

        // totalsByCurrency
        const sums = {};
        (wallets || []).forEach(w => {
          const curr = w.currency || 'VND';
          const amt = Number(w.initialBalance) || 0;
          sums[curr] = (sums[curr] || 0) + amt;
        });
        setWalletTotals(sums);

        // compute month range
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

        const inc = {};
        const exp = {};
        const catMap = {}; // categoryId -> { name, total }

        // ensure txs sorted descending by date
        const sorted = (txs || []).slice().sort((a,b) => new Date(b.date) - new Date(a.date));
        // recent 5 transactions
        setRecentTxs(sorted.slice(0,5));

        (txs || []).forEach(tx => {
          const txDate = tx.date ? new Date(tx.date) : null;
          if (!txDate) return;
          // only current month considered for sums/top categories
          if (txDate >= monthStart && txDate < monthEnd) {
            // determine currency
            let currency = 'VND';
            if (tx.wallet && typeof tx.wallet !== 'string' && tx.wallet.currency) currency = tx.wallet.currency;
            else if (typeof tx.wallet === 'string') {
              const w = wallets.find(wt => String(wt._id) === String(tx.wallet));
              if (w && w.currency) currency = w.currency;
            }
            const amt = Number(tx.amount) || 0;
            if (tx.type === 'income') inc[currency] = (inc[currency] || 0) + amt;
            else exp[currency] = (exp[currency] || 0) + amt;

            // category aggregation for expense only (common use case)
            const cat = tx.category;
            let catId = '';
            let catName = '';
            if (cat) {
              if (typeof cat === 'string') catId = cat;
              else { catId = cat._id || ''; catName = cat.name || ''; }
            }
            if (catId) {
              if (!catMap[catId]) catMap[catId] = { name: catName || '(khác)', total: 0 };
              catMap[catId].total += amt;
            }
          }
        });

        // compute top categories by total (descending)
        const top = Object.keys(catMap).map(id => ({ id, name: catMap[id].name, total: catMap[id].total }))
          .sort((a,b) => b.total - a.total)
          .slice(0,5);
        setTopCategories(top);

        setIncomeByCurrency(inc);
        setExpenseByCurrency(exp);
        
        // Prepare initial chart data
        const chartData = prepareChartData(txs);
        setChartData(chartData);
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error(err);
        setError(err.message || 'Lỗi khi tải dữ liệu');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    return () => { ctrl.abort(); };
  }, [prepareChartData]); // Add prepareChartData as dependency

  // Update chart when wallet selection changes or pie chart type changes
  useEffect(() => {
    if (allTransactionsRef.current.length) {
      const chartData = prepareChartData(allTransactionsRef.current, selectedWallet);
      setChartData(chartData);
    }
  }, [selectedWallet, pieChartType, prepareChartData]); // Add prepareChartData as dependency

  // Handle wallet change
  const handleWalletChange = (e) => {
    setSelectedWallet(e.target.value);
  };
  
  // Handle pie chart type change
  const handlePieChartTypeChange = (type) => {
    setPieChartType(type);
  };

  // helper: primary currency to display amounts (fallback to VND)
  const primaryCurrency = Object.keys(walletTotals)[0] || 'VND';

  // total across currencies isn't strictly correct for mixed currencies,
  // but we display primaryCurrency amount (existing behaviour in UI uses one currency)
  const totalExpenseForPrimary = expenseByCurrency[primaryCurrency] || 0;

  // --- New: compute today's transaction stats per wallet ---
  const computeTodayStats = () => {
    const txs = allTransactionsRef.current || [];
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    // build a map of wallets by id for quick lookup
    const walletMap = {};
    (wallets || []).forEach(w => { walletMap[String(w._id)] = w; });

    const stats = {};
    // initialize entries for all wallets (so wallets with 0 tx still show)
    (wallets || []).forEach(w => {
      stats[String(w._id)] = { walletId: String(w._id), name: w.name || '(Không tên)', currency: w.currency || primaryCurrency, income: 0, expense: 0, count: 0 };
    });

    txs.forEach(tx => {
      const txDate = tx.date ? new Date(tx.date) : null;
      if (!txDate) return;
      if (txDate < start || txDate > end) return;

      const wid = tx.wallet && (typeof tx.wallet === 'string' ? tx.wallet : (tx.wallet._id || tx.wallet));
      const key = wid ? String(wid) : 'unknown';
      if (!stats[key]) {
        // create synthetic entry if wallet not in current wallets list
        const w = walletMap[key];
        stats[key] = { walletId: key, name: (w && w.name) ? w.name : (tx.wallet && tx.wallet.name) || 'Ví khác', currency: (w && w.currency) ? w.currency : primaryCurrency, income: 0, expense: 0, count: 0 };
      }

      const amt = Number(tx.amount) || 0;
      if (tx.type === 'income') stats[key].income += amt;
      else stats[key].expense += amt;
      stats[key].count += 1;
    });

    // compute total row
    const totals = { income: 0, expense: 0, count: 0 };
    Object.values(stats).forEach(s => {
      totals.income += s.income;
      totals.expense += s.expense;
      totals.count += s.count;
    });

    return { perWallet: Object.values(stats), totals };
  };
  
  const todayStats = computeTodayStats();

  // New: export report of current-month transactions (optionally filtered by selectedWallet)
  const exportReport = async (format = 'csv', includeDetails = true) => {
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      // Decode user from token if available
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

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

      // Fetch categories so we can include them in the export
      let categories = [];
      try {
        const cRes = await fetch('http://localhost:5000/api/categories', { headers });
        if (cRes.ok) {
          const allCategories = await cRes.json();
          const uid = user && (user.id || user._id);
          if (uid) {
            // Keep only categories created by this user (owner === user id)
            categories = allCategories.filter(c => {
              const owner = c.owner;
              const ownerId = owner && (typeof owner === 'object' ? (owner._id || owner.id) : owner);
              return ownerId && String(ownerId) === String(uid);
            });
          } else {
            // no user info => do not include categories
            categories = [];
          }
        }
      } catch (err) {
        // ignore; we will still export without categories if fetch fails
        console.warn('Could not fetch categories for export', err);
      }

      // transactions for month
      const allTxs = (allTransactionsRef.current || []);
      const monthTxs = allTxs.filter(tx => {
        const txDate = tx.date ? new Date(tx.date) : null;
        if (!txDate || txDate < monthStart || txDate >= monthEnd) return false;
        if (selectedWallet && selectedWallet !== 'all') {
          const walletId = tx.wallet?._id || tx.wallet;
          return String(walletId) === String(selectedWallet);
        }
        return true;
      });

      // today's transactions
      const today = new Date();
      const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
      const endToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
      const todayTxs = allTxs.filter(tx => {
        const txDate = tx.date ? new Date(tx.date) : null;
        if (!txDate) return false;
        if (txDate < startToday || txDate > endToday) return false;
        if (selectedWallet && selectedWallet !== 'all') {
          const walletId = tx.wallet?._id || tx.wallet;
          return String(walletId) === String(selectedWallet);
        }
        return true;
      });

      // helper to map wallet/category to names
      const walletMap = {};
      (wallets || []).forEach(w => { walletMap[String(w._id)] = w.name || w._id; });

      const escapeCell = (cell) => {
        const s = cell === null || cell === undefined ? '' : String(cell);
        return `"${s.replace(/"/g, '""')}"`;
      };

      // Build CSV sections
      const sections = [];

      // Metadata section (user info)
      sections.push([['User Information']]);
      sections.push([['Field', 'Value']]);
      sections.push([['Name', user.name || user.fullName || user.username || '']]);
      sections.push([['Email', user.email || '']]);
      sections.push([['Export Period', `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`]]);
      sections.push([[]]); // blank line

      // Wallets section
      sections.push([['Wallets']]);
      sections.push([['Wallet ID', 'Name', 'Currency', 'Initial Balance']]);
      (wallets || []).forEach(w => {
        sections.push([[w._id || '', w.name || '', w.currency || '', w.initialBalance != null ? w.initialBalance : '']]);
      });
      sections.push([[]]);

      // Categories section
      sections.push([['Categories']]);
      sections.push([['Category ID', 'Name', 'Type', 'Icon', 'OwnerId', 'CreatedBy', 'CreatorName']]);
      (categories || []).forEach(c => {
        sections.push([[c._id || '', c.name || '', c.type || '', c.icon || '', c.owner || '', c.createdBy || '', c.creatorName || '']]);
      });
      sections.push([[]]);

      // Today's transactions section
      sections.push([['Transactions - Today']]);
      sections.push([['Date', 'Title', 'Wallet', 'Category', 'Type', 'Amount', 'Currency', 'Note']]);
      todayTxs.forEach(tx => {
        const date = tx.date ? (new Date(tx.date)).toLocaleString() : '';
        const title = tx.title || tx.description || '';
        const walletName = (tx.wallet && typeof tx.wallet !== 'string') ? (tx.wallet.name || '') : (walletMap[String(tx.wallet)] || tx.wallet || '');
        const categoryName = tx.category && (typeof tx.category !== 'string') ? (tx.category.name || '') : (tx.category || '');
        const type = tx.type || '';
        const amount = tx.amount != null ? Number(tx.amount) : '';
        const currency = (tx.wallet && tx.wallet.currency) || (tx.currency) || '';
        const note = includeDetails ? (tx.note || tx.description || '') : '';
        sections.push([[date, title, walletName, categoryName, type, amount, currency, note]]);
      });
      sections.push([[]]);

      // Month transactions section
      sections.push([['Transactions - This Month']]);
      sections.push([['Date', 'Title', 'Wallet', 'Category', 'Type', 'Amount', 'Currency', 'Note']]);
      monthTxs.forEach(tx => {
        const date = tx.date ? (new Date(tx.date)).toLocaleString() : '';
        const title = tx.title || tx.description || '';
        const walletName = (tx.wallet && typeof tx.wallet !== 'string') ? (tx.wallet.name || '') : (walletMap[String(tx.wallet)] || tx.wallet || '');
        const categoryName = tx.category && (typeof tx.category !== 'string') ? (tx.category.name || '') : (tx.category || '');
        const type = tx.type || '';
        const amount = tx.amount != null ? Number(tx.amount) : '';
        const currency = (tx.wallet && tx.wallet.currency) || (tx.currency) || '';
        const note = includeDetails ? (tx.note || tx.description || '') : '';
        sections.push([[date, title, walletName, categoryName, type, amount, currency, note]]);
      });

      // Flatten sections into CSV string
      const csvLines = [];
      sections.forEach(block => {
        block.forEach(row => {
          if (row.length === 0) {
            csvLines.push(''); // blank line
          } else {
            const line = row.map(cell => {
              // row elements might be arrays themselves (we used nested arrays to keep grouping)
              if (Array.isArray(cell)) {
                return cell.map(escapeCell).join(',');
              }
              return escapeCell(cell);
            }).join(',');
            csvLines.push(line);
          }
        });
      });

      const csvContent = '\uFEFF' + csvLines.join('\n'); // prepend BOM for Excel/UTF-8

      switch (format) {
        case 'csv':
          // Create a blob and trigger download
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          // sanitize user name for filename
          const safeName = (user.name || 'user').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
          link.href = url;
          link.setAttribute('download', `bao-cao-${safeName}-${now.getFullYear()}-${now.getMonth() + 1}.csv`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          break;

        case 'excel':
          alert('Tính năng xuất Excel sẽ sớm được hỗ trợ!');
          break;

        case 'pdf':
          alert('Tính năng xuất PDF sẽ sớm được hỗ trợ!');
          break;

        case 'print':
          // keep existing print behavior (fallback)
          {
            const printWindow = window.open('', '_blank');
            if (!printWindow) {
              alert('Vui lòng cho phép mở cửa sổ pop-up để sử dụng tính năng này.');
              return;
            }
            const walletTitle = selectedWallet !== 'all' 
              ? wallets.find(w => String(w._id) === selectedWallet)?.name || 'Ví đã chọn'
              : 'Tất cả ví';
            const title = `Báo cáo giao dịch - ${walletTitle} - Tháng ${now.getMonth() + 1}/${now.getFullYear()}`;
            // re-use earlier rows for monthTxs for print preview
            const rows = [];
            rows.push(['Ngày', 'Tiêu đề', 'Ví', 'Danh mục', 'Loại', 'Số tiền', 'Tiền tệ', 'Ghi chú']);
            monthTxs.forEach(tx => {
              const date = tx.date ? (new Date(tx.date)).toLocaleString() : '';
              const titleRow = tx.title || tx.description || '';
              const walletName = (tx.wallet && typeof tx.wallet !== 'string') ? (tx.wallet.name || '') : (walletMap[String(tx.wallet)] || tx.wallet || '');
              const categoryName = tx.category && (typeof tx.category !== 'string') ? (tx.category.name || '') : (tx.category || '');
              const typeRow = tx.type || '';
              const amount = tx.amount != null ? Number(tx.amount) : '';
              const currency = (tx.wallet && tx.wallet.currency) || (tx.currency) || '';
              const note = includeDetails ? (tx.note || tx.description || '') : '';
              rows.push([date, titleRow, walletName, categoryName, typeRow, amount, currency, note]);
            });

            const htmlContent = `
              <!DOCTYPE html>
              <html>
              <head>
                <title>${title}</title>
                <style>
                  body { font-family: Arial, sans-serif; margin: 20px; }
                  h1 { color: #2a5298; margin-bottom: 20px; }
                  table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                  th { background: #f8fafc; color: #334155; text-align: left; padding: 12px; }
                  td { border-bottom: 1px solid #e2e8f0; padding: 10px 12px; }
                  .income { color: #10b981; }
                  .expense { color: #ef4444; }
                  .report-info { margin-bottom: 20px; }
                  .report-info div { margin: 8px 0; }
                  @media print {
                    .no-print { display: none; }
                    body { margin: 0; padding: 15px; }
                  }
                </style>
              </head>
              <body>
                <div class="no-print" style="text-align: right; margin-bottom: 20px;">
                  <button onclick="window.print()">In báo cáo</button>
                  <button onclick="window.close()">Đóng</button>
                </div>
                
                <h1>${title}</h1>
                
                <div class="report-info">
                  <div><strong>Người xuất:</strong> ${user.name || ''} ${user.email ? `(${user.email})` : ''}</div>
                  <div><strong>Kỳ báo cáo:</strong> ${now.getMonth() + 1}/${now.getFullYear()}</div>
                  <div><strong>Số giao dịch (tháng):</strong> ${monthTxs.length}</div>
                  <div><strong>Ngày xuất:</strong> ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</div>
                </div>
                
                <table border="0" cellpadding="0" cellspacing="0">
                  <thead>
                    <tr>
                      ${rows[0].map(header => `<th>${header}</th>`).join('')}
                    </tr>
                  </thead>
                  <tbody>
                    ${rows.slice(1).map(row => `
                      <tr>
                        <td>${row[0]}</td>
                        <td>${row[1]}</td>
                        <td>${row[2]}</td>
                        <td>${row[3]}</td>
                        <td>${row[4] === 'income' ? 'Thu nhập' : 'Chi tiêu'}</td>
                        <td class="${row[4] === 'income' ? 'income' : 'expense'}">${row[5].toLocaleString()} ${row[6]}</td>
                        <td>${row[6]}</td>
                        <td>${includeDetails ? row[7] : ''}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
                
                <div style="margin-top: 40px; font-size: 0.9em; color: #64748b; text-align: center;">
                  © ${new Date().getFullYear()} Báo cáo tài chính cá nhân
                </div>
                
                <script>
                  window.onload = function() {
                    setTimeout(() => window.print(), 500);
                  }
                </script>
              </body>
              </html>
            `;
            printWindow.document.open();
            printWindow.document.write(htmlContent);
            printWindow.document.close();
          }
          break;

        default:
          throw new Error(`Định dạng "${format}" không được hỗ trợ.`);
      }
    } catch (err) {
      console.error('Export failed', err);
      throw err; // Re-throw to be handled by the modal
    }
  };
  
  // Get selected wallet name for the export modal
  const getSelectedWalletName = () => {
    if (selectedWallet === 'all') return 'Tất cả ví';
    const wallet = wallets.find(w => String(w._id) === selectedWallet);
    return wallet ? wallet.name : 'Ví đã chọn';
  };

  // Chart options for pie chart
  const pieOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          generateLabels: (chart) => {
            const datasets = chart.data.datasets;
            return chart.data.labels.map((label, i) => {
              const meta = chart.getDatasetMeta(0);
              const style = meta.controller && meta.controller.getStyle ? meta.controller.getStyle(i) : {};
              return {
                text: `${chartData.pieData?.icons?.[i] || ''} ${label}`,
                fillStyle: style.backgroundColor,
                strokeStyle: style.borderColor,
                lineWidth: style.borderWidth,
                hidden: isNaN(datasets[0].data[i]) || (meta.data[i] && meta.data[i].hidden),
                index: i
              };
            });
          }
        }
      },
      title: {
        display: true,
        text: pieChartType === 'expense' ? 'Chi tiêu theo danh mục' : 'Thu nhập theo danh mục',
        font: {
          size: 16,
          weight: 'bold'
        }
      }
    }
  };
  
  // Chart options for bar chart
  const barOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Thu nhập & Chi tiêu tháng này',
        font: {
          size: 16,
          weight: 'bold'
        }
      },
    },
  };

  // Use loading / error states to avoid ESLint unused-vars warning
  if (loading) {
    return (
      <div className="fd-root">
        <div className="fd-loading">Đang tải bảng điều khiển...</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="fd-root">
        <div className="fd-error">Lỗi: {error}</div>
      </div>
    );
  }
  
  return (
    <div className="fd-root" aria-label="Bảng điều khiển tài chính">
      {/* Export report button at top */}
      <div className="fd-export-wrap" style={{ marginBottom: 12 }}>
        <button 
          className="fd-export-btn" 
          onClick={() => setShowExportModal(true)} 
          aria-label="Xuất báo cáo"
        >
          Xuất báo cáo
        </button>
      </div>
      
      {/* Export Modal */}
      <ExportModal 
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={exportReport}
        selectedWallet={selectedWallet}
        walletName={getSelectedWalletName()}
        periodText={`Tháng ${new Date().getMonth() + 1}/${new Date().getFullYear()}`}
      />
      
      {/* Composition card: show expense structure at top */}
      <div className="fd-composition">
        <div className="fd-composition-inner">
          <div className="fd-comp-title">Cơ cấu chi tiêu</div>
          <div className="fd-comp-value">
            { (Object.keys(expenseByCurrency).length === 0) ? '0₫' : formatCurrency(totalExpenseForPrimary, primaryCurrency) }
          </div>
          <div className="fd-comp-sub">
            {topCategories.length === 0 ? (
              <div className="fd-comp-empty">Không có chi tiêu trong tháng này</div>
            ) : (
              <ul className="fd-comp-list">
                {topCategories.map((c, i) => {
                  const pct = totalExpenseForPrimary ? Math.round((c.total / totalExpenseForPrimary) * 100) : 0;
                  return (
                    <li key={c.id} className="fd-comp-item">
                      <span className="fd-comp-icon"> {/* if icon available show it (clients may provide icons) */}
                        { (c.icon) ? c.icon : '📌' }
                      </span>
                      <span className="fd-comp-name">{c.name}</span>
                      <span className="fd-comp-amt">{formatCurrency(c.total, primaryCurrency)} <small className="fd-comp-pct">({pct}%)</small></span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Bank-style header cards */}
      <div className="fd-cards bank-style">
        <div className="fd-card fd-account">
          <div className="fd-account-top">
            <div className="fd-account-title">Tất cả ví</div>
            {/* removed action buttons as requested */}
          </div>
          <div className="fd-account-balance">
            {Object.keys(walletTotals).length === 0 ? (
              <div className="fd-balance-main">0₫</div>
            ) : (
              // show primary currency first, then smaller lines
              (() => {
                const primary = Object.keys(walletTotals)[0];
                return (
                  <>
                    <div className="fd-balance-main">{formatCurrency(walletTotals[primary], primary)}</div>
                    <div className="fd-balance-sub">
                      {Object.keys(walletTotals).slice(1).map(c => (
                        <div key={c} className="fd-currency-line">{formatCurrency(walletTotals[c], c)}</div>
                      ))}
                    </div>
                  </>
                );
              })()
            )}
          </div>
          <div className="fd-account-meta">Số ví: {Object.values(walletTotals).length ? Object.values(walletTotals).length : 0} • Cập nhật mới nhất</div>
        </div>

        <div className="fd-rhs">
          <div className="fd-card fd-metric">
            <div className="fd-card-title">Thu tháng này</div>
            <div className="fd-card-value fd-money">
              {Object.keys(incomeByCurrency).length === 0 ? '0₫' : Object.keys(incomeByCurrency).map(c => (
                <div key={c} className="fd-currency-line" aria-label={`income-${c}`}>{formatCurrency(incomeByCurrency[c], c)}</div>
              ))}
            </div>
          </div>
          <div className="fd-card fd-metric">
            <div className="fd-card-title">Chi tháng này</div>
            <div className="fd-card-value fd-money expense">
              {Object.keys(expenseByCurrency).length === 0 ? '0₫' : Object.keys(expenseByCurrency).map(c => (
                <div key={c} className="fd-currency-line" aria-label={`expense-${c}`}>{formatCurrency(expenseByCurrency[c], c)}</div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Chart Section */}
      <div className="fd-chart-section">
        <div className="fd-chart-header">
          <h3 className="fd-chart-title">Biểu đồ phân tích</h3>
          <div className="fd-wallet-selector">
            <label htmlFor="wallet-select">Chọn ví:</label>
            <select 
              id="wallet-select" 
              value={selectedWallet} 
              onChange={handleWalletChange}
              className="fd-wallet-select"
            >
              <option value="all">Tất cả ví</option>
              {wallets.map(wallet => (
                <option key={wallet._id} value={wallet._id}>
                  {wallet.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        
        <div className="fd-charts-container">
          <div className="fd-chart-wrapper fd-bar-chart">
            {chartData.barData && <Bar options={barOptions} data={chartData.barData} />}
          </div>
          
          <div className="fd-chart-wrapper fd-pie-chart">
            <div className="fd-pie-chart-controls">
              <div className="fd-chart-type-toggle">
                <button 
                  className={`fd-chart-type-btn ${pieChartType === 'expense' ? 'active' : ''}`}
                  onClick={() => handlePieChartTypeChange('expense')}
                >
                  Chi tiêu
                </button>
                <button 
                  className={`fd-chart-type-btn ${pieChartType === 'income' ? 'active' : ''}`}
                  onClick={() => handlePieChartTypeChange('income')}
                >
                  Thu nhập
                </button>
              </div>
            </div>
            {chartData.pieData && <Pie options={pieOptions} data={chartData.pieData} />}
          </div>
        </div>
      </div>

      <div className="fd-sections">
        <div className="fd-section fd-topcats">
          <div className="fd-section-title">Top danh mục (tháng)</div>
          {topCategories.length === 0 ? <div className="fd-empty">Chưa có dữ liệu</div> : (
            <ul>
              {topCategories.map((c, idx) => (
                <li key={c.id}><span className="fd-rank">{idx+1}.</span> <span className="fd-cat">{c.name}</span> <span className="fd-amt">{formatCurrency(c.total, Object.keys(walletTotals)[0] || 'VND')}</span></li>
              ))}
            </ul>
          )}
        </div>

        <div className="fd-section fd-recent">
          <div className="fd-section-title">Giao dịch gần nhất</div>
          {recentTxs.length === 0 ? <div className="fd-empty">Không có giao dịch</div> : (
            <ul>
              {recentTxs.map(tx => (
                <li key={tx._id} className="fd-tx">
                  <div className="fd-tx-left">
                    <div className="fd-tx-title">{tx.title || tx.description || '—'}</div>
                    <div className="fd-tx-meta">{(tx.wallet && tx.wallet.name) || ''} • {tx.category && tx.category.name ? tx.category.name : ''}</div>
                  </div>
                  <div className={`fd-tx-amt ${tx.type === 'income' ? 'income' : 'expense'}`}>
                    {(tx.type === 'income' ? '+' : '-')}{formatCurrency(tx.amount, (tx.wallet && tx.wallet.currency) || 'VND')}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Daily transactions stats (moved from HomePage) */}
      <div style={{ marginTop: 16 }} className="home-stat-table">
        <div className="home-stat-title" style={{ marginBottom: 8, fontWeight: 800 }}>Bảng thống kê giao dịch trong ngày</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #eee' }}>
              <th style={{ padding: '10px 8px' }}>Ví</th>
              <th style={{ padding: '10px 8px' }}>Thu</th>
              <th style={{ padding: '10px 8px' }}>Chi</th>
              <th style={{ padding: '10px 8px' }}>Net</th>
              <th style={{ padding: '10px 8px' }}>Giao dịch</th>
            </tr>
          </thead>
          <tbody>
            { /* nếu không có giao dịch hôm nay */ }
            {todayStats.totals.count === 0 ? (
              <tr>
                <td colSpan="5" style={{ padding: '18px', textAlign: 'center', color: '#888', fontWeight: 700 }}>
                  Hôm nay chưa có giao dịch nào
                </td>
              </tr>
            ) : (
              <>
                { /* chỉ hiển thị những ví có giao dịch (count > 0) */ }
                {todayStats.perWallet.filter(w => w.count > 0).map(w => (
                  <tr key={w.walletId} style={{ borderBottom: '1px solid #f5f7fa' }}>
                    <td style={{ padding: '10px 8px' }}>{w.name}</td>
                    <td style={{ padding: '10px 8px', color: '#1b8e5a', fontWeight: 700 }}>{formatCurrency(w.income, w.currency)}</td>
                    <td style={{ padding: '10px 8px', color: '#c93e3e', fontWeight: 700 }}>{formatCurrency(w.expense, w.currency)}</td>
                    <td style={{ padding: '10px 8px', fontWeight: 800 }}>{formatCurrency((w.income - w.expense), w.currency)}</td>
                    <td style={{ padding: '10px 8px' }}>{w.count}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 800 }}>
                  <td style={{ padding: '10px 8px' }}>Tổng</td>
                  <td style={{ padding: '10px 8px', color: '#1b8e5a' }}>{formatCurrency(todayStats.totals.income, primaryCurrency)}</td>
                  <td style={{ padding: '10px 8px', color: '#c93e3e' }}>{formatCurrency(todayStats.totals.expense, primaryCurrency)}</td>
                  <td style={{ padding: '10px 8px' }}>{formatCurrency((todayStats.totals.income - todayStats.totals.expense), primaryCurrency)}</td>
                  <td style={{ padding: '10px 8px' }}>{todayStats.totals.count}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}




