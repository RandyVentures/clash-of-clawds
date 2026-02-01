// Database initialization for Clash of Clawds
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'game.db');
const db = new Database(dbPath);

console.log('🏰 Initializing Clash of Clawds database...');

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  -- Agents table
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    moltbook_id TEXT UNIQUE,
    created_at INTEGER NOT NULL,
    last_active INTEGER NOT NULL,
    trophies INTEGER DEFAULT 0,
    league TEXT DEFAULT 'bronze',
    clan_id TEXT,
    shells INTEGER DEFAULT 500,
    energy INTEGER DEFAULT 5,
    data INTEGER DEFAULT 0
  );

  -- Bases table
  CREATE TABLE IF NOT EXISTS bases (
    agent_id TEXT PRIMARY KEY,
    town_hall_level INTEGER DEFAULT 1,
    vault_level INTEGER DEFAULT 1,
    defense_level INTEGER DEFAULT 1,
    barracks_level INTEGER DEFAULT 1,
    lab_level INTEGER DEFAULT 1,
    reactor_level INTEGER DEFAULT 1,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
  );

  -- Battles table
  CREATE TABLE IF NOT EXISTS battles (
    id TEXT PRIMARY KEY,
    attacker_id TEXT NOT NULL,
    defender_id TEXT NOT NULL,
    attacker_army TEXT,
    outcome TEXT NOT NULL,
    stars INTEGER DEFAULT 0,
    shells_stolen INTEGER DEFAULT 0,
    trophies_change INTEGER DEFAULT 0,
    timestamp INTEGER NOT NULL,
    FOREIGN KEY (attacker_id) REFERENCES agents(id),
    FOREIGN KEY (defender_id) REFERENCES agents(id)
  );

  -- Upgrades queue table
  CREATE TABLE IF NOT EXISTS upgrades (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    building_type TEXT NOT NULL,
    target_level INTEGER NOT NULL,
    cost INTEGER NOT NULL,
    started_at INTEGER NOT NULL,
    completes_at INTEGER NOT NULL,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
  );

  -- Clans table
  CREATE TABLE IF NOT EXISTS clans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    leader_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    member_count INTEGER DEFAULT 1,
    total_trophies INTEGER DEFAULT 0,
    clan_level INTEGER DEFAULT 1,
    FOREIGN KEY (leader_id) REFERENCES agents(id)
  );

  -- Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_agents_trophies ON agents(trophies DESC);
  CREATE INDEX IF NOT EXISTS idx_agents_clan ON agents(clan_id);
  CREATE INDEX IF NOT EXISTS idx_battles_attacker ON battles(attacker_id);
  CREATE INDEX IF NOT EXISTS idx_battles_defender ON battles(defender_id);
  CREATE INDEX IF NOT EXISTS idx_battles_timestamp ON battles(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_upgrades_agent ON upgrades(agent_id);
  CREATE INDEX IF NOT EXISTS idx_clans_trophies ON clans(total_trophies DESC);
`);

console.log('✅ Database tables created');

// Insert test data for development
const now = Date.now();

try {
  const insertAgent = db.prepare(`
    INSERT OR IGNORE INTO agents (id, name, moltbook_id, created_at, last_active, trophies, shells, energy)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertBase = db.prepare(`
    INSERT OR IGNORE INTO bases (agent_id, town_hall_level, vault_level, defense_level, barracks_level)
    VALUES (?, ?, ?, ?, ?)
  `);

  // Test agent
  insertAgent.run('test-agent-1', 'TestBot', 'test-moltbook-1', now, now, 100, 500, 5);
  insertBase.run('test-agent-1', 1, 1, 1, 1);

  console.log('✅ Test data inserted');
} catch (err) {
  console.log('ℹ️  Test data already exists or skipped');
}

console.log('\n🎮 Database ready!');
console.log(`📍 Location: ${dbPath}\n`);

db.close();
