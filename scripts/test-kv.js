#!/usr/bin/env node
/**
 * Test script to verify Redis connectivity (Upstash/Vercel)
 * Usage: node scripts/test-kv.js
 */

const Redis = require('ioredis');

if (!process.env.REDIS_URL) {
  console.error('❌ REDIS_URL environment variable not set');
  console.error('Run: vercel env pull .env.local');
  process.exit(1);
}

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: false
});

async function testKV() {
  console.log('🧪 Testing Redis connectivity (Upstash/Vercel)...\n');

  try {
    // Test 1: Basic set/get
    console.log('📝 Test 1: Basic set/get');
    await redis.set('test:hello', 'world');
    const result = await redis.get('test:hello');
    console.log(`   Result: ${result === 'world' ? '✅ PASS' : '❌ FAIL'} (got: ${result})`);

    // Test 2: Hash operations (what we use for agents)
    console.log('\n📝 Test 2: Hash operations');
    const testAgent = {
      id: 'test-123',
      name: 'TestAgent',
      shells: '500',
      trophies: '0'
    };
    await redis.hset('agent:test-123', testAgent);
    const agent = await redis.hgetall('agent:test-123');
    console.log(`   Result: ${agent && agent.name === 'TestAgent' ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Agent data:`, agent);

    // Test 3: Set operations (used for collections)
    console.log('\n📝 Test 3: Set operations');
    await redis.sadd('agents:all', 'test-123');
    const members = await redis.smembers('agents:all');
    console.log(`   Result: ${members.includes('test-123') ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Members:`, members);

    // Test 4: Sorted set (leaderboard)
    console.log('\n📝 Test 4: Sorted set (leaderboard)');
    await redis.zadd('leaderboard', 100, 'test-123');
    const leaders = await redis.zrevrange('leaderboard', 0, 0);
    console.log(`   Result: ${leaders.includes('test-123') ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Top leader:`, leaders);

    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    await redis.del('test:hello');
    await redis.del('agent:test-123');
    await redis.del('agents:all');
    await redis.del('leaderboard');

    console.log('\n✅ All tests passed! Redis is working correctly.');
    console.log('🎮 Clash of Clawds multiplayer persistence is ready!\n');
    
    redis.disconnect();

  } catch (error) {
    console.error('\n❌ Redis Test Failed:', error.message);
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Make sure Redis database is created in Vercel Dashboard');
    console.error('   2. Verify environment variable is set (REDIS_URL)');
    console.error('   3. Run: vercel env ls');
    console.error('   4. If missing, add through: https://vercel.com/dashboard -> Storage -> Create Database\n');
    redis.disconnect();
    process.exit(1);
  }
}

testKV();
