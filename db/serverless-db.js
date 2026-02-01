// Serverless-compatible database using JSON storage
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || '/tmp/game-data.json';

class ServerlessDB {
  constructor() {
    this.data = this.loadData();
  }

  loadData() {
    try {
      if (fs.existsSync(DB_PATH)) {
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      }
    } catch (err) {
      console.log('Creating new database');
    }
    
    return {
      agents: [],
      bases: [],
      buildings: [],
      upgrades: [],
      battles: []
    };
  }

  saveData() {
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(this.data, null, 2));
    } catch (err) {
      console.error('Error saving data:', err);
    }
  }

  prepare(sql) {
    const self = this;
    return {
      run(...params) {
        try {
          if (sql.includes('INSERT INTO agents')) {
            const agent = {
              id: self.data.agents.length + 1,
              username: params[0],
              created_at: Date.now()
            };
            self.data.agents.push(agent);
            self.saveData();
            return { lastInsertRowid: agent.id };
          }
          else if (sql.includes('INSERT INTO bases')) {
            const base = {
              id: self.data.bases.length + 1,
              agent_id: params[0],
              shells: 1000,
              energy: 5,
              data_fragments: 0,
              trophies: 0,
              last_login: Date.now()
            };
            self.data.bases.push(base);
            self.saveData();
            return { lastInsertRowid: base.id };
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
            const upgrade = {
              id: self.data.upgrades.length + 1,
              base_id: params[0],
              building_id: params[1],
              started_at: Date.now(),
              completes_at: Date.now() + params[2] * 1000
            };
            self.data.upgrades.push(upgrade);
            self.saveData();
            return { lastInsertRowid: upgrade.id };
          }
          else if (sql.includes('INSERT INTO battles')) {
            const battle = {
              id: self.data.battles.length + 1,
              attacker_id: params[0],
              defender_id: params[1],
              attacker_damage: params[2],
              defender_damage: params[3],
              shells_stolen: params[4],
              trophies_change: params[5],
              timestamp: Date.now()
            };
            self.data.battles.push(battle);
            self.saveData();
            return { lastInsertRowid: battle.id };
          }
          else if (sql.includes('UPDATE bases')) {
            const baseId = params[params.length - 1];
            const base = self.data.bases.find(b => b.id === baseId);
            if (base) {
              if (sql.includes('shells =')) base.shells = params[0];
              if (sql.includes('energy =')) base.energy = params[0];
              if (sql.includes('data_fragments =')) base.data_fragments = params[0];
              if (sql.includes('trophies =')) base.trophies = params[0];
              if (sql.includes('last_login =')) base.last_login = params[0];
              self.saveData();
            }
            return { changes: 1 };
          }
          else if (sql.includes('UPDATE buildings')) {
            const buildingId = params[params.length - 1];
            const building = self.data.buildings.find(b => b.id === buildingId);
            if (building) {
              building.level = params[0];
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
          if (sql.includes('SELECT * FROM agents WHERE username')) {
            return self.data.agents.find(a => a.username === params[0]);
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
          else if (sql.includes('SELECT * FROM upgrades WHERE base_id')) {
            return self.data.upgrades.find(u => u.base_id === params[0] && u.completes_at > Date.now());
          }
          
          return null;
        } catch (err) {
          console.error('Error in get:', err);
          return null;
        }
      },
      
      all(...params) {
        try {
          if (sql.includes('SELECT * FROM buildings WHERE base_id')) {
            return self.data.buildings.filter(b => b.base_id === params[0]);
          }
          else if (sql.includes('SELECT * FROM upgrades WHERE base_id')) {
            return self.data.upgrades.filter(u => u.base_id === params[0] && u.completes_at > Date.now());
          }
          else if (sql.includes('SELECT * FROM battles WHERE attacker_id')) {
            return self.data.battles.filter(b => b.attacker_id === params[0] || b.defender_id === params[0])
              .sort((a, b) => b.timestamp - a.timestamp)
              .slice(0, 20);
          }
          else if (sql.includes('SELECT a.username, b.trophies')) {
            return self.data.bases
              .map(base => {
                const agent = self.data.agents.find(a => a.id === base.agent_id);
                return {
                  username: agent?.username,
                  trophies: base.trophies,
                  shells: base.shells
                };
              })
              .filter(b => b.username)
              .sort((a, b) => b.trophies - a.trophies)
              .slice(0, 100);
          }
          else if (sql.includes('SELECT * FROM bases WHERE id !=')) {
            const myBaseId = params[0];
            const myBase = self.data.bases.find(b => b.id === myBaseId);
            if (!myBase) return [];
            
            const minTrophies = myBase.trophies - 200;
            const maxTrophies = myBase.trophies + 200;
            
            return self.data.bases
              .filter(b => b.id !== myBaseId && b.trophies >= minTrophies && b.trophies <= maxTrophies)
              .slice(0, 10);
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
