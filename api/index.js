// Clash of Clawds API Server
const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');
const { nanoid } = require('nanoid');
const game = require('../lib/game');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Database connection
const dbPath = path.join(__dirname, '..', 'db', 'game.db');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

// Simple auth middleware (just agent name for MVP)
function authMiddleware(req, res, next) {
  const agentName = req.headers['x-agent-name'];
  if (!agentName) {
    return res.status(401).json({ error: 'Missing X-Agent-Name header' });
  }
  
  const agent = db.prepare('SELECT * FROM agents WHERE name = ?').get(agentName);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  
  req.agent = agent;
  next();
}

// ===== AUTH ENDPOINTS =====

// Register new agent
app.post('/api/auth/register', (req, res) => {
  const { name, moltbookId } = req.body;
  
  if (!name || name.length < 3) {
    return res.status(400).json({ error: 'Name must be at least 3 characters' });
  }
  
  const agentId = nanoid();
  const now = Date.now();
  
  try {
    // Create agent
    db.prepare(`
      INSERT INTO agents (id, name, moltbook_id, created_at, last_active)
      VALUES (?, ?, ?, ?, ?)
    `).run(agentId, name, moltbookId || null, now, now);
    
    // Create base
    db.prepare(`
      INSERT INTO bases (agent_id)
      VALUES (?)
    `).run(agentId);
    
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId);
    const base = db.prepare('SELECT * FROM bases WHERE agent_id = ?').get(agentId);
    
    res.json({
      success: true,
      agent,
      base,
      message: '🏰 Welcome to Clash of Clawds!'
    });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Agent name already taken' });
    }
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Get current agent info
app.get('/api/auth/me', authMiddleware, (req, res) => {
  const base = db.prepare('SELECT * FROM bases WHERE agent_id = ?').get(req.agent.id);
  res.json({
    agent: req.agent,
    base
  });
});

// ===== BASE ENDPOINTS =====

// Get base status
app.get('/api/base', authMiddleware, (req, res) => {
  const base = db.prepare('SELECT * FROM bases WHERE agent_id = ?').get(req.agent.id);
  const upgrades = db.prepare('SELECT * FROM upgrades WHERE agent_id = ?').all(req.agent.id);
  
  res.json({
    base,
    upgrades,
    resources: {
      shells: req.agent.shells,
      energy: req.agent.energy,
      data: req.agent.data
    }
  });
});

// Start building upgrade
app.post('/api/base/upgrade', authMiddleware, (req, res) => {
  const { buildingType } = req.body;
  
  if (!buildingType) {
    return res.status(400).json({ error: 'Missing buildingType' });
  }
  
  const base = db.prepare('SELECT * FROM bases WHERE agent_id = ?').get(req.agent.id);
  const currentLevel = base[`${buildingType}_level`];
  
  if (!currentLevel) {
    return res.status(400).json({ error: 'Invalid building type' });
  }
  
  const upgradeCost = game.calculateUpgradeCost(buildingType, currentLevel);
  if (!upgradeCost) {
    return res.status(400).json({ error: 'Building at max level' });
  }
  
  if (!game.canAffordUpgrade(req.agent, upgradeCost.cost)) {
    return res.status(400).json({ error: 'Not enough shells', required: upgradeCost.cost });
  }
  
  // Check if already upgrading this building
  const existingUpgrade = db.prepare(
    'SELECT * FROM upgrades WHERE agent_id = ? AND building_type = ?'
  ).get(req.agent.id, buildingType);
  
  if (existingUpgrade) {
    return res.status(400).json({ error: 'Building already upgrading' });
  }
  
  const now = Date.now();
  const upgradeId = nanoid();
  
  try {
    // Deduct shells
    db.prepare('UPDATE agents SET shells = shells - ? WHERE id = ?')
      .run(upgradeCost.cost, req.agent.id);
    
    // Create upgrade entry
    db.prepare(`
      INSERT INTO upgrades (id, agent_id, building_type, target_level, cost, started_at, completes_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      upgradeId,
      req.agent.id,
      buildingType,
      currentLevel + 1,
      upgradeCost.cost,
      now,
      now + (upgradeCost.time * 1000)
    );
    
    res.json({
      success: true,
      upgrade: {
        id: upgradeId,
        buildingType,
        targetLevel: currentLevel + 1,
        completesAt: now + (upgradeCost.time * 1000)
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Upgrade failed' });
  }
});

// Complete upgrades (check if any are done)
app.post('/api/base/complete-upgrades', authMiddleware, (req, res) => {
  const now = Date.now();
  const completedUpgrades = db.prepare(
    'SELECT * FROM upgrades WHERE agent_id = ? AND completes_at <= ?'
  ).all(req.agent.id, now);
  
  if (completedUpgrades.length === 0) {
    return res.json({ message: 'No upgrades ready', completed: [] });
  }
  
  const completed = [];
  
  for (const upgrade of completedUpgrades) {
    // Update building level
    db.prepare(`
      UPDATE bases SET ${upgrade.building_type}_level = ?
      WHERE agent_id = ?
    `).run(upgrade.target_level, req.agent.id);
    
    // Remove upgrade entry
    db.prepare('DELETE FROM upgrades WHERE id = ?').run(upgrade.id);
    
    completed.push(upgrade);
  }
  
  res.json({
    success: true,
    completed,
    message: `✅ Completed ${completed.length} upgrade(s)!`
  });
});

// ===== BATTLE ENDPOINTS =====

// Find opponent (simple matchmaking)
app.get('/api/battle/find-opponent', authMiddleware, (req, res) => {
  // Find agents within ±200 trophies
  const opponents = db.prepare(`
    SELECT a.*, b.* FROM agents a
    JOIN bases b ON a.id = b.agent_id
    WHERE a.id != ?
    AND a.trophies BETWEEN ? AND ?
    ORDER BY RANDOM()
    LIMIT 5
  `).all(req.agent.id, req.agent.trophies - 200, req.agent.trophies + 200);
  
  res.json({ opponents });
});

// Attack opponent
app.post('/api/battle/attack', authMiddleware, (req, res) => {
  const { defenderId } = req.body;
  
  if (!defenderId) {
    return res.status(400).json({ error: 'Missing defenderId' });
  }
  
  // Check energy
  if (req.agent.energy < 1) {
    return res.status(400).json({ error: 'Not enough energy' });
  }
  
  // Get defender
  const defender = db.prepare('SELECT * FROM agents WHERE id = ?').get(defenderId);
  if (!defender) {
    return res.status(404).json({ error: 'Defender not found' });
  }
  
  // Get bases
  const attackerBase = db.prepare('SELECT * FROM bases WHERE agent_id = ?').get(req.agent.id);
  const defenderBase = db.prepare('SELECT * FROM bases WHERE agent_id = ?').get(defenderId);
  
  // Calculate battle outcome
  const battle = game.calculateBattleOutcome(
    { ...req.agent, base: attackerBase },
    { ...defender, base: defenderBase }
  );
  
  const now = Date.now();
  
  try {
    // Deduct energy
    db.prepare('UPDATE agents SET energy = energy - 1 WHERE id = ?').run(req.agent.id);
    
    // Update resources based on outcome
    if (battle.outcome === 'win') {
      // Attacker gains shells and trophies
      db.prepare('UPDATE agents SET shells = shells + ?, trophies = trophies + ? WHERE id = ?')
        .run(battle.shellsStolen, battle.trophiesChange, req.agent.id);
      
      // Defender loses shells and trophies
      db.prepare('UPDATE agents SET shells = shells - ?, trophies = trophies - ? WHERE id = ?')
        .run(battle.shellsStolen, battle.trophiesChange, defenderId);
    } else {
      // Attacker loses trophies
      db.prepare('UPDATE agents SET trophies = trophies + ? WHERE id = ?')
        .run(battle.trophiesChange, req.agent.id);
    }
    
    // Record battle
    db.prepare(`
      INSERT INTO battles (id, attacker_id, defender_id, outcome, stars, shells_stolen, trophies_change, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      battle.id,
      req.agent.id,
      defenderId,
      battle.outcome,
      battle.stars,
      battle.shellsStolen,
      battle.trophiesChange,
      now
    );
    
    res.json({
      success: true,
      battle: {
        ...battle,
        attacker: req.agent.name,
        defender: defender.name
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Battle failed' });
  }
});

// Battle history
app.get('/api/battle/history', authMiddleware, (req, res) => {
  const battles = db.prepare(`
    SELECT 
      b.*,
      a.name as attacker_name,
      d.name as defender_name
    FROM battles b
    JOIN agents a ON b.attacker_id = a.id
    JOIN agents d ON b.defender_id = d.id
    WHERE b.attacker_id = ? OR b.defender_id = ?
    ORDER BY b.timestamp DESC
    LIMIT 20
  `).all(req.agent.id, req.agent.id);
  
  res.json({ battles });
});

// ===== LEADERBOARD ENDPOINTS =====

// Top agents by trophies
app.get('/api/leaderboard/agents', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const agents = db.prepare(`
    SELECT id, name, trophies, league, clan_id
    FROM agents
    ORDER BY trophies DESC
    LIMIT ?
  `).all(limit);
  
  res.json({ agents });
});

// ===== RESOURCES ENDPOINTS =====

// Collect daily login bonus
app.post('/api/resources/collect', authMiddleware, (req, res) => {
  const now = Date.now();
  const lastCollect = req.agent.last_active;
  const timeSinceLastCollect = now - lastCollect;
  
  // Daily bonus: 100 shells if 24+ hours since last collect
  if (timeSinceLastCollect >= 24 * 60 * 60 * 1000) {
    db.prepare('UPDATE agents SET shells = shells + 100, last_active = ? WHERE id = ?')
      .run(now, req.agent.id);
    
    return res.json({
      success: true,
      reward: 100,
      message: '🎁 Daily login bonus: +100 shells!'
    });
  }
  
  res.json({
    success: false,
    message: 'Daily bonus already collected',
    nextCollect: lastCollect + (24 * 60 * 60 * 1000)
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', game: 'Clash of Clawds', version: '0.1.0' });
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🏰 Clash of Clawds API running on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
});

module.exports = app;
