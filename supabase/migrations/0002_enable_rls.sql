-- Defense in depth for Supabase. Browser roles already have no grants (0001),
-- but Supabase's default privileges grant anon/authenticated access to new
-- tables in public. Enabling RLS with no policies denies them every row even
-- if a grant reappears. The backend connects as the table owner, which
-- bypasses RLS, so game behavior is unchanged.
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shuffle_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
