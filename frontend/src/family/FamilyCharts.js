import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import FamilySidebar from './FamilySidebar';
import './FamilyCharts.css';
import { showNotification } from '../utils/notify';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  BarElement,
  Tooltip,
  Legend,
  Title
} from 'chart.js';
import { Line, Bar, Pie } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  BarElement,
  Tooltip,
  Legend,
  Title
);

export default function FamilyCharts() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [familyInfo, setFamilyInfo] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  // Chart data states
  const [monthlyData, setMonthlyData] = useState([]);
  const [categoryData, setCategoryData] = useState([]);
  const [incomeCategoryData, setIncomeCategoryData] = useState([]);
  const [expenseCategoryData, setExpenseCategoryData] = useState([]);
  const [budgetData, setBudgetData] = useState([]);
  const [activityData, setActivityData] = useState([]);
  const [topTransactions, setTopTransactions] = useState([]);
  const [selectedCategoryType, setSelectedCategoryType] = useState('expense'); // 'income' or 'expense'
  const [selectedMonth, setSelectedMonth] = useState(() => {
    // Mặc định là tháng hiện tại (YYYY-MM)
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [memberExpenseData, setMemberExpenseData] = useState([]);
  const [memberIncomeData, setMemberIncomeData] = useState([]);
  const [isOwner, setIsOwner] = useState(false);
  const [weeklyExpenseData, setWeeklyExpenseData] = useState([]); // Dữ liệu chi tiêu theo tuần
  const [topCategoriesData, setTopCategoriesData] = useState([]); // Top 10 danh mục chi tiêu

  const API_BASE = 'http://localhost:5000';
  const token = localStorage.getItem('token');
  const selectedFamilyId = localStorage.getItem('selectedFamilyId');

  // Get current user
  const getCurrentUser = useCallback(() => {
    try {
      const t = token;
      if (!t) return null;
      const payload = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return {
        id: payload.id || payload._id || payload.userId || '',
        name: payload.name || '',
        email: payload.email || ''
      };
    } catch (e) { return null; }
  }, [token]);

  // Fetch family info
  const fetchFamilyInfo = useCallback(async () => {
    if (!token || !selectedFamilyId) return;
    try {
      const res = await fetch(`${API_BASE}/api/family/${selectedFamilyId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      setFamilyInfo(data);
      
      // Kiểm tra xem user hiện tại có phải là owner không
      const user = getCurrentUser();
      if (user && data.owner) {
        const ownerId = data.owner._id || data.owner.id || data.owner;
        const isUserOwner = String(ownerId) === String(user.id);
        setIsOwner(isUserOwner);
      }
    } catch (err) {
      console.error('Error fetching family info:', err);
    }
  }, [token, selectedFamilyId, API_BASE, getCurrentUser]);

  // Fetch chart data
  const fetchChartData = useCallback(async () => {
    if (!token || !selectedFamilyId || !selectedMonth) return;
    
    setLoading(true);
    setError('');
    
    try {
      // Parse selected month
      const [year, month] = selectedMonth.split('-').map(Number);
      if (!year || !month || isNaN(year) || isNaN(month)) {
        setLoading(false);
        return;
      }
      
      const startOfMonth = new Date(year, month - 1, 1);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
      
      // Monthly transactions data - CHỈ LẤY GIAO DỊCH GIA ĐÌNH (family), KHÔNG LẤY GIAO DỊCH CÁ NHÂN (personal)
      const monthlyRes = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/transactions/monthly?transactionScope=family`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (monthlyRes.ok) {
        const monthly = await monthlyRes.json();
        setMonthlyData(monthly);
      }

      // Category breakdown - CHỈ LẤY GIAO DỊCH GIA ĐÌNH (family), KHÔNG LẤY GIAO DỊCH CÁ NHÂN (personal)
      // Lấy cả thu nhập và chi tiêu riêng biệt
      
      // Fetch expense categories - CHỈ giao dịch gia đình
      const expenseRes = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/transactions?type=expense&transactionScope=family&startDate=${startOfMonth.toISOString()}&endDate=${endOfMonth.toISOString()}&excludeActivities=true&limit=1000`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Fetch income categories - CHỈ giao dịch gia đình
      const incomeRes = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/transactions?type=income&transactionScope=family&startDate=${startOfMonth.toISOString()}&endDate=${endOfMonth.toISOString()}&excludeActivities=true&limit=1000`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const expenseData = expenseRes.ok ? await expenseRes.json() : { transactions: [] };
      const incomeData = incomeRes.ok ? await incomeRes.json() : { transactions: [] };
      
      // Xử lý chi tiêu - nhóm theo category (CHỈ giao dịch gia đình)
      const expenseMap = {};
      if (expenseData.transactions) {
        expenseData.transactions.forEach(tx => {
          // CHỈ tính giao dịch có transactionScope === 'family'
          if (tx.transactionScope === 'family') {
            const catId = tx.category?._id || 'expense-other';
            const catName = tx.category?.name || 'Chi tiêu khác';
            
            if (!expenseMap[catId]) {
              expenseMap[catId] = { 
                name: catName, 
                value: 0
              };
            }
            expenseMap[catId].value += tx.amount || 0;
          }
        });
      }
      
      // Xử lý thu nhập - nhóm theo category (CHỈ giao dịch gia đình)
      const incomeMap = {};
      if (incomeData.transactions) {
        incomeData.transactions.forEach(tx => {
          // CHỈ tính giao dịch có transactionScope === 'family'
          if (tx.transactionScope === 'family') {
            const catId = tx.category?._id || 'income-other';
            const catName = tx.category?.name || 'Thu nhập khác';
            
            if (!incomeMap[catId]) {
              incomeMap[catId] = { 
                name: catName, 
                value: 0
              };
            }
            incomeMap[catId].value += tx.amount || 0;
          }
        });
      }
      
      // Chuyển thành mảng và sắp xếp theo giá trị giảm dần
      const expenseCategories = Object.values(expenseMap)
        .sort((a, b) => b.value - a.value);
      
      const incomeCategories = Object.values(incomeMap)
        .sort((a, b) => b.value - a.value);
      
      setExpenseCategoryData(expenseCategories);
      setIncomeCategoryData(incomeCategories);
      
      // Giữ categoryData cho tương thích (mặc định là chi tiêu)
      setCategoryData(expenseCategories);

      // Budget data - Lấy từ budgets hoặc budgetHistory tùy theo tháng được chọn
      const currentDate = new Date();
      const currentMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
      const selectedMonthDate = new Date(year, month - 1, 1);
      const isPastMonth = selectedMonthDate < new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      
      let budgetsWithSpent = [];
      
      if (isPastMonth) {
        // Nếu là tháng quá khứ: lấy từ budgetHistory
        const historyRes = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/budget-history`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (historyRes.ok) {
          const history = await historyRes.json();
          // Lọc history có tháng trùng với tháng được chọn
          // Lấy những record có startDate thuộc tháng được chọn
          const filteredHistory = history.filter(budgetHistory => {
            if (!budgetHistory.startDate) return false;
            const historyStart = new Date(budgetHistory.startDate);
            const historyMonth = `${historyStart.getFullYear()}-${String(historyStart.getMonth() + 1).padStart(2, '0')}`;
            // Kiểm tra xem tháng của startDate có trùng với tháng được chọn không
            return historyMonth === selectedMonth;
          });
          
          // Chuyển đổi budgetHistory thành format giống budgets để tương thích
          budgetsWithSpent = filteredHistory.map(budgetHistory => ({
            _id: budgetHistory._id,
            category: budgetHistory.category,
            amount: budgetHistory.amount,
            spent: budgetHistory.spent || 0,
            date: budgetHistory.startDate, // Dùng startDate làm date
            note: budgetHistory.note || '',
            isFromHistory: true // Đánh dấu là từ history
          }));
        }
      } else {
        // Nếu là tháng hiện tại hoặc tương lai: lấy từ budgets
        const budgetRes = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/budget`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (budgetRes.ok) {
          const budgets = await budgetRes.json();
          // Lọc budgets có tháng trùng với tháng được chọn
          const filteredBudgets = budgets.filter(budget => {
            if (!budget.date) return false;
            const budgetDate = new Date(budget.date);
            const budgetMonth = `${budgetDate.getFullYear()}-${String(budgetDate.getMonth() + 1).padStart(2, '0')}`;
            return budgetMonth === selectedMonth;
          });
          
          // Tính spent cho mỗi budget trong tháng được chọn
          budgetsWithSpent = await Promise.all(filteredBudgets.map(async (budget) => {
            const categoryId = budget.category?._id || budget.category;
            if (!categoryId) return { ...budget, spent: 0 };
            
            // Tính spent trực tiếp từ transactions trong tháng được chọn
            const txRes = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/transactions?type=expense&category=${categoryId}&startDate=${startOfMonth.toISOString()}&endDate=${endOfMonth.toISOString()}&transactionScope=family&excludeActivities=true`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            
            if (txRes.ok) {
              const txData = await txRes.json();
              const spent = (txData.transactions || []).reduce((sum, tx) => sum + (tx.amount || 0), 0);
              return {
                ...budget,
                spent,
                isFromHistory: false
              };
            }
            return { ...budget, spent: 0, isFromHistory: false };
          }));
        }
      }
      
      setBudgetData(budgetsWithSpent);

      // Activity data (deposits/withdrawals) - Lấy trong tháng được chọn
      // Activity thường hiển thị 7 ngày gần nhất, nhưng ta sẽ filter theo tháng
      const activityRes = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/transactions?tags=transfer&startDate=${startOfMonth.toISOString()}&endDate=${endOfMonth.toISOString()}&limit=1000`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (activityRes.ok) {
        const activityTransactions = await activityRes.json();
        // Nhóm theo ngày trong tháng
        const activityMap = {};
        if (activityTransactions.transactions) {
          activityTransactions.transactions.forEach(tx => {
            const date = new Date(tx.date);
            const dateKey = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
            const dayName = date.toLocaleDateString('vi-VN', { weekday: 'short' });
            
            if (!activityMap[dateKey]) {
              activityMap[dateKey] = {
                name: dayName,
                date: dateKey,
                deposits: 0,
                withdrawals: 0
              };
            }
            
            // Phân loại nạp/rút dựa vào tags
            // tags có thể là string hoặc array
            const tags = Array.isArray(tx.tags) ? tx.tags : (tx.tags ? [tx.tags] : []);
            if (tags.includes('to-family') || (tags.includes('transfer') && tx.type === 'income')) {
              activityMap[dateKey].deposits += tx.amount || 0;
            } else if (tags.includes('from-family') || (tags.includes('transfer') && tx.type === 'expense')) {
              activityMap[dateKey].withdrawals += tx.amount || 0;
            }
          });
        }
        const activities = Object.values(activityMap).sort((a, b) => {
          const dateA = new Date(a.date.split('/').reverse().join('-'));
          const dateB = new Date(b.date.split('/').reverse().join('-'));
          return dateA - dateB;
        });
        setActivityData(activities);
      }

      // Top transactions - CHỈ lấy giao dịch gia đình trong tháng được chọn
      const topRes = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/transactions?transactionScope=family&startDate=${startOfMonth.toISOString()}&endDate=${endOfMonth.toISOString()}&excludeActivities=true&limit=5&sort=amount&order=desc`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (topRes.ok) {
        const topData = await topRes.json();
        // Lọc chỉ lấy giao dịch gia đình
        const familyTransactions = (topData.transactions || []).filter(tx => tx.transactionScope === 'family');
        setTopTransactions(familyTransactions);
      }

      // Weekly expense data - Chi tiêu theo tuần trong tháng (CHỈ giao dịch gia đình)
      const weeklyRes = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/transactions?type=expense&transactionScope=family&startDate=${startOfMonth.toISOString()}&endDate=${endOfMonth.toISOString()}&excludeActivities=true&limit=1000`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (weeklyRes.ok) {
        const weeklyData = await weeklyRes.json();
        const weeklyMap = {};
        const daysInMonth = new Date(year, month, 0).getDate(); // Số ngày trong tháng
        
        if (weeklyData.transactions) {
          weeklyData.transactions.forEach(tx => {
            if (tx.transactionScope === 'family') {
              const date = new Date(tx.date);
              const dayOfMonth = date.getDate();
              // Tính tuần trong tháng: Tuần 1 (1-7), Tuần 2 (8-14), Tuần 3 (15-21), Tuần 4 (22-28), Tuần 5 (29-31)
              const weekNumber = Math.ceil(dayOfMonth / 7);
              
              if (!weeklyMap[weekNumber]) {
                const weekStart = (weekNumber - 1) * 7 + 1;
                const weekEnd = Math.min(weekNumber * 7, daysInMonth);
                weeklyMap[weekNumber] = {
                  week: `Tuần ${weekNumber} (${weekStart}-${weekEnd})`,
                  weekNumber: weekNumber,
                  expense: 0
                };
              }
              weeklyMap[weekNumber].expense += tx.amount || 0;
            }
          });
        }
        
        const weeklyArray = Object.values(weeklyMap).sort((a, b) => a.weekNumber - b.weekNumber);
        setWeeklyExpenseData(weeklyArray);
      }

      // Top 10 categories - Top 10 danh mục chi tiêu nhiều nhất (CHỈ giao dịch gia đình)
      // Sử dụng expenseCategories đã tính ở trên
      const top10 = expenseCategories
        .slice(0, 10)
        .map((item, index) => ({
          ...item,
          rank: index + 1
        }));
      setTopCategoriesData(top10);

      // Fetch member transaction data (chỉ cho owner)
      // Sử dụng familyInfo đã có thay vì fetch lại
      if (isOwner && familyInfo && familyInfo.members && familyInfo.members.length > 0) {
        const memberStats = {};
        
        // Khởi tạo stats cho mỗi thành viên
        familyInfo.members.forEach(member => {
          const memberId = member.user?._id || member.user;
          const memberName = member.user?.name || member.userName || member.email || 'Thành viên';
          if (memberId) {
            memberStats[String(memberId)] = {
              name: memberName,
              expense: 0,
              income: 0
            };
          }
        });
        
        // Fetch expense transactions cá nhân (personal) của từng thành viên
        // CHỈ LẤY GIAO DỊCH CÁ NHÂN (personal), KHÔNG LẤY GIAO DỊCH GIA ĐÌNH (family)
        const allExpenseRes = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/transactions?type=expense&transactionScope=personal&startDate=${startOfMonth.toISOString()}&endDate=${endOfMonth.toISOString()}&excludeActivities=true&limit=1000`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (allExpenseRes.ok) {
          const expenseData = await allExpenseRes.json();
          if (expenseData.transactions) {
            expenseData.transactions.forEach(tx => {
              // CHỈ tính giao dịch có transactionScope === 'personal'
              if (tx.transactionScope === 'personal') {
                const creatorId = tx.createdBy?._id || tx.createdBy;
                if (creatorId && memberStats[String(creatorId)]) {
                  memberStats[String(creatorId)].expense += tx.amount || 0;
                }
              }
            });
          }
        }
        
        // Fetch income transactions cá nhân (personal) của từng thành viên
        // CHỈ LẤY GIAO DỊCH CÁ NHÂN (personal), KHÔNG LẤY GIAO DỊCH GIA ĐÌNH (family)
        const allIncomeRes = await fetch(`${API_BASE}/api/family/${selectedFamilyId}/transactions?type=income&transactionScope=personal&startDate=${startOfMonth.toISOString()}&endDate=${endOfMonth.toISOString()}&excludeActivities=true&limit=1000`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (allIncomeRes.ok) {
          const incomeData = await allIncomeRes.json();
          if (incomeData.transactions) {
            incomeData.transactions.forEach(tx => {
              // CHỈ tính giao dịch có transactionScope === 'personal'
              if (tx.transactionScope === 'personal') {
                const creatorId = tx.createdBy?._id || tx.createdBy;
                if (creatorId && memberStats[String(creatorId)]) {
                  memberStats[String(creatorId)].income += tx.amount || 0;
                }
              }
            });
          }
        }
        
        // Chuyển thành mảng và sắp xếp
        const expenseData = Object.values(memberStats)
          .filter(m => m.expense > 0)
          .sort((a, b) => b.expense - a.expense);
        
        const incomeData = Object.values(memberStats)
          .filter(m => m.income > 0)
          .sort((a, b) => b.income - a.income);
        
        setMemberExpenseData(expenseData);
        setMemberIncomeData(incomeData);
      } else if (!isOwner) {
        // Nếu không phải owner, xóa dữ liệu
        setMemberExpenseData([]);
        setMemberIncomeData([]);
      }
    } catch (err) {
      console.error('Error fetching chart data:', err);
      setError('Không thể tải dữ liệu biểu đồ');
    } finally {
      setLoading(false);
    }
  }, [token, selectedFamilyId, API_BASE, selectedMonth, isOwner, familyInfo]);

  // Effect để fetch familyInfo khi mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    const selectedFamilyId = localStorage.getItem('selectedFamilyId');
    
    if (!token) {
      navigate('/login');
      return;
    }
    
    if (!selectedFamilyId) {
      navigate('/family-selector');
      return;
    }
    
    setCurrentUser(getCurrentUser());
    // Fetch familyInfo trước, sau đó fetch chart data
    fetchFamilyInfo().then(() => {
      // Sau khi có familyInfo, mới fetch chart data lần đầu
      if (selectedMonth) {
        fetchChartData();
      }
    });
  }, [navigate, getCurrentUser, fetchFamilyInfo]); // Chỉ chạy 1 lần khi mount

  // Effect riêng để fetch chart data khi selectedMonth hoặc isOwner thay đổi
  useEffect(() => {
    if (!token || !selectedFamilyId || !selectedMonth) return;
    
    // Debounce: Chỉ fetch sau khi người dùng dừng đổi tháng trong 300ms
    const timer = setTimeout(() => {
      fetchChartData();
    }, 300);
    
    return () => clearTimeout(timer);
  }, [selectedMonth, isOwner, fetchChartData, token, selectedFamilyId]);

  // Colors for charts
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];
  const INCOME_COLORS = ['#00C49F', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#86efac']; // Các sắc thái xanh lá cho thu nhập
  const EXPENSE_COLORS = ['#FF8042', '#FF5722', '#ef4444', '#f87171', '#0088FE', '#8884D8', '#FFBB28', '#f59e0b']; // Các màu cho chi tiêu

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  // Calculate budget completion rate
  const getBudgetCompletionRate = () => {
    if (budgetData.length === 0) return 0;
    const totalBudget = budgetData.reduce((sum, b) => sum + (b.amount || 0), 0);
    const totalSpent = budgetData.reduce((sum, b) => sum + (b.spent || 0), 0);
    return totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
  };

  // Prepare Line Chart data for monthly transactions - dùng useMemo để tránh re-render
  const lineChartData = useMemo(() => ({
    labels: monthlyData.map(item => item.month),
    datasets: [
      {
        label: 'Thu nhập',
        data: monthlyData.map(item => item.income || 0),
        borderColor: '#00C49F',
        backgroundColor: 'rgba(0, 196, 159, 0.1)',
        tension: 0.4,
        fill: true,
        borderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBackgroundColor: '#00C49F',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
      },
      {
        label: 'Chi tiêu',
        data: monthlyData.map(item => item.expense || 0),
        borderColor: '#FF8042',
        backgroundColor: 'rgba(255, 128, 66, 0.1)',
        tension: 0.4,
        fill: true,
        borderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBackgroundColor: '#FF8042',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
      }
    ]
  }), [monthlyData]);

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          usePointStyle: true,
          padding: 15,
          font: {
            size: 12,
            weight: '600'
          }
        }
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            return `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value) {
            return formatCurrency(value);
          },
          font: {
            size: 11
          }
        },
        grid: {
          color: 'rgba(59, 130, 246, 0.1)'
        }
      },
      x: {
        grid: {
          display: false
        },
        ticks: {
          font: {
            size: 11
          }
        }
      }
    }
  };

  // Prepare Pie Chart data dựa vào loại được chọn - dùng useMemo
  const currentCategoryData = selectedCategoryType === 'income' ? incomeCategoryData : expenseCategoryData;
  
  const pieChartData = useMemo(() => ({
    labels: currentCategoryData.map(item => item.name),
    datasets: [
      {
        data: currentCategoryData.map(item => item.value),
        backgroundColor: selectedCategoryType === 'income' 
          ? INCOME_COLORS 
          : EXPENSE_COLORS,
        borderColor: '#ffffff',
        borderWidth: 2,
        hoverBorderWidth: 3,
      }
    ]
  }), [currentCategoryData, selectedCategoryType]);

  const pieChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'right',
        labels: {
          usePointStyle: true,
          padding: 12,
          font: {
            size: 11,
            weight: '600'
          },
          generateLabels: function(chart) {
            const data = chart.data;
            if (data.labels.length && data.datasets.length) {
              const dataset = data.datasets[0];
              const total = dataset.data.reduce((sum, val) => sum + val, 0);
              return data.labels.map((label, i) => {
                const value = dataset.data[i];
                const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                return {
                  text: `${label} (${percentage}%)`,
                  fillStyle: dataset.backgroundColor[i],
                  strokeStyle: dataset.borderColor,
                  lineWidth: dataset.borderWidth,
                  hidden: false,
                  index: i
                };
              });
            }
            return [];
          }
        }
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            const label = context.label || '';
            const value = context.parsed || 0;
            const total = context.dataset.data.reduce((sum, val) => sum + val, 0);
            const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
            return `${label}: ${formatCurrency(value)} (${percentage}%)`;
          }
        }
      }
    }
  };

  // Prepare Bar Chart data for activity (deposits/withdrawals) - dùng useMemo
  const barChartData = useMemo(() => ({
    labels: activityData.map(item => item.name),
    datasets: [
      {
        label: 'Nạp tiền',
        data: activityData.map(item => item.deposits || 0),
        backgroundColor: 'rgba(0, 196, 159, 0.8)',
        borderColor: '#00C49F',
        borderWidth: 2,
        borderRadius: 6,
      },
      {
        label: 'Rút tiền',
        data: activityData.map(item => item.withdrawals || 0),
        backgroundColor: 'rgba(255, 128, 66, 0.8)',
        borderColor: '#FF8042',
        borderWidth: 2,
        borderRadius: 6,
      }
    ]
  }), [activityData]);

  const barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          usePointStyle: true,
          padding: 15,
          font: {
            size: 12,
            weight: '600'
          }
        }
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            return `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value) {
            return formatCurrency(value);
          },
          font: {
            size: 11
          }
        },
        grid: {
          color: 'rgba(59, 130, 246, 0.1)'
        }
      },
      x: {
        grid: {
          display: false
        },
        ticks: {
          font: {
            size: 11
          }
        }
      }
    }
  };

  // Prepare Member Expense Bar Chart data (chỉ cho owner) - dùng useMemo
  const memberExpenseChartData = useMemo(() => ({
    labels: memberExpenseData.map(item => item.name),
    datasets: [
      {
        label: 'Chi tiêu',
        data: memberExpenseData.map(item => item.expense),
        backgroundColor: 'rgba(255, 128, 66, 0.8)',
        borderColor: '#FF8042',
        borderWidth: 2,
        borderRadius: 6,
      }
    ]
  }), [memberExpenseData]);

  // Prepare Member Income Bar Chart data (chỉ cho owner) - dùng useMemo
  const memberIncomeChartData = useMemo(() => ({
    labels: memberIncomeData.map(item => item.name),
    datasets: [
      {
        label: 'Thu nhập',
        data: memberIncomeData.map(item => item.income),
        backgroundColor: 'rgba(0, 196, 159, 0.8)',
        borderColor: '#00C49F',
        borderWidth: 2,
        borderRadius: 6,
      }
    ]
  }), [memberIncomeData]);

  const memberBarChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            return `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value) {
            return formatCurrency(value);
          },
          font: {
            size: 11
          }
        },
        grid: {
          color: 'rgba(59, 130, 246, 0.1)'
        }
      },
      x: {
        grid: {
          display: false
        },
        ticks: {
          font: {
            size: 11
          }
        }
      }
    }
  };

  // Prepare Weekly Expense Chart data - dùng useMemo
  const weeklyExpenseChartData = useMemo(() => ({
    labels: weeklyExpenseData.map(item => item.week),
    datasets: [
      {
        label: 'Chi tiêu theo tuần',
        data: weeklyExpenseData.map(item => item.expense),
        backgroundColor: 'rgba(255, 128, 66, 0.8)',
        borderColor: '#FF8042',
        borderWidth: 2,
        borderRadius: 6,
      }
    ]
  }), [weeklyExpenseData]);

  const weeklyExpenseChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'x',
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            return `Chi tiêu: ${formatCurrency(context.parsed.y)}`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value) {
            return formatCurrency(value);
          },
          font: {
            size: 11
          }
        },
        grid: {
          color: 'rgba(59, 130, 246, 0.1)'
        }
      },
      x: {
        grid: {
          display: false
        },
        ticks: {
          font: {
            size: 11
          }
        }
      }
    }
  };

  // Prepare Top Categories Horizontal Bar Chart data - dùng useMemo
  const topCategoriesChartData = useMemo(() => ({
    labels: topCategoriesData.map(item => item.name),
    datasets: [
      {
        label: 'Chi tiêu',
        data: topCategoriesData.map(item => item.value),
        backgroundColor: topCategoriesData.map((item, index) => {
          const colors = ['#FF8042', '#FF5722', '#ef4444', '#f87171', '#FFBB28', '#f59e0b', '#8884D8', '#0088FE', '#82CA9D', '#00C49F'];
          return colors[index % colors.length];
        }),
        borderColor: '#ffffff',
        borderWidth: 2,
        borderRadius: 6,
      }
    ]
  }), [topCategoriesData]);

  const topCategoriesChartOptions = {
    indexAxis: 'y', // Horizontal bar chart
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            const total = topCategoriesData.reduce((sum, item) => sum + item.value, 0);
            const percentage = total > 0 ? Math.round((context.parsed.x / total) * 100) : 0;
            return `${context.label}: ${formatCurrency(context.parsed.x)} (${percentage}%)`;
          }
        }
      }
    },
    scales: {
      x: {
        beginAtZero: true,
        ticks: {
          callback: function(value) {
            return formatCurrency(value);
          },
          font: {
            size: 11
          }
        },
        grid: {
          color: 'rgba(59, 130, 246, 0.1)'
        }
      },
      y: {
        grid: {
          display: false
        },
        ticks: {
          font: {
            size: 11
          }
        }
      }
    }
  };

  return (
    <div className="family-page">
      <FamilySidebar active="charts" />
      
      <main className="family-main">
        <header className="fc-header">
          <div className="fc-header-main">
            <div className="fc-header-title-section">
              <div>
                <h1><i className="fas fa-chart-bar"></i> Biểu đồ Gia đình</h1>
                <p>Phân tích tài chính và hoạt động gia đình</p>
              </div>
              <div className="fc-month-filter">
                <label htmlFor="month-filter">
                  <i className="fas fa-calendar"></i> Chọn tháng:
                </label>
                <input
                  id="month-filter"
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="fc-month-input"
                />
              </div>
            </div>
          </div>
        </header>

        <div className="fc-content">
          {loading ? (
            <div className="fc-loading">
              <div className="fc-loading-spinner"></div>
              <p>Đang tải dữ liệu biểu đồ...</p>
            </div>
          ) : error ? (
            <div className="fc-error">
              <i className="fas fa-exclamation-triangle"></i>
              <p>{error}</p>
              <button onClick={fetchChartData} className="fc-retry-btn">
                Thử lại
              </button>
            </div>
          ) : (
            <div className="fc-charts-grid">
              {/* Monthly Transactions Chart - Line Chart */}
              <div className="fc-chart-card">
                <div className="fc-chart-header">
                  <h3><i className="fas fa-calendar-alt"></i> Giao dịch theo tháng</h3>
                  <span className="fc-chart-badge">Line Chart</span>
                </div>
                <div className="fc-chart-content">
                  {monthlyData.length > 0 ? (
                    <Line data={lineChartData} options={lineChartOptions} />
                  ) : (
                    <div className="fc-empty-chart">
                      <i className="fas fa-chart-line"></i>
                      <p>Chưa có dữ liệu giao dịch</p>
                      <small>Hãy thêm giao dịch để xem biểu đồ theo tháng</small>
                    </div>
                  )}
                </div>
              </div>

              {/* Category Breakdown - Pie Chart */}
              <div className="fc-chart-card">
                <div className="fc-chart-header">
                  <h3><i className="fas fa-pie-chart"></i> Phân bổ theo danh mục</h3>
                  <span className="fc-chart-badge">Pie Chart</span>
                </div>
                <div className="fc-chart-content">
                  {/* Toggle buttons */}
                  <div className="fc-category-toggle">
                    <button
                      className={`fc-toggle-btn ${selectedCategoryType === 'income' ? 'active' : ''}`}
                      onClick={() => setSelectedCategoryType('income')}
                    >
                      <i className="fas fa-arrow-up"></i> Thu nhập
                    </button>
                    <button
                      className={`fc-toggle-btn ${selectedCategoryType === 'expense' ? 'active' : ''}`}
                      onClick={() => setSelectedCategoryType('expense')}
                    >
                      <i className="fas fa-arrow-down"></i> Chi tiêu
                    </button>
                  </div>
                  
                  {currentCategoryData.length > 0 ? (
                    <div style={{ width: '100%', height: 'calc(100% - 60px)', minHeight: '280px' }}>
                      <Pie data={pieChartData} options={pieChartOptions} />
                    </div>
                  ) : (
                    <div className="fc-empty-chart">
                      <i className="fas fa-chart-pie"></i>
                      <p>
                        {selectedCategoryType === 'income' 
                          ? 'Chưa có giao dịch thu nhập nào' 
                          : 'Chưa có giao dịch chi tiêu nào'}
                      </p>
                      <small>
                        {selectedCategoryType === 'income'
                          ? 'Hãy thêm giao dịch thu nhập để xem phân bổ theo danh mục'
                          : 'Hãy thêm giao dịch chi tiêu để xem phân bổ theo danh mục'}
                      </small>
                    </div>
                  )}
                </div>
              </div>

              {/* Budget Progress */}
              <div className="fc-chart-card">
                <div className="fc-chart-header">
                  <h3><i className="fas fa-wallet"></i> Ngân sách hiện tại</h3>
                  <span className="fc-chart-badge">Progress</span>
                </div>
                <div className="fc-chart-content">
                  <div className="fc-budget-list">
                    {budgetData.slice(0, 5).map((budget, index) => {
                      const percentage = budget.amount > 0 ? Math.round((budget.spent / budget.amount) * 100) : 0;
                      const status = percentage >= 100 ? 'over' : percentage >= 80 ? 'warning' : 'good';
                      
                      return (
                        <div key={index} className="fc-budget-item">
                          <div className="fc-budget-info">
                            <span className="fc-budget-name">{budget.category?.name || 'Danh mục'}</span>
                            <span className="fc-budget-amount">
                              {formatCurrency(budget.spent)} / {formatCurrency(budget.amount)}
                            </span>
                          </div>
                          <div className="fc-budget-bar">
                            <div 
                              className={`fc-budget-fill ${status}`}
                              style={{ width: `${Math.min(percentage, 100)}%` }}
                            ></div>
                          </div>
                          <span className={`fc-budget-percentage ${status}`}>{percentage}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Budget Completion Gauge */}
              <div className="fc-chart-card">
                <div className="fc-chart-header">
                  <h3><i className="fas fa-tachometer-alt"></i> Tốc độ hoàn thành ngân sách</h3>
                  <span className="fc-chart-badge">Gauge</span>
                </div>
                <div className="fc-chart-content">
                  <div className="fc-gauge-container">
                    <div className="fc-gauge">
                      <div className="fc-gauge-circle">
                        <div 
                          className="fc-gauge-fill"
                          style={{ 
                            background: `conic-gradient(#00C49F 0deg, #00C49F ${getBudgetCompletionRate() * 3.6}deg, #e2e8f0 ${getBudgetCompletionRate() * 3.6}deg, #e2e8f0 360deg)` 
                          }}
                        ></div>
                        <div className="fc-gauge-center">
                          <span className="fc-gauge-value">{getBudgetCompletionRate()}%</span>
                          <span className="fc-gauge-label">Hoàn thành</span>
                        </div>
                      </div>
                    </div>
                    <div className="fc-gauge-legend">
                      <div className="fc-gauge-legend-item">
                        <span className="fc-gauge-dot good"></span>
                        <span>Tốt (&lt;80%)</span>
                      </div>
                      <div className="fc-gauge-legend-item">
                        <span className="fc-gauge-dot warning"></span>
                        <span>Cảnh báo (80-99%)</span>
                      </div>
                      <div className="fc-gauge-legend-item">
                        <span className="fc-gauge-dot over"></span>
                        <span>Vượt quá (≥100%)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Activity Chart - Bar Chart */}
              <div className="fc-chart-card">
                <div className="fc-chart-header">
                  <h3><i className="fas fa-exchange-alt"></i> Hoạt động nạp rút</h3>
                  <span className="fc-chart-badge">Bar Chart</span>
                </div>
                <div className="fc-chart-content">
                  {activityData.length > 0 ? (
                    <Bar data={barChartData} options={barChartOptions} />
                  ) : (
                    <div className="fc-empty-chart">
                      <i className="fas fa-exchange-alt"></i>
                      <p>Chưa có hoạt động nạp/rút</p>
                      <small>Hoạt động nạp rút tiền sẽ được hiển thị tại đây</small>
                    </div>
                  )}
                </div>
              </div>

              {/* Top Transactions List */}
              <div className="fc-chart-card">
                <div className="fc-chart-header">
                  <h3><i className="fas fa-star"></i> Giao dịch hàng đầu</h3>
                  <span className="fc-chart-badge">List</span>
                </div>
                <div className="fc-chart-content">
                  <div className="fc-top-list">
                    {topTransactions.slice(0, 5).map((transaction, index) => (
                      <div key={index} className="fc-top-item">
                        <div className="fc-top-rank">#{index + 1}</div>
                        <div className="fc-top-info">
                          <div className="fc-top-description">{transaction.description}</div>
                          <div className="fc-top-meta">
                            <span className="fc-top-category">{transaction.category?.name}</span>
                            <span className="fc-top-date">{new Date(transaction.date).toLocaleDateString('vi-VN')}</span>
                          </div>
                        </div>
                        <div className={`fc-top-amount ${transaction.type}`}>
                          {transaction.type === 'expense' ? '-' : '+'}{formatCurrency(transaction.amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Weekly Expense Chart - Xu hướng chi tiêu theo tuần */}
              <div className="fc-chart-card">
                <div className="fc-chart-header">
                  <h3><i className="fas fa-calendar-week"></i> Chi tiêu theo tuần trong tháng</h3>
                  <span className="fc-chart-badge">Bar Chart</span>
                </div>
                <div className="fc-chart-content">
                  {weeklyExpenseData.length > 0 ? (
                    <Bar data={weeklyExpenseChartData} options={weeklyExpenseChartOptions} />
                  ) : (
                    <div className="fc-empty-chart">
                      <i className="fas fa-chart-bar"></i>
                      <p>Chưa có dữ liệu chi tiêu theo tuần</p>
                      <small>Dữ liệu chi tiêu theo tuần sẽ được hiển thị tại đây</small>
                    </div>
                  )}
                </div>
              </div>

              {/* Top 10 Categories Chart - Top 10 danh mục chi tiêu */}
              <div className="fc-chart-card">
                <div className="fc-chart-header">
                  <h3><i className="fas fa-tags"></i> Top 10 danh mục chi tiêu</h3>
                  <span className="fc-chart-badge">Horizontal Bar</span>
                </div>
                <div className="fc-chart-content">
                  {topCategoriesData.length > 0 ? (
                    <Bar data={topCategoriesChartData} options={topCategoriesChartOptions} />
                  ) : (
                    <div className="fc-empty-chart">
                      <i className="fas fa-tags"></i>
                      <p>Chưa có dữ liệu danh mục chi tiêu</p>
                      <small>Top 10 danh mục chi tiêu sẽ được hiển thị tại đây</small>
                    </div>
                  )}
                </div>
              </div>

              {/* Member Charts - Chỉ hiển thị cho owner */}
              {isOwner && (
                <>
                  {/* Member Expense Chart */}
                  <div className="fc-chart-card fc-owner-only">
                    <div className="fc-chart-header">
                      <h3><i className="fas fa-users"></i> Chi tiêu theo thành viên</h3>
                      <span className="fc-chart-badge">Owner Only</span>
                    </div>
                    <div className="fc-chart-content">
                      {memberExpenseData.length > 0 ? (
                        <Bar data={memberExpenseChartData} options={memberBarChartOptions} />
                      ) : (
                        <div className="fc-empty-chart">
                          <i className="fas fa-user-times"></i>
                          <p>Chưa có chi tiêu của thành viên nào</p>
                          <small>Dữ liệu chi tiêu của các thành viên sẽ được hiển thị tại đây</small>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Member Income Chart */}
                  <div className="fc-chart-card fc-owner-only">
                    <div className="fc-chart-header">
                      <h3><i className="fas fa-users"></i> Thu nhập theo thành viên</h3>
                      <span className="fc-chart-badge">Owner Only</span>
                    </div>
                    <div className="fc-chart-content">
                      {memberIncomeData.length > 0 ? (
                        <Bar data={memberIncomeChartData} options={memberBarChartOptions} />
                      ) : (
                        <div className="fc-empty-chart">
                          <i className="fas fa-user-times"></i>
                          <p>Chưa có thu nhập của thành viên nào</p>
                          <small>Dữ liệu thu nhập của các thành viên sẽ được hiển thị tại đây</small>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
