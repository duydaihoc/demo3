import React, { useEffect, useState, useRef, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react';
import './FinanceDashboard.css';
import SpendingTimeline from './SpendingTimeline';
// Import Chart.js
import { 
  Chart as ChartJS, 
  ArcElement, 
  Tooltip, 
  Legend, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title,
  LineElement,
  PointElement 
} from 'chart.js';
import { Pie, Bar, Line } from 'react-chartjs-2'; // add Line
import ExportModal from '../components/ExportModal';

// Register Chart.js components
ChartJS.register(
  ArcElement, 
  Tooltip, 
  Legend, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title,
  LineElement,
  PointElement
);

const FinanceDashboard = forwardRef((props, ref) => {
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
  // Add new state for stock-like chart data
  const [stockChartData, setStockChartData] = useState(null);
  // NEW: AI insights states
  const [insights, setInsights] = useState([]);
  const [insightsChartData, setInsightsChartData] = useState(null);
  // NEW: keep objects with types for badges
  const [detailedInsightObjects, setDetailedInsightObjects] = useState([]);
  
  // Format currency with appropriate locale
  const formatCurrency = (amount, currency) => {
    try {
      return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: currency || 'VND' }).format(amount);
    } catch {
      return `${amount} ${currency || ''}`;
    }
  };

  // Function to prepare chart data based on transactions and selected wallet
  const prepareChartData = useCallback((transactions, selectedWalletId = 'all', chartType = 'expense') => {
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
      const catIcon = category.icon || '';
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
      
    // Prepare pie chart data based on currently selected type passed as parameter
    let pieData;
    
    if (chartType === 'expense') {
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
  }, []);

  // New function to prepare column chart data for income/expense
  const prepareStockChartData = useCallback((transactions, walletsList) => {
    // Get the last 30 days for the chart
    const dates = [];
    const now = new Date();
    for (let i = 30; i >= 0; i--) {
      const date = new Date();
      date.setDate(now.getDate() - i);
      dates.push(date);
    }
    
    // Format dates for display
    const dateLabels = dates.map(date => 
      date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
    );
    
    // Calculate daily income and expense
    const dailyIncome = Array(dates.length).fill(0);
    const dailyExpense = Array(dates.length).fill(0);
    
    transactions.forEach(tx => {
      const txDate = tx.date ? new Date(tx.date) : null;
      if (!txDate) return;
      
      // Find the index of this date in our dates array
      const dayIndex = dates.findIndex(date => 
        date.getDate() === txDate.getDate() && 
        date.getMonth() === txDate.getMonth() && 
        date.getFullYear() === txDate.getFullYear()
      );
      
      if (dayIndex !== -1) {
        const amount = Number(tx.amount) || 0;
        if (tx.type === 'income') {
          dailyIncome[dayIndex] += amount;
        } else {
          dailyExpense[dayIndex] += amount;
        }
      }
    });
    
    // Convert expenses to negative values for the chart
    const negativeExpenses = dailyExpense.map(val => -val);
    
    // Calculate total volume for reference
    let totalIncome = dailyIncome.reduce((sum, val) => sum + val, 0);
    let totalExpense = dailyExpense.reduce((sum, val) => sum + val, 0);
    let netChange = totalIncome - totalExpense;
    let percentChange = totalIncome > 0 ? (netChange / totalIncome * 100).toFixed(2) : 0;
    
    return {
      labels: dateLabels,
      datasets: [
        {
          label: 'Thu nhập',
          data: dailyIncome,
          backgroundColor: 'rgba(46, 204, 113, 0.7)',
          borderColor: 'rgba(46, 204, 113, 1)',
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false,
        },
        {
          label: 'Chi tiêu',
          data: negativeExpenses,
          backgroundColor: 'rgba(231, 76, 60, 0.7)',
          borderColor: 'rgba(231, 76, 60, 1)',
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false,
        }
      ],
      performanceChange: percentChange
    };
  }, []);

  // NEW: Compute AI spending insights for last 3 months (mở rộng trả về rawData)
  const computeInsights = useCallback((txs = []) => {
    const now = new Date();
    // Build last 3 months windows [M-2, M-1, M]
    const months = [];
    for (let i = 2; i >= 0; i--) {
      const b = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        label: b.toLocaleDateString('vi-VN', { month: '2-digit', year: '2-digit' }),
        start: new Date(b.getFullYear(), b.getMonth(), 1),
        end: new Date(b.getFullYear(), b.getMonth() + 1, 1)
      });
    }

    const perMonthTotals = [];
    const perMonthByCat = [];
    const perMonthNightExpense = [];

    months.forEach((m, idx) => {
      const monthTx = txs.filter(t => {
        if (!t?.date) return false;
        const d = new Date(t.date);
        return d >= m.start && d < m.end && t.type === 'expense';
      });
      const total = monthTx.reduce((s, t) => s + (Number(t.amount) || 0), 0);
      perMonthTotals.push(total);

      const catMap = {};
      let night = 0;
      monthTx.forEach(t => {
        const catName = (t.category && t.category.name) || 'Khác';
        catMap[catName] = (catMap[catName] || 0) + (Number(t.amount) || 0);
        const hr = new Date(t.date).getHours();
        if (hr < 6 || hr >= 21) night += (Number(t.amount) || 0);
      });
      perMonthByCat.push({ total, catMap });
      perMonthNightExpense[idx] = night;
    });

    const ins = [];

    // Top category share (current month vs previous)
    if (perMonthByCat[2]?.total > 0) {
      const entries = Object.entries(perMonthByCat[2].catMap).sort((a, b) => b[1] - a[1]);
      const [topCat, topAmt] = entries[0] || ['Khác', 0];
      const share = Math.round((topAmt / perMonthByCat[2].total) * 100);
      let deltaTxt = '';
      if (perMonthByCat[1]?.total > 0) {
        const prevTopAmt = perMonthByCat[1].catMap[topCat] || 0;
        const prevShare = Math.round((prevTopAmt / perMonthByCat[1].total) * 100);
        const diff = share - prevShare;
        if (diff !== 0) {
          deltaTxt = diff > 0 ? `, tăng ${diff}% so với tháng trước` : `, giảm ${Math.abs(diff)}% so với tháng trước`;
        }
      }
      ins.push(`Bạn chi ${share}% cho ${topCat}${deltaTxt}.`);
      if (share >= 30) {
        ins.push(`Gợi ý: đặt mục tiêu tiết kiệm 5–10% cho danh mục ${topCat} trong tháng tới.`);
      }
    }

    // Night spending change
    if (perMonthNightExpense[2] != null && perMonthNightExpense[1] != null && perMonthNightExpense[1] > 0) {
      const change = Math.round(((perMonthNightExpense[2] - perMonthNightExpense[1]) / perMonthNightExpense[1]) * 100);
      if (Math.abs(change) >= 20) {
        ins.push(`Chi tiêu ban đêm ${change >= 0 ? 'tăng' : 'giảm'} ${Math.abs(change)}% so với tháng trước.`);
      }
    }

    // Prepare rawData for detailed analysis
    const monthExpenseArray = perMonthTotals.slice();
    const currentMonthCats = perMonthByCat[2]?.catMap || {};
    const prevMonthCats = perMonthByCat[1]?.catMap || {};
    const currentMonthTotal = perMonthByCat[2]?.total || 0;
    const prevMonthTotal = perMonthByCat[1]?.total || 0;

    const lineData = {
      labels: months.map(m => m.label),
      datasets: [
        {
          label: 'Chi tiêu theo tháng',
          data: perMonthTotals,
          borderColor: 'rgba(231, 76, 60, 0.9)',
          backgroundColor: 'rgba(231, 76, 60, 0.25)',
          tension: 0.35,
          pointRadius: 3,
          pointHoverRadius: 4
        }
      ]
    };

    return { insights: ins, lineData, rawData: {
      months,
      monthExpenseArray,
      currentMonthCats,
      prevMonthCats,
      currentMonthTotal,
      prevMonthTotal,
      nightExpenseCurrent: perMonthNightExpense[2] || 0,
      nightExpensePrev: perMonthNightExpense[1] || 0
    }};
  }, []);

  // NEW: Hàm tạo gợi ý chi tiết hơn
  const generateDetailedSuggestions = useCallback((txs = [], rawData) => {
    if (!txs.length || !rawData) return [];
    const suggestions = [];
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    // Lấy giao dịch tháng hiện tại
    const monthStart = new Date(year, month, 1);
    const nextMonthStart = new Date(year, month + 1, 1);
    const monthTxs = txs.filter(t => {
      if (!t.date) return false;
      const d = new Date(t.date);
      return d >= monthStart && d < nextMonthStart && t.type === 'expense';
    });

    const dayCountSoFar = Math.max(1, (now - monthStart) / 86400000 + 1);
    const spentSoFar = monthTxs.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const avgPerDay = spentSoFar / dayCountSoFar;
    const forecast = Math.round((avgPerDay * (nextMonthStart - monthStart) / 86400000) || 0);

    // So sánh trung bình ngày với tháng trước
    const prevMonthStart = new Date(year, month - 1, 1);
    const prevMonthEnd = new Date(year, month, 1);
    const prevMonthTxs = txs.filter(t => {
      if (!t.date) return false;
      const d = new Date(t.date);
      return d >= prevMonthStart && d < prevMonthEnd && t.type === 'expense';
    });
    const prevSpent = prevMonthTxs.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const prevDayCount = (prevMonthEnd - prevMonthStart) / 86400000;
    const prevAvgPerDay = prevSpent / (prevDayCount || 1);
    const avgDiffPct = prevAvgPerDay > 0 ? Math.round(((avgPerDay - prevAvgPerDay) / prevAvgPerDay) * 100) : 0;

    suggestions.push({
      type: 'trend',
      text: `Trung bình bạn chi khoảng ${avgPerDay.toLocaleString('vi-VN')}₫ mỗi ngày, ${avgDiffPct === 0 ? 'tương đương' : (avgDiffPct > 0 ? 'cao hơn' : 'thấp hơn')} ${Math.abs(avgDiffPct)}% so với tháng trước.`
    });

    suggestions.push({
      type: 'forecast',
      text: `Dự báo cuối tháng này bạn có thể tiêu khoảng ${forecast.toLocaleString('vi-VN')}₫ nếu giữ nhịp độ hiện tại.`
    });

    // Danh mục tăng mạnh nhất
    const catGrowth = [];
    Object.keys(rawData.currentMonthCats).forEach(cat => {
      const curAmt = rawData.currentMonthCats[cat] || 0;
      const prevAmt = rawData.prevMonthCats[cat] || 0;
      const diff = curAmt - prevAmt;
      const pct = prevAmt > 0 ? Math.round((diff / prevAmt) * 100) : (curAmt > 0 ? 100 : 0);
      if (curAmt > 0) {
        catGrowth.push({ cat, curAmt, diff, pct });
      }
    });
    catGrowth.sort((a,b) => b.pct - a.pct);
    if (catGrowth[0]) {
      const g = catGrowth[0];
      if (g.pct >= 30) {
        suggestions.push({
          type: 'alert',
          text: `Danh mục "${g.cat}" tăng ${g.pct}% so với tháng trước (hiện tại: ${g.curAmt.toLocaleString('vi-VN')}₫). Cân nhắc đặt giới hạn hoặc xem lại nhu cầu.`
        });
      }
    }

    // Ví chi tiêu lớn nhất (expense)
    const walletExpenseMap = {};
    monthTxs.forEach(t => {
      const wName = (t.wallet && t.wallet.name) || 'Ví khác';
      walletExpenseMap[wName] = (walletExpenseMap[wName] || 0) + (Number(t.amount) || 0);
    });
    const walletRank = Object.entries(walletExpenseMap).sort((a,b)=>b[1]-a[1]);
    if (walletRank[0]) {
      suggestions.push({
        type: 'focus',
        text: `Ví "${walletRank[0][0]}" chi nhiều nhất: ${walletRank[0][1].toLocaleString('vi-VN')}₫ trong tháng này. Bạn có thể ưu tiên kiểm tra lại các giao dịch ở ví này.`
      });
    }

    // Tiềm năng tiết kiệm: nếu top danh mục >35% tổng chi
    const totalCur = rawData.currentMonthTotal;
    if (totalCur > 0) {
      const entries = Object.entries(rawData.currentMonthCats).sort((a,b)=>b[1]-a[1]);
      const [topCat, topAmt] = entries[0] || ['Khác', 0];
      const share = Math.round((topAmt / totalCur) * 100);
      if (share >= 35) {
        const saveTarget = Math.round(topAmt * 0.05);
        suggestions.push({
          type: 'action',
          text: `Nếu giảm 5% chi ở "${topCat}" (~${saveTarget.toLocaleString('vi-VN')}₫) bạn sẽ cải thiện ngân sách rõ rệt.`
        });
      }
    }

    // Cảnh báo chi tiêu ban đêm tăng mạnh
    const nightCur = rawData.nightExpenseCurrent;
    const nightPrev = rawData.nightExpensePrev;
    if (nightPrev > 0) {
      const nightDiffPct = Math.round(((nightCur - nightPrev) / nightPrev) * 100);
      if (nightDiffPct >= 40 && nightCur > 0) {
        suggestions.push({
          type: 'alert',
          text: `Chi tiêu ban đêm đã tăng ${nightDiffPct}% (hiện tại: ${nightCur.toLocaleString('vi-VN')}₫). Hãy xem có thể chuyển sang mua ban ngày để kiểm soát tốt hơn.`
        });
      }
    }

    // Gợi ý đặt mục tiêu tiết kiệm tổng quát
    if (forecast > 0 && rawData.prevMonthTotal > 0) {
      const potentialCut = Math.round(forecast * 0.08);
      suggestions.push({
        type: 'action',
        text: `Đặt mục tiêu tiết kiệm thêm 8% tháng này (~${potentialCut.toLocaleString('vi-VN')}₫) dựa trên dự báo chi tiêu hiện tại.`
      });
    }

    return suggestions;
  }, []);

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

  // NEW: Line options for insights chart (fix no-undef)
  const insightLineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: {
        display: true,
        text: 'Xu hướng chi tiêu 3 tháng gần đây',
        font: { size: 14, weight: 'bold' }
      },
      tooltip: {
        callbacks: {
          label: (ctx) => `${Number(ctx.raw || 0).toLocaleString('vi-VN')}₫`
        }
      }
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        grid: { color: 'rgba(0,0,0,0.05)' },
        ticks: {
          callback: (v) => `${Number(v).toLocaleString('vi-VN')}₫`,
          font: { size: 10 }
        }
      }
    }
  };

  // Stock chart options - updated for column chart
  const stockOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        grid: {
          display: false,
          drawBorder: false,
        },
        ticks: {
          font: {
            size: 10,
          },
          maxRotation: 0
        }
      },
      y: {
        grid: {
          color: 'rgba(0, 0, 0, 0.05)',
        },
        ticks: {
          callback: (value) => `${Math.abs(value).toLocaleString('vi-VN')}₫`,
          font: {
            size: 10,
          }
        }
      }
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
      },
      title: {
        display: true,
        text: 'Biến động số dư theo thời gian',
        font: {
          size: 16,
          weight: 'bold'
        }
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const value = context.raw;
            const formattedValue = Math.abs(value).toLocaleString('vi-VN') + '₫';
            return `${context.dataset.label}: ${formattedValue}`;
          }
        }
      }
    },
    interaction: {
      mode: 'index',
      intersect: false,
    },
  };

  // NEW: lookup map from detailed objects (fix no-undef)
  const typeLookup = useMemo(() => {
    const map = {};
    detailedInsightObjects.forEach(o => { map[o.text] = o.type; });
    return map;
  }, [detailedInsightObjects]);

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
        
        // Prepare initial chart data - pass pieChartType as parameter
        const chartData = prepareChartData(txs, 'all', pieChartType);
        setChartData(chartData);
        
        // Prepare stock chart data
        const stockData = prepareStockChartData(txs, wallets);
        setStockChartData(stockData);

        // Try server-side insights, fallback to client compute
        try {
          const token = localStorage.getItem('token');
          const headers = token ? { Authorization: `Bearer ${token}` } : {};
          const res = await fetch(`http://localhost:5000/api/ai/insights?months=3`, { headers, signal: ctrl.signal });
          const localAi = computeInsights(txs); // luôn chuẩn bị fallback + dữ liệu biểu đồ

          if (res.ok) {
            const data = await res.json();

            // Nếu backend có trả về insight từ AI (Gemini)
            const aiItems = Array.isArray(data.aiItems) ? data.aiItems : [];
            if (aiItems.length) {
              const detailed = aiItems.map(item => ({
                text: item.text,
                // map type AI (TREND/FORECAST/ALERT/FOCUS) -> class css dạng thường
                type: item.type ? String(item.type).toLowerCase() : 'basic'
              }));
              setDetailedInsightObjects(detailed);
              setInsights(detailed.map(d => d.text));
            } else {
              // Fallback: tự tính insight chi tiết trên frontend
              const detailed = generateDetailedSuggestions(txs, localAi.rawData);
              setDetailedInsightObjects(detailed);
              const baseSuggestions = Array.isArray(data.suggestions) ? data.suggestions : localAi.insights;
              const mergedTexts = [...new Set([...baseSuggestions, ...detailed.map(d => d.text)])];
              setInsights(mergedTexts);
            }

            setInsightsChartData(data.lineData || localAi.lineData);
          } else {
            const detailed = generateDetailedSuggestions(txs, localAi.rawData);
            setDetailedInsightObjects(detailed);
            const mergedTexts = [...new Set([...localAi.insights, ...detailed.map(d => d.text)])];
            setInsights(mergedTexts);
            setInsightsChartData(localAi.lineData);
          }
        } catch {
          const localAi = computeInsights(txs);
          const detailed = generateDetailedSuggestions(txs, localAi.rawData);
          setDetailedInsightObjects(detailed);
          const mergedTexts = [...new Set([...localAi.insights, ...detailed.map(d => d.text)])];
          setInsights(mergedTexts);
          setInsightsChartData(localAi.lineData);
        }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepareChartData, prepareStockChartData, computeInsights]);

  // Update chart when wallet selection changes or pie chart type changes
  useEffect(() => {
    if (allTransactionsRef.current.length) {
      // Pass pieChartType as parameter
      const chartData = prepareChartData(allTransactionsRef.current, selectedWallet, pieChartType);
      setChartData(chartData);
      
      // Also update stock chart when wallet selection changes
      const stockData = prepareStockChartData(allTransactionsRef.current, wallets);
      setStockChartData(stockData);
    }
  }, [selectedWallet, pieChartType, prepareChartData, prepareStockChartData, wallets]);

  // Handle wallet change
  const handleWalletChange = (e) => {
    setSelectedWallet(e.target.value);
  };
  
  // Handle pie chart type change
  const handlePieChartTypeChange = (type) => {
    setPieChartType(type);
  };

  // When Export modal is open, mark body and ensure overlays take precedence over Leaflet panes
  useEffect(() => {
    if (showExportModal) document.body.classList.add('export-open');
    else document.body.classList.remove('export-open');
    return () => document.body.classList.remove('export-open');
  }, [showExportModal]);

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

  // Get selected wallet name for the export modal
  const getSelectedWalletName = () => {
    if (selectedWallet === 'all') return 'Tất cả ví';
    const wallet = wallets.find(w => String(w._id) === selectedWallet);
    return wallet ? wallet.name : 'Ví đã chọn';
  };

  // Expose function to open export modal via ref
  useImperativeHandle(ref, () => ({
    openExportModal: () => {
      setShowExportModal(true);
    }
  }));

  return (
    <div className="fd-root tour-stats-component" aria-label="Bảng điều khiển tài chính">
      {/* Export Modal - Pass necessary data to handle export processing */}
      <ExportModal 
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        selectedWallet={selectedWallet}
        walletName={getSelectedWalletName()}
        periodText={`Tháng ${new Date().getMonth() + 1}/${new Date().getFullYear()}`}
        wallets={wallets}
        transactions={allTransactionsRef.current}
        token={localStorage.getItem('token')}
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
                        { (c.icon) ? c.icon : '' }
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
        
        {/* Stock-like chart - now a column chart */}
        <div className="fd-stock-chart-container">
          <div className="fd-stock-chart-header">
            <div className="fd-stock-chart-title">
              Biến động số dư theo thời gian
              {stockChartData && stockChartData.performanceChange && (
                <span className={`fd-stock-performance ${stockChartData.performanceChange >= 0 ? 'positive' : 'negative'}`}>
                  {stockChartData.performanceChange >= 0 ? '+' : ''}{stockChartData.performanceChange}%
                </span>
              )}
            </div>
            <div className="fd-stock-chart-period">30 ngày gần nhất</div>
          </div>
          <div className="fd-stock-chart">
            {stockChartData && <Bar options={stockOptions} data={stockChartData} height={200} />}
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

      {/* NEW: AI Spending Insights */}
      <div className="fd-insights">
        <div className="fd-insights-header">
          <div className="fd-insights-title">Trợ lý tài chính thông minh</div>
          <div className="fd-insights-sub">Phân tích thói quen chi tiêu cá nhân</div>
        </div>
        <div className="fd-insights-body">
          <div className="fd-insights-chart">
            {insightsChartData && <Line data={insightsChartData} options={insightLineOptions} height={150} />}
          </div>
          <ul className="fd-insights-list">
            {insights && insights.length > 0 ? (
              insights.map((t, i) => {
                const tType = typeLookup[t];
                return (
                  <li key={i} className={`ins-item ${tType || 'basic'}`}>
                    <span className="dot">•</span>
                    {tType && <span className={`ins-badge ins-${tType}`}>{tType}</span>}
                    <span className="ins-text">{t}</span>
                  </li>
                );
              })
            ) : (
              <li className="ins-item basic"><span className="dot">•</span><span className="ins-text">Chưa đủ dữ liệu để phân tích.</span></li>
            )}
          </ul>
        </div>
      </div>

      {/* Timeline chi tiêu (moved here, above daily stats table) */}
      <SpendingTimeline />

      {/* Daily transactions stats (kept below timeline) */}
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
});

export default FinanceDashboard;





