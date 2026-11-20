import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { venStatus } from '../utils/procurement';

// Searchable vendor picker. Shows the selected vendor as "VID · Name"; start typing to filter
// the vendor list by code or name (partial match) and pick without scrolling the whole list.
// Selecting calls onChange(vid). Keeps the existing vendor database — it only filters it.
export default function VendorSelect({ value, onChange, vendors = [], placeholder = 'Search vendor by name or code…', allowClear = false }) {
  const label = (v) => `${v.vid} · ${v.name}${venStatus(v.status) !== 'Ongoing' ? ` (${venStatus(v.status)})` : ''}`;
  const selected = vendors.find((v) => v.vid === value) || null;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) { setOpen(false); setActive(-1); } };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const q = query.trim().toLowerCase();
  const list = vendors.filter((v) => !q || `${v.vid} ${v.name}`.toLowerCase().includes(q));

  const pick = (v) => { onChange(v.vid); setQuery(''); setOpen(false); setActive(-1); };
  const clear = () => { onChange(''); setQuery(''); setActive(-1); inputRef.current && inputRef.current.focus(); };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); setActive((a) => Math.min(a + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open && active >= 0 && list[active]) { e.preventDefault(); pick(list[active]); }
    else if (e.key === 'Escape') { setOpen(false); setActive(-1); }
  };

  // When closed, show the selected vendor's label; when open, show what the user is typing.
  const display = open ? query : (selected ? label(selected) : '');

  return (
    <div className="combo" ref={wrapRef}>
      <input
        ref={inputRef}
        className="combo-input"
        value={display}
        placeholder={selected ? label(selected) : placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onKeyDown={onKey}
      />
      <ChevronDown size={16} className="combo-caret" onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o); inputRef.current && inputRef.current.focus(); }} />
      {open && (
        <div className="combo-menu" role="listbox">
          {allowClear && selected && (
            <button type="button" className="combo-opt" onMouseDown={(e) => { e.preventDefault(); clear(); setOpen(false); }}>— Clear —</button>
          )}
          {list.length === 0 ? (
            <div className="combo-opt" style={{ opacity: 0.6, cursor: 'default' }}>No vendors match “{query}”</div>
          ) : list.map((v, i) => (
            <button
              type="button" key={v.vid} role="option" aria-selected={v.vid === value}
              className={`combo-opt ${i === active ? 'active' : ''} ${v.vid === value ? 'sel' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pick(v); }}
              onMouseEnter={() => setActive(i)}
            >{label(v)}</button>
          ))}
        </div>
      )}
    </div>
  );
}
