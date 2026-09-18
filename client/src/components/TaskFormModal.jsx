import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { PRIORITY_LABELS } from '../constants.js';
import { toDateInputValue } from '../utils.js';

export default function TaskFormModal({ task, onClose, onSaved, onCreated }) {
  const isEdit = Boolean(task);
  const [users, setUsers] = useState([]);
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [priority, setPriority] = useState(task?.priority || 'normal');
  const [dueDate, setDueDate] = useState(toDateInputValue(task?.due_date));
  const [assigneeIds, setAssigneeIds] = useState((task?.assignees || []).map((a) => a.id));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getUsers().then(setUsers).catch(console.error);
  }, []);

  function toggleAssignee(id) {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) {
      setError('חובה להזין כותרת');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        title,
        description,
        priority,
        due_date: dueDate || null,
        assignee_ids: assigneeIds,
      };
      const saved = isEdit ? await api.updateTask(task.id, payload) : await api.createTask(payload);
      (onSaved || onCreated)?.(saved);
      onClose();
    } catch (err) {
      setError(isEdit ? 'שגיאה בעדכון המשימה' : 'שגיאה ביצירת המשימה');
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <form onSubmit={handleSubmit} className="bg-white rounded p-4 w-full max-w-md space-y-3">
        <h2 className="text-lg font-bold">{isEdit ? 'עריכת משימה' : 'משימה חדשה'}</h2>

        <div>
          <label className="block text-sm mb-1">כותרת</label>
          <input
            className="w-full border rounded p-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm mb-1">תיאור</label>
          <textarea
            className="w-full border rounded p-2"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm mb-1">עדיפות</label>
            <select
              className="w-full border rounded p-2"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm mb-1">תאריך יעד</label>
            <input
              type="date"
              className="w-full border rounded p-2"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm mb-1">אחראים</label>
          <div className="border rounded p-2 max-h-32 overflow-y-auto space-y-1">
            {users.map((u) => (
              <label key={u.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={assigneeIds.includes(u.id)}
                  onChange={() => toggleAssignee(u.id)}
                />
                {u.name || u.email}
              </label>
            ))}
          </div>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded border">
            ביטול
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
          >
            {saving ? 'שומר…' : isEdit ? 'שמור' : 'צור משימה'}
          </button>
        </div>
      </form>
    </div>
  );
}
