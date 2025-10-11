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
import { Line, Bar } from 'react-chartjs-2';
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
	TimeScale
);

export default function GroupCharts({ txs = [], members = [] }) {
	// State for tab switching between chart views
	const [activeTab, setActiveTab] = useState('transactions');
	const [isLoading, setIsLoading] = useState(false);
	const networkChartRef = useRef(null);
	
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

	// Generate unique colors for each member
	const memberColors = useMemo(() => {
		const colors = [
			'rgba(54, 162, 235, 0.8)',    // Blue
			'rgba(255, 99, 132, 0.8)',     // Red
			'rgba(75, 192, 192, 0.8)',     // Green
			'rgba(255, 159, 64, 0.8)',     // Orange
			'rgba(153, 102, 255, 0.8)',    // Purple
			'rgba(255, 205, 86, 0.8)',     // Yellow
			'rgba(201, 203, 207, 0.8)',    // Grey
			'rgba(0, 204, 150, 0.8)',      // Teal
			'rgba(255, 99, 71, 0.8)',      // Tomato
			'rgba(106, 90, 205, 0.8)',     // SlateBlue
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
		
		return { keys: displayDates, values, cumulative };
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

	// Transaction trends line chart with improved styling
	const lineData = {
		labels: byDate.keys,
		datasets: [
			{
				label: 'Giao dịch hàng ngày',
				data: byDate.values,
				backgroundColor: 'rgba(14,165,233,0.2)',
				borderColor: 'rgb(14,165,233)',
				borderWidth: 2,
				tension: 0.3,
				pointRadius: 3,
				pointHoverRadius: 5,
				pointBackgroundColor: 'rgb(14,165,233)',
				yAxisID: 'y',
				fill: true
			},
			{
				label: 'Tổng cộng dồn',
				data: byDate.cumulative,
				backgroundColor: 'rgba(236,72,153,0.1)',
				borderColor: 'rgb(236,72,153)',
				borderWidth: 2,
				tension: 0.4,
				pointRadius: 0,
				pointHoverRadius: 4,
				yAxisID: 'y1',
				borderDash: []
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
				labels: {
					usePointStyle: true,
					boxWidth: 8,
					padding: 20
				}
			},
			tooltip: {
				backgroundColor: 'rgba(15, 23, 42, 0.9)',
				titleFont: {
					size: 13
				},
				bodyFont: {
					size: 12
				},
				padding: 12,
				cornerRadius: 6,
				boxPadding: 6,
				callbacks: {
					label: (context) => {
						let label = context.dataset.label || '';
						if (label) {
							label += ': ';
						}
						if (context.parsed.y !== null) {
							label += new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(context.parsed.y);
						}
						return label;
					}
				}
			}
		},
		scales: {
			x: {
				grid: {
					display: false
				},
				ticks: {
					maxRotation: 0,
					autoSkip: true,
					maxTicksLimit: 10,
					color: '#64748b'
				}
			},
			y: {
				type: 'linear',
				display: true,
				position: 'left',
				title: {
					display: true,
					text: 'Giao dịch hàng ngày',
					color: '#0ea5e9',
					font: {
						weight: 'normal',
						size: 12
					}
				},
				ticks: {
					callback: value => new Intl.NumberFormat('vi-VN').format(value),
					color: '#64748b'
				},
				grid: {
					color: 'rgba(203,213,225,0.4)'
				}
			},
			y1: {
				type: 'linear',
				display: true,
				position: 'right',
				title: {
					display: true,
					text: 'Tổng cộng dồn',
					color: '#ec4899',
					font: {
						weight: 'normal',
						size: 12
					}
				},
				grid: {
					drawOnChartArea: false
				},
				ticks: {
					callback: value => new Intl.NumberFormat('vi-VN').format(value),
					color: '#64748b'
				}
			}
		},
		maintainAspectRatio: false
	};

	// Improved Debt balance chart (bar) with better styling
	const debtBarData = {
		labels: debtBalances.slice(0, 8).map(d => `${d.debtor} nợ ${d.creditor}`),
		datasets: [
			{
				label: 'Số tiền nợ',
				data: debtBalances.slice(0, 8).map(d => d.amount),
				backgroundColor: debtBalances.slice(0, 8).map((_, idx) => 
					`hsla(${(idx * 35) % 360}, 85%, 65%, 0.85)`
				),
				borderColor: debtBalances.slice(0, 8).map((_, idx) => 
					`hsla(${(idx * 35) % 360}, 90%, 45%, 1)`
				),
				borderWidth: 1,
				barPercentage: 0.75,
				borderRadius: 6
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
				backgroundColor: 'rgba(15, 23, 42, 0.9)',
				titleFont: {
					size: 13
				},
				bodyFont: {
					size: 12
				},
				padding: 12,
				cornerRadius: 6,
				callbacks: {
					title: (items) => {
						const idx = items[0].dataIndex;
						const debt = debtBalances[idx];
						return debt ? `${debt.debtor} nợ ${debt.creditor}` : '';
					},
					label: (context) => {
						return `Số tiền nợ: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(context.parsed.x)}`;
					},
					afterLabel: (context) => {
						const idx = context.dataIndex;
						const debt = debtBalances[idx];
						if (debt) {
							return `Từ giao dịch nhóm`;
						}
						return '';
					}
				}
			}
		},
		scales: {
			x: {
				ticks: {
					callback: value => new Intl.NumberFormat('vi-VN').format(value),
					color: '#64748b'
				},
				grid: {
					color: 'rgba(203,213,225,0.4)'
				}
			},
			y: {
				ticks: {
					autoSkip: false,
					font: {
						size: 11
					},
					color: '#334155'
				}
			}
		},
		maintainAspectRatio: false
	};

	// Member activity chart (stacked bar) with better styling
	const memberActivityData = {
		labels: memberActivity.slice(0, 6).map(m => m.name),
		datasets: [
			{
				label: 'Đã trả',
				data: memberActivity.slice(0, 6).map(m => m.paid),
				backgroundColor: 'rgba(16, 185, 129, 0.8)',
				borderColor: 'rgb(16, 185, 129)',
				borderWidth: 1,
				borderRadius: 6,
				stack: 'Stack 0'
			},
			{
				label: 'Đã mượn',
				data: memberActivity.slice(0, 6).map(m => m.borrowed),
				backgroundColor: 'rgba(239, 68, 68, 0.8)',
				borderColor: 'rgb(239, 68, 68)',
				borderWidth: 1,
				borderRadius: 6,
				stack: 'Stack 1'
			},
			{
				label: 'Được nợ',
				data: memberActivity.slice(0, 6).map(m => m.owed),
				backgroundColor: 'rgba(59, 130, 246, 0.8)',
				borderColor: 'rgb(59, 130, 246)',
				borderWidth: 1,
				borderRadius: 6,
				stack: 'Stack 1'
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
					boxWidth: 8
				}
			},
			tooltip: {
				backgroundColor: 'rgba(15, 23, 42, 0.9)',
				titleFont: {
					size: 13
				},
				bodyFont: {
					size: 12
				},
				padding: 12,
				cornerRadius: 6,
				callbacks: {
					label: (context) => {
						let label = context.dataset.label || '';
						if (label) {
							label += ': ';
						}
						if (context.parsed.y !== null) {
							label += new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(context.parsed.y);
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
								return `${member.transactions} giao dịch`;
							} else if (datasetIdx === 1) { // Borrowed
								return `Từ các khoản vay mượn`;
							} else if (datasetIdx === 2) { // Owed
								return `Từ các khoản cho vay`;
							}
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
					minRotation: 45,
					color: '#64748b'
				},
				grid: {
					display: false
				}
			},
			y: {
				stacked: false,
				ticks: {
					callback: value => new Intl.NumberFormat('vi-VN').format(value),
					color: '#64748b'
				},
				grid: {
					color: 'rgba(203,213,225,0.4)'
				}
			}
		},
		maintainAspectRatio: false
	};

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
				
		// Add circles to nodes
		node.append("circle")
			.attr("r", d => Math.sqrt(d.total) / 10000 + 10)
			.attr("fill", d => d.group === 1 ? "#f87171" : "#60a5fa")
			.attr("stroke", "#ffffff")
			.attr("stroke-width", 1.5);
			
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
				
				// Highlight connected links
				link
					.attr("stroke", function(l) {
						if (l.source.id === d.id || l.target.id === d.id)
							return d.group === 1 ? "#f87171" : "#60a5fa";
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
								<div className="gc-card-badge">
									<i className="fas fa-calendar-alt"></i> {txs.length} giao dịch
								</div>
							</div>
							<div className="gc-chart gc-line">
								{txs.length > 0 ? (
									<Line data={lineData} options={lineOptions} />
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
												<div className="gc-legend-color" style={{backgroundColor: "#f87171"}}></div>
												<span>Người đi vay</span>
											</div>
											<div className="gc-legend-item">
												<div className="gc-legend-color" style={{backgroundColor: "#60a5fa"}}></div>
												<span>Chủ nợ</span>
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

