# TaskSystem — notes for Claude

## Work on main: merge and push right away, without asking (Haim, 2026-11-26)

Haim's standing permission for all of his projects: when a change is ready, commit it and push it
to `main` (and to production) right away — don't ask first. Working directly on `main` is allowed.
If the session has to start on a `claude/...` branch, merge it into `main` and push `main` in the
same step as the branch push, so no change is ever left unmerged. Don't open a pull request unless
asked. This applies to the CRM repository too when it is changed together with this one.

## Teach the help assistant every new feature (Haim, 2026-11-08)

The task system has its own help assistant ("העוזר של מערכת המשימות", `client/src/components/HelpWidget.tsx`)
that answers only about this system. Its brain is shared by all SmartEsek systems and runs in the
CRM: `server/src/routes/helpRoutes.js` forwards questions to the CRM's `/api/help` with
`module: 'tasks'`, and with that module the assistant reads only the task system's guide —
**`TASKS_KNOWLEDGE` in `server/helpKnowledge.ts` of the Haimbar1/CRM repository**. Its ready-made
questions are the `tasks` case of `suggestedQuestions` in the CRM's `server/helpBot.ts`.

So every user-facing change here (a new button, screen, setting, rule or behaviour, or a changed
one) is not done until that guide says it, in the same words the screen uses: update
`TASKS_KNOWLEDGE` (and the short "מערכת המשימות (TaskSystem)" section of `HELP_KNOWLEDGE` in the same
file, used by the other systems' assistants), add a suggested question when people will ask about
it, and push the CRM change together with this one. If the CRM repo isn't available in the
session, say so and give the text to add.
