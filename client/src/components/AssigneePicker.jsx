import { useEffect, useRef, useState } from 'react';

const MENU_MAX_HEIGHT = 256;

// The list opens fixed on top of the page (the table around it clips anything that sticks out),
// collects ticks while open, and saves once when it closes ("שמור") — every save also sends WhatsApp
// updates, so saving on each tick would message people about every intermediate state.
// block: the task form — fills the width of its row, and each tick goes straight into the form,
// which has its own "שמור" (one save, not "אישור" and then "שמור" — Haim, 2026-10-27).
// With many people the list gets a search box.
const SEARCH_FROM = 8;

export default function AssigneePicker({ users, selectedIds, onChange, block = false }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(selectedIds);
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const openRef = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  function openMenu() {
    const r = buttonRef.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    setPos({
      right: window.innerWidth - r.right,
      minWidth: Math.max(r.width, 180),
      ...(below < MENU_MAX_HEIGHT + 8 && r.top > below
        ? { bottom: window.innerHeight - r.top + 4, maxHeight: Math.min(MENU_MAX_HEIGHT, r.top - 8) }
        : { top: r.bottom + 4, maxHeight: Math.min(MENU_MAX_HEIGHT, below - 8) }),
    });
    setDraft(selectedIds);
    setSearch('');
    openRef.current = true;
    setOpen(true);
  }

  function closeMenu() {
    if (!openRef.current) return; // e.g. a scroll and a resize in the same moment
    openRef.current = false;
    setOpen(false);
    const next = draftRef.current;
    const changed = next.length !== selectedIds.length || next.some((id) => !selectedIds.includes(id));
    if (changed && !block) onChange(next);
  }

  useEffect(() => {
    if (!open) return undefined;
    function onOutside(e) {
      if (!menuRef.current?.contains(e.target) && !buttonRef.current?.contains(e.target)) closeMenu();
    }
    function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault(); // inside the task form, Enter would also submit it
        closeMenu();
      }
    }
    // the list is pinned to where the button was, so close it once the page moves under it
    function onScroll(e) {
      if (!menuRef.current?.contains(e.target)) closeMenu();
    }
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', closeMenu);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', closeMenu);
    };
  });

  const shownIds = open ? draft : selectedIds;
  const selectedNames = users.filter((u) => shownIds.includes(u.id)).map((u) => u.name || u.email);

  function toggle(id) {
    const d = draftRef.current;
    const next = d.includes(id) ? d.filter((x) => x !== id) : [...d, id];
    draftRef.current = next;
    setDraft(next);
    if (block) onChange(next);
  }

  const term = search.trim().toLowerCase();
  const shownUsers = term
    ? users.filter((u) => `${u.name || ''} ${u.email || ''}`.toLowerCase().includes(term))
    : users;

  return (
    <div className={block ? 'block' : 'inline-block'}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? closeMenu() : openMenu())}
        className={`border rounded text-sm text-right bg-white ${
          block ? 'w-full p-2 flex items-center justify-between gap-2' : 'px-2 py-1 min-w-[100px]'
        }`}
      >
        <span className={selectedNames.length ? '' : 'text-gray-500'}>
          {selectedNames.length ? selectedNames.join(', ') : 'לא משויך'}
        </span>
        {block && <span className="text-gray-400 text-xs">▾</span>}
      </button>
      {open && pos && (
        <div
          ref={menuRef}
          dir="rtl"
          style={pos}
          className="fixed z-50 bg-white border rounded shadow-lg p-2 overflow-y-auto"
        >
          {users.length >= SEARCH_FROM && (
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש…"
              className="w-full border rounded px-2 py-1 text-sm mb-1"
            />
          )}
          {shownUsers.map((u) => (
            <label key={u.id} className="flex items-center gap-2 text-sm py-1 whitespace-nowrap cursor-pointer">
              <input type="checkbox" checked={draft.includes(u.id)} onChange={() => toggle(u.id)} />
              {u.name || u.email}
            </label>
          ))}
          {!block && (
            <button
              type="button"
              onClick={closeMenu}
              className="mt-2 w-full px-2 py-1 rounded bg-emerald-600 text-white text-sm"
            >
              שמור
            </button>
          )}
        </div>
      )}
    </div>
  );
}
