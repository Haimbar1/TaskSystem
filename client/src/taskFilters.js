// The task search's state (kept in AppContext, edited by components/TaskFilters.jsx) and how it
// becomes GET /api/tasks parameters: words in the title or description, and a period — this week
// (Sunday to Saturday), this month, or between two dates — on the due, created or completed date.
export const EMPTY_FILTERS = { q: '', period: 'all', dateField: 'due_date', from: '', to: '' };

const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// The API parameters for the filters (empty ones left out).
export function filterParams(f) {
  const params = {};
  if (f.q.trim()) params.q = f.q.trim();
  const today = new Date();
  let from = '';
  let to = '';
  if (f.period === 'week') {
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
    from = ymd(start);
    to = ymd(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6));
  } else if (f.period === 'month') {
    from = ymd(new Date(today.getFullYear(), today.getMonth(), 1));
    to = ymd(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  } else if (f.period === 'range') {
    from = f.from;
    to = f.to;
  }
  if (from || to) {
    params.date_field = f.dateField;
    if (from) params.from = from;
    if (to) params.to = to;
  }
  return params;
}
