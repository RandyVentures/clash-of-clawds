// Serverless-compatible database using Redis (via Upstash/Vercel)
// Maintains the same prepare() API as before, but with persistent storage

const Redis = require('ioredis');

// Initialize Redis client (works with REDIS_URL from Upstash/Vercel)
let redis;
if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    lazyConnect: true
  });
} else {
  console.warn('⚠️  REDIS_URL not set - using in-memory storage (data will not persist)');
  redis = null;
}

class ServerlessDB {
  constructor() {
    this.redis = redis;
  }

  loadData() {
    // Not needed - data is in KV
    return null;
  }

  saveData() {
    // Not needed - data is auto-saved to KV
  }

  prepare(sql) {
    const self = this;
    return {
      async run(...params) {
        try {
          if (sql.includes('INSERT INTO agents')) {
            // Match real API schema: (id, name, moltbook_id, created_at, last_active)
            const agent = {
              id: params[0],
              name: params[1],
              moltbook_id: params[2],
              created_at: params[3],
              last_active: params[4],
              trophies: 0,
              league: 'bronze',
              clan_id: null,
              shells: 500,
              energy: 5,
              data: 0
            };
            
            // Store agent
            await self.redis.hset(`agent:${agent.id}`, agent);
            // Add to agents set and name index
            await self.redis.sadd('agents:all', agent.id);
            await self.redis.set(`agent:name:${agent.name}`, agent.id);
            // Add to leaderboard (sorted set by trophies)
            await self.redis.zadd('leaderboard', agent.trophies, agent.id);
            
            return { lastInsertRowid: agent.id, changes: 1 };
          }
          else if (sql.includes('INSERT INTO bases')) {
            // Match real API schema: just agent_id
            const base = {
              agent_id: params[0],
              town_hall_level: 1,
              vault_level: 1,
              defense_level: 1,
              barracks_level: 1,
              lab_level: 1,
              reactor_level: 1
            };
            
            await self.redis.hset(`base:${base.agent_id}`, base);
            await self.redis.sadd('bases:all', base.agent_id);
            
            return { lastInsertRowid: 1, changes: 1 };
          }
          else if (sql.includes('INSERT INTO buildings')) {
            const buildingId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
            const building = {
              id: buildingId,
              base_id: params[0],
              building_type: params[1],
              level: params[2] || 1
            };
            
            await self.redis.hset(`building:${buildingId}`, building);
            await self.redis.sadd(`buildings:base:${building.base_id}`, buildingId);
            
            return { lastInsertRowid: buildingId };
          }
          else if (sql.includes('INSERT INTO upgrades')) {
            // (id, agent_id, building_type, target_level, cost, started_at, completes_at)
            const upgrade = {
              id: params[0],
              agent_id: params[1],
              building_type: params[2],
              target_level: params[3],
              cost: params[4],
              started_at: params[5],
              completes_at: params[6]
            };
            
            await self.redis.hset(`upgrade:${upgrade.id}`, upgrade);
            await self.redis.sadd(`upgrades:agent:${upgrade.agent_id}`, upgrade.id);
            
            return { lastInsertRowid: upgrade.id, changes: 1 };
          }
          else if (sql.includes('INSERT INTO battles')) {
            // (id, attacker_id, defender_id, outcome, stars, shells_stolen, trophies_change, timestamp)
            const battle = {
              id: params[0],
              attacker_id: params[1],
              defender_id: params[2],
              attacker_army: null,
              outcome: params[3],
              stars: params[4],
              shells_stolen: params[5],
              trophies_change: params[6],
              timestamp: params[7]
            };
            
            await self.redis.hset(`battle:${battle.id}`, battle);
            await self.redis.sadd(`battles:agent:${battle.attacker_id}`, battle.id);
            await self.redis.sadd(`battles:agent:${battle.defender_id}`, battle.id);
            // Add to sorted set by timestamp for history queries
            await self.redis.zadd(`battles:timeline:${battle.attacker_id}`, battle.timestamp, battle.id);
            await self.redis.zadd(`battles:timeline:${battle.defender_id}`, battle.timestamp, battle.id);
            
            return { lastInsertRowid: battle.id, changes: 1 };
          }
          else if (sql.includes('UPDATE agents')) {
            const agentId = params[params.length - 1];
            const agent = await self.redis.hgetall(`agent:${agentId}`);
            
            if (agent) {
              let updated = false;
              
              // Handle dynamic updates
              if (sql.includes('shells = shells -')) {
                agent.shells = (parseInt(agent.shells) || 0) - params[0];
                updated = true;
              }
              else if (sql.includes('shells = shells +') && params.length === 3) {
                agent.shells = (parseInt(agent.shells) || 0) + params[0];
                agent.trophies = (parseInt(agent.trophies) || 0) + params[1];
                updated = true;
                // Update leaderboard
                await self.redis.zadd('leaderboard', agent.trophies, agentId);
              }
              else if (sql.includes('shells = shells + 100')) {
                agent.shells = (parseInt(agent.shells) || 0) + 100;
                agent.last_active = params[0];
                updated = true;
              }
              
              if (sql.includes('energy = energy - 1')) {
                agent.energy = (parseInt(agent.energy) || 0) - 1;
                updated = true;
              }
              
              if (sql.includes('trophies = trophies +') && params.length === 2) {
                agent.trophies = (parseInt(agent.trophies) || 0) + params[0];
                updated = true;
                await self.redis.zadd('leaderboard', agent.trophies, agentId);
              }
              
              if (sql.includes('trophies = trophies -')) {
                agent.trophies = (parseInt(agent.trophies) || 0) - params[0];
                updated = true;
                await self.redis.zadd('leaderboard', agent.trophies, agentId);
              }
              
              if (updated) {
                await self.redis.hset(`agent:${agentId}`, agent);
              }
            }
            
            return { changes: 1 };
          }
          else if (sql.includes('UPDATE bases')) {
            const agentId = params[params.length - 1];
            const base = await self.redis.hgetall(`base:${agentId}`);
            
            if (base) {
              // Extract building type from SQL dynamically
              const levelMatch = sql.match(/SET (\w+)_level = \?/);
              if (levelMatch) {
                const buildingType = levelMatch[1];
                base[`${buildingType}_level`] = params[0];
                await self.redis.hset(`base:${agentId}`, base);
              }
            }
            
            return { changes: 1 };
          }
          else if (sql.includes('DELETE FROM upgrades')) {
            const upgradeId = params[0];
            const upgrade = await self.redis.hgetall(`upgrade:${upgradeId}`);
            
            if (upgrade && upgrade.agent_id) {
              await self.redis.del(`upgrade:${upgradeId}`);
              await self.redis.srem(`upgrades:agent:${upgrade.agent_id}`, upgradeId);
            }
            
            return { changes: 1 };
          }
          
          return { changes: 0 };
        } catch (err) {
          console.error('Error in run:', err);
          throw err;
        }
      },
      
      async get(...params) {
        try {
          if (sql.includes('SELECT * FROM agents WHERE name')) {
            const agentId = await self.redis.get(`agent:name:${params[0]}`);
            if (!agentId) return null;
            return await self.redis.hgetall(`agent:${agentId}`);
          }
          else if (sql.includes('SELECT * FROM agents WHERE id')) {
            return await self.redis.hgetall(`agent:${params[0]}`);
          }
          else if (sql.includes('SELECT * FROM bases WHERE agent_id')) {
            return await self.redis.hgetall(`base:${params[0]}`);
          }
          else if (sql.includes('SELECT * FROM bases WHERE id')) {
            return await self.redis.hgetall(`base:${params[0]}`);
          }
          else if (sql.includes('SELECT * FROM buildings WHERE id')) {
            return await self.redis.hgetall(`building:${params[0]}`);
          }
          else if (sql.includes('SELECT * FROM upgrades WHERE agent_id')) {
            const upgradeIds = await self.redis.smembers(`upgrades:agent:${params[0]}`);
            if (!upgradeIds || upgradeIds.length === 0) return null;
            // Return first upgrade
            return await self.redis.hgetall(`upgrade:${upgradeIds[0]}`);
          }
          
          return null;
        } catch (err) {
          console.error('Error in get:', err);
          return null;
        }
      },
      
      async all(...params) {
        try {
          if (sql.includes('SELECT * FROM upgrades WHERE agent_id') && sql.includes('completes_at <=')) {
            // Get all upgrades for agent that are complete
            const upgradeIds = await self.redis.smembers(`upgrades:agent:${params[0]}`);
            if (!upgradeIds || upgradeIds.length === 0) return [];
            
            const upgrades = [];
            for (const id of upgradeIds) {
              const upgrade = await self.redis.hgetall(`upgrade:${id}`);
              if (upgrade && parseInt(upgrade.completes_at) <= params[1]) {
                upgrades.push(upgrade);
              }
            }
            return upgrades;
          }
          else if (sql.includes('SELECT * FROM upgrades WHERE agent_id')) {
            const upgradeIds = await self.redis.smembers(`upgrades:agent:${params[0]}`);
            if (!upgradeIds || upgradeIds.length === 0) return [];
            
            const upgrades = [];
            for (const id of upgradeIds) {
              const upgrade = await self.redis.hgetall(`upgrade:${id}`);
              if (upgrade) upgrades.push(upgrade);
            }
            return upgrades;
          }
          else if (sql.includes('SELECT') && sql.includes('FROM agents a') && sql.includes('JOIN bases b')) {
            // Find opponents query
            const myAgentId = params[0];
            const minTrophies = params[1];
            const maxTrophies = params[2];
            
            // Get agents by trophy range from leaderboard
            const agentIds = await self.redis.zrangebyscore('leaderboard', minTrophies, maxTrophies);
            
            const opponents = [];
            for (const agentId of agentIds) {
              if (agentId === myAgentId) continue;
              
              const agent = await self.redis.hgetall(`agent:${agentId}`);
              const base = await self.redis.hgetall(`base:${agentId}`);
              
              if (agent && base) {
                opponents.push({ ...agent, ...base });
              }
              
              if (opponents.length >= 5) break;
            }
            
            return opponents;
          }
          else if (sql.includes('SELECT') && sql.includes('battles b') && sql.includes('JOIN agents')) {
            // Battle history
            const agentId = params[0];
            const battleIds = await self.redis.zrevrange(`battles:timeline:${agentId}`, 0, 19);
            
            if (!battleIds || battleIds.length === 0) return [];
            
            const battles = [];
            for (const id of battleIds) {
              const battle = await self.redis.hgetall(`battle:${id}`);
              if (battle) {
                const attacker = await self.redis.hgetall(`agent:${battle.attacker_id}`);
                const defender = await self.redis.hgetall(`agent:${battle.defender_id}`);
                
                battles.push({
                  ...battle,
                  attacker_name: attacker?.name,
                  defender_name: defender?.name
                });
              }
            }
            
            return battles;
          }
          else if (sql.includes('SELECT id, name, trophies')) {
            // Leaderboard
            const limit = params[0] || 50;
            const agentIds = await self.redis.zrevrange('leaderboard', 0, limit - 1);
            
            if (!agentIds || agentIds.length === 0) return [];
            
            const agents = [];
            for (const agentId of agentIds) {
              const agent = await self.redis.hgetall(`agent:${agentId}`);
              if (agent) {
                agents.push({
                  id: agent.id,
                  name: agent.name,
                  trophies: parseInt(agent.trophies) || 0,
                  league: agent.league,
                  clan_id: agent.clan_id
                });
              }
            }
            
            return agents;
          }
          
          return [];
        } catch (err) {
          console.error('Error in all:', err);
          return [];
        }
      }
    };
  }

  exec(sql) {
    // Used for initialization - just return success
    return this;
  }
}

module.exports = ServerlessDB;
