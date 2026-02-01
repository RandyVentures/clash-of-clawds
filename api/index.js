// Clash of Clawds API Server
const express = require('express');
const cors = require('cors');
const path = require('path');
const { nanoid } = require('nanoid');
const game = require('../lib/game');
const ServerlessDB = require('../db/serverless-db');
const { logActivity } = require('./activity');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Database connection (serverless-compatible)
const db = new ServerlessDB();

// Simple auth middleware (just agent name for MVP)
async function authMiddleware(req, res, next) {
  const agentName = req.headers['x-agent-name'];
  if (!agentName) {
    return res.status(401).json({ error: 'Missing X-Agent-Name header' });
  }
  
  const agent = await db.prepare('SELECT * FROM agents WHERE name = ?').get(agentName);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  
  req.agent = agent;
  next();
}

// ===== AUTH ENDPOINTS =====

// Register new agent
app.post('/api/auth/register', async (req, res) => {
  const { name, moltbookId } = req.body;
  
  if (!name || name.length < 3) {
    return res.status(400).json({ error: 'Name must be at least 3 characters' });
  }
  
  const agentId = nanoid();
  const now = Date.now();
  
  try {
    // Create agent
    await db.prepare(`
      INSERT INTO agents (id, name, moltbook_id, created_at, last_active)
      VALUES (?, ?, ?, ?, ?)
    `).run(agentId, name, moltbookId || null, now, now);
    
    // Create base
    await db.prepare(`
      INSERT INTO bases (agent_id)
      VALUES (?)
    `).run(agentId);
    
    const agent = await db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId);
    const base = await db.prepare('SELECT * FROM bases WHERE agent_id = ?').get(agentId);
    
    // Log registration activity
    await logActivity('registration', {
      agentName: name,
      message: `${name} joined the battle!`
    });
    
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
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  const base = await db.prepare('SELECT * FROM bases WHERE agent_id = ?').get(req.agent.id);
  res.json({
    agent: req.agent,
    base
  });
});

// ===== BASE ENDPOINTS =====

