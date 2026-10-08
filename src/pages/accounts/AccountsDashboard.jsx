import React, { useMemo } from 'react';
import { usePurchaseData } from '../../context/PurchaseData';
import { groupPOs, inr, calcLine, vendorName } from '../../utils/procurement';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

export default function AccountsDashboard() {
  const { lines, vendors } = usePurchaseData();
  
  const stats = useMemo(() => {
    const groups = groupPOs(lines);
    const totalPOs = groups.length;
    const pendingPOs = groups.filter(g => g.delivery !== 'Completed').length;
    const deliveredPOs = groups.filter(g => g.delivery === 'Completed').length;
    const outstandingAmount = groups.reduce((sum, g) => sum + g.out, 0);
    const overdueCount = groups.filter(g => g.payOverdueDays > 0).length;
    const deliveredRate = totalPOs > 0 ? Math.round((deliveredPOs / totalPOs) * 100) : 0;

    // Monthly Spend
    const monthMap = {};
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Group lines by material for pie chart
    const catMap = {};

    lines.forEach(l => {
      const c = calcLine(l);
      if (l.poDate) {
        const d = new Date(l.poDate);
        if (!isNaN(d)) {
          const m = d.getMonth();
          const yr = d.getFullYear();
          const key = `${months[m]} '${yr.toString().slice(-2)}`;
          monthMap[key] = (monthMap[key] || 0) + c.total;
        }
      }
      const mat = l.material || 'Other';
      catMap[mat] = (catMap[mat] || 0) + c.total;
    });

    // Format monthly data (last 6 months with data, sorted properly if possible. 
    // For simplicity, just sort chronologically if parsing is okay, or just take top 6.)
    const monthlyData = Object.entries(monthMap).map(([name, val]) => ({ name, value: val / 100000 })) // in lakhs
      .slice(-6); // naive slice for now

    // Format category data (top 4, rest in others)
    const sortedCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    const topCats = sortedCats.slice(0, 4);
    const others = sortedCats.slice(4).reduce((sum, [_, val]) => sum + val, 0);
    const pieData = topCats.map(([name, value]) => ({ name, value }));
    if (others > 0) pieData.push({ name: 'Other', value: others });

    // Recent POs
    const recentPOs = [...groups].sort((a, b) => {
      // Assuming PO numbers have numeric sequence like PO-001
      const numA = parseInt((a.po || '').replace(/\D/g, '')) || 0;
      const numB = parseInt((b.po || '').replace(/\D/g, '')) || 0;
      return numB - numA;
    }).slice(0, 5);

    return { totalPOs, pendingPOs, deliveredPOs, outstandingAmount, overdueCount, deliveredRate, monthlyData, pieData, recentPOs };
  }, [lines]);

  const COLORS = ['#6366f1', '#14b8a6', '#f59e0b', '#f43f5e', '#8b5cf6'];
  const formatLakhs = (val) => `₹${(val / 100000).toFixed(2)}L`;

  return (
    <div className="dark-dash">
      <div className="dash-row top-cards">
        <div className="d-card">
          <div className="d-title">TOTAL POS</div>
          <div className="d-val">{stats.totalPOs}</div>
          <div className="d-sub good">▲ All time</div>
        </div>
        <div className="d-card">
          <div className="d-title">PENDING</div>
          <div className="d-val">{stats.pendingPOs}</div>
          <div className="d-sub">⏳ {stats.pendingPOs} awaiting delivery</div>
        </div>
        <div className="d-card">
          <div className="d-title">DELIVERED</div>
          <div className="d-val">{stats.deliveredPOs}</div>
          <div className="d-sub good">▲ {stats.deliveredRate}% rate</div>
        </div>
        <div className="d-card">
          <div className="d-title">OUTSTANDING</div>
          <div className="d-val">{formatLakhs(stats.outstandingAmount * 100000)}</div>
          <div className="d-sub bad">▼ {stats.overdueCount} overdue</div>
        </div>
      </div>

      <div className="dash-row charts">
        <div className="d-card chart-card">
          <div className="d-title chart-title">Monthly Spend <span className="d-hint">₹ In lakhs • last 6 months</span></div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.monthlyData}>
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: '#334155' }} contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: 8, color: '#f8fafc' }} />
                <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="d-card chart-card">
          <div className="d-title chart-title">Spend by Category <span className="d-hint">All time</span></div>
          <div className="chart-wrap" style={{ display: 'flex', alignItems: 'center' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stats.pieData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
                  {stats.pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: 8, color: '#f8fafc' }} itemStyle={{ color: '#fff' }} />
                <Legend verticalAlign="middle" align="right" layout="vertical" iconType="circle" wrapperStyle={{ fontSize: 12, color: '#cbd5e1' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="d-card bottom-list">
        <div className="d-title chart-title">Recent Purchase Orders <span className="d-hint">{stats.recentPOs.length} of {stats.totalPOs}</span></div>
        <table className="d-table">
          <thead>
            <tr>
              <th>PO</th>
              <th>VENDOR</th>
              <th>STATUS</th>
              <th style={{ textAlign: 'right' }}>VALUE</th>
            </tr>
          </thead>
          <tbody>
            {stats.recentPOs.map(po => (
              <tr key={po.po}>
                <td style={{ color: '#818cf8', fontWeight: 600 }}>{po.po}</td>
                <td>{vendorName(vendors, po.vid)}</td>
                <td>
                  <span className={`d-pill ${po.delivery === 'Completed' ? 'good' : po.delivery === 'Overdue' ? 'bad' : 'warn'}`}>
                    {po.delivery}
                  </span>
                </td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{inr(po.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style>{`
        .dark-dash {
          background-color: #0f172a;
          color: #f8fafc;
          padding: 20px;
          border-radius: 16px;
          font-family: system-ui, -apple-system, sans-serif;
          min-height: calc(100vh - 100px);
        }
        .dash-row {
          display: grid;
          gap: 16px;
          margin-bottom: 16px;
        }
        .top-cards {
          grid-template-columns: repeat(4, 1fr);
        }
        .charts {
          grid-template-columns: 3fr 2fr;
        }
        .d-card {
          background-color: #1e293b;
          border: 1px solid #334155;
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }
        .d-title {
          font-size: 11px;
          text-transform: uppercase;
          font-weight: 700;
          letter-spacing: 0.05em;
          color: #94a3b8;
          margin-bottom: 12px;
        }
        .d-val {
          font-size: 32px;
          font-weight: 800;
          color: #f8fafc;
          line-height: 1.1;
          margin-bottom: 8px;
        }
        .d-sub {
          font-size: 12px;
          color: #94a3b8;
          font-weight: 500;
        }
        .d-sub.good { color: #10b981; }
        .d-sub.bad { color: #ef4444; }
        
        .chart-title {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          color: #f8fafc;
          font-size: 14px;
          text-transform: none;
          letter-spacing: normal;
        }
        .d-hint {
          font-size: 11px;
          color: #64748b;
          font-weight: 500;
          text-transform: lowercase;
        }
        .chart-wrap {
          height: 220px;
        }
        
        .d-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .d-table th {
          text-align: left;
          padding: 12px 0;
          color: #64748b;
          font-weight: 600;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 1px solid #334155;
        }
        .d-table td {
          padding: 14px 0;
          border-bottom: 1px solid #334155;
          color: #e2e8f0;
        }
        .d-table tr:last-child td {
          border-bottom: none;
        }
        .d-pill {
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
          background: #334155;
          color: #cbd5e1;
        }
        .d-pill.good { background: rgba(16, 185, 129, 0.15); color: #34d399; }
        .d-pill.bad { background: rgba(239, 68, 68, 0.15); color: #f87171; }
        .d-pill.warn { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }

        @media (max-width: 1024px) {
          .top-cards { grid-template-columns: repeat(2, 1fr); }
          .charts { grid-template-columns: 1fr; }
        }
        @media (max-width: 640px) {
          .top-cards { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
