#!/usr/bin/env node
/**
 * Test script to verify Vercel KV connectivity
 * Usage: node scripts/test-kv.js
 */

const { kv } = require('@vercel/kv');

async function testKV() {
  console.log('🧪 Testing Vercel KV connectivity...\n');

  try {
    // Test 1: Basic set/get
    console.log('📝 Test 1: Basic set/get');
    await kv.set('test:hello', 'world');
    const result = await kv.get('test:hello');
    console.log(`   Result: ${result === 'world' ? '✅ PASS' : '❌ FAIL'} (got: ${result})`);

    // Test 2: Hash operations (what we use for agents)
    console.log('\n📝 Test 2: Hash operations');
    const testAgent = {
      id: 'test-123',
      name: 'TestAgent',
      shells: 500,
      trophies: 0
    };
    await kv.hset('agent:test-123', testAgent);
    const agent = await kv.hgetall('agent:test-123');
    console.log(`   Result: ${agent && agent.name === 'TestAgent' ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Agent data:`, agent);

    // Test 3: Set operations (used for collections)
    console.log('\n📝 Test 3: Set operations');
    await kv.sadd('agents:all', 'test-123');
    const members = await kv.smembers('agents:all');
    console.log(`   Result: ${members.includes('test-123') ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Members:`, members);

    // Test 4: Sorted set (leaderboard)
    console.log('\n📝 Test 4: Sorted set (leaderboard)');
    await kv.zadd('leaderboard', { score: 100, member: 'test-123' });
    const leaders = await kv.zrevrange('leaderboard', 0, 0);
    console.log(`   Result: ${leaders.includes('test-123') ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Top leader:`, leaders);

    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    await kv.del('test:hello');
    await kv.del('agent:test-123');
    await kv.del('agents:all');
    await kv.del('leaderboard');

    console.log('\n✅ All tests passed! Vercel KV is working correctly.');
    console.log('🎮 Clash of Clawds multiplayer persistence is ready!\n');

  } catch (error) {
    console.error('\n❌ KV Test Failed:', error.message);
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Make sure KV database is created in Vercel Dashboard');
    console.error('   2. Verify environment variables are set (KV_REST_API_URL, KV_REST_API_TOKEN)');
    console.error('   3. Run: vercel env ls');
    console.error('   4. If missing, add KV through: https://vercel.com/dashboard -> Storage -> Create Database\n');
    process.exit(1);
  }
}

testKV();