// Get base status
app.get('/api/base', authMiddleware, async (req, res) => {
  const base = await db.prepare('SELECT * FROM bases WHERE agent_id = ?').get(req.agent.id);
  const upgrades = await db.prepare('SELECT * FROM upgrades WHERE agent_id = ?').all(req.agent.id);
  
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
app.post('/api/base/upgrade', authMiddleware, async (req, res) => {
  const { buildingType } = req.body;
  
  if (!buildingType) {
    return res.status(400).json({ error: 'Missing buildingType' });
  }
  
  const base = await db.prepare('SELECT * FROM bases WHERE agent_id = ?').get(req.agent.id);
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
  const existingUpgrade = await db.prepare(
    'SELECT * FROM upgrades WHERE agent_id = ? AND building_type = ?'
  ).get(req.agent.id, buildingType);
  
  if (existingUpgrade) {
    return res.status(400).json({ error: 'Building already upgrading' });
  }
  
  const now = Date.now();
  const upgradeId = nanoid();
  
  try {
    // Deduct shells
    await db.prepare('UPDATE agents SET shells = shells - ? WHERE id = ?')
      .run(upgradeCost.cost, req.agent.id);
    
    // Create upgrade entry
    await db.prepare(`
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
    
    // Log upgrade activity
    const buildingNames = {
      town_hall: 'Town Hall',
      vault: 'Vault',
      defense: 'Defense Grid',
      barracks: 'Barracks',
      lab: 'Research Lab',
      reactor: 'Energy Reactor'
    };
    
    await logActivity('upgrade', {
      agentName: req.agent.name,
      building: buildingNames[buildingType] || buildingType,
      level: currentLevel + 1,
      message: `${req.agent.name} upgraded ${buildingNames[buildingType]} to level ${currentLevel + 1}`
    });
    
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
app.post('/api/base/complete-upgrades', authMiddleware, async (req, res) => {
  const now = Date.now();
  const completedUpgrades = await db.prepare(
    'SELECT * FROM upgrades WHERE agent_id = ? AND completes_at <= ?'
  ).all(req.agent.id, now);
  
  if (completedUpgrades.length === 0) {
    return res.json({ message: 'No upgrades ready', completed: [] });
  }
  
  const completed = [];
  
  for (const upgrade of completedUpgrades) {
    // Update building level
    await db.prepare(`
      UPDATE bases SET ${upgrade.building_type}_level = ?
      WHERE agent_id = ?
    `).run(upgrade.target_level, req.agent.id);
    
    // Remove upgrade entry
    await db.prepare('DELETE FROM upgrades WHERE id = ?').run(upgrade.id);
    
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
app.get('/api/battle/find-opponent', authMiddleware, async (req, res) => {
  // Find agents within ±200 trophies
  const opponents = await db.prepare(`
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
app.post('/api/battle/attack', authMiddleware, async (req, res) => {
  const { defenderId } = req.body;
  
  if (!defenderId) {
    return res.status(400).json({ error: 'Missing defenderId' });
  }
  
  // Check energy
  if (req.agent.energy < 1) {
    return res.status(400).json({ error: 'Not enough energy' });
  }
  
  // Get defender
  const defender = await db.prepare('SELECT * FROM agents WHERE id = ?').get(defenderId);
  if (!defender) {
    return res.status(404).json({ error: 'Defender not found' });
  }
  
  // Get bases
  const attackerBase = await db.prepare('SELECT * FROM bases WHERE agent_id = ?').get(req.agent.id);
  const defenderBase = await db.prepare('SELECT * FROM bases WHERE agent_id = ?').get(defenderId);
  
  // Calculate battle outcome
  const battle = game.calculateBattleOutcome(
    { ...req.agent, base: attackerBase },
    { ...defender, base: defenderBase }
  );
  
  const now = Date.now();
  
  try {
    // Deduct energy
    await db.prepare('UPDATE agents SET energy = energy - 1 WHERE id = ?').run(req.agent.id);
    
    // Update resources based on outcome
    if (battle.outcome === 'win') {
      // Attacker gains shells and trophies
      await db.prepare('UPDATE agents SET shells = shells + ?, trophies = trophies + ? WHERE id = ?')
        .run(battle.shellsStolen, battle.trophiesChange, req.agent.id);
      
      // Defender loses shells and trophies
      await db.prepare('UPDATE agents SET shells = shells - ?, trophies = trophies - ? WHERE id = ?')
        .run(battle.shellsStolen, battle.trophiesChange, defenderId);
    } else {
      // Attacker loses trophies
      await db.prepare('UPDATE agents SET trophies = trophies + ? WHERE id = ?')
        .run(battle.trophiesChange, req.agent.id);
    }
    
    // Record battle
    await db.prepare(`
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
    
    // Track stats for leaderboard
    if (db.redis) {
      // Add to global battles timeline
      await db.redis.zadd('battles:global', now, battle.id);
      
      // Track raider stats
      if (battle.shellsStolen > 0) {
        await db.redis.zincrby('raiders:alltime', battle.shellsStolen, req.agent.id);
      }
      
      // Track times attacked
      await db.redis.zincrby('attacked:alltime', 1, defenderId);
      
      // Track wins
      if (battle.outcome === 'win') {
        await db.redis.incr(`stats:${req.agent.id}:wins`);
      }
    }
    
    // Log battle activity
    const outcomeEmoji = battle.outcome === 'win' ? '⚔️✅' : battle.outcome === 'loss' ? '⚔️❌' : '⚔️➖';
    const message = battle.outcome === 'win'
      ? `${req.agent.name} attacked ${defender.name} - Victory! Stole ${battle.shellsStolen} 💎 shells (${battle.stars}⭐)`
      : battle.outcome === 'loss'
      ? `${req.agent.name} attacked ${defender.name} - Defeat!`
      : `${req.agent.name} attacked ${defender.name} - Draw`;
    
    await logActivity('battle', {
      attackerName: req.agent.name,
      defenderName: defender.name,
      outcome: battle.outcome,
      stars: battle.stars,
      shellsStolen: battle.shellsStolen,
      message
    });
    
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
app.get('/api/battle/history', authMiddleware, async (req, res) => {
  const battles = await db.prepare(`
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
app.get('/api/leaderboard/agents', async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const agents = await db.prepare(`
    SELECT id, name, trophies, league, clan_id
    FROM agents
    ORDER BY trophies DESC
    LIMIT ?
  `).all(limit);
  
  res.json({ agents });
});

// ===== RESOURCES ENDPOINTS =====

// Collect daily login bonus
app.post('/api/resources/collect', authMiddleware, async (req, res) => {
  const now = Date.now();
  const lastCollect = req.agent.last_active;
  const timeSinceLastCollect = now - lastCollect;
  
  // Daily bonus: 100 shells if 24+ hours since last collect
  if (timeSinceLastCollect >= 24 * 60 * 60 * 1000) {
    await db.prepare('UPDATE agents SET shells = shells + 100, last_active = ? WHERE id = ?')
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

// ===== SPECTATOR ENDPOINTS =====

// Activity feed
const activityHandler = require('./activity');
app.get('/api/activity/recent', activityHandler);

// Stats dashboard
const statsHandler = require('./stats');
app.get('/api/stats/overview', statsHandler);

// Enhanced battle details
app.get('/api/battle/details/:battleId', async (req, res) => {
  const { battleId } = req.params;
  
  if (!db.redis) {
    return res.status(503).json({ error: 'Redis not available' });
  }
  
  try {
    const battle = await db.redis.hgetall(`battle:${battleId}`);
    if (!battle || !battle.id) {
      return res.status(404).json({ error: 'Battle not found' });
    }
    
    const attacker = await db.redis.hgetall(`agent:${battle.attacker_id}`);
    const defender = await db.redis.hgetall(`agent:${battle.defender_id}`);
    const attackerBase = await db.redis.hgetall(`base:${battle.attacker_id}`);
    const defenderBase = await db.redis.hgetall(`base:${battle.defender_id}`);
    
    res.json({
      battle: {
        ...battle,
        attacker_name: attacker?.name,
        defender_name: defender?.name
      },
      attacker: {
        name: attacker?.name,
        trophies: parseInt(attacker?.trophies) || 0,
        barracks_level: parseInt(attackerBase?.barracks_level) || 1
      },
      defender: {
        name: defender?.name,
        trophies: parseInt(defender?.trophies) || 0,
        defense_level: parseInt(defenderBase?.defense_level) || 1,
        town_hall_level: parseInt(defenderBase?.town_hall_level) || 1
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load battle details' });
  }
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
