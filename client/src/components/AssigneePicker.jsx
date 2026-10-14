import { useEffect, useRef, useState } from 'react';

const MENU_MAX_HEIGHT = 256;

// The list opens fixed on top of the page (the table around it clips anything that sticks out),
// collects ticks while open, and saves once when it closes — every save also sends WhatsApp
// updates, so saving on each tick would message people about every intermediate state.
export default function AssigneePicker({ users, selectedIds, onChange }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(selectedIds);
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
    openRef.current = true;
    setOpen(true);
  }

  function closeMenu() {
    if (!openRef.current) return; // e.g. a scroll and a resize in the same moment
    openRef.current = false;
    setOpen(false);
    const next = draftRef.current;
    const changed = next.length !== selectedIds.length || next.some((id) => !selectedIds.includes(id));
    if (changed) onChange(next);
  }

  useEffect(() => {
    if (!open) return undefined;
    function onOutside(e) {
      if (!menuRef.current?.contains(e.target) && !buttonRef.current?.contains(e.target)) closeMenu();
    }
    function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Enter') closeMenu();
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
    setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  }

  return (
    <div className="inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? closeMenu() : openMenu())}
        className="border rounded px-2 py-1 text-sm text-right min-w-[100px] bg-white"
      >
        {selectedNames.length ? selectedNames.join(', ') : 'לא משויך'}
      </button>
      {open && pos && (
        <div
          ref={menuRef}
          dir="rtl"
          style={pos}
          className="fixed z-50 bg-white border rounded shadow-lg p-2 overflow-y-auto"
        >
          {users.map((u) => (
            <label key={u.id} className="flex items-center gap-2 text-sm py-1 whitespace-nowrap cursor-pointer">
              <input type="checkbox" checked={draft.includes(u.id)} onChange={() => toggle(u.id)} />
              {u.name || u.email}
            </label>
          ))}
          <button
            type="button"
            onClick={closeMenu}
            className="mt-2 w-full px-2 py-1 rounded bg-emerald-600 text-white text-sm"
          >
            אישור
          </button>
        </div>
      )}
    </div>
  );
}
