// Marks an archived task (server/src/services/taskArchive.js), seen only with "כולל ארכיון" ticked.
export default function ArchivedBadge() {
  return (
    <span className="mr-1.5 align-middle text-xs font-normal px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 inline-block">
      בארכיון
    </span>
  );
}
