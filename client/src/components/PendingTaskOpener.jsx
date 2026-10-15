import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAppContext } from '../context/AppContext.jsx';
import TaskFormModal from './TaskFormModal.jsx';

// Opens the task a WhatsApp message's link asked for. The link went through /api/open/<task>
// (server/src/routes/openTaskRoutes.js), which noted the task and redirected here — or to the
// business's Monday board, where this app runs in an iframe that can't be deep-linked.
export default function PendingTaskOpener() {
  const { bumpRefresh } = useAppContext();
  const [task, setTask] = useState(null);

  useEffect(() => {
    api
      .getPendingTask()
      .then(({ taskId }) => (taskId ? api.getTasks({ id: taskId }) : []))
      .then((rows) => rows[0] && setTask(rows[0]))
      .catch(console.error);
  }, []);

  if (!task) return null;

  // The modal closes itself after save/delete; the views reload on bumpRefresh.
  return <TaskFormModal task={task} onClose={() => setTask(null)} onSaved={bumpRefresh} onDeleted={bumpRefresh} />;
}
