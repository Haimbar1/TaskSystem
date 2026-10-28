import { useState } from 'react';
import { api } from '../api.js';

// The Kanban boards' "שלח וואטסאפ על כל שינוי" (Haim, 2026-10-26; on by default since 2026-10-28): when ticked,
// every card moved also sends the WhatsApp update for that task (like the task window's
// "שלח עדכון בוואטסאפ"). Remembered on this device, shared by both boards.
const KEY = 'tasks.kanbanSendUpdate';

export function useKanbanSendUpdate() {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(KEY) !== '0';
    } catch {
      return true;
    }
  });
  function change(value) {
    setOn(value);
    try {
      if (value) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, '0');
    } catch {
      // Storage unavailable (e.g. blocked in the iframe) — it's just not remembered.
    }
  }
  return [on, change];
}

// After a card's move is saved: the WhatsApp update, reported by WhatsAppSentToast.
export function sendKanbanUpdate(task) {
  api.sendTaskUpdate(task.id).catch((err) => {
    console.error(err);
    window.dispatchEvent(new CustomEvent('task-save-failed', {
      detail: `המשימה "${task.title}" עודכנה, אבל שליחת העדכון בוואטסאפ נכשלה: ${err.message}`,
    }));
  });
}

export default function KanbanSendUpdate({ checked, onChange }) {
  return (
    <label
      className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer select-none"
      title="כל משימה שמעבירים בלוח שולחת בוואטסאפ עדכון על השינויים מאז העדכון האחרון"
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      שלח וואטסאפ על כל שינוי
    </label>
  );
}
