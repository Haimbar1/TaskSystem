import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAppContext } from '../context/AppContext.jsx';
import { PRIORITY_LABELS } from '../constants.js';
import { toDateInputValue } from '../utils.js';
import { getActingUserId, setActingUserId } from '../actingUser.js';
import TaskNotes from './TaskNotes.jsx';
import AssigneePicker from './AssigneePicker.jsx';
import { isDoneLine, lineText, toggleLine } from '../descriptionLines.js';

export default function TaskFormModal({ task, onClose, onSaved, onCreated, onDeleted }) {
  const isEdit = Boolean(task);
  const { user } = useAppContext();
  // Logged in through an embed, everyone shares one login, so a new task must say who created it
  // (they're the one notified on its later changes).
  const needsCreator = !isEdit && user?.is_embed;
  const [createdBy, setCreatedBy] = useState(needsCreator ? getActingUserId() : '');
  const [users, setUsers] = useState([]);
  const [usersError, setUsersError] = useState('');
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  // An existing task opens its description as lines to tick; a new one as text to type.
  const [editingText, setEditingText] = useState(!isEdit);
  const [priority, setPriority] = useState(task?.priority || 'normal');
  const [dueDate, setDueDate] = useState(toDateInputValue(task?.due_date));
  const [assigneeIds, setAssigneeIds] = useState((task?.assignees || []).map((a) => a.id));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // A note typed in "הערות ביצוע" but not added with "הוסף הערה" would be lost on save.
  const [hasUnaddedNote, setHasUnaddedNote] = useState(false);
  const UNADDED_NOTE = 'כתבת הערת ביצוע ולא הוספת אותה — לחצי "הוסף הערה" (או מחקי את הטקסט) ואז שמרי.';

  useEffect(() => {
    api
      .getUsers()
      .then((list) => {
        setUsers(list);
        // Drop a remembered creator who's no longer in this business.
        setCreatedBy((id) => (list.some((u) => u.id === id) ? id : ''));
      })
      .catch((err) => setUsersError(err.message));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) {
      setError('חובה להזין כותרת');
      return;
    }
    if (hasUnaddedNote) {
      setError(UNADDED_NOTE);
      return;
    }
    if (needsCreator && !createdBy) {
      setError('חובה לבחור מי יוצר את המשימה');
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
      if (needsCreator) {
        payload.created_by = createdBy;
        // Whoever creates a task here is who's using this device (the "who am I" in Nav).
        if (createdBy !== getActingUserId()) setActingUserId(createdBy);
      }
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

  function handleCancel() {
    if (hasUnaddedNote && !window.confirm('יש הערת ביצוע שלא נוספה. לסגור בלי לשמור אותה?')) return;
    onClose();
  }

  async function handleDelete() {
    if (!window.confirm(`למחוק את המשימה "${task.title}"? לא ניתן לשחזר.`)) return;
    setDeleting(true);
    setError('');
    try {
      await api.deleteTask(task.id);
      onDeleted?.(task.id);
      onClose();
    } catch (err) {
      setError('שגיאה במחיקת המשימה');
      console.error(err);
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded p-4 w-full max-w-2xl lg:max-w-5xl space-y-3 max-h-[92vh] overflow-y-auto"
      >
        {/* Save / cancel also at the top, staying in view while the form scrolls (long description
            and notes); the error shows here too, so a click up here isn't answered out of sight. */}
        <div className="sticky -top-4 -mx-4 -mt-4 px-4 pt-4 pb-2 bg-white border-b z-10">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold">{isEdit ? 'עריכת משימה' : 'משימה חדשה'}</h2>
            <div className="flex gap-2">
              <button type="button" onClick={handleCancel} className="px-3 py-1.5 rounded-lg border text-sm">
                ביטול
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm disabled:opacity-50"
              >
                {saving ? 'שומר…' : isEdit ? 'שמור' : 'צור משימה'}
              </button>
            </div>
          </div>
          {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
        </div>

        {needsCreator && (
          <div>
            <label className="block text-sm mb-1">יוצר המשימה *</label>
            <select
              className="w-full border rounded p-2"
              value={createdBy}
              onChange={(e) => setCreatedBy(e.target.value)}
            >
              <option value="">בחר/י…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email}
                </option>
              ))}
            </select>
          </div>
        )}

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
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm">תיאור</label>
            {description.trim() && (
              <button
                type="button"
                onClick={() => setEditingText((v) => !v)}
                className="text-xs text-emerald-700 hover:underline"
              >
                {editingText ? '☑ סימון שורות כבוצע' : '✏️ עריכת הטקסט'}
              </button>
            )}
          </div>
          {editingText || !description.trim() ? (
            <textarea
              className="w-full border rounded p-2 resize-y"
              rows={6}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          ) : (
            // Each line gets a tick box; ticking marks it done (descriptionLines.js), saved with "שמור".
            <div className="border rounded p-2 space-y-1 max-h-80 overflow-y-auto">
              {description.split('\n').map((line, i) =>
                line.trim() ? (
                  <label key={i} className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={isDoneLine(line)}
                      onChange={() => setDescription((d) => toggleLine(d, i))}
                    />
                    <span className={`whitespace-pre-wrap ${isDoneLine(line) ? 'line-through text-gray-400' : ''}`}>
                      {lineText(line)}
                    </span>
                  </label>
                ) : (
                  <div key={i} className="h-2" />
                )
              )}
            </div>
          )}
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
          {usersError ? (
            <p className="text-red-600 text-sm">שגיאה בטעינת רשימת המשתמשים: {usersError}</p>
          ) : users.length === 0 ? (
            <p className="text-gray-500 text-sm">אין עדיין משתמשים בעסק הזה. אפשר להוסיף במסך "משתמשים".</p>
          ) : (
            <AssigneePicker users={users} selectedIds={assigneeIds} onChange={setAssigneeIds} block />
          )}
        </div>

        {isEdit ? (
          <TaskNotes taskId={task.id} onDraftChange={setHasUnaddedNote} />
        ) : (
          <p className="text-xs text-gray-400">הערות ביצוע אפשר להוסיף אחרי יצירת המשימה.</p>
        )}

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex justify-between items-center pt-2">
          {isEdit ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="px-3 py-2 rounded-lg border border-red-600 text-red-600 disabled:opacity-50"
            >
              {deleting ? 'מוחק…' : 'מחק משימה'}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={handleCancel} className="px-3 py-2 rounded-lg border">
              ביטול
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-2 rounded-lg bg-emerald-600 text-white disabled:opacity-50"
            >
              {saving ? 'שומר…' : isEdit ? 'שמור' : 'צור משימה'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
