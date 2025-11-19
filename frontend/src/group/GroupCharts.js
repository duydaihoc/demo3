import React, { useMemo, useState, useEffect, useRef } from 'react';
import './GroupCharts.css';
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
	TimeScale
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import * as d3 from 'd3';

ChartJS.register(
	CategoryScale,
	LinearScale,
	PointElement,
	LineElement,
	ArcElement,
	BarElement,
	Tooltip,
	Legend,
	TimeScale,
	zoomPlugin
);

export default function GroupCharts({ txs = [], members = [] }) {
	// State for tab switching between chart views
	const [activeTab, setActiveTab] = useState('transactions');
	const [isLoading, setIsLoading] = useState(false);
	const networkChartRef = useRef(null);
	const lineChartRef = useRef(null);
	
	// build a lookup map: id/email -> displayName (prefer name)
	const memberNameMap = useMemo(() => {
		const map = {};
		if (!Array.isArray(members)) return map;
		for (const m of members) {
			const name = m.name || (m.user && (m.user.name || m.user.email)) || (m.email || null);
			const id = m.user && (m.user._id || m.user.id || m.user) ? String(m.user._id || m.user.id || m.user) : null;
			const email = (m.email || '').toLowerCase().trim();
			if (id) map[id] = name;
			if (email) map[email] = name;
			// also support populated user object under m.user with email
			if (m.user && typeof m.user === 'object') {
				const muId = m.user._id || m.user.id || null;
				const muEmail = (m.user.email || '').toLowerCase().trim();
				const muName = m.user.name || name;
				if (muId) map[String(muId)] = muName;
				if (muEmail) map[muEmail] = muName;
			}
		}
		return map;
	}, [members]);

	// Generate modern gradient colors for each member - Updated to blue/teal theme
	const memberColors = useMemo(() => {
		const colors = [
			'linear-gradient(135deg, #2a5298 0%, #4ecdc4 100%)',
			'linear-gradient(135deg, #1e40af 0%, #06b6d4 100%)',
			'linear-gradient(135deg, #3b82f6 0%, #14b8a6 100%)',
			'linear-gradient(135deg, #2563eb 0%, #10b981 100%)',
			'linear-gradient(135deg, #1d4ed8 0%, #059669 100%)',
			'linear-gradient(135deg, #0ea5e9 0%, #22d3ee 100%)',
			'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
			'linear-gradient(135deg, #0369a1 0%, #5eead4 100%)',
			'linear-gradient(135deg, #075985 0%, #67e8f9 100%)',
			'linear-gradient(135deg, #0c4a6e 0%, #99f6e4 100%)',
		];
		
		const memberIds = Object.keys(memberNameMap);
		const colorMap = {};
		
		memberIds.forEach((id, index) => {
			colorMap[id] = colors[index % colors.length];
		});
		
		return colorMap;
	}, [memberNameMap]);
	
	// Get the total transactions amount for summary display
	const totalTransactionsAmount = useMemo(() => {
		return (txs || []).reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
	}, [txs]);

	// Aggregate transactions by date with improved data visualization
	const byDate = useMemo(() => {
		const map = new Map();
		const now = new Date();
		const sixMonthsAgo = new Date();
		sixMonthsAgo.setMonth(now.getMonth() - 6);
		
		// Create series of dates for past six months
		for (let d = new Date(sixMonthsAgo); d <= now; d.setDate(d.getDate() + 1)) {
			const key = d.toISOString().slice(0, 10);
			map.set(key, 0);
		}
		
		// Add transaction amounts to corresponding dates
		for (const tx of (txs || [])) {
			const d = new Date(tx.date || tx.createdAt || Date.now());
			if (isNaN(d.getTime())) continue;
			const key = d.toISOString().slice(0, 10);
			const amt = Number(tx.amount || 0);
			map.set(key, (map.get(key) || 0) + amt);
		}
		
		// Format for nice display
		const keys = Array.from(map.keys()).sort();
		const values = keys.map(k => map.get(k) || 0);
		
		// Get cumulative total for line chart
		const cumulative = [];
		let runningTotal = 0;
		values.forEach(val => {
			runningTotal += val;
			cumulative.push(runningTotal);
		});
		
		// Format dates for better display
		const displayDates = keys.map(date => {
			const d = new Date(date);
			return `${d.getDate()}/${d.getMonth() + 1}`;
		});
		
		// Return full data - we'll use zoom to show only last 5 days initially
		return { 
			keys: displayDates, 
			values, 
			cumulative,
			totalLength: displayDates.length
		};
	}, [txs]);

	// Calculate debt balances between members with enhanced details
	const debtBalances = useMemo(() => {
		// Track who owes whom
		const balances = new Map();
		
		// Process all transactions
		for (const tx of (txs || [])) {
			if (!Array.isArray(tx.participants) || !tx.payer) continue;
			
			// Get payer ID
			const payerId = (typeof tx.payer === 'object') 
				? (tx.payer._id || tx.payer.id) 
				: tx.payer;
				
			if (!payerId) continue;
			
			// Process each participant's debt to the payer
			for (const participant of tx.participants) {
				// Skip if settled
				if (participant.settled) continue;
				
				const userId = (participant.user && typeof participant.user === 'object')
					? (participant.user._id || participant.user.id)
					: participant.user;
					
				const userEmail = participant.email;
				
				// Skip if participant is payer (self-payment)
				if (userId && userId === payerId) continue;
				if (userEmail && typeof tx.payer === 'object' && tx.payer.email === userEmail) continue;
				
				// Calculate owed amount
				const amount = Number(participant.shareAmount || 0);
				if (!amount) continue;
				
				// Create unique key for this debt relationship
				const key = `${userId || userEmail}:${payerId}`;
				balances.set(key, (balances.get(key) || 0) + amount);
			}
		}
		
		// Format data for visualization
		const debtData = Array.from(balances.entries())
			.filter(([_, amount]) => amount > 0)
			.map(([key, amount]) => {
				const [debtorId, creditorId] = key.split(':');
				return {
					debtor: memberNameMap[debtorId] || debtorId,
					debtorId,
					creditor: memberNameMap[creditorId] || creditorId,
					creditorId,
					amount
				};
			})
			.sort((a, b) => b.amount - a.amount);
			
		return debtData;
	}, [txs, memberNameMap]);

	// Aggregate member activity data with more detailed stats
	const memberActivity = useMemo(() => {
		const memberData = {};
		
		// Initialize data structure for each member
		Object.entries(memberNameMap).forEach(([id, name]) => {
			memberData[id] = {
				name,
				paid: 0,        // amount paid by this member
				owed: 0,        // amount owed to this member
				borrowed: 0,    // amount borrowed by this member
				transactions: 0, // number of transactions
				id              // store ID for reference
			};
		});
		
		// Process transactions
		for (const tx of (txs || [])) {
			// Process payer (amount paid)
			const payerId = (typeof tx.payer === 'object') 
				? (tx.payer._id || tx.payer.id) 
				: tx.payer;
				
			if (payerId && memberData[payerId]) {
				memberData[payerId].paid += Number(tx.amount || 0);
				memberData[payerId].transactions += 1;
			}
			
			// Process participants (amounts borrowed/owed)
			if (!Array.isArray(tx.participants)) continue;
			
			for (const participant of tx.participants) {
				if (participant.settled) continue;
				
				const userId = (participant.user && typeof participant.user === 'object')
					? (participant.user._id || participant.user.id)
					: participant.user;
					
				if (!userId || !memberData[userId]) continue;
				
				// If not payer, they borrowed money
				if (userId !== payerId) {
					memberData[userId].borrowed += Number(participant.shareAmount || 0);
					
					// The payer is owed this amount
					if (payerId && memberData[payerId]) {
						memberData[payerId].owed += Number(participant.shareAmount || 0);
					}
				}
			}
		}
		
		// Format for chart display
		return Object.values(memberData)
			.filter(m => m.transactions > 0 || m.paid > 0 || m.borrowed > 0)
			.sort((a, b) => (b.paid + b.owed) - (a.paid + a.owed));
	}, [txs, memberNameMap]);

	// Calculate summary statistics for debts
	const debtSummary = useMemo(() => {
		const totalOwed = debtBalances.reduce((sum, item) => sum + item.amount, 0);
		const debtorsCount = new Set(debtBalances.map(item => item.debtorId)).size;
		const creditorsCount = new Set(debtBalances.map(item => item.creditorId)).size;
		
		return {
			totalOwed,
			debtorsCount,
			creditorsCount,
			relationships: debtBalances.length
		};
	}, [debtBalances]);

	// Transaction trends line chart with improved styling - Updated colors
	// Use full data but we'll limit visible range with zoom
	const lineData = {
		labels: byDate.keys, // Full data for zoom capability
		datasets: [
			{
			label: '💰 Giao dịch hàng ngày',
			data: byDate.values, // Full data
			backgroundColor: 'rgba(42, 82, 152, 0.15)',
			borderColor: '#2a5298',
			borderWidth: 3,
			tension: 0.4,
			pointRadius: 5,
			pointHoverRadius: 8,
			pointBackgroundColor: '#2a5298',
			pointBorderColor: '#fff',
			pointBorderWidth: 3,
			yAxisID: 'y',
			fill: true,
			pointHoverBackgroundColor: '#4ecdc4',
			pointHoverBorderColor: '#fff',
			pointHoverBorderWidth: 3
		},
		{
			label: '📈 Tổng cộng dồn',
			data: byDate.cumulative, // Full data
			backgroundColor: 'rgba(78, 205, 196, 0.1)',
			borderColor: '#4ecdc4',
			borderWidth: 3,
			tension: 0.4,
			pointRadius: 0,
			pointHoverRadius: 6,
			pointBackgroundColor: '#4ecdc4',
			yAxisID: 'y1',
			borderDash: [8, 4],
			pointHoverBackgroundColor: '#2a5298',
			pointHoverBorderColor: '#fff'
		}
		]
	};
	
	const lineOptions = {
		responsive: true,
		interaction: {
			mode: 'index',
			intersect: false,
		},
		plugins: {
			legend: {
				position: 'top',
				align: 'start',
				fullSize: false,
				labels: {
					usePointStyle: true,
					boxWidth: 14,
					padding: 16,
					font: {
						size: 12,
						weight: 600
					},
					color: '#1e293b',
					textAlign: 'left',
					maxWidth: 200
				}
			},
			tooltip: {
				backgroundColor: 'rgba(15, 23, 42, 0.98)',
				titleFont: {
					size: 14,
					weight: 700
				},
				bodyFont: {
					size: 13,
					weight: 500
				},
				padding: 14,
				cornerRadius: 12,
				boxPadding: 6,
				displayColors: true,
				titleColor: '#fff',
				bodyColor: '#e2e8f0',
				borderColor: 'rgba(42, 82, 152, 0.3)',
				borderWidth: 1,
				titleMarginBottom: 8,
				bodySpacing: 4,
				maxWidth: 280,
				callbacks: {
					title: (items) => {
						return `📅 ${items[0].label}`;
					},
					label: (context) => {
						let label = context.dataset.label || '';
						// Remove emoji for cleaner display
						label = label.replace(/[💰📈]/g, '').trim();
						if (label) {
							label += ': ';
						}
						if (context.parsed.y !== null) {
							const value = context.parsed.y;
							const formatted = new Intl.NumberFormat('vi-VN', { 
								style: 'currency', 
								currency: 'VND',
								maximumFractionDigits: 0
							}).format(value);
							label += formatted;
							
							// Add percentage for cumulative if it's the second dataset
							if (context.datasetIndex === 1 && byDate.cumulative.length > 0) {
								const total = byDate.cumulative[byDate.cumulative.length - 1];
								if (total > 0) {
									const percentage = ((value / total) * 100).toFixed(1);
									label += ` (${percentage}% tổng)`;
								}
							}
						}
						return label;
					},
					footer: (items) => {
						if (items.length > 1) {
							const daily = items[0].parsed.y;
							const cumulative = items[1].parsed.y;
							if (byDate.keys.length > 0) {
								const avg = cumulative > 0 ? (cumulative / byDate.keys.length).toFixed(0) : 0;
								return `Trung bình: ${new Intl.NumberFormat('vi-VN', { 
									style: 'currency', 
									currency: 'VND',
									maximumFractionDigits: 0
								}).format(avg)}`;
							}
						}
						return '';
					}
				}
			},
			zoom: {
				zoom: {
					wheel: {
						enabled: true,
						speed: 0.1
					},
					pinch: {
						enabled: true
					},
					mode: 'x',
					drag: {
						enabled: false // Disable drag zoom, use pan instead
					}
				},
				pan: {
					enabled: true,
					mode: 'x',
					modifierKey: null, // Pan with mouse drag (no key needed)
					threshold: 10
				},
				limits: {
					x: {
						min: 0,
						max: byDate.keys.length - 1
					}
				}
			}
		},
		scales: {
			x: {
				grid: {
					display: true,
					color: 'rgba(203, 213, 225, 0.2)',
					drawBorder: false
				},
				ticks: {
					maxRotation: 45,
					minRotation: 0,
					autoSkip: true,
					maxTicksLimit: 15,
					color: '#64748b',
					font: {
						size: 11,
						weight: 500
					},
					padding: 10,
					callback: function(value, index, ticks) {
						// Show all labels but skip if too close
						return this.getLabelForValue(value);
					}
				},
				title: {
					display: true,
					text: '📅 Thời gian (6 tháng gần đây)',
					color: '#475569',
					font: {
						size: 12,
						weight: 600
					},
					padding: {
						top: 12,
						bottom: 4
					}
				}
			},
			y: {
				type: 'linear',
				display: true,
				position: 'left',
				title: {
					display: true,
					text: '💰 Số tiền giao dịch hàng ngày',
					color: '#2a5298',
					font: {
						weight: 600,
						size: 13
					}
				},
				ticks: {
					callback: function(value, index, ticks) {
						// Prevent duplicate labels
						if (index > 0 && ticks[index - 1].value === value) {
							return '';
						}
						if (value >= 1000000) {
							return (value / 1000000).toFixed(1) + 'M';
						} else if (value >= 1000) {
							return (value / 1000).toFixed(0) + 'K';
						}
						return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value);
					},
					color: '#64748b',
					font: {
						size: 11
					},
					maxTicksLimit: 8,
					stepSize: undefined,
					autoSkip: true
				},
				grid: {
					color: 'rgba(42, 82, 152, 0.1)',
					drawBorder: false
				}
			},
			y1: {
				type: 'linear',
				display: true,
				position: 'right',
				title: {
					display: true,
					text: '📈 Tổng cộng dồn (tích lũy)',
					color: '#4ecdc4',
					font: {
						weight: 600,
						size: 13
					}
				},
				grid: {
					drawOnChartArea: false,
					drawBorder: false
				},
				ticks: {
					callback: function(value, index, ticks) {
						// Prevent duplicate labels
						if (index > 0 && ticks[index - 1].value === value) {
							return '';
						}
						if (value >= 1000000) {
							return (value / 1000000).toFixed(1) + 'M';
						} else if (value >= 1000) {
							return (value / 1000).toFixed(0) + 'K';
						}
						return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value);
					},
					color: '#64748b',
					font: {
						size: 11
					},
					maxTicksLimit: 8,
					stepSize: undefined,
					autoSkip: true
				}
			}
		},
		maintainAspectRatio: false,
		animation: {
			onComplete: () => {
				// Set initial zoom after chart animation completes
				if (lineChartRef.current && byDate.keys.length > 5) {
					const chart = lineChartRef.current;
					const totalDays = byDate.keys.length;
					const startIndex = totalDays - 5;
					const endIndex = totalDays - 1;
					
					setTimeout(() => {
						if (chart && chart.chartInstance) {
							try {
								chart.chartInstance.zoomScale('x', {
									min: startIndex,
									max: endIndex
								}, 'default');
							} catch (e) {
								// Chart might not be ready yet
							}
						}
					}, 200);
				}
			}
		}
	};

	// Improved Debt balance chart (bar) with better styling - Updated colors
	const debtBarData = {
		labels: debtBalances.slice(0, 10).map(d => `${d.debtor} → ${d.creditor}`),
		datasets: [
			{
				label: '💸 Số tiền nợ',
				data: debtBalances.slice(0, 10).map(d => d.amount),
				backgroundColor: [
					'rgba(239, 68, 68, 0.9)',
					'rgba(249, 115, 22, 0.9)',
					'rgba(245, 158, 11, 0.9)',
					'rgba(234, 179, 8, 0.9)',
					'rgba(42, 82, 152, 0.9)',
					'rgba(59, 130, 246, 0.9)',
					'rgba(14, 165, 233, 0.9)',
					'rgba(78, 205, 196, 0.9)',
					'rgba(20, 184, 166, 0.9)',
					'rgba(34, 197, 94, 0.9)',
				],
				borderColor: [
					'rgb(220, 38, 38)',
					'rgb(234, 88, 12)',
					'rgb(217, 119, 6)',
					'rgb(202, 138, 4)',
					'rgb(30, 64, 175)',
					'rgb(37, 99, 235)',
					'rgb(2, 132, 199)',
					'rgb(45, 212, 191)',
					'rgb(15, 118, 110)',
					'rgb(22, 163, 74)',
				],
				borderWidth: 2.5,
				barPercentage: 0.75,
				borderRadius: 10,
				categoryPercentage: 0.8
			}
		]
	};
	
	const debtBarOptions = {
		indexAxis: 'y',
		responsive: true,
		plugins: {
			legend: {
				display: false
			},
			tooltip: {
				backgroundColor: 'rgba(15, 23, 42, 0.95)',
				titleFont: {
					size: 14,
					weight: 700
				},
				bodyFont: {
					size: 13,
					weight: 500
				},
				padding: 16,
				cornerRadius: 12,
				titleColor: '#fff',
				bodyColor: '#e2e8f0',
				borderColor: 'rgba(239, 68, 68, 0.3)',
				borderWidth: 1,
				callbacks: {
					title: (items) => {
						const idx = items[0].dataIndex;
						const debt = debtBalances[idx];
						if (debt) {
							return `💸 ${debt.debtor} nợ ${debt.creditor}`;
						}
						return '';
					},
					label: (context) => {
						const amount = context.parsed.x;
						const formatted = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
						return `Số tiền: ${formatted}`;
					},
					afterLabel: (context) => {
						const idx = context.dataIndex;
						const debt = debtBalances[idx];
						if (debt) {
							// Calculate percentage of total debt
							const totalDebt = debtBalances.reduce((sum, d) => sum + d.amount, 0);
							const percentage = totalDebt > 0 ? ((debt.amount / totalDebt) * 100).toFixed(1) : 0;
							return `📊 ${percentage}% tổng công nợ nhóm`;
						}
						return '';
					},
					footer: (items) => {
						return '💡 Từ các giao dịch nhóm chưa thanh toán';
					}
				}
			}
		},
		scales: {
			x: {
				ticks: {
					callback: value => {
						if (value >= 1000000) {
							return (value / 1000000).toFixed(1) + 'M ₫';
						} else if (value >= 1000) {
							return (value / 1000).toFixed(0) + 'K ₫';
						}
						return new Intl.NumberFormat('vi-VN').format(value) + ' ₫';
					},
					color: '#64748b',
					font: {
						size: 11,
						weight: 500
					}
				},
				grid: {
					color: 'rgba(203,213,225,0.3)',
					drawBorder: false
				},
				title: {
					display: true,
					text: '💸 Số tiền nợ (VND)',
					color: '#ef4444',
					font: {
						size: 12,
						weight: 600
					},
					padding: {
						top: 10
					}
				}
			},
			y: {
				ticks: {
					autoSkip: false,
					font: {
						size: 12,
						weight: 500
					},
					color: '#334155',
					padding: 8
				},
				grid: {
					display: false
				}
			}
		},
		maintainAspectRatio: false
	};

	// Member activity chart (stacked bar) with better styling - Updated colors
	const memberActivityData = {
		labels: memberActivity.slice(0, 8).map(m => m.name),
		datasets: [
			{
				label: '💰 Đã trả',
				data: memberActivity.slice(0, 8).map(m => m.paid),
				backgroundColor: 'rgba(34, 197, 94, 0.9)',
				borderColor: 'rgb(22, 163, 74)',
				borderWidth: 2.5,
				borderRadius: 10,
				stack: 'Stack 0',
				barThickness: 40
			},
			{
				label: '🔴 Đã mượn',
				data: memberActivity.slice(0, 8).map(m => m.borrowed),
				backgroundColor: 'rgba(239, 68, 68, 0.9)',
				borderColor: 'rgb(220, 38, 38)',
				borderWidth: 2.5,
				borderRadius: 10,
				stack: 'Stack 1',
				barThickness: 40
			},
			{
				label: '🔵 Được nợ',
				data: memberActivity.slice(0, 8).map(m => m.owed),
				backgroundColor: 'rgba(42, 82, 152, 0.9)',
				borderColor: 'rgb(30, 64, 175)',
				borderWidth: 2.5,
				borderRadius: 10,
				stack: 'Stack 1',
				barThickness: 40
			}
		]
	};
	
	const memberActivityOptions = {
		responsive: true,
		plugins: {
			legend: {
				position: 'top',
				labels: {
					usePointStyle: true,
					boxWidth: 12,
					padding: 20,
					font: {
						size: 13,
						weight: 600
					},
					color: '#1e293b'
				}
			},
			tooltip: {
				backgroundColor: 'rgba(15, 23, 42, 0.95)',
				titleFont: {
					size: 14,
					weight: 700
				},
				bodyFont: {
					size: 13,
					weight: 500
				},
				padding: 16,
				cornerRadius: 12,
				titleColor: '#fff',
				bodyColor: '#e2e8f0',
				borderColor: 'rgba(42, 82, 152, 0.3)',
				borderWidth: 1,
				callbacks: {
					title: (items) => {
						const idx = items[0].dataIndex;
						const member = memberActivity[idx];
						return member ? `👤 ${member.name}` : '';
					},
					label: (context) => {
						let label = context.dataset.label || '';
						// Remove emoji for cleaner display
						label = label.replace(/[💰🔴🔵]/g, '').trim();
						if (label) {
							label += ': ';
						}
						if (context.parsed.y !== null) {
							const value = context.parsed.y;
							label += new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
							
							// Add percentage of total
							const total = memberActivity[context.dataIndex].paid + 
							              memberActivity[context.dataIndex].borrowed + 
							              memberActivity[context.dataIndex].owed;
							if (total > 0) {
								const percentage = ((value / total) * 100).toFixed(1);
								label += ` (${percentage}%)`;
							}
						}
						return label;
					},
					afterLabel: (context) => {
						const idx = context.dataIndex;
						const member = memberActivity[idx];
						if (member) {
							const datasetIdx = context.datasetIndex;
							// Add additional information based on dataset
							if (datasetIdx === 0) { // Paid
								return `📊 ${member.transactions} giao dịch đã tạo`;
							} else if (datasetIdx === 1) { // Borrowed
								return `💸 Từ các khoản vay mượn`;
							} else if (datasetIdx === 2) { // Owed
								return `💵 Từ các khoản cho vay`;
							}
						}
						return '';
					},
					footer: (items) => {
						const idx = items[0].dataIndex;
						const member = memberActivity[idx];
						if (member) {
							const net = member.owed - member.borrowed;
							const netText = net > 0 
								? `✅ Cần nhận: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(net)}`
								: net < 0
								? `⚠️ Cần trả: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Math.abs(net))}`
								: `⚖️ Cân bằng`;
							return netText;
						}
						return '';
					}
				}
			}
		},
		scales: {
			x: {
				ticks: {
					autoSkip: false,
					maxRotation: 45,
					minRotation: 0,
					color: '#334155',
					font: {
						size: 12,
						weight: 500
					},
					padding: 10
				},
				grid: {
					display: false
				},
				title: {
					display: true,
					text: '👥 Thành viên',
					color: '#475569',
					font: {
						size: 12,
						weight: 600
					},
					padding: {
						top: 10
					}
				}
			},
			y: {
				stacked: false,
				ticks: {
					callback: value => {
						if (value >= 1000000) {
							return (value / 1000000).toFixed(1) + 'M';
						} else if (value >= 1000) {
							return (value / 1000).toFixed(0) + 'K';
						}
						return new Intl.NumberFormat('vi-VN').format(value);
					},
					color: '#64748b',
					font: {
						size: 11
					}
				},
				grid: {
					color: 'rgba(42, 82, 152, 0.1)',
					drawBorder: false
				},
				title: {
					display: true,
					text: '💰 Số tiền (VND)',
					color: '#2a5298',
					font: {
						size: 12,
						weight: 600
					}
				}
			}
		},
		maintainAspectRatio: false
	};

	// Chi tiêu theo danh mục (6 tháng gần đây) - với debug
	const categorySpending = useMemo(() => {
		const map = new Map();
		const now = new Date();
		const sixMonthsAgo = new Date();
		sixMonthsAgo.setMonth(now.getMonth() - 6);

		// Commented out debug log to reduce console noise
		// console.log('Processing transactions for category chart:', txs.length);

		for (const tx of (txs || [])) {
			const d = new Date(tx.date || tx.createdAt || Date.now());
			if (isNaN(d.getTime()) || d < sixMonthsAgo) continue;
			
			// Commented out debug log to reduce console noise
			// console.log('Transaction category:', {
			//   txId: tx._id,
			//   category: tx.category,
			//   categoryType: typeof tx.category,
			//   amount: tx.amount
			// });
			
			// Xử lý tên danh mục một cách robust hơn
			let catName = 'Chưa phân loại';
			if (tx.category) {
				if (typeof tx.category === 'object' && tx.category !== null) {
					// Category đã được populate
					if (tx.category.name) {
						catName = tx.category.name;
					} else if (tx.category._id) {
						catName = `Danh mục ID: ${tx.category._id}`;
					} else {
						catName = 'Danh mục không hợp lệ';
					}
				} else if (typeof tx.category === 'string' && tx.category.trim() !== '') {
					// Category là ObjectId string
					catName = `Chưa load tên (${tx.category.substring(0, 8)}...)`;
				} else {
					catName = 'Danh mục trống';
				}
			}
			
			const amt = Number(tx.amount) || 0;
			if (!amt) continue;
			
			// Commented out debug log to reduce console noise
			// console.log('Adding to category:', catName, 'amount:', amt);
			map.set(catName, (map.get(catName) || 0) + amt);
		}

		const entries = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
		
		// Commented out debug log to reduce console noise
		// console.log('Final category spending:', entries);
		
		return {
			labels: entries.map(e => e[0]),
			values: entries.map(e => e[1]),
		};
	}, [txs]);

	// Màu sắc cho biểu đồ doughnut
	const categoryPalette = useMemo(() => [
		'#67e8f9', '#60a5fa', '#a78bfa', '#f472b6', '#fb7185',
		'#f59e0b', '#34d399', '#22c55e', '#14b8a6', '#0ea5e9', '#ef4444'
	], []);

	const categoryDonutData = useMemo(() => {
		const colors = categorySpending.labels.map((_, i) => categoryPalette[i % categoryPalette.length]);
		return {
			labels: categorySpending.labels,
			datasets: [{
				data: categorySpending.values,
				backgroundColor: colors,
				borderColor: '#ffffff',
				borderWidth: 2
			}]
		};
	}, [categorySpending, categoryPalette]);

	const categoryDonutOptions = useMemo(() => ({
		responsive: true,
		plugins: {
			legend: {
				position: 'right',
				labels: {
					usePointStyle: true,
					boxWidth: 12,
					padding: 16,
					font: {
						size: 12,
						weight: 500
					},
					color: '#1e293b'
				}
			},
			tooltip: {
				backgroundColor: 'rgba(15, 23, 42, 0.95)',
				titleFont: { 
					size: 14,
					weight: 700
				},
				bodyFont: { 
					size: 13,
					weight: 500
				},
				padding: 16,
				cornerRadius: 12,
				titleColor: '#fff',
				bodyColor: '#e2e8f0',
				borderColor: 'rgba(42, 82, 152, 0.3)',
				borderWidth: 1,
				callbacks: {
					title: (items) => {
						return `🏷️ ${items[0].label || 'Danh mục'}`;
					},
					label: (context) => {
						const label = context.label || '';
						const val = context.parsed || 0;
						const total = (context.dataset?.data || []).reduce((s, v) => s + (Number(v) || 0), 0);
						const pct = total ? (val / total) * 100 : 0;
						const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
						return `Số tiền: ${money}`;
					},
					footer: (items) => {
						const val = items[0].parsed || 0;
						const total = (items[0].dataset?.data || []).reduce((s, v) => s + (Number(v) || 0), 0);
						const pct = total ? ((val / total) * 100).toFixed(1) : 0;
						return `📊 ${pct}% tổng chi tiêu`;
					}
				}
			}
		},
		cutout: '60%',
		maintainAspectRatio: false
	}), []);

	// Create force-directed network chart for debt relationships
	useEffect(() => {
		if (activeTab !== 'debts' || debtBalances.length === 0 || !networkChartRef.current) {
			return;
		}

		setIsLoading(true);
		
		// Clear previous chart
		d3.select(networkChartRef.current).selectAll("*").remove();
		
		// Create debt network data structure
		const nodes = [];
		const links = [];
		const nodeMap = new Map();
		
		// Create unique nodes for members involved in debts
		debtBalances.forEach(debt => {
			if (!nodeMap.has(debt.debtorId)) {
				nodeMap.set(debt.debtorId, {
					id: debt.debtorId,
					name: debt.debtor,
					group: 1, // debtors
					total: 0
				});
			}
			if (!nodeMap.has(debt.creditorId)) {
				nodeMap.set(debt.creditorId, {
					id: debt.creditorId,
					name: debt.creditor,
					group: 2, // creditors
					total: 0
				});
			}
			
			// Update total debt amounts
			nodeMap.get(debt.debtorId).total += debt.amount;
			nodeMap.get(debt.creditorId).total += debt.amount;
			
			// Create links between nodes
			links.push({
				source: debt.debtorId,
				target: debt.creditorId,
				value: debt.amount
			});
		});
		
		// Convert nodeMap to array
		Array.from(nodeMap.values()).forEach(node => {
			nodes.push(node);
		});
		
		// Set up dimensions
		const containerWidth = networkChartRef.current.clientWidth || 500;
		const containerHeight = 300;
		
		// Create SVG
		const svg = d3.select(networkChartRef.current)
			.append("svg")
			.attr("width", containerWidth)
			.attr("height", containerHeight);
			
		// Create tooltip
		const tooltip = d3.select(networkChartRef.current)
			.append("div")
			.attr("class", "gc-tooltip")
			.style("opacity", 0);
		
		// Create simulation
		const simulation = d3.forceSimulation(nodes)
			.force("link", d3.forceLink(links).id(d => d.id).distance(100))
			.force("charge", d3.forceManyBody().strength(-300))
			.force("center", d3.forceCenter(containerWidth / 2, containerHeight / 2))
			.force("collision", d3.forceCollide().radius(d => Math.sqrt(d.total) / 10 + 20));
			
		// Create arrow marker for debt direction
		svg.append("defs").selectAll("marker")
			.data(["arrow"])
			.enter().append("marker")
			.attr("id", d => d)
			.attr("viewBox", "0 -5 10 10")
			.attr("refX", 20)
			.attr("refY", 0)
			.attr("markerWidth", 6)
			.attr("markerHeight", 6)
			.attr("orient", "auto")
			.append("path")
			.attr("fill", "#94a3b8")
			.attr("d", "M0,-5L10,0L0,5");
			
		// Create links
		const link = svg.append("g")
			.selectAll("line")
			.data(links)
			.enter().append("line")
			.attr("stroke", "#94a3b8")
			.attr("stroke-opacity", 0.6)
			.attr("stroke-width", d => Math.sqrt(d.value) / 500 + 1)
			.attr("marker-end", "url(#arrow)");
		
		// Create nodes
		const node = svg.append("g")
			.selectAll("g")
			.data(nodes)
			.enter().append("g")
			.call(d3.drag()
				.on("start", dragstarted)
				.on("drag", dragged)
				.on("end", dragended));
				
		// Add circles to nodes - Updated colors
		node.append("circle")
			.attr("r", d => Math.sqrt(d.total) / 8000 + 12)
			.attr("fill", d => d.group === 1 ? "#ef4444" : "#2a5298")
			.attr("stroke", "#ffffff")
			.attr("stroke-width", 2);
			
		// Add labels to nodes
		node.append("text")
			.attr("dx", 14)
			.attr("dy", ".35em")
			.text(d => d.name)
			.style("font-size", "12px")
			.style("fill", "#334155");
			
		// Add hover interactions
		node.on("mouseover", function(event, d) {
				tooltip.transition()
					.duration(200)
					.style("opacity", 0.9);
				tooltip.html(`
					<strong>${d.name}</strong><br>
					${d.group === 1 ? 'Nợ: ' : 'Được nợ: '}
					${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(d.total)}
				`)
				.style("left", (event.offsetX + 10) + "px")
				.style("top", (event.offsetY - 28) + "px");
				
				// Highlight connected links - Updated colors
				link
					.attr("stroke", function(l) {
						if (l.source.id === d.id || l.target.id === d.id)
							return d.group === 1 ? "#ef4444" : "#2a5298";
						else
							return "#94a3b8";
					})
					.attr("stroke-opacity", function(l) {
						if (l.source.id === d.id || l.target.id === d.id)
							return 1;
						else
							return 0.3;
					})
					.attr("stroke-width", function(l) {
						if (l.source.id === d.id || l.target.id === d.id)
							return Math.sqrt(l.value) / 500 + 2;
						else
							return Math.sqrt(l.value) / 500 + 1;
					});
			})
			.on("mouseout", function() {
				tooltip.transition()
					.duration(500)
					.style("opacity", 0);
					
				// Reset link styles
				link
					.attr("stroke", "#94a3b8")
					.attr("stroke-opacity", 0.6)
					.attr("stroke-width", d => Math.sqrt(d.value) / 500 + 1);
			});
			
		// Update positions on simulation tick
		simulation.on("tick", () => {
			link
				.attr("x1", d => d.source.x)
				.attr("y1", d => d.source.y)
				.attr("x2", d => d.target.x)
				.attr("y2", d => d.target.y);
				
			node
				.attr("transform", d => `translate(${d.x},${d.y})`);
		});
		
		// Drag functions
		function dragstarted(event) {
			if (!event.active) simulation.alphaTarget(0.3).restart();
			event.subject.fx = event.subject.x;
			event.subject.fy = event.subject.y;
		}
		
		function dragged(event) {
			event.subject.fx = event.x;
			event.subject.fy = event.y;
		}
		
		function dragended(event) {
			if (!event.active) simulation.alphaTarget(0);
			event.subject.fx = null;
			event.subject.fy = null;
		}
		
		setIsLoading(false);
		
		// Cleanup function
		return () => {
			if (simulation) simulation.stop();
		};
	}, [activeTab, debtBalances]);

	// Reset zoom function
	const resetZoom = () => {
		if (lineChartRef.current && lineChartRef.current.chartInstance) {
			lineChartRef.current.chartInstance.resetZoom();
		}
	};

	// Set initial zoom to show only last 5 days when chart is ready
	useEffect(() => {
		if (lineChartRef.current && byDate.keys.length > 5 && activeTab === 'transactions') {
			const chart = lineChartRef.current;
			const totalDays = byDate.keys.length;
			const startIndex = totalDays - 5;
			const endIndex = totalDays - 1;
			
			// Wait for chart to be fully rendered
			const timer = setTimeout(() => {
				if (chart && chart.chartInstance) {
					try {
						chart.chartInstance.zoomScale('x', {
							min: startIndex,
							max: endIndex
						}, 'default');
					} catch (e) {
						console.log('Zoom not ready yet');
					}
				}
			}, 300);
			
			return () => clearTimeout(timer);
		}
	}, [byDate.keys.length, activeTab]);

	return (
		<div className="group-charts">
			<div className="gc-tabs">
				<button 
					className={`gc-tab-btn ${activeTab === 'transactions' ? 'active' : ''}`}
					onClick={() => setActiveTab('transactions')}
				>
					<i className="fas fa-chart-line"></i> Biểu đồ giao dịch
				</button>
				<button 
					className={`gc-tab-btn ${activeTab === 'debts' ? 'active' : ''}`}
					onClick={() => setActiveTab('debts')}
				>
					<i className="fas fa-hand-holding-usd"></i> Biểu đồ nợ
				</button>
			</div>
			
			{activeTab === 'transactions' && (
				<div className="gc-tab-content">
					{/* Transaction summary cards */}
					<div className="gc-summary-cards">
						<div className="gc-summary-card">
							<div className="gc-summary-label">
								<i className="fas fa-exchange-alt gc-summary-icon"></i>
								Tổng giao dịch
							</div>
							<div className="gc-summary-value">{txs.length}</div>
							<div style={{fontSize: 12, color: '#64748b'}}>Trong 6 tháng qua</div>
						</div>
						
						<div className="gc-summary-card">
							<div className="gc-summary-label">
								<i className="fas fa-money-bill-wave gc-summary-icon"></i>
								Tổng giá trị
							</div>
							<div className="gc-summary-value">
								{new Intl.NumberFormat('vi-VN', { 
									style: 'currency', 
									currency: 'VND',
									maximumFractionDigits: 0 
								}).format(totalTransactionsAmount)}
							</div>
							<div style={{fontSize: 12, color: '#64748b'}}>Tất cả giao dịch</div>
						</div>
						
						<div className="gc-summary-card">
							<div className="gc-summary-label">
								<i className="fas fa-user-friends gc-summary-icon"></i>
								Thành viên tham gia
							</div>
							<div className="gc-summary-value">{memberActivity.length}</div>
							<div style={{fontSize: 12, color: '#64748b'}}>Hoạt động gần đây</div>
						</div>
					</div>
				
					<div className="gc-charts-container">
						<div className="gc-card">
							<div className="gc-card-header">
								<h3><i className="fas fa-chart-line"></i> Xu hướng giao dịch nhóm</h3>
								<div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
									<button 
										onClick={resetZoom}
										style={{
											background: 'linear-gradient(135deg, rgba(42, 82, 152, 0.1) 0%, rgba(78, 205, 196, 0.1) 100%)',
											color: '#2a5298',
											border: '1px solid rgba(42, 82, 152, 0.2)',
											borderRadius: '8px',
											padding: '6px 12px',
											fontSize: '11px',
											fontWeight: 600,
											cursor: 'pointer',
											display: 'flex',
											alignItems: 'center',
											gap: '6px',
											transition: 'all 0.2s'
										}}
										onMouseEnter={(e) => {
											e.target.style.background = 'linear-gradient(135deg, rgba(42, 82, 152, 0.2) 0%, rgba(78, 205, 196, 0.2) 100%)';
										}}
										onMouseLeave={(e) => {
											e.target.style.background = 'linear-gradient(135deg, rgba(42, 82, 152, 0.1) 0%, rgba(78, 205, 196, 0.1) 100%)';
										}}
									>
										<i className="fas fa-search-minus"></i> Xem tất cả
									</button>
									<div className="gc-card-badge" style={{ fontSize: '11px', padding: '4px 10px' }}>
										<i className="fas fa-mouse"></i> Kéo để xem các ngày cũ
									</div>
									<div className="gc-card-badge">
										<i className="fas fa-calendar-alt"></i> {txs.length} giao dịch
									</div>
								</div>
							</div>
							<div className="gc-chart gc-line">
								{txs.length > 0 ? (
									<Line 
										ref={lineChartRef}
										data={lineData} 
										options={lineOptions}
										onElementsClick={(elements) => {
											// Optional: handle click
										}}
									/>
								) : (
									<div className="gc-empty-state">
										<i className="fas fa-chart-line"></i>
										<p>Chưa có dữ liệu giao dịch</p>
									</div>
								)}
							</div>
						</div>

						<div className="gc-card">
							<div className="gc-card-header">
								<h3><i className="fas fa-users"></i> Hoạt động thành viên</h3>
								<div className="gc-card-badge">
									<i className="fas fa-user-circle"></i> {memberActivity.length} thành viên
								</div>
							</div>
							<div className="gc-chart gc-bar">
								{memberActivity.length > 0 ? (
									<Bar data={memberActivityData} options={memberActivityOptions} />
								) : (
									<div className="gc-empty-state">
										<i className="fas fa-users"></i>
										<p>Chưa có dữ liệu hoạt động thành viên</p>
									</div>
								)}
							</div>
						</div>

						{/* NEW: Biểu đồ chi tiêu theo danh mục */}
						<div className="gc-card">
							<div className="gc-card-header">
								<h3><i className="fas fa-tags"></i> Chi tiêu theo danh mục</h3>
								<div className="gc-card-badge">
									<i className="fas fa-layer-group"></i> {categorySpending.labels.length} danh mục
								</div>
							</div>
							<div className="gc-chart gc-doughnut">
								{categorySpending.labels.length > 0 ? (
									<Doughnut data={categoryDonutData} options={categoryDonutOptions} />
								) : (
									<div className="gc-empty-state">
										<i className="fas fa-tags"></i>
										<p>Chưa có dữ liệu danh mục</p>
									</div>
								)}
							</div>
						</div>
					</div>
				</div>
			)}
			
			{activeTab === 'debts' && (
				<div className="gc-tab-content">
					{/* Debt summary cards */}
					<div className="gc-summary-cards">
						<div className="gc-summary-card incoming">
							<div className="gc-summary-label">
								<i className="fas fa-user-friends gc-summary-icon"></i>
								Người đi nợ
							</div>
							<div className="gc-summary-value">{debtSummary.debtorsCount}</div>
							<div style={{fontSize: 12, color: '#047857'}}>Thành viên có khoản nợ</div>
						</div>
						
						<div className="gc-summary-card outgoing">
							<div className="gc-summary-label">
								<i className="fas fa-user-tag gc-summary-icon"></i>
								Chủ nợ
							</div>
							<div className="gc-summary-value">{debtSummary.creditorsCount}</div>
							<div style={{fontSize: 12, color: '#b91c1c'}}>Thành viên được nợ</div>
						</div>
						
						<div className="gc-summary-card balance">
							<div className="gc-summary-label">
								<i className="fas fa-money-check-alt gc-summary-icon"></i>
								Tổng giá trị công nợ
							</div>
							<div className="gc-summary-value">
								{new Intl.NumberFormat('vi-VN', { 
									style: 'currency', 
									currency: 'VND',
									maximumFractionDigits: 0 
								}).format(debtSummary.totalOwed)}
							</div>
							<div style={{fontSize: 12, color: '#0369a1'}}>{debtSummary.relationships} mối quan hệ nợ</div>
						</div>
					</div>
					
					<div className="gc-charts-container">
						<div className="gc-card">
							<div className="gc-card-header">
								<h3><i className="fas fa-balance-scale"></i> Khoản nợ giữa thành viên</h3>
								<div className="gc-card-badge">
									<i className="fas fa-file-invoice-dollar"></i> {debtBalances.length} khoản nợ
								</div>
							</div>
							<div className="gc-chart gc-debt-bar">
								{debtBalances.length > 0 ? (
									<Bar data={debtBarData} options={debtBarOptions} />
								) : (
									<div className="gc-empty-state">
										<i className="fas fa-check-circle"></i>
										<p>Không có khoản nợ chưa thanh toán</p>
									</div>
								)}
							</div>
						</div>

						<div className="gc-card">
							<div className="gc-card-header">
								<h3><i className="fas fa-project-diagram"></i> Mạng lưới nợ</h3>
								<div className="gc-card-badge">
									<i className="fas fa-sitemap"></i> {debtBalances.length} mối quan hệ
								</div>
							</div>
							<div className="gc-chart gc-network">
								{isLoading && (
									<div className="gc-loading">
										<i className="fas fa-spinner fa-spin"></i>
										<span>Đang tạo mạng lưới...</span>
									</div>
								)}
								
								{!isLoading && debtBalances.length > 0 ? (
									<div className="gc-network-container">
										<div ref={networkChartRef}></div>
										<div className="gc-network-legend">
											<div className="gc-legend-item">
												<div className="gc-legend-color" style={{backgroundColor: "#ef4444"}}></div>
												<span>💸 Người đi vay</span>
											</div>
											<div className="gc-legend-item">
												<div className="gc-legend-color" style={{backgroundColor: "#2a5298"}}></div>
												<span>💰 Chủ nợ</span>
											</div>
										</div>
									</div>
								) : !isLoading && (
									<div className="gc-empty-state">
										<i className="fas fa-check-circle"></i>
										<p>Không có dữ liệu nợ để hiển thị</p>
									</div>
								)}
							</div>
						</div>

						<div className="gc-card" style={{gridColumn: "1 / -1"}}>
							<div className="gc-card-header">
								<h3><i className="fas fa-network-wired"></i> Tổng quan công nợ từng thành viên</h3>
							</div>
							<div className="gc-chart gc-summary">
								{memberActivity.length > 0 ? (
									<div className="gc-debt-summary-grid">
										{memberActivity.slice(0, 6).map((member, idx) => (
											<div key={idx} className="gc-member-summary-card">
												<div className="gc-member-avatar" style={{
													background: `linear-gradient(135deg, ${memberColors[Object.keys(memberNameMap).find(id => memberNameMap[id] === member.name)] || 'rgba(54, 162, 235, 0.8)'}, rgba(255,255,255,0.1))`
												}}>
													{member.name.charAt(0).toUpperCase()}
												</div>
												<div className="gc-member-stats">
													<div className="gc-member-name">{member.name}</div>
													<div className="gc-member-balance-row">
														<div className="gc-stat-label">Đã trả</div>
														<div className="gc-stat-amount gc-stat-paid">
															{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(member.paid)}
														</div>
													</div>
													<div className="gc-member-balance-row">
														<div className="gc-stat-label">Đã mượn</div>
														<div className="gc-stat-amount gc-stat-borrowed">
															{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(member.borrowed)}
														</div>
													</div>
													<div className="gc-member-balance-row">
														<div className="gc-stat-label">Được nợ</div>
														<div className="gc-stat-amount gc-stat-owed">
															{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(member.owed)}
														</div>
													</div>
													<div className="gc-member-balance-row gc-net-balance">
														<div className="gc-stat-label">Cân bằng</div>
														<div className={`gc-stat-amount ${(member.owed - member.borrowed) >= 0 ? 'gc-positive' : 'gc-negative'}`}>
															{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Math.abs(member.owed - member.borrowed))}
															<span className="gc-balance-direction">
																{(member.owed - member.borrowed) > 0 
																	? 'Được nhận' 
																	: (member.owed - member.borrowed) < 0 
																		? 'Cần trả' 
																		: 'Cân bằng'}
															</span>
														</div>
													</div>
												</div>
											</div>
										))}
									</div>
								) : (
									<div className="gc-empty-state">
										<i className="fas fa-info-circle"></i>
										<p>Chưa có dữ liệu công nợ</p>
									</div>
								)}
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

