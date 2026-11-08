# TaskSystem — notes for Claude

## Teach the help assistant every new feature (Haim, 2026-11-08)

The help assistant ("העוזר", `client/src/components/HelpWidget.tsx`) has no knowledge of its own in
this repo: `server/src/routes/helpRoutes.js` forwards questions to the CRM's `/api/help` with
`module: 'tasks'`, and its knowledge of this system lives in the **Haimbar1/CRM** repository
(`crm/server/helpBot.ts`, the tasks module).

So every user-facing change here (a new button, screen, setting, rule or behaviour) is not done
until the assistant knows it:

1. Add or update the feature's entry in `docs/help-knowledge.md` (Hebrew, written the way the
   assistant should explain it: where it is, what it does, what to click, rules and exceptions).
2. Update the tasks knowledge in Haimbar1/CRM `crm/server/helpBot.ts` to match, and add a
   suggested question there if the feature is something people will ask about. If the CRM repo
   isn't available in the session, say so and leave the text in `docs/help-knowledge.md` ready to copy.
