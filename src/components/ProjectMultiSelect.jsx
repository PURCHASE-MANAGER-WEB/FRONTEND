import React, { useState } from 'react';

// Assign a PO to one or more projects. Selected projects show as removable chips;
// pick more from the dropdown of existing projects, or type a new name and press Enter.
// The first selected project is treated as the PO's primary project by the rest of the app.
export default function ProjectMultiSelect({ value = [], onChange, options = [], placeholder = 'Add a project…' }) {
  const [input, setInput] = useState('');
  const sel = Array.isArray(value) ? value : [];
  const add = (name) => {
    const n = String(name || '').trim();
    if (!n || sel.includes(n)) return;
    onChange([...sel, n]);
  };
  const remove = (name) => onChange(sel.filter((v) => v !== name));
  const avail = options.filter((o) => o && !sel.includes(o));

  return (
    <div className="mps">
      {sel.length > 0 && (
        <div className="mps-chips">
          {sel.map((v, i) => (
            <span className="mps-chip" key={v}>
              {i === 0 && <span className="mps-primary" title="Primary project">★</span>}
              {v}
              <button type="button" onClick={() => remove(v)} aria-label={`Remove ${v}`}>×</button>
            </span>
          ))}
        </div>
      )}
      <div className="mps-add">
        <select value="" onChange={(e) => { add(e.target.value); e.target.value = ''; }}>
          <option value="">{placeholder}</option>
          {avail.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(input); setInput(''); } }}
          placeholder="or type &amp; press Enter"
        />
      </div>
      <style>{`
        .mps{display:flex;flex-direction:column;gap:8px;min-width:0}
        .mps-chips{display:flex;flex-wrap:wrap;gap:6px}
        .mps-chip{display:inline-flex;align-items:center;gap:6px;background:var(--accent-soft);color:var(--accent-ink);border:1px solid color-mix(in srgb,var(--accent) 22%,transparent);border-radius:999px;padding:4px 10px;font:600 12.5px var(--f-body)}
        .mps-primary{color:var(--accent);font-size:11px;line-height:1}
        .mps-chip button{border:0;background:none;color:var(--accent-ink);cursor:pointer;font-size:15px;line-height:1;padding:0;opacity:.7}
        .mps-chip button:hover{opacity:1}
        .mps-add{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        .mps-add select,.mps-add input{width:100%;box-sizing:border-box;font:400 14px var(--f-body);padding:9px 10px;border:1px solid var(--line);border-radius:9px;background:var(--bg);color:var(--fg);outline:none;min-width:0}
        .mps-add select:focus,.mps-add input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
        @media (max-width:560px){.mps-add{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}
