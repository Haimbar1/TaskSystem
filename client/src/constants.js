// Task statuses are the business's own (server/src/services/taskStatuses.js), loaded into
// AppContext; these colors are what a status can pick. Same names as STATUS_COLORS there.
// row: the table row of a task in that status (an overdue one is red instead); ring: its circle
// in the task window's status bar.
export const STATUS_COLOR_OPTIONS = {
  sky: { label: 'תכלת', bar: 'bg-sky-500', badge: 'bg-sky-50 text-sky-700', row: 'bg-sky-200', ring: 'border-sky-500 text-sky-700' },
  amber: { label: 'צהוב', bar: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700', row: 'bg-amber-200', ring: 'border-amber-500 text-amber-700' },
  teal: { label: 'טורקיז', bar: 'bg-teal-500', badge: 'bg-teal-50 text-teal-700', row: 'bg-teal-200', ring: 'border-teal-500 text-teal-700' },
  emerald: { label: 'ירוק', bar: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700', row: 'bg-emerald-200', ring: 'border-emerald-500 text-emerald-700' },
  gray: { label: 'אפור', bar: 'bg-gray-400', badge: 'bg-gray-100 text-gray-600', row: 'bg-gray-200', ring: 'border-gray-400 text-gray-600' },
  red: { label: 'אדום', bar: 'bg-red-500', badge: 'bg-red-50 text-red-700', row: 'bg-red-200', ring: 'border-red-500 text-red-700' },
  violet: { label: 'סגול', bar: 'bg-violet-500', badge: 'bg-violet-50 text-violet-700', row: 'bg-violet-200', ring: 'border-violet-500 text-violet-700' },
  pink: { label: 'ורוד', bar: 'bg-pink-500', badge: 'bg-pink-50 text-pink-700', row: 'bg-pink-200', ring: 'border-pink-500 text-pink-700' },
  orange: { label: 'כתום', bar: 'bg-orange-500', badge: 'bg-orange-50 text-orange-700', row: 'bg-orange-200', ring: 'border-orange-500 text-orange-700' },
  blue: { label: 'כחול', bar: 'bg-blue-500', badge: 'bg-blue-50 text-blue-700', row: 'bg-blue-200', ring: 'border-blue-500 text-blue-700' },
};
// An overdue task's table row / card (utils.js isOverdue)
export const OVERDUE_ROW = 'bg-red-300';

export const PRIORITY_LABELS = {
  urgent: 'דחופה',
  high: 'גבוהה',
  normal: 'רגילה',
  low: 'נמוכה',
};

// Small pill shown on each task card.
export const PRIORITY_COLORS = {
  urgent: 'bg-red-50 text-red-700',
  high: 'bg-orange-50 text-orange-700',
  normal: 'bg-gray-100 text-gray-600',
  low: 'bg-gray-50 text-gray-500',
};
