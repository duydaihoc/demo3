import React, { useMemo } from 'react';
import './GroupCharts.css';
import {
	Chart as ChartJS,
	CategoryScale,
	LinearScale,
	PointElement,
	LineElement,
	ArcElement,
	Tooltip,
	Legend,
	TimeScale
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(
	CategoryScale,
	LinearScale,
	PointElement,
	LineElement,
	ArcElement,
	Tooltip,
	Legend,
	TimeScale
);

export default function GroupCharts({ txs = [], members = [] }) {
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

	// Aggregate transactions by date (YYYY-MM-DD)
	const byDate = useMemo(() => {
		const map = new Map();
		for (const tx of (txs || [])) {
			const d = new Date(tx.date || tx.createdAt || Date.now());
			if (isNaN(d.getTime())) continue;
			const key = d.toISOString().slice(0, 10);
			const amt = Number(tx.amount || 0);
			map.set(key, (map.get(key) || 0) + amt);
		}
		const keys = Array.from(map.keys()).sort();
		const values = keys.map(k => map.get(k) || 0);
		return { keys, values };
	}, [txs]);

	// Aggregate participant shareAmount per member (use memberNameMap to get display name)
	const memberTotals = useMemo(() => {
		const totals = new Map();
		for (const tx of (txs || [])) {
			if (!Array.isArray(tx.participants)) continue;
			for (const p of tx.participants) {
				const uid = p.user && (p.user._id || p.user.id || p.user) ? String(p.user._id || p.user.id || p.user) : null;
				const email = (p.email || '').toLowerCase().trim() || null;
				const key = uid || email || (p.name || 'unknown');
				const name = (uid && memberNameMap[uid]) || (email && memberNameMap[email]) || (p.user && p.user.name) || p.email || key;
				const val = Number(p.shareAmount || 0);
				// use the "key" as internal id but label by resolved name
				const storeKey = `${key}::${name}`;
				totals.set(storeKey, (totals.get(storeKey) || 0) + val);
			}
		}
		const arr = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
		const labels = arr.map(a => a[0].split('::')[1] || a[0].split('::')[0]);
		const values = arr.map(a => a[1]);
		return { labels, values };
	}, [txs, memberNameMap]);

	const lineData = {
		labels: byDate.keys,
		datasets: [
			{
				label: 'Tổng giao dịch (VND)',
				data: byDate.values,
				fill: true,
				backgroundColor: 'rgba(14,165,233,0.12)',
				borderColor: 'rgba(14,165,233,0.9)',
				tension: 0.3,
				pointRadius: 3
			}
		]
	};
	const lineOptions = {
		plugins: { legend: { display: false } },
		scales: {
			y: { ticks: { callback: v => new Intl.NumberFormat('vi-VN').format(v) } },
			x: { ticks: { maxRotation: 0, minRotation: 0 } }
		},
		maintainAspectRatio: false
	};

	const doughnutData = {
		labels: memberTotals.labels.length ? memberTotals.labels : ['Không có dữ liệu'],
		datasets: [
			{
				data: memberTotals.values.length ? memberTotals.values : [1],
				backgroundColor: [
					'#4CAF50','#2196F3','#FF9800','#E91E63','#9C27B0',
					'#009688','#1a3b5d','#00b894','#FF5722','#673AB7'
				],
				hoverOffset: 8
			}
		]
	};
	const doughnutOptions = {
		plugins: {
			legend: { position: 'right', labels: { boxWidth: 12 } },
			tooltip: { callbacks: { label: ctx => `${ctx.label}: ${new Intl.NumberFormat('vi-VN', { style:'currency', currency:'VND' }).format(ctx.parsed)}` } }
		},
		maintainAspectRatio: false
	};

	return (
		<div className="gc-charts-container group-charts">
			<div className="gc-card">
				<div className="gc-card-header"><h3>Giao dịch theo ngày</h3></div>
				<div className="gc-chart gc-line"><Line data={lineData} options={lineOptions} /></div>
			</div>

			<div className="gc-card">
				<div className="gc-card-header"><h3>Tỉ lệ giao dịch theo thành viên</h3></div>
				<div className="gc-chart gc-doughnut"><Doughnut data={doughnutData} options={doughnutOptions} /></div>
			</div>
		</div>
	);
}

