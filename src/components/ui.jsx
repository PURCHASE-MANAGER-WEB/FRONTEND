import React, { useEffect } from 'react';

const PILL = { Completed: 'p-ok', Paid: 'p-ok', Active: 'p-ok', Approved: 'p-ok', Partial: 'p-warn', 'Due today': 'p-warn', 'Pending Approval': 'p-warn', Overdue: 'p-bad', Pending: 'p-mute', Draft: 'p-mute', Unpaid: 'p-bad', Blocked: 'p-bad', Cancelled: 'p-bad', Inactive: 'p-mute' };
export const Pill = ({ s }) => <span className={`pill ${PILL[s] || 'p-mute'}`}>{s}</span>;

// Slide-in drawer with a backdrop; Escape / backdrop click closes.
export function Drawer({ onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target.classList.contains('scrim')) onClose(); }}>
      <form className="drawer" onSubmit={(e) => e.preventDefault()}>{children}</form>
    </div>
  );
}

// A labelled form field.
export const Field = ({ label, full, children }) => (
  <label className={`fld ${full ? 'full' : ''}`}>{label}{children}</label>
);

// Loading / empty / error row inside a table body.
export const StateRow = ({ cols, loading, error, empty }) => (
  <tr><td colSpan={cols} className="state">
    {loading ? 'Loading…' : error ? <span style={{ color: 'var(--bad)' }}>{error}</span> : empty}
  </td></tr>
);
