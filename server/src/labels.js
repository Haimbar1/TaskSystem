// Mirrors client/src/constants.js — kept separate because WhatsApp message
// text is rendered server-side, before it ever reaches the client.
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

export const FIELD_LABELS = {
  title: 'כותרת',
  description: 'תיאור',
  priority: 'עדיפות',
  due_date: 'תאריך יעד',
  status: 'סטטוס',
  assignees: 'אחראים',
};
