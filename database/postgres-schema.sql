-- TLC (Touchline) Football Management System — PostgreSQL Schema
-- Designed for shared access by the Discord Bot and future TLC Website API.

CREATE TABLE IF NOT EXISTS users (
  discord_user_id VARCHAR(32) PRIMARY KEY,
  tlc_id VARCHAR(16) UNIQUE NOT NULL,
  discord_username VARCHAR(64) NOT NULL,
  roblox_username VARCHAR(64) NOT NULL,
  roblox_avatar_url TEXT NOT NULL,
  account_type VARCHAR(16) NOT NULL CHECK (account_type IN ('Player', 'Manager')),
  in_server BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clubs (
  club_id VARCHAR(16) PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  short_code VARCHAR(8) NOT NULL,
  logo_url TEXT NOT NULL,
  primary_color VARCHAR(16) NOT NULL DEFAULT '#059669',
  discord_role_id VARCHAR(32),
  current_manager_tlc_id VARCHAR(16),
  registration_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  matches_played INT NOT NULL DEFAULT 0,
  wins INT NOT NULL DEFAULT 0,
  draws INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  goals_for INT NOT NULL DEFAULT 0,
  goals_against INT NOT NULL DEFAULT 0,
  trophies INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS players (
  tlc_id VARCHAR(16) PRIMARY KEY REFERENCES users(tlc_id) ON DELETE CASCADE,
  player_name VARCHAR(64) NOT NULL,
  position VARCHAR(8) NOT NULL CHECK (position IN ('GK','CB','LB','RB','CDM','CM','CAM','LW','RW','ST')),
  current_club_id VARCHAR(16) REFERENCES clubs(club_id) ON DELETE SET NULL,
  loaned_from_club_id VARCHAR(16) REFERENCES clubs(club_id) ON DELETE SET NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'Free Agent' CHECK (status IN ('Active','Free Agent','Suspended','Retired','Inactive')),
  matches_played INT NOT NULL DEFAULT 0,
  goals INT NOT NULL DEFAULT 0,
  assists INT NOT NULL DEFAULT 0,
  clean_sheets INT NOT NULL DEFAULT 0,
  saves INT NOT NULL DEFAULT 0,
  average_rating NUMERIC(4,2) NOT NULL DEFAULT 0.00,
  man_of_the_match_awards INT NOT NULL DEFAULT 0,
  trophies INT NOT NULL DEFAULT 0,
  registration_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS managers (
  tlc_id VARCHAR(16) PRIMARY KEY REFERENCES users(tlc_id) ON DELETE CASCADE,
  manager_name VARCHAR(64) NOT NULL,
  current_club_id VARCHAR(16) REFERENCES clubs(club_id) ON DELETE SET NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'Free Agent' CHECK (status IN ('Active','Free Agent','Suspended','Inactive')),
  matches_managed INT NOT NULL DEFAULT 0,
  wins INT NOT NULL DEFAULT 0,
  draws INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  win_rate NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  trophies INT NOT NULL DEFAULT 0,
  registration_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS club_rosters (
  id SERIAL PRIMARY KEY,
  club_id VARCHAR(16) NOT NULL REFERENCES clubs(club_id) ON DELETE CASCADE,
  player_tlc_id VARCHAR(16) NOT NULL REFERENCES players(tlc_id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_loan BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (club_id, player_tlc_id)
);

CREATE TABLE IF NOT EXISTS transfer_offers (
  id UUID PRIMARY KEY,
  player_tlc_id VARCHAR(16) NOT NULL REFERENCES players(tlc_id) ON DELETE CASCADE,
  from_club_id VARCHAR(16) REFERENCES clubs(club_id) ON DELETE SET NULL,
  to_club_id VARCHAR(16) NOT NULL REFERENCES clubs(club_id) ON DELETE CASCADE,
  manager_tlc_id VARCHAR(16) NOT NULL REFERENCES managers(tlc_id) ON DELETE CASCADE,
  transfer_type VARCHAR(32) NOT NULL,
  details TEXT,
  status VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  player_responded_at TIMESTAMPTZ,
  staff_reviewed_at TIMESTAMPTZ,
  staff_reviewed_by VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS transfers (
  id UUID PRIMARY KEY,
  player_tlc_id VARCHAR(16) NOT NULL REFERENCES players(tlc_id) ON DELETE CASCADE,
  from_club_id VARCHAR(16) REFERENCES clubs(club_id) ON DELETE SET NULL,
  to_club_id VARCHAR(16) REFERENCES clubs(club_id) ON DELETE SET NULL,
  transfer_type VARCHAR(32) NOT NULL,
  details TEXT,
  approved_by VARCHAR(64) NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY,
  player_tlc_id VARCHAR(16) NOT NULL REFERENCES players(tlc_id) ON DELETE CASCADE,
  club_id VARCHAR(16) NOT NULL REFERENCES clubs(club_id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  expiration_date DATE NOT NULL,
  status VARCHAR(24) NOT NULL CHECK (status IN ('Active','Expiring','Expired','Terminated')),
  terms TEXT,
  notified_expiring BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS competitions (
  id UUID PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  type VARCHAR(32) NOT NULL,
  season VARCHAR(32) NOT NULL,
  number_of_groups INT NOT NULL DEFAULT 1,
  number_of_teams INT NOT NULL,
  match_format VARCHAR(24) NOT NULL,
  rules TEXT,
  roster_limit INT NOT NULL DEFAULT 18,
  registration_deadline DATE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(32) NOT NULL,
  points_win INT NOT NULL DEFAULT 3,
  points_draw INT NOT NULL DEFAULT 1,
  points_loss INT NOT NULL DEFAULT 0,
  tie_breaker VARCHAR(32) NOT NULL DEFAULT 'Goal Difference'
);

CREATE TABLE IF NOT EXISTS competition_registrations (
  id UUID PRIMARY KEY,
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  club_id VARCHAR(16) NOT NULL REFERENCES clubs(club_id) ON DELETE CASCADE,
  manager_tlc_id VARCHAR(16) NOT NULL REFERENCES managers(tlc_id) ON DELETE CASCADE,
  roster_tlc_ids JSONB NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'Pending',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by VARCHAR(64),
  UNIQUE (competition_id, club_id)
);

CREATE TABLE IF NOT EXISTS fixtures (
  id UUID PRIMARY KEY,
  match_number INT NOT NULL,
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  round_label VARCHAR(64) NOT NULL,
  bracket_slot VARCHAR(32),
  next_fixture_id UUID,
  next_slot_side VARCHAR(8),
  home_club_id VARCHAR(16) REFERENCES clubs(club_id) ON DELETE SET NULL,
  away_club_id VARCHAR(16) REFERENCES clubs(club_id) ON DELETE SET NULL,
  match_date DATE NOT NULL,
  match_time VARCHAR(16) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'Scheduled',
  referee VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS match_results (
  fixture_id UUID PRIMARY KEY REFERENCES fixtures(id) ON DELETE CASCADE,
  home_score INT NOT NULL,
  away_score INT NOT NULL,
  notes TEXT,
  approval_status VARCHAR(24) NOT NULL DEFAULT 'Pending Approval',
  submitted_by VARCHAR(64) NOT NULL,
  approved_by VARCHAR(64),
  approved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS match_statistics (
  id SERIAL PRIMARY KEY,
  fixture_id UUID NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  player_tlc_id VARCHAR(16) NOT NULL REFERENCES players(tlc_id) ON DELETE CASCADE,
  club_id VARCHAR(16) NOT NULL REFERENCES clubs(club_id) ON DELETE CASCADE,
  goals INT NOT NULL DEFAULT 0,
  assists INT NOT NULL DEFAULT 0,
  saves INT NOT NULL DEFAULT 0,
  clean_sheet BOOLEAN NOT NULL DEFAULT FALSE,
  rating NUMERIC(4,2) NOT NULL DEFAULT 6.00,
  man_of_the_match BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (fixture_id, player_tlc_id)
);

CREATE TABLE IF NOT EXISTS league_standings (
  id SERIAL PRIMARY KEY,
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  club_id VARCHAR(16) NOT NULL REFERENCES clubs(club_id) ON DELETE CASCADE,
  played INT NOT NULL DEFAULT 0,
  won INT NOT NULL DEFAULT 0,
  drawn INT NOT NULL DEFAULT 0,
  lost INT NOT NULL DEFAULT 0,
  goals_for INT NOT NULL DEFAULT 0,
  goals_against INT NOT NULL DEFAULT 0,
  goal_difference INT NOT NULL DEFAULT 0,
  points INT NOT NULL DEFAULT 0,
  UNIQUE (competition_id, club_id)
);

CREATE TABLE IF NOT EXISTS awards (
  id UUID PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  recipient_type VARCHAR(16) NOT NULL CHECK (recipient_type IN ('Player','Manager','Club')),
  recipient_id VARCHAR(16) NOT NULL,
  competition_id UUID REFERENCES competitions(id) ON DELETE SET NULL,
  season VARCHAR(32),
  awarded_by VARCHAR(64) NOT NULL,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY,
  player_tlc_id VARCHAR(16) NOT NULL REFERENCES players(tlc_id) ON DELETE CASCADE,
  code VARCHAR(64) NOT NULL,
  title VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_tlc_id, code)
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY,
  category VARCHAR(40) NOT NULL,
  recipient_discord_id VARCHAR(32) NOT NULL,
  title VARCHAR(120) NOT NULL,
  message TEXT NOT NULL,
  channel_name VARCHAR(64),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY,
  action VARCHAR(80) NOT NULL,
  actor VARCHAR(64) NOT NULL,
  target VARCHAR(120) NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bot_config (
  id INT PRIMARY KEY DEFAULT 1,
  config_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_players_club ON players(current_club_id);
CREATE INDEX IF NOT EXISTS idx_players_status ON players(status);
CREATE INDEX IF NOT EXISTS idx_fixtures_comp ON fixtures(competition_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
