import React, { useState, useRef, useEffect, useMemo } from 'react';

// Assign a PO to one or more projects. Selected projects show as removable chips;
// search the existing projects by NAME or CODE and click a match to add it, or type
// a new name and press Enter to add a custom one. The first selected project is the
// PO's primary project. `value`/`onChange` stay arrays of project NAMES, so the rest
// of the app is unchanged; `options` may be plain names or {name, code} objects.
export default function ProjectMultiSelect({ value = [], onChange, options = [], placeholder = 'Add a project…' }) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);              // highlighted match (keyboard)
  const wrapRef = useRef(null);
  const sel = Array.isArray(value) ? value : [];

  // Normalize options to { name, code } so search can use both.
  const norm = useMemo(() => (options || [])
    .map((o) => (typeof o === 'string' ? { name: o, code: '' } : { name: (o && o.name) || '', code: (o && o.code) || '' }))
    .filter((o) => o.name), [options]);

  const add = (name) => {
    const n = String(name || '').trim();
    if (!n || sel.includes(n)) { setInput(''); setOpen(false); return; }
    onChange([...sel, n]);
    setInput(''); setOpen(false); setHi(0);
  };
  const remove = (name) => onChange(sel.filter((v) => v !== name));

  const q = input.trim().toLowerCase();
  const avail = norm.filter((o) => !sel.includes(o.name));
  const matches = useMemo(
    () => (q ? avail.filter((o) => `${o.name} ${o.code}`.toLowerCase().includes(q)) : avail),
    [avail, q]
  );

  useEffect(() => { setHi(0); }, [q, open]);
  useEffect(() => {
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const exact = avail.find((o) => o.name.toLowerCase() === input.trim().toLowerCase());
      if (open && matches[hi]) add(matches[hi].name);
      else if (exact) add(exact.name);
      else if (matches.length === 1) add(matches[0].name);
      else if (input.trim()) add(input.trim());
    } else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div className="mps" ref={wrapRef}>
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
      <div className="mps-search">
        <input
          value={input}
          onChange={(e) => { setInput(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder={placeholder}
          aria-label="Search projects by name or code"
          autoComplete="off"
        />
        {open && (
          <div className="mps-menu" role="listbox">
            {matches.length === 0 ? (
              <div className="mps-empty">{input.trim() ? `No match — press Enter to add “${input.trim()}”` : 'No projects yet.'}</div>
            ) : matches.map((o, idx) => (
              <button
                type="button"
                className={`mps-opt ${idx === hi ? 'hi' : ''}`}
                key={o.name}
                onMouseEnter={() => setHi(idx)}
                onClick={() => add(o.name)}
              >
                <span className="mps-opt-name">{o.name}</span>
                {o.code ? <span className="mps-code">{o.code}</span> : null}
              </button>
            ))}
          </div>
        )}
      </div>
      <style>{`
        .mps{display:flex;flex-direction:column;gap:8px;min-width:0}
        .mps-chips{display:flex;flex-wrap:wrap;gap:6px}
        .mps-chip{display:inline-flex;align-items:center;gap:6px;background:var(--accent-soft);color:var(--accent-ink);border:1px solid color-mix(in srgb,var(--accent) 22%,transparent);border-radius:999px;padding:4px 10px;font:600 12.5px var(--f-body)}
        .mps-primary{color:var(--accent);font-size:11px;line-height:1}
        .mps-chip button{border:0;background:none;color:var(--accent-ink);cursor:pointer;font-size:15px;line-height:1;padding:0;opacity:.7}
        .mps-chip button:hover{opacity:1}
        .mps-search{position:relative;min-width:0}
        .mps-search>input{width:100%;box-sizing:border-box;font:400 14px var(--f-body);padding:9px 10px;border:1px solid var(--line);border-radius:9px;background:var(--bg);color:var(--fg);outline:none;min-width:0}
        .mps-search>input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
        .mps-menu{position:absolute;z-index:50;top:calc(100% + 4px);left:0;right:0;max-height:240px;overflow-y:auto;background:var(--surface);border:1px solid var(--line);border-radius:10px;box-shadow:0 18px 40px -16px rgba(0,0,0,.4);padding:4px}
        .mps-opt{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;text-align:left;border:0;background:none;cursor:pointer;padding:9px 10px;border-radius:7px;font:400 13.5px var(--f-body);color:var(--fg)}
        .mps-opt:hover,.mps-opt.hi{background:var(--accent-soft);color:var(--accent-ink)}
        .mps-opt-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .mps-code{flex:none;font:600 11px var(--f-mono,var(--f-body));color:var(--muted);background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:1px 7px}
        .mps-empty{padding:10px;font-size:13px;color:var(--muted)}
      `}</style>
    </div>
  );
}
