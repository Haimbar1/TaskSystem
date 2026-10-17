// Task statuses are the business's own (server/src/services/taskStatuses.js), loaded into
// AppContext; these colors are what a status can pick. Same names as STATUS_COLORS there.
export const STATUS_COLOR_OPTIONS = {
  sky: { label: 'תכלת', bar: 'bg-sky-500', badge: 'bg-sky-50 text-sky-700' },
  amber: { label: 'צהוב', bar: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700' },
  teal: { label: 'טורקיז', bar: 'bg-teal-500', badge: 'bg-teal-50 text-teal-700' },
  emerald: { label: 'ירוק', bar: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700' },
  gray: { label: 'אפור', bar: 'bg-gray-400', badge: 'bg-gray-100 text-gray-600' },
  red: { label: 'אדום', bar: 'bg-red-500', badge: 'bg-red-50 text-red-700' },
  violet: { label: 'סגול', bar: 'bg-violet-500', badge: 'bg-violet-50 text-violet-700' },
  pink: { label: 'ורוד', bar: 'bg-pink-500', badge: 'bg-pink-50 text-pink-700' },
  orange: { label: 'כתום', bar: 'bg-orange-500', badge: 'bg-orange-50 text-orange-700' },
  blue: { label: 'כחול', bar: 'bg-blue-500', badge: 'bg-blue-50 text-blue-700' },
};

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
