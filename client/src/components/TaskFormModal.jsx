import { Fragment, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAppContext } from '../context/AppContext.jsx';
import { PRIORITY_LABELS, STATUS_COLOR_OPTIONS } from '../constants.js';
import { toDateInputValue } from '../utils.js';
import { getActingUserId, setActingUserId } from '../actingUser.js';
import TaskNotes from './TaskNotes.jsx';
import AssigneePicker from './AssigneePicker.jsx';
import { isDoneLine, isItemLine, isLegacyList, hasItems, lineText, toggleLine, toggleItems, typedMarks } from '../descriptionLines.js';

export default function TaskFormModal({ task, onClose, onSaved, onCreated, onDeleted }) {
  const isEdit = Boolean(task);
  const { user, statuses } = useAppContext();
  // The status, picked from the circles at the top (any status from any status), saved with "שמור"
  const [status, setStatus] = useState(task?.status || '');
  // Logged in through an embed, everyone shares one login, so a new task must say who created it
  // (they're the one notified on its later changes).
  const needsCreator = !isEdit && user?.is_embed;
  const [createdBy, setCreatedBy] = useState(needsCreator ? getActingUserId() : '');
  const [users, setUsers] = useState([]);
  const [usersError, setUsersError] = useState('');
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  // A description with item lines opens as lines to tick, anything else as text to type.
  const hasListLines = (d) => hasItems(d) || isLegacyList(d);
  const [editingText, setEditingText] = useState(() => !isEdit || !hasListLines(task?.description || ''));
  const showText = editingText || !hasListLines(description);
  const legacy = isLegacyList(description);
  const textRef = useRef(null);
  // a click on the text opens it for editing, with the cursor in it
  const [focusText, setFocusText] = useState(false);
  function editText() {
    setEditingText(true);
    setFocusText(true);
  }
  function markLines() {
    const el = textRef.current;
    const from = el ? el.selectionStart : description.length;
    const to = el ? el.selectionEnd : description.length;
    setDescription((d) => toggleItems(d, from, to));
  }
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

  // What "שמור" sends, or null (with the reason shown) when the form can't be saved yet.
  function buildPayload() {
    if (!title.trim()) {
      setError('חובה להזין כותרת');
      return null;
    }
    if (hasUnaddedNote) {
      setError(UNADDED_NOTE);
      return null;
    }
    if (needsCreator && !createdBy) {
      setError('חובה לבחור מי יוצר את המשימה');
      return null;
    }
    const payload = {
      title,
      description,
      priority,
      due_date: dueDate || null,
      assignee_ids: assigneeIds,
    };
    if (isEdit && status && status !== task.status) payload.status = status;
    return payload;
  }

  // "שלח עדכון בוואטסאפ" next to "שמור" (Haim, 2026-10-26: a checkbox instead of a separate button;
  // on by default since 2026-10-28): when ticked, the changes since the last update go out once the
  // save is done; untick it to save without a WhatsApp (server/src/services/notifications.js), and
  // WhatsAppSentToast says who got them.
  const [sendUpdate, setSendUpdate] = useState(true);
  const [pendingUpdate, setPendingUpdate] = useState(null); // { changes, recipients }
  useEffect(() => {
    if (isEdit) api.getPendingUpdate(task.id).then(setPendingUpdate).catch(() => setPendingUpdate(null));
  }, [isEdit, task?.id]);
  const sendUpdateBox = (
    <label
      className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer select-none"
      title={
        pendingUpdate?.changes?.length
          ? `שינויים שעוד לא עודכנו: ${pendingUpdate.changes.join(' · ')}` +
            (pendingUpdate.recipients.length ? `\nיישלח בוואטסאפ אל: ${pendingUpdate.recipients.join(', ')}` : '')
          : 'עם השמירה נשלח בוואטסאפ עדכון על השינויים מאז העדכון האחרון'
      }
    >
      <input type="checkbox" checked={sendUpdate} onChange={(e) => setSendUpdate(e.target.checked)} />
      שלח עדכון בוואטסאפ
      {pendingUpdate?.changes?.length > 0 && <span className="w-2 h-2 rounded-full bg-amber-500" />}
    </label>
  );

  async function handleSubmit(e) {
    e.preventDefault();
    const payload = buildPayload();
    if (!payload) return;
    if (needsCreator) {
      payload.created_by = createdBy;
      // Whoever creates a task here is who's using this device (the "who am I" in Nav).
      if (createdBy !== getActingUserId()) setActingUserId(createdBy);
    }
    // The window closes at once and the save goes on in the background (Haim, 2026-10-26: saving
    // waited for the WhatsApp messages / the check whether any are due). An edited task shows its
    // changes right away; the server's copy replaces it when it answers, or a failure notice
    // (WhatsAppSentToast) shows then. WhatsApp goes out only with "שלח עדכון בוואטסאפ" ticked.
    if (isEdit) {
      onSaved?.({ ...task, ...payload, assignees: users.length ? users.filter((u) => assigneeIds.includes(u.id)) : task.assignees });
    }
    onClose();
    const name = title.trim();
    (isEdit ? api.updateTask(task.id, payload) : api.createTask(payload))
      .then((saved) => {
        (onSaved || onCreated)?.(saved);
        if (!sendUpdate) return;
        api.sendTaskUpdate(saved.id).catch((err) => {
          console.error(err);
          window.dispatchEvent(new CustomEvent('task-save-failed', {
            detail: `המשימה "${name}" נשמרה, אבל שליחת העדכון בוואטסאפ נכשלה: ${err.message}`,
          }));
        });
      })
      .catch((err) => {
        console.error(err);
        if (isEdit) onSaved?.(task); // back to what's really saved
        window.dispatchEvent(new CustomEvent('task-save-failed', {
          detail: `${isEdit ? 'השמירה של' : 'יצירת'} המשימה "${name}" נכשלה${isEdit ? ' — השינויים לא נשמרו' : ''}: ${err.message}`,
        }));
      });
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
            <div className="flex flex-wrap items-center justify-end gap-2">
              {sendUpdateBox}
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

        {isEdit && statuses.length > 0 && (
          // The statuses in board order, right to left; a click on any circle picks it (Haim, 2026-10-26)
          <div>
            <label className="block text-sm mb-1">סטטוס</label>
            <div className="flex items-start overflow-x-auto pb-1">
              {statuses.map((s, i) => {
                const at = statuses.findIndex((x) => x.key === status);
                const colors = STATUS_COLOR_OPTIONS[s.color] || STATUS_COLOR_OPTIONS.gray;
                const current = s.key === status;
                const passed = at > -1 && i < at;
                return (
                  <Fragment key={s.key}>
                    {i > 0 && <span className={`h-0.5 flex-1 min-w-3 mt-4 ${passed || current ? colors.bar : 'bg-gray-200'}`} />}
                    <button
                      type="button"
                      onClick={() => setStatus(s.key)}
                      title={current ? `הסטטוס עכשיו: ${s.label}` : `העבר ל"${s.label}"`}
                      className="flex flex-col items-center gap-1 w-16 shrink-0 group"
                    >
                      <span
                        className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-bold transition ${
                          current ? `${colors.bar} border-transparent text-white ring-2 ring-offset-1 ring-gray-300` : passed ? `bg-white ${colors.ring}` : 'bg-white border-gray-300 text-gray-400 group-hover:border-gray-500'
                        }`}
                      >
                        {passed ? '✓' : i + 1}
                      </span>
                      <span className={`text-xs text-center leading-tight ${current ? 'font-bold text-gray-900' : 'text-gray-500'}`}>{s.label}</span>
                    </button>
                  </Fragment>
                );
              })}
            </div>
            {status !== task.status && (
              <p className="text-xs text-amber-700 mt-1">הסטטוס ישתנה ל"{statuses.find((s) => s.key === status)?.label}" כשתלחצו "שמור"</p>
            )}
          </div>
        )}

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
          <div className="flex items-center justify-between gap-2 mb-1">
            <label className="block text-sm">תיאור</label>
            {showText && (
              <button
                type="button"
                // keeps the cursor in the text, so it marks the line the cursor is on
                onMouseDown={(e) => e.preventDefault()}
                onClick={markLines}
                className="text-xs px-2 py-0.5 rounded border border-emerald-600 text-emerald-700 hover:bg-emerald-50"
                title='השורה שהסמן עליה (או השורות שסימנת) מקבלת תיבת סימון; לחיצה נוספת מחזירה לטקסט רגיל. אפשר גם להקליד [] בתחילת שורה'
              >
                ☐ תיבת סימון בשורה
              </button>
            )}
          </div>
          {showText ? (
            <>
              <textarea
                ref={textRef}
                className="w-full border rounded p-2 resize-y"
                rows={6}
                value={description}
                autoFocus={focusText}
                onChange={(e) => {
                  const el = e.target;
                  const next = typedMarks(el.value);
                  setDescription(next);
                  // "[]" just became "☐ ": the cursor stays where it was, not at the end of the text
                  if (next !== el.value) {
                    const at = el.selectionStart + next.length - el.value.length;
                    requestAnimationFrame(() => el.setSelectionRange(at, at));
                  }
                }}
                // back to the tick boxes once the text has items
                onBlur={() => hasListLines(description) && setEditingText(false)}
              />
              <p className="text-xs text-gray-400 mt-0.5">
                שורה שמתחילה ב-[] (או "☐ תיבת סימון בשורה") היא פריט לסימון "בוצע"; שאר השורות הן טקסט רגיל.
              </p>
            </>
          ) : (
            // Only item lines get a tick box (descriptionLines.js), saved with "שמור"; a click on the
            // text edits it — no separate edit button (Haim, 2026-10-26)
            <div className="border rounded p-2 space-y-1 max-h-80 overflow-y-auto">
              {description.split('\n').map((line, i) =>
                !line.trim() ? (
                  <div key={i} className="h-2" onClick={editText} />
                ) : isItemLine(line, legacy) ? (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 cursor-pointer"
                      checked={isDoneLine(line)}
                      onChange={() => setDescription((d) => toggleLine(d, i))}
                    />
                    <span
                      onClick={editText}
                      className={`flex-1 whitespace-pre-wrap cursor-text ${isDoneLine(line) ? 'line-through text-gray-400' : ''}`}
                    >
                      {lineText(line)}
                    </span>
                  </div>
                ) : (
                  <p key={i} onClick={editText} className="text-sm whitespace-pre-wrap cursor-text">
                    {line}
                  </p>
                )
              )}
              <button type="button" onClick={editText} className="text-xs text-gray-400 hover:text-emerald-700">
                לחצו על הטקסט כדי לערוך אותו
              </button>
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
          <div className="flex flex-wrap items-center justify-end gap-2">
            {sendUpdateBox}
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
