import React, { useMemo } from 'react';
import { usePurchaseData } from '../../context/PurchaseData';
import { groupPOs, inr, calcLine, vendorName } from '../../utils/procurement';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { useNavigate } from 'react-router-dom';

export default function AccountsDashboard() {
  const { lines, vendors } = usePurchaseData();
  const navigate = useNavigate();
  
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

    // Format monthly data (last 6 months with data)
    const monthlyData = Object.entries(monthMap).map(([name, val]) => ({ name, value: val / 100000 })) // in lakhs
      .slice(-6);

    // Format category data (top 4, rest in others)
    const sortedCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    const topCats = sortedCats.slice(0, 4);
    const others = sortedCats.slice(4).reduce((sum, [_, val]) => sum + val, 0);
    const pieData = topCats.map(([name, value]) => ({ name, value }));
    if (others > 0) pieData.push({ name: 'Other', value: others });

    // Recent POs
    const recentPOs = [...groups].sort((a, b) => {
      const numA = parseInt((a.po || '').replace(/\D/g, '')) || 0;
      const numB = parseInt((b.po || '').replace(/\D/g, '')) || 0;
      return numB - numA;
    }).slice(0, 5);

    return { totalPOs, pendingPOs, deliveredPOs, outstandingAmount, overdueCount, deliveredRate, monthlyData, pieData, recentPOs };
  }, [lines]);

  const COLORS = ['var(--accent)', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6'];
  const formatLakhs = (val) => `₹${(val / 100000).toFixed(2)}L`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--muted)', marginBottom: '8px' }}>TOTAL POS</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--fg)', lineHeight: 1.1, marginBottom: '6px' }}>{stats.totalPOs}</div>
          <div style={{ fontSize: '12px', color: 'var(--good, #10b981)', fontWeight: 600 }}>▲ All time</div>
        </div>
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--muted)', marginBottom: '8px' }}>PENDING</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--fg)', lineHeight: 1.1, marginBottom: '6px' }}>{stats.pendingPOs}</div>
          <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 500 }}>⏳ {stats.pendingPOs} awaiting delivery</div>
        </div>
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--muted)', marginBottom: '8px' }}>DELIVERED</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--fg)', lineHeight: 1.1, marginBottom: '6px' }}>{stats.deliveredPOs}</div>
          <div style={{ fontSize: '12px', color: 'var(--good, #10b981)', fontWeight: 600 }}>▲ {stats.deliveredRate}% rate</div>
        </div>
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--muted)', marginBottom: '8px' }}>OUTSTANDING</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--fg)', lineHeight: 1.1, marginBottom: '6px' }}>{formatLakhs(stats.outstandingAmount * 100000)}</div>
          <div style={{ fontSize: '12px', color: 'var(--bad, #ef4444)', fontWeight: 600 }}>▼ {stats.overdueCount} overdue</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '16px' }}>
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>Monthly Spend</h3>
            <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 500 }}>₹ In lakhs • last 6 months</span>
          </div>
          <div style={{ height: '220px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.monthlyData}>
                <XAxis dataKey="name" stroke="var(--muted)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: 'var(--line)' }} contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--fg)' }} />
                <Bar dataKey="value" fill="var(--accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>Spend by Category</h3>
            <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 500 }}>All time</span>
          </div>
          <div style={{ height: '220px', display: 'flex', alignItems: 'center' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stats.pieData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
                  {stats.pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--fg)' }} itemStyle={{ color: 'var(--fg)' }} />
                <Legend verticalAlign="middle" align="right" layout="vertical" iconType="circle" wrapperStyle={{ fontSize: 12, color: 'var(--fg)' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card tbl">
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>Recent Purchase Orders</h3>
          <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 500 }}>{stats.recentPOs.length} of {stats.totalPOs}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>PO Number</th>
              <th>Vendor</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Value</th>
            </tr>
          </thead>
          <tbody>
            {stats.recentPOs.map(po => (
              <tr key={po.po}>
                <td>
                  <button onClick={() => navigate(`/purchase-orders/${encodeURIComponent(po.po)}`)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent-ink)', fontWeight: 600 }}>{po.po}</button>
                </td>
                <td>{vendorName(vendors, po.vid)}</td>
                <td>
                  <span style={{ 
                    padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600,
                    background: po.delivery === 'Completed' ? 'var(--good-bg, #ecfdf5)' : po.delivery === 'Overdue' ? 'var(--bad-bg, #fef2f2)' : 'var(--warn-bg, #fffbeb)',
                    color: po.delivery === 'Completed' ? 'var(--good, #10b981)' : po.delivery === 'Overdue' ? 'var(--bad, #ef4444)' : 'var(--warn, #f59e0b)'
                  }}>
                    {po.delivery}
                  </span>
                </td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{inr(po.value)}</td>
              </tr>
            ))}
            {stats.recentPOs.length === 0 && <tr><td colSpan="4">No recent purchase orders.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
