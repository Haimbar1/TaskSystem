import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAppContext } from '../context/AppContext.jsx';
import KanbanCard from '../components/KanbanCard.jsx';
import PageFrame from '../components/PageFrame.jsx';
import TaskFilters from '../components/TaskFilters.jsx';
import { filterParams } from '../taskFilters.js';
import TaskFormModal from '../components/TaskFormModal.jsx';
import KanbanSendUpdate, { sendKanbanUpdate, useKanbanSendUpdate } from '../components/KanbanSendUpdate.jsx';

const UNASSIGNED = '__unassigned__';

export default function KanbanAssigneeView() {
  const { refreshKey, filters } = useAppContext();
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [savingIds, setSavingIds] = useState([]);
  const [editingTask, setEditingTask] = useState(null);
  const [sendUpdate, setSendUpdate] = useKanbanSendUpdate();

  useEffect(() => {
    api.getTasks(filterParams(filters)).then(setTasks).catch(console.error);
  }, [refreshKey, filters]);

  useEffect(() => {
    api.getUsers().then(setUsers).catch(console.error);
  }, [refreshKey]);

  // The card moves at once and shows that it's saving; if the save fails it goes back to where it
  // was. With "שלח וואטסאפ על כל שינוי" ticked, the WhatsApp update follows the save.
  async function moveTask(taskId, userId) {
    const before = tasks.find((t) => String(t.id) === String(taskId));
    if (!before) return;
    const assignees = userId === UNASSIGNED ? [] : users.filter((u) => u.id === userId);
    const prevIds = (before.assignees || []).map((a) => a.id);
    if (prevIds.length === assignees.length && assignees.every((a) => prevIds.includes(a.id))) return;
    setTasks((prev) => prev.map((t) => (t.id === before.id ? { ...t, assignees } : t)));
    setSavingIds((ids) => [...ids, before.id]);
    try {
      const updated = await api.updateTask(before.id, { assignee_ids: assignees.map((a) => a.id) });
      setTasks((prev) => prev.map((t) => (t.id === before.id ? updated : t)));
      if (sendUpdate) sendKanbanUpdate(updated);
    } catch (err) {
      console.error(err);
      setTasks((prev) => prev.map((t) => (t.id === before.id ? before : t)));
      alert('העברת המשימה נכשלה — היא הוחזרה למקומה');
    } finally {
      setSavingIds((ids) => ids.filter((id) => id !== before.id));
    }
  }

  const columns = [{ id: UNASSIGNED, name: 'לא משויך' }, ...users];

  return (
    <>
    <PageFrame title="קנבן לפי אחראי" subtitle="גררי משימה בין אנשים כדי לשנות מי אחראי עליה · לחיצה כפולה פותחת אותה" actions={<div className="flex flex-wrap items-center gap-3"><KanbanSendUpdate checked={sendUpdate} onChange={setSendUpdate} /><TaskFilters /></div>}>
      {/* One column per person; never narrower than --kanban-col (index.css), scrolls sideways instead. */}
      <div
        className="kanban-board grid gap-2 sm:gap-3 items-start overflow-x-auto"
        style={{ gridTemplateColumns: `repeat(${columns.length || 1}, minmax(var(--kanban-col), 1fr))` }}
      >
        {columns.map((col) => {
          const colTasks = tasks.filter((t) =>
            col.id === UNASSIGNED
              ? !(t.assignees || []).length
              : (t.assignees || []).some((a) => a.id === col.id)
          );
          return (
            <div
              key={col.id}
              className="bg-gray-50 border rounded-lg overflow-hidden min-h-[300px]"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => moveTask(e.dataTransfer.getData('taskId'), col.id)}
            >
              <div className={`h-1 ${col.id === UNASSIGNED ? 'bg-gray-400' : 'bg-teal-500'}`} />
              <div className="p-2">
                <div className="flex items-center justify-between mb-2 px-1">
                  <h3 className="font-semibold text-sm text-gray-700 truncate">
                    {col.name || col.email}
                  </h3>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {colTasks.length}
                  </span>
                </div>
                {colTasks.map((t) => (
                  <KanbanCard
                    key={t.id}
                    task={t}
                    showStatus
                    saving={savingIds.includes(t.id)}
                    sending={sendUpdate}
                    onOpen={() => setEditingTask(t)}
                    onDragStart={(e) => e.dataTransfer.setData('taskId', t.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </PageFrame>

      {editingTask && (
        <TaskFormModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSaved={(updated) => setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))}
          onDeleted={(taskId) => setTasks((prev) => prev.filter((t) => t.id !== taskId))}
        />
      )}
    </>
  );
}
