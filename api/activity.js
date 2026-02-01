// Activity Feed API - Track recent game events
const ServerlessDB = require('../db/serverless-db');
const db = new ServerlessDB();

module.exports = async (req, res) => {
  const limit = parseInt(req.query.limit) || 30;
  
  try {
    if (!db.redis) {
      return res.status(503).json({ error: 'Redis not available' });
    }
    
    // Get recent activities from sorted set (timestamp-based)
    const activityIds = await db.redis.zrevrange('activities:global', 0, limit - 1, 'WITHSCORES');
    
    const activities = [];
    for (let i = 0; i < activityIds.length; i += 2) {
      const activityData = await db.redis.get(`activity:${activityIds[i]}`);
      if (activityData) {
        const activity = JSON.parse(activityData);
        activity.timestamp = parseInt(activityIds[i + 1]);
        activities.push(activity);
      }
    }
    
    res.json({ activities });
  } catch (err) {
    console.error('Error fetching activities:', err);
    res.status(500).json({ error: 'Failed to load activities' });
  }
};

// Helper function to log activity (called from other endpoints)
async function logActivity(type, data) {
  if (!db.redis) return;
  
  const activityId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const timestamp = Date.now();
  
  const activity = {
    id: activityId,
    type, // 'battle', 'upgrade', 'registration'
    ...data
  };
  
  try {
    // Store activity
    await db.redis.set(`activity:${activityId}`, JSON.stringify(activity), 'EX', 86400 * 7); // 7 day expiry
    
    // Add to global timeline (sorted by timestamp)
    await db.redis.zadd('activities:global', timestamp, activityId);
    
    // Keep only last 500 activities
    await db.redis.zremrangebyrank('activities:global', 0, -501);
  } catch (err) {
    console.error('Error logging activity:', err);
  }
}

module.exports.logActivity = logActivity;
