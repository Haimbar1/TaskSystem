const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];

// Renders any ISO date/timestamp string as "Sept/12/26" without going
// through a JS Date object, so server-side UTC timestamps never shift by a
// day relative to the date the DB actually stored.
export function formatDate(value) {
  if (!value) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${MONTHS[parseInt(month, 10) - 1]}/${day}/${year.slice(2)}`;
}

// Overdue = the due date has passed (Israel's date) and the task isn't in an ending status or
// "מושהה" — the same rule as the daily overdue reminder (server/src/services/overdueCheck.js).
export function isOverdue(task, statuses) {
  const due = toDateInputValue(task?.due_date);
  if (!due || task.status === 'paused') return false;
  if (statuses.find((s) => s.key === task.status)?.is_final) return false;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
  return due < today;
}

// yyyy-mm-dd, suitable for <input type="date">.
export function toDateInputValue(value) {
  if (!value) return '';
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1] : '';
}
