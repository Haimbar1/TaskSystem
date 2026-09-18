// The three Meta-approved templates Haim actually has, with their exact
// {{n}} variable order — copied verbatim from the WhatsApp Business template
// library so the preview shown to the user matches what will really be sent.
export const WHATSAPP_TEMPLATES = {
  assigned: {
    name: 'new_task_was_assigned_to_you_rev1',
    // {{1}} name  {{2}} task title  {{3}} due date  {{4}} link
    buildParams: ({ recipientName, task, dueDate, link }) => [recipientName, task.title, dueDate, link],
    render: (p) =>
      `שלום ${p[0]},\nהמשימה *${p[1]}*, הועברה לטיפולך.\nתאריך יעד ${p[2]}.\nקישור למשימה:\n${p[3]},\nלטיפולך המסור`,
  },
  status_changed: {
    name: 'a_task_was_updated',
    // {{1}} name  {{2}} task title  {{3}} changed by  {{4}} what changed  {{5}} link
    buildParams: ({ recipientName, task, changedByName, changeSummary, link }) => [
      recipientName,
      task.title,
      changedByName,
      changeSummary,
      link,
    ],
    render: (p) => `שלום ${p[0]},\nהמשימה *${p[1]}*,\nעודכנה ע"י ${p[2]}.\nהעדכון ${p[3]}\nקישור למשימה:\n${p[4]},\nלידיעתך`,
  },
  overdue_reminder: {
    name: 'task_overdue',
    // {{1}} task title  {{2}} status  {{3}} due date  {{4}} link
    buildParams: ({ task, statusLabel, dueDate, link }) => [task.title, statusLabel, dueDate, link],
    render: (p) => `שלום,\nהמשימה ${p[0]} עדיין במצב ${p[1]}\nתאריך היעד שלה הוא ${p[2]}\nקישור למשימה ${p[3]}`,
  },
};

// field_changed shares the same template/wording as status_changed — both
// are "the task was updated", just with a different summary of what changed.
WHATSAPP_TEMPLATES.field_changed = WHATSAPP_TEMPLATES.status_changed;
