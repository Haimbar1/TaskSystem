import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { STATUS_LABELS, PRIORITY_LABELS } from '../constants.js';
import { useAppContext } from '../context/AppContext.jsx';
import AssigneePicker from '../components/AssigneePicker.jsx';
import TaskFormModal from '../components/TaskFormModal.jsx';
import { formatDate } from '../utils.js';
import { showWhatsAppPreview } from '../whatsappPreview.js';

// TODO: per-column filtering (the spec asks for sort + filter on every
// column) — only sorting is wired up so far.
export default function TableView() {
  const { refreshKey } = useAppContext();
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [sort, setSort] = useState({ col: 'created_at', dir: 'desc' });
  const [editingTask, setEditingTask] = useState(null);

  useEffect(() => {
    api.getTasks({ sort: sort.col, dir: sort.dir }).then(setTasks).catch(console.error);
  }, [sort, refreshKey]);

  useEffect(() => {
    api.getUsers().then(setUsers).catch(console.error);
  }, []);

  function toggleSort(col) {
    setSort((s) => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }));
  }

  async function updateAssignees(taskId, assigneeIds) {
    const updated = await api.updateTask(taskId, { assignee_ids: assigneeIds });
    setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
    showWhatsAppPreview(updated.whatsappPreviews);
  }

  function handleSaved(updated) {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    showWhatsAppPreview(updated.whatsappPreviews);
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
      <table className="w-full bg-white border rounded">
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
                className="p-2 cursor-pointer text-blue-700 hover:underline"
                onClick={() => setEditingTask(t)}
              >
                {t.title}
              </td>
              <td className="p-2">{PRIORITY_LABELS[t.priority]}</td>
              <td className="p-2">{formatDate(t.due_date)}</td>
              <td className="p-2">{STATUS_LABELS[t.status]}</td>
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
