import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

// A professional type-ahead combobox: styled dropdown of options, filter-as-you-type,
// click or keyboard to select, and free-text allowed (for ad-hoc values). Replaces the
// browser-native <datalist>, which renders inconsistently and looks unpolished.
export default function ComboBox({ value, onChange, options = [], placeholder, autoFocus = false }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const q = String(value || '').trim().toLowerCase();
  const list = options.filter((o) => !q || String(o).toLowerCase().includes(q));

  useEffect(() => {
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) { setOpen(false); setActive(-1); } };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (o) => { onChange(o); setOpen(false); setActive(-1); };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); setActive((a) => Math.min(a + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open && active >= 0 && list[active]) { e.preventDefault(); pick(list[active]); }
    else if (e.key === 'Escape') { setOpen(false); setActive(-1); }
  };

  return (
    <div className="combo" ref={wrapRef}>
      <input
        ref={inputRef}
        className="combo-input"
        value={value || ''}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
      />
      <ChevronDown size={16} className="combo-caret" onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o); inputRef.current && inputRef.current.focus(); }} />
      {open && list.length > 0 && (
        <div className="combo-menu" role="listbox">
          {list.map((o, i) => (
            <button
              type="button" key={o} role="option" aria-selected={o === value}
              className={`combo-opt ${i === active ? 'active' : ''} ${o === value ? 'sel' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pick(o); }}
              onMouseEnter={() => setActive(i)}
            >{o}</button>
          ))}
        </div>
      )}
    </div>
  );
}
