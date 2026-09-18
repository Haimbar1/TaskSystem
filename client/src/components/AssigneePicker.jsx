import { useEffect, useRef, useState } from 'react';

export default function AssigneePicker({ users, selectedIds, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const selectedNames = users
    .filter((u) => selectedIds.includes(u.id))
    .map((u) => u.name || u.email);

  function toggle(id) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="border rounded px-2 py-1 text-sm text-right min-w-[100px] bg-white"
      >
        {selectedNames.length ? selectedNames.join(', ') : 'לא משויך'}
      </button>
      {open && (
        <div className="absolute z-10 mt-1 bg-white border rounded shadow p-2 min-w-[160px] max-h-48 overflow-y-auto">
          {users.map((u) => (
            <label key={u.id} className="flex items-center gap-2 text-sm py-1 whitespace-nowrap">
              <input
                type="checkbox"
                checked={selectedIds.includes(u.id)}
                onChange={() => toggle(u.id)}
              />
              {u.name || u.email}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
