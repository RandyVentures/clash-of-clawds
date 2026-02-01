// Serverless-compatible database using IN-MEMORY storage
// NOTE: This is for DEMO/TESTING only! Data resets on cold starts.
// For production, use Vercel KV, Postgres, or external DB service.

// Global in-memory store (persists across requests in same instance)
let GLOBAL_DATA = {
  agents: [],
  bases: [],
  buildings: [],
  upgrades: [],
  battles: []
};

class ServerlessDB {
  constructor() {
    // Use shared global data store
    this.data = GLOBAL_DATA;
  }

  loadData() {
    // Not needed - using in-memory store
    return this.data;
  }

  saveData() {
    // Data already in memory, no need to save
    // In production, this would write to actual DB
  }

  prepare(sql) {
    const self = this;
    return {
      run(...params) {
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
            self.data.agents.push(agent);
            self.saveData();
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
            self.data.bases.push(base);
            self.saveData();
            return { lastInsertRowid: 1, changes: 1 };
          }
          else if (sql.includes('INSERT INTO buildings')) {
            const building = {
              id: self.data.buildings.length + 1,
              base_id: params[0],
              building_type: params[1],
              level: params[2] || 1
            };
            self.data.buildings.push(building);
            self.saveData();
            return { lastInsertRowid: building.id };
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
            self.data.upgrades.push(upgrade);
            self.saveData();
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
            self.data.battles.push(battle);
            self.saveData();
            return { lastInsertRowid: battle.id, changes: 1 };
          }
          else if (sql.includes('UPDATE agents')) {
            const agentId = params[params.length - 1];
            const agent = self.data.agents.find(a => a.id === agentId);
            if (agent) {
              // Handle dynamic updates
              if (sql.includes('shells = shells -')) agent.shells -= params[0];
              else if (sql.includes('shells = shells +') && params.length === 3) {
                agent.shells += params[0];
                agent.trophies += params[1];
              }
              else if (sql.includes('shells = shells + 100')) {
                agent.shells += 100;
                agent.last_active = params[0];
              }
              if (sql.includes('energy = energy - 1')) agent.energy -= 1;
              if (sql.includes('trophies = trophies +') && params.length === 2) agent.trophies += params[0];
              if (sql.includes('trophies = trophies -')) agent.trophies -= params[0];
              self.saveData();
            }
            return { changes: 1 };
          }
          else if (sql.includes('UPDATE bases')) {
            const agentId = params[params.length - 1];
            const base = self.data.bases.find(b => b.agent_id === agentId);
            if (base) {
              // Extract building type from SQL dynamically
              const levelMatch = sql.match(/SET (\w+)_level = \?/);
              if (levelMatch) {
                const buildingType = levelMatch[1];
                base[`${buildingType}_level`] = params[0];
              }
              self.saveData();
            }
            return { changes: 1 };
          }
          else if (sql.includes('DELETE FROM upgrades')) {
            const upgradeId = params[0];
            const index = self.data.upgrades.findIndex(u => u.id === upgradeId);
            if (index !== -1) {
              self.data.upgrades.splice(index, 1);
              self.saveData();
            }
            return { changes: 1 };
          }
          
          return { changes: 0 };
        } catch (err) {
          console.error('Error in run:', err);
          throw err;
        }
      },
      
      get(...params) {
        try {
          if (sql.includes('SELECT * FROM agents WHERE name')) {
            return self.data.agents.find(a => a.name === params[0]);
          }
          else if (sql.includes('SELECT * FROM agents WHERE id')) {
            return self.data.agents.find(a => a.id === params[0]);
          }
          else if (sql.includes('SELECT * FROM bases WHERE agent_id')) {
            return self.data.bases.find(b => b.agent_id === params[0]);
          }
          else if (sql.includes('SELECT * FROM bases WHERE id')) {
            return self.data.bases.find(b => b.id === params[0]);
          }
          else if (sql.includes('SELECT * FROM buildings WHERE id')) {
            return self.data.buildings.find(b => b.id === params[0]);
          }
          else if (sql.includes('SELECT * FROM upgrades WHERE agent_id')) {
            return self.data.upgrades.find(u => u.agent_id === params[0]);
          }
          
          return null;
        } catch (err) {
          console.error('Error in get:', err);
          return null;
        }
      },
      
      all(...params) {
        try {
          if (sql.includes('SELECT * FROM upgrades WHERE agent_id')) {
            return self.data.upgrades.filter(u => u.agent_id === params[0]);
          }
          else if (sql.includes('completes_at <=')) {
            // SELECT * FROM upgrades WHERE agent_id = ? AND completes_at <= ?
            return self.data.upgrades.filter(u => u.agent_id === params[0] && u.completes_at <= params[1]);
          }
          else if (sql.includes('SELECT') && sql.includes('FROM agents a') && sql.includes('JOIN bases b')) {
            // Find opponents query
            const myAgentId = params[0];
            const minTrophies = params[1];
            const maxTrophies = params[2];
            
            return self.data.agents
              .filter(a => a.id !== myAgentId && a.trophies >= minTrophies && a.trophies <= maxTrophies)
              .map(agent => {
                const base = self.data.bases.find(b => b.agent_id === agent.id);
                return { ...agent, ...base };
              })
              .slice(0, 5);
          }
          else if (sql.includes('SELECT') && sql.includes('battles b') && sql.includes('JOIN agents')) {
            // Battle history
            const agentId = params[0];
            return self.data.battles
              .filter(b => b.attacker_id === agentId || b.defender_id === agentId)
              .map(battle => {
                const attacker = self.data.agents.find(a => a.id === battle.attacker_id);
                const defender = self.data.agents.find(a => a.id === battle.defender_id);
                return {
                  ...battle,
                  attacker_name: attacker?.name,
                  defender_name: defender?.name
                };
              })
              .sort((a, b) => b.timestamp - a.timestamp)
              .slice(0, 20);
          }
          else if (sql.includes('SELECT id, name, trophies')) {
            // Leaderboard
            const limit = params[0] || 50;
            return self.data.agents
              .map(a => ({
                id: a.id,
                name: a.name,
                trophies: a.trophies,
                league: a.league,
                clan_id: a.clan_id
              }))
              .sort((a, b) => b.trophies - a.trophies)
              .slice(0, limit);
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
