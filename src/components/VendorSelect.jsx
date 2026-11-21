import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { venStatus } from '../utils/procurement';

// Searchable vendor / fabricator picker. Shows the selected record as "VID · Name"; start typing
// to filter the list by code or name (partial match) and pick without scrolling the whole list.
// Selecting calls onChange(value). It only filters the existing records — the database is unchanged.
//
// Props:
//   vendors       array of { vid, name, status } to choose from (vendors OR fabricators)
//   value         currently selected value (a vid, or an extra option's value like '__other__')
//   onChange(v)   called with the chosen value
//   extraOptions  optional [{ value, label }] appended after the records (e.g. "Other")
//   labelFn(v)    optional custom label for a record (defaults to the vendor label)
//   allowClear    show a "— Clear —" row to unset the selection
export default function VendorSelect({ value, onChange, vendors = [], extraOptions = [], labelFn, placeholder = 'Search vendor by name or code…', allowClear = false }) {
  const defaultLabel = (v) => `${v.vid} · ${v.name}${venStatus(v.status) !== 'Ongoing' ? ` (${venStatus(v.status)})` : ''}`;
  const label = labelFn || defaultLabel;

  // Unified option list: records first, then any extra options (deduped by value).
  const seen = new Set();
  const items = [];
  for (const v of vendors) {
    if (seen.has(v.vid)) continue;     // avoid duplicate entries
    seen.add(v.vid);
    items.push({ value: v.vid, label: label(v), search: `${v.vid} ${v.name}`.toLowerCase() });
  }
  for (const o of extraOptions) {
    if (seen.has(o.value)) continue;
    seen.add(o.value);
    items.push({ value: o.value, label: o.label, search: String(o.label).toLowerCase(), extra: true });
  }
  const selected = items.find((i) => i.value === value) || null;

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
  const list = items.filter((it) => !q || it.search.includes(q) || it.label.toLowerCase().includes(q));

  const pick = (it) => { onChange(it.value); setQuery(''); setOpen(false); setActive(-1); };
  const clear = () => { onChange(''); setQuery(''); setActive(-1); setOpen(false); };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); setActive((a) => Math.min(a + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open && active >= 0 && list[active]) { e.preventDefault(); pick(list[active]); }
    else if (e.key === 'Escape') { setOpen(false); setActive(-1); }
  };

  // Closed → show the selected record's label; open → show what the user is typing.
  const display = open ? query : (selected ? selected.label : '');

  return (
    <div className="combo" ref={wrapRef}>
      <input
        ref={inputRef}
        className="combo-input"
        value={display}
        placeholder={selected ? selected.label : placeholder}
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
            <button type="button" className="combo-opt" onMouseDown={(e) => { e.preventDefault(); clear(); }}>— Clear —</button>
          )}
          {list.length === 0 ? (
            <div className="combo-opt" style={{ opacity: 0.6, cursor: 'default' }}>No matches for “{query}”</div>
          ) : list.map((it, i) => (
            <button
              type="button" key={it.value} role="option" aria-selected={it.value === value}
              className={`combo-opt ${i === active ? 'active' : ''} ${it.value === value ? 'sel' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pick(it); }}
              onMouseEnter={() => setActive(i)}
            >{it.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
