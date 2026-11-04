// When WhatsApp messages may go out (Haim, 2026-11-04): Sunday–Thursday, 08:00–17:00 Israel time,
// never on Friday, Saturday or a holiday. A message asked for outside the window waits in the
// queue (whatsapp.js) and goes out on the first hourly cron run inside it (routes/cronRoutes.js).

const TZ = 'Asia/Jerusalem';
export const SEND_FROM_HOUR = 8;
export const SEND_UNTIL_HOUR = 17; // the cron runs on the hour, so the last run that sends is 16:00

const partsOf = (date, options) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-US-u-ca-hebrew', { timeZone: TZ, ...options })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );

// Israeli holidays that are days off, by the Hebrew calendar: Rosh Hashana (2 days), Yom Kippur,
// Sukkot, Shemini Atzeret / Simchat Torah, the first and seventh days of Pesach, Shavuot.
const HOLIDAYS = { Tishri: [1, 2, 10, 15, 22], Nisan: [15, 21], Sivan: [6] };

// Yom Ha'atzmaut is 5 Iyar, moved to Thursday when that's a Friday (4 Iyar) or a Saturday (3 Iyar),
// and to Tuesday when it's a Monday (6 Iyar).
function isIndependenceDay(day, weekday) {
  if (day === 5) return !['Mon', 'Fri', 'Sat'].includes(weekday);
  if (day === 4 || day === 3) return weekday === 'Thu';
  if (day === 6) return weekday === 'Tue';
  return false;
}

export function isRestDay(date = new Date()) {
  const { weekday, day, month } = partsOf(date, { weekday: 'short', day: 'numeric', month: 'long' });
  if (weekday === 'Fri' || weekday === 'Sat') return true;
  const d = Number(day);
  if (HOLIDAYS[month]?.includes(d)) return true;
  return month === 'Iyar' && isIndependenceDay(d, weekday);
}

export function inSendWindow(date = new Date()) {
  const hour = Number(partsOf(date, { hour: 'numeric', hourCycle: 'h23' }).hour);
  return hour >= SEND_FROM_HOUR && hour < SEND_UNTIL_HOUR && !isRestDay(date);
}

// The first hourly cron run inside the window (now, when inside it).
export function nextSendTime(from = new Date()) {
  if (inSendWindow(from)) return from;
  const t = new Date(from);
  t.setUTCMinutes(0, 0, 0); // Israel is a whole number of hours off UTC
  for (let i = 0; i < 24 * 14; i++) {
    t.setUTCHours(t.getUTCHours() + 1);
    if (inSendWindow(t)) return t;
  }
  return t;
}

// "יום ראשון 08/11 בשעה 08:00" — for telling people when a held message will go out.
export function formatSendTime(date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('he-IL', {
      timeZone: TZ, weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((x) => [x.type, x.value])
  );
  return `${p.weekday} ${p.day}/${p.month} בשעה ${p.hour}:${p.minute}`;
}
