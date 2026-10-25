// A description line ticked as done starts with this mark. It's kept in the description text itself,
// so it shows the same everywhere (WhatsApp messages, search). The server reads it too, to say which
// line was ticked (server/src/services/notifications.js) — keep the two in sync.
export const DONE_MARK = '✅ ';

export function isDoneLine(line) {
  return line.startsWith(DONE_MARK);
}

export function lineText(line) {
  return isDoneLine(line) ? line.slice(DONE_MARK.length) : line;
}

// The description with line `index` ticked / unticked.
export function toggleLine(description, index) {
  const lines = description.split('\n');
  const line = lines[index];
  lines[index] = isDoneLine(line) ? lineText(line) : `${DONE_MARK}${line}`;
  return lines.join('\n');
}
