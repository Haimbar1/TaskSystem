import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { STATUS_COLOR_OPTIONS } from '../constants.js';
import { useAppContext } from '../context/AppContext.jsx';
import KanbanCard from '../components/KanbanCard.jsx';
import PageFrame from '../components/PageFrame.jsx';
import TaskFilters from '../components/TaskFilters.jsx';
import { filterParams } from '../taskFilters.js';
import TaskFormModal from '../components/TaskFormModal.jsx';
import KanbanSendUpdate, { sendKanbanUpdate, useKanbanSendUpdate } from '../components/KanbanSendUpdate.jsx';

export default function KanbanStatusView() {
  const { refreshKey, statuses, filters } = useAppContext();
  const [tasks, setTasks] = useState([]);
  const [savingIds, setSavingIds] = useState([]);
  const [editingTask, setEditingTask] = useState(null);
  const [sendUpdate, setSendUpdate] = useKanbanSendUpdate();

  useEffect(() => {
    api.getTasks(filterParams(filters)).then(setTasks).catch(console.error);
  }, [refreshKey, filters]);

  // The card moves at once and shows that it's saving; if the save fails it goes back to its old
  // column. With "שלח וואטסאפ על כל שינוי" ticked, the WhatsApp update follows the save.
  async function moveTask(taskId, newStatus) {
    const before = tasks.find((t) => String(t.id) === String(taskId));
    if (!before || before.status === newStatus) return;
    setTasks((prev) => prev.map((t) => (t.id === before.id ? { ...t, status: newStatus } : t)));
    setSavingIds((ids) => [...ids, before.id]);
    try {
      // The answer carries the completion date the server set or cleared.
      const updated = await api.updateTask(before.id, { status: newStatus });
      setTasks((prev) => prev.map((t) => (t.id === before.id ? updated : t)));
      if (sendUpdate) sendKanbanUpdate(updated);
    } catch (err) {
      console.error(err);
      setTasks((prev) => prev.map((t) => (t.id === before.id ? { ...t, status: before.status } : t)));
      alert('העברת המשימה נכשלה — היא הוחזרה למקומה');
    } finally {
      setSavingIds((ids) => ids.filter((id) => id !== before.id));
    }
  }

  return (
    <>
    <PageFrame title="קנבן לפי סטטוס" subtitle="גררי משימה בין עמודות כדי לעדכן את הסטטוס שלה · לחיצה כפולה פותחת אותה" actions={<div className="flex flex-wrap items-center gap-3"><KanbanSendUpdate checked={sendUpdate} onChange={setSendUpdate} /><TaskFilters /></div>}>
      {/* One column per status of the business, in its order; scrolls sideways when there are many.
          On a phone the columns are about half as wide (--kanban-col in index.css), so most
          statuses fit on the screen. */}
      <div
        className="kanban-board grid gap-2 sm:gap-3 items-start overflow-x-auto"
        style={{ gridTemplateColumns: `repeat(${statuses.length || 1}, minmax(var(--kanban-col), 1fr))` }}
      >
        {statuses.map((status) => {
          const colTasks = tasks.filter((t) => t.status === status.key);
          const colors = STATUS_COLOR_OPTIONS[status.color] || STATUS_COLOR_OPTIONS.gray;
          return (
            <div
              key={status.key}
              className="bg-gray-50 border rounded-lg overflow-hidden min-h-[300px]"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => moveTask(e.dataTransfer.getData('taskId'), status.key)}
            >
              <div className={`h-1 ${colors.bar}`} />
              <div className="p-2">
                <div className="flex items-center justify-between mb-2 px-1">
                  <h3 className="font-semibold text-sm text-gray-700">
                    {status.label}
                    {status.is_final && <span className="text-gray-400 font-normal"> ✓</span>}
                  </h3>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.badge}`}>
                    {colTasks.length}
                  </span>
                </div>
                {colTasks.map((t) => (
                  <KanbanCard
                    key={t.id}
                    task={t}
                    showAssignees
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
