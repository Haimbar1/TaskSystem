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

// yyyy-mm-dd, suitable for <input type="date">.
export function toDateInputValue(value) {
  if (!value) return '';
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1] : '';
}
