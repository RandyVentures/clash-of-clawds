// Screenshot capture script for Clash of Clawds
const puppeteer = require('puppeteer');
const path = require('path');

const BASE_URL = 'http://localhost:3333';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

async function captureScreenshots() {
  console.log('🚀 Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  
  try {
    // 1. Login/Registration screen
    console.log('📸 Capturing login screen...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '1-login-registration.png'),
      fullPage: true
    });
    
    // Register a test agent
    console.log('🔑 Registering test agent...');
    await page.evaluate(() => {
      const registerBtn = document.querySelector('button[onclick*="register"]') || 
                          document.querySelector('#registerBtn') ||
                          document.querySelector('button');
      if (registerBtn) registerBtn.click();
    });
    
    // Wait for registration to complete
    await page.waitForTimeout(2000);
    
    // 2. Main dashboard with base view
    console.log('📸 Capturing main dashboard...');
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '2-main-dashboard.png'),
      fullPage: true
    });
    
    // 3. Navigate to battle screen
    console.log('📸 Capturing battle screen...');
    await page.evaluate(() => {
      const battleBtn = document.querySelector('button[onclick*="battle"]') ||
                        document.querySelector('#battleBtn') ||
                        Array.from(document.querySelectorAll('button'))
                          .find(btn => btn.textContent.toLowerCase().includes('battle'));
      if (battleBtn) battleBtn.click();
    });
    
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '3-battle-screen.png'),
      fullPage: true
    });
    
    // 4. Navigate to leaderboard
    console.log('📸 Capturing leaderboard...');
    await page.evaluate(() => {
      const leaderboardBtn = document.querySelector('button[onclick*="leaderboard"]') ||
                             document.querySelector('#leaderboardBtn') ||
                             Array.from(document.querySelectorAll('button'))
                               .find(btn => btn.textContent.toLowerCase().includes('leaderboard'));
      if (leaderboardBtn) leaderboardBtn.click();
    });
    
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '4-leaderboard.png'),
      fullPage: true
    });
    
    console.log('✅ All screenshots captured successfully!');
    
  } catch (error) {
    console.error('❌ Error capturing screenshots:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

captureScreenshots()
  .then(() => {
    console.log('🎉 Screenshot capture complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Failed:', error);
    process.exit(1);
  });
