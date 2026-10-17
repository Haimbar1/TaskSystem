import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { PRIORITY_LABELS } from '../constants.js';
import { useAppContext } from '../context/AppContext.jsx';
import AssigneePicker from '../components/AssigneePicker.jsx';
import TaskFormModal from '../components/TaskFormModal.jsx';
import { formatDate } from '../utils.js';
import PageFrame from '../components/PageFrame.jsx';
import TaskFilters from '../components/TaskFilters.jsx';
import { filterParams } from '../taskFilters.js';

// TODO: per-column filtering (the spec asks for sort + filter on every
// column) — only sorting is wired up so far.
export default function TableView() {
  const { refreshKey, statusLabel, filters } = useAppContext();
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

  // Shown at once; the save (which also sends WhatsApp) replaces it when it answers, or undoes it.
  async function updateAssignees(taskId, assigneeIds) {
    const before = tasks.find((t) => t.id === taskId);
    const assignees = users.filter((u) => assigneeIds.includes(u.id));
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, assignees } : t)));
    try {
      const updated = await api.updateTask(taskId, { assignee_ids: assigneeIds });
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
    } catch (err) {
      console.error(err);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? before : t)));
      alert('עדכון האחראים נכשל');
    }
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
      <table className="w-full">
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
            <tr key={t.id} className="border-b">
              <td
                className="p-2 cursor-pointer text-emerald-700 hover:underline"
                onClick={() => setEditingTask(t)}
              >
                {t.title}
              </td>
              <td className="p-2">{PRIORITY_LABELS[t.priority]}</td>
              <td className="p-2">{formatDate(t.due_date)}</td>
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
