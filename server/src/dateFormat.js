const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];

// Matches client/src/utils.js's "Sept/12/26" rendering. node-postgres returns
// DATE columns as JS Date objects built from local y/m/d components (see
// pg-types), so reading them back with local getters is safe — no UTC shift.
export function formatDate(value) {
  if (!value) return '—';
  if (value instanceof Date) {
    return `${MONTHS[value.getMonth()]}/${String(value.getDate()).padStart(2, '0')}/${String(value.getFullYear()).slice(2)}`;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!match) return String(value);
  const [, year, month, day] = match;
  return `${MONTHS[parseInt(month, 10) - 1]}/${day}/${year.slice(2)}`;
}
