import { PRIORITY_COLORS, PRIORITY_LABELS, STATUS_COLOR_OPTIONS } from '../constants.js';
import { useAppContext } from '../context/AppContext.jsx';
import { isOverdue } from '../utils.js';

// `saving`: the card was just moved and the server hasn't answered yet — it already sits in its
// new column, dimmed, and can't be dragged again. `sending`: a WhatsApp update goes out with it.
// `showStatus`: a pill with the task's status, for boards whose columns aren't statuses.
// An overdue task (utils.js isOverdue) is red, with "באיחור" on its due date.
export default function KanbanCard({ task, onDragStart, onOpen, showAssignees = false, showStatus = false, saving = false, sending = false }) {
  const { statuses, statusLabel } = useAppContext();
  const overdue = isOverdue(task, statuses);
  const status = statuses.find((s) => s.key === task.status);
  const statusColors = STATUS_COLOR_OPTIONS[status?.color] || STATUS_COLOR_OPTIONS.gray;
  return (
    <div
      draggable={!saving}
      onDragStart={onDragStart}
      onDoubleClick={saving ? undefined : onOpen}
      title="גרירה להעברה, לחיצה כפולה לפתיחה"
      className={`border rounded-lg p-2 sm:p-2.5 mb-2 break-words shadow-sm transition-shadow space-y-2 ${
        overdue ? 'bg-red-50 border-red-300' : 'bg-white'
      } ${saving ? 'opacity-60 cursor-wait border-emerald-300' : 'cursor-move hover:shadow-md'}`}
    >
      <div className="text-sm font-medium text-gray-800">{task.title}</div>
      {saving && <div className="text-xs text-emerald-700">{sending ? 'שומר ושולח עדכון…' : 'שומר…'}</div>}
      <div className="flex items-center flex-wrap gap-1">
        {showStatus && task.status && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors.badge}`}>
            {statusLabel(task.status)}
          </span>
        )}
        {task.priority && (
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.normal
            }`}
          >
            {PRIORITY_LABELS[task.priority] || task.priority}
          </span>
        )}
        {task.due_date && (
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              overdue ? 'bg-red-100 text-red-700 font-semibold' : 'bg-gray-50 text-gray-500'
            }`}
          >
            {new Date(task.due_date).toLocaleDateString('he-IL')}
            {overdue && ' · באיחור'}
          </span>
        )}
      </div>
      {showAssignees && (task.assignees || []).length > 0 && (
        <div className="flex items-center flex-wrap gap-1">
          {task.assignees.map((a) => (
            <span
              key={a.id}
              className="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-700"
            >
              {a.name || a.email}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
