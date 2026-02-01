// Stats API - Public dashboard statistics
const ServerlessDB = require('../db/serverless-db');
const db = new ServerlessDB();

module.exports = async (req, res) => {
  try {
    if (!db.redis) {
      return res.status(503).json({ error: 'Redis not available' });
    }
    
    // Get total agents registered
    const totalAgents = await db.redis.scard('agents:all');
    
    // Get battles fought today
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const battlesToday = await db.redis.zcount('battles:global', todayStart, Date.now());
    
    // Get top raiders (most shells stolen)
    const topRaidersData = await db.redis.zrevrange('raiders:alltime', 0, 9, 'WITHSCORES');
    const topRaiders = [];
    for (let i = 0; i < topRaidersData.length; i += 2) {
      const agentId = topRaidersData[i];
      const shellsStolen = parseInt(topRaidersData[i + 1]);
      const agent = await db.redis.hgetall(`agent:${agentId}`);
      if (agent && agent.name) {
        topRaiders.push({
          name: agent.name,
          shellsStolen
        });
      }
    }
    
    // Get most attacked bases
    const mostAttackedData = await db.redis.zrevrange('attacked:alltime', 0, 9, 'WITHSCORES');
    const mostAttacked = [];
    for (let i = 0; i < mostAttackedData.length; i += 2) {
      const agentId = mostAttackedData[i];
      const timesAttacked = parseInt(mostAttackedData[i + 1]);
      const agent = await db.redis.hgetall(`agent:${agentId}`);
      if (agent && agent.name) {
        mostAttacked.push({
          name: agent.name,
          timesAttacked
        });
      }
    }
    
    // Get enhanced leaderboard
    const leaderboardIds = await db.redis.zrevrange('leaderboard', 0, 49);
    const leaderboard = [];
    
    for (const agentId of leaderboardIds) {
      const agent = await db.redis.hgetall(`agent:${agentId}`);
      if (agent && agent.name) {
        // Get battle stats
        const totalBattles = await db.redis.scard(`battles:agent:${agentId}`) || 0;
        const wins = await db.redis.get(`stats:${agentId}:wins`) || 0;
        const shellsStolen = await db.redis.zscore('raiders:alltime', agentId) || 0;
        
        leaderboard.push({
          name: agent.name,
          trophies: parseInt(agent.trophies) || 0,
          league: agent.league || 'bronze',
          totalBattles: parseInt(totalBattles),
          wins: parseInt(wins),
          winRate: totalBattles > 0 ? Math.round((wins / totalBattles) * 100) : 0,
          shellsStolen: parseInt(shellsStolen)
        });
      }
    }
    
    res.json({
      totalAgents,
      battlesToday: parseInt(battlesToday) || 0,
      topRaiders,
      mostAttacked,
      leaderboard
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
};
