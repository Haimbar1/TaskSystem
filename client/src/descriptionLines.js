// Only lines marked as items get a tick box (Haim, 2026-10-26: "sometimes it's not all a to-do
// list"): an open item starts with OPEN_MARK, a ticked one with DONE_MARK. The marks are kept in the
// description text itself, so they show the same everywhere (WhatsApp messages, search). The server
// reads them too, to say which line was ticked (server/src/services/notifications.js) — keep the two
// in sync. Typing "[]" or "[ ]" at the start of a line makes it an item.
export const DONE_MARK = '✅ ';
export const OPEN_MARK = '☐ ';

export function isDoneLine(line) {
  return line.startsWith(DONE_MARK);
}

export function isOpenLine(line) {
  return line.startsWith(OPEN_MARK);
}

export function lineText(line) {
  if (isDoneLine(line)) return line.slice(DONE_MARK.length);
  if (isOpenLine(line)) return line.slice(OPEN_MARK.length);
  return line;
}

// Descriptions from before the marks: every line was an item, only the ticked ones marked (✅).
// Such a description (ticked lines, no open mark anywhere) keeps working that way.
export function isLegacyList(description) {
  const lines = description.split('\n');
  return lines.some(isDoneLine) && !lines.some(isOpenLine);
}

export function isItemLine(line, legacy) {
  return isDoneLine(line) || isOpenLine(line) || (legacy && !!line.trim());
}

export function hasItems(description) {
  return description.split('\n').some((l) => isDoneLine(l) || isOpenLine(l));
}

// The description with line `index` ticked / unticked.
export function toggleLine(description, index) {
  const lines = description.split('\n');
  const line = lines[index];
  if (isDoneLine(line)) lines[index] = isLegacyList(description) ? lineText(line) : `${OPEN_MARK}${lineText(line)}`;
  else lines[index] = `${DONE_MARK}${lineText(line)}`;
  return lines.join('\n');
}

// "[] " / "[ ] " typed at the start of a line → the open mark
export function typedMarks(description) {
  return description.replace(/^[ \t]*\[ ?\][ \t]*/gm, OPEN_MARK);
}

// The "☐ תיבת סימון" button: the lines from `from` to `to` (character offsets) become items, or
// plain text again when all of them already are. A legacy list first gets its lines marked, so they
// keep their boxes.
export function toggleItems(description, from, to) {
  const legacy = isLegacyList(description);
  const lines = description.split('\n').map((l) => (legacy && l.trim() && !isDoneLine(l) ? `${OPEN_MARK}${l}` : l));
  let pos = 0;
  const picked = [];
  description.split('\n').forEach((l, i) => {
    const end = pos + l.length;
    if (end >= from && pos <= Math.max(from, to)) picked.push(i);
    pos = end + 1;
  });
  const targets = picked.filter((i) => lines[i].trim());
  const allItems = targets.length > 0 && targets.every((i) => isItemLine(lines[i], false));
  for (const i of targets.length ? targets : picked) {
    lines[i] = allItems ? lineText(lines[i]) : isItemLine(lines[i], false) ? lines[i] : `${OPEN_MARK}${lines[i]}`;
  }
  return lines.join('\n');
}
