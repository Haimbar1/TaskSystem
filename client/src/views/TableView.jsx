import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { PRIORITY_LABELS, STATUS_COLOR_OPTIONS, OVERDUE_ROW } from '../constants.js';
import { useAppContext } from '../context/AppContext.jsx';
import AssigneePicker from '../components/AssigneePicker.jsx';
import { sendKanbanUpdate } from '../components/KanbanSendUpdate.jsx';
import TaskFormModal from '../components/TaskFormModal.jsx';
import { formatDate, isOverdue } from '../utils.js';
import PageFrame from '../components/PageFrame.jsx';
import TaskFilters from '../components/TaskFilters.jsx';
import { filterParams } from '../taskFilters.js';

// TODO: per-column filtering (the spec asks for sort + filter on every
// column) — only sorting is wired up so far.
export default function TableView() {
  const { refreshKey, statusLabel, statuses, filters } = useAppContext();
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [sort, setSort] = useState({ col: 'created_at', dir: 'desc' });
  const [editingTask, setEditingTask] = useState(null);

  useEffect(() => {
    api.getTasks({ sort: sort.col, dir: sort.dir, ...filterParams(filters) }).then(setTasks).catch(console.error);
  }, [sort, refreshKey, filters]);

  useEffect(() => {
    api.getUsers().then(setUsers).catch(console.error);
  }, []);

  function toggleSort(col) {
    setSort((s) => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }));
  }

  // Shown at once; the save replaces it when it answers, or undoes it. Saving doesn't message
  // anyone by itself, so the WhatsApp update follows — the new person hears about the task
  // (Haim, 2026-10-27).
  async function updateAssignees(taskId, assigneeIds) {
    const before = tasks.find((t) => t.id === taskId);
    const assignees = users.filter((u) => assigneeIds.includes(u.id));
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, assignees } : t)));
    try {
      const updated = await api.updateTask(taskId, { assignee_ids: assigneeIds });
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
      sendKanbanUpdate(updated);
    } catch (err) {
      console.error(err);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? before : t)));
      alert('עדכון האחראים נכשל');
    }
  }

  // Each row in its status's color; past its due date (and not finished / paused) — red (Haim, 2026-10-26)
  function rowColor(t) {
    if (isOverdue(t, statuses)) return OVERDUE_ROW;
    const color = statuses.find((s) => s.key === t.status)?.color;
    return (STATUS_COLOR_OPTIONS[color] || STATUS_COLOR_OPTIONS.gray).row;
  }

  function handleSaved(updated) {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  function handleDeleted(taskId) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  const columns = [
    ['title', 'המשימה'],
    ['priority', 'עדיפות'],
    ['due_date', 'תאריך יעד'],
    ['status', 'סטטוס'],
    ['assignees', 'אחראים'],
    ['completed_at', 'תאריך ביצוע'],
    ['created_at', 'תאריך יצירה'],
  ];

  return (
    <>
      <PageFrame title="כל המשימות" subtitle={`${tasks.length} משימות`} actions={<TaskFilters />}>
      {/* On a phone: one card per task, so every task shows without sliding sideways. */}
      <div className="sm:hidden space-y-2">
        {tasks.map((t) => (
          <div key={t.id} className={`border rounded-lg p-3 space-y-1.5 ${rowColor(t) || 'bg-white'}`}>
            <button
              type="button"
              onClick={() => setEditingTask(t)}
              className="block w-full text-right font-medium text-emerald-700 break-words"
            >
              {t.title}
            </button>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
              <span>{statusLabel(t.status)}</span>
              <span>עדיפות: {PRIORITY_LABELS[t.priority]}</span>
              {t.due_date && (
                <span className={isOverdue(t, statuses) ? 'text-red-700 font-semibold' : ''}>
                  יעד: {formatDate(t.due_date)}{isOverdue(t, statuses) ? ' (באיחור)' : ''}
                </span>
              )}
              {t.completed_at && <span>בוצע: {formatDate(t.completed_at)}</span>}
              <span>נוצר: {formatDate(t.created_at)}</span>
            </div>
            <AssigneePicker
              users={users}
              selectedIds={(t.assignees || []).map((a) => a.id)}
              onChange={(ids) => updateAssignees(t.id, ids)}
            />
          </div>
        ))}
      </div>
      {/* Wider than a phone: the table scrolls sideways inside its frame, not the whole page. */}
      <div className="hidden sm:block overflow-x-auto">
      <table className="w-full whitespace-nowrap">
        <thead>
          <tr>
            {columns.map(([key, label]) => (
              <th
                key={key}
                onClick={() => key !== 'assignees' && toggleSort(key)}
                className={`p-2 border-b text-right select-none ${key !== 'assignees' ? 'cursor-pointer' : ''}`}
              >
                {label} {sort.col === key ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id} className={`border-b ${rowColor(t)}`}>
              <td
                className="p-2 cursor-pointer text-emerald-700 hover:underline"
                onClick={() => setEditingTask(t)}
              >
                {t.title}
              </td>
              <td className="p-2">{PRIORITY_LABELS[t.priority]}</td>
              <td className={`p-2 ${isOverdue(t, statuses) ? 'text-red-700 font-semibold' : ''}`}>
                {formatDate(t.due_date)}
                {isOverdue(t, statuses) && <span className="mr-1 text-xs">(באיחור)</span>}
              </td>
              <td className="p-2">{statusLabel(t.status)}</td>
              <td className="p-2">
                <AssigneePicker
                  users={users}
                  selectedIds={(t.assignees || []).map((a) => a.id)}
                  onChange={(ids) => updateAssignees(t.id, ids)}
                />
              </td>
              <td className="p-2">{formatDate(t.completed_at)}</td>
              <td className="p-2">{formatDate(t.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      </PageFrame>

      {editingTask && (
        <TaskFormModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </>
  );
}
