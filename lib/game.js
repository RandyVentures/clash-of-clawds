// Core game logic for Clash of Clawds
const { nanoid } = require('nanoid');

// Building costs and upgrade times
const BUILDING_STATS = {
  town_hall: {
    1: { cost: 0, time: 0 },
    2: { cost: 500, time: 3600 },
    3: { cost: 1500, time: 7200 },
    4: { cost: 5000, time: 14400 },
    5: { cost: 15000, time: 28800 }
  },
  vault: {
    1: { cost: 0, time: 0 },
    2: { cost: 300, time: 1800 },
    3: { cost: 1000, time: 3600 },
    4: { cost: 3000, time: 7200 },
    5: { cost: 10000, time: 14400 }
  },
  defense: {
    1: { cost: 0, time: 0 },
    2: { cost: 400, time: 2400 },
    3: { cost: 1200, time: 4800 },
    4: { cost: 4000, time: 9600 },
    5: { cost: 12000, time: 19200 }
  },
  barracks: {
    1: { cost: 0, time: 0 },
    2: { cost: 350, time: 1800 },
    3: { cost: 1100, time: 3600 },
    4: { cost: 3500, time: 7200 },
    5: { cost: 11000, time: 14400 }
  },
  lab: {
    1: { cost: 0, time: 0 },
    2: { cost: 600, time: 3600 },
    3: { cost: 2000, time: 7200 },
    4: { cost: 6000, time: 14400 },
    5: { cost: 20000, time: 28800 }
  },
  reactor: {
    1: { cost: 0, time: 0 },
    2: { cost: 400, time: 2400 },
    3: { cost: 1300, time: 4800 },
    4: { cost: 4500, time: 9600 },
    5: { cost: 14000, time: 19200 }
  }
};

// League thresholds
const LEAGUES = [
  { name: 'bronze', min: 0, max: 499 },
  { name: 'silver', min: 500, max: 999 },
  { name: 'gold', min: 1000, max: 1999 },
  { name: 'crystal', min: 2000, max: 2999 },
  { name: 'master', min: 3000, max: 999999 }
];

function getLeague(trophies) {
  return LEAGUES.find(l => trophies >= l.min && trophies <= l.max).name;
}

function calculateBattleOutcome(attacker, defender) {
  // Simple combat formula for MVP
  // Attack power = (barracks_level * 10) + (trophies / 10)
  // Defense power = (defense_level * 12) + (town_hall_level * 8)
  
  const attackPower = (attacker.base.barracks_level * 10) + (attacker.trophies / 10);
  const defensePower = (defender.base.defense_level * 12) + (defender.base.town_hall_level * 8);
  
  // Add 10% randomness
  const randomFactor = 0.9 + (Math.random() * 0.2);
  const finalAttackPower = attackPower * randomFactor;
  
  // Determine outcome
  const powerDiff = finalAttackPower - defensePower;
  let outcome, stars, shellsStolen, trophiesChange;
  
  if (powerDiff > 20) {
    // Strong victory
    outcome = 'win';
    stars = 3;
    shellsStolen = Math.min(Math.floor(defender.shells * 0.3), 500);
    trophiesChange = 30;
  } else if (powerDiff > 5) {
    // Victory
    outcome = 'win';
    stars = 2;
    shellsStolen = Math.min(Math.floor(defender.shells * 0.2), 300);
    trophiesChange = 20;
  } else if (powerDiff > -5) {
    // Close victory
    outcome = 'win';
    stars = 1;
    shellsStolen = Math.min(Math.floor(defender.shells * 0.1), 150);
    trophiesChange = 10;
  } else if (powerDiff > -15) {
    // Draw
    outcome = 'draw';
    stars = 0;
    shellsStolen = 0;
    trophiesChange = -5;
  } else {
    // Loss
    outcome = 'loss';
    stars = 0;
    shellsStolen = 0;
    trophiesChange = -15;
  }
  
  return {
    id: nanoid(),
    outcome,
    stars,
    shellsStolen,
    trophiesChange,
    attackPower: Math.floor(finalAttackPower),
    defensePower: Math.floor(defensePower)
  };
}

function calculateUpgradeCost(buildingType, currentLevel) {
  const targetLevel = currentLevel + 1;
  if (targetLevel > 5) return null; // Max level
  
  const stats = BUILDING_STATS[buildingType];
  if (!stats || !stats[targetLevel]) return null;
  
  return stats[targetLevel];
}

function canAffordUpgrade(agent, cost) {
  return agent.shells >= cost;
}

function getEnergyRegenRate(reactorLevel) {
  // Energy regenerates based on reactor level
  // Level 1: 1 energy/hour
  // Level 2: 1.5 energy/hour
  // Level 3: 2 energy/hour
  // Level 4: 2.5 energy/hour
  // Level 5: 3 energy/hour
  return 1 + ((reactorLevel - 1) * 0.5);
}

function getMaxEnergy(reactorLevel) {
  return 5 + (reactorLevel * 2);
}

module.exports = {
  BUILDING_STATS,
  LEAGUES,
  getLeague,
  calculateBattleOutcome,
  calculateUpgradeCost,
  canAffordUpgrade,
  getEnergyRegenRate,
  getMaxEnergy
};
