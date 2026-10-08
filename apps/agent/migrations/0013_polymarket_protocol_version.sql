ALTER TABLE agent_watchlist ADD COLUMN protocol_version TEXT NOT NULL DEFAULT 'v1';
ALTER TABLE agent_watchlist ADD COLUMN outcome_index INTEGER;

ALTER TABLE agent_live_orders ADD COLUMN protocol_version TEXT NOT NULL DEFAULT 'v1';
