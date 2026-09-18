export const STATUS_LABELS = {
  new: 'חדש',
  transferred: 'הועבר לטיפול',
  in_progress: 'בעבודה',
  done: 'בוצע',
  paused: 'מושהה',
};

export const PRIORITY_LABELS = {
  urgent: 'דחופה',
  high: 'גבוהה',
  normal: 'רגילה',
  low: 'נמוכה',
};

// Column header accent + count badge per status (Kanban-by-status view).
export const STATUS_COLORS = {
  new: { bar: 'bg-sky-500', badge: 'bg-sky-50 text-sky-700' },
  transferred: { bar: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700' },
  in_progress: { bar: 'bg-teal-500', badge: 'bg-teal-50 text-teal-700' },
  done: { bar: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700' },
  paused: { bar: 'bg-gray-400', badge: 'bg-gray-100 text-gray-600' },
};

// Small pill shown on each task card.
export const PRIORITY_COLORS = {
  urgent: 'bg-red-50 text-red-700',
  high: 'bg-orange-50 text-orange-700',
  normal: 'bg-gray-100 text-gray-600',
  low: 'bg-gray-50 text-gray-500',
};
