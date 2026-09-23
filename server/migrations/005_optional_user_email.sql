-- People of an embedded business (see src/embed.js) are added here by a super admin and never log
-- in themselves, so they may have no email. Also ensured at runtime there.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
