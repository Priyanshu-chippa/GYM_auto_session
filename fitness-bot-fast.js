
require('dotenv').config();
const puppeteer = require('puppeteer');
const cron = require('node-cron');
const axios = require('axios');
const fs = require('fs');

const GITAM_URL = 'https://gitam.edu';
const BOOKING_URL = 'https://gitam.edu/schedule-facility/MjM=';
const ROLL_NUMBER = process.env.GITAM_ROLL_NUMBER;
const PASSWORD = process.env.GITAM_PASSWORD;
const BOOKING_SLOT = process.env.BOOKING_TIME_SLOT || '19'; // 7-8 PM
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL;

let sessionToken = null;
let browser = null;

// Logging function
function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`);
  fs.appendFileSync('fitness-bot.log', `[${timestamp}] [${level}] ${message}\n`);
}

// Send Discord notification
async function sendNotification(message) {
  if (!DISCORD_WEBHOOK) return;
  try {
    await axios.post(DISCORD_WEBHOOK, {
      content: `🏋️ Fitness Bot: ${message}`
    });
  } catch (error) {
    log(`Discord notification failed: ${error.message}`, 'WARN');
  }
}

// Step 1: Open browser and login
async function login() {
  try {
    log('Starting browser...');
    browser = await puppeteer.launch({
      headless: false, // Set to true if running on server
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    log('Navigating to GITAM login...');
    
    await page.goto(GITAM_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Login process
    log('Entering credentials...');
    await page.type('input[name="rollNumber"]', ROLL_NUMBER, { delay: 50 });
    await page.type('input[name="password"]', PASSWORD, { delay: 50 });
    await page.click('button[type="submit"]');
    
    // Wait for navigation
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
    log('Login successful!');
    
    // Extract session token from cookies
    const cookies = await page.cookies();
    const sessionCookie = cookies.find(c => c.name === 'sessionid' || c.name === 'JSESSIONID');
    if (sessionCookie) {
      sessionToken = sessionCookie.value;
      log(`Session token obtained: ${sessionToken.substring(0, 10)}...`);
    }
    
    return page;
  } catch (error) {
    log(`Login failed: ${error.message}`, 'ERROR');
    sendNotification(`❌ Login failed: ${error.message}`);
    throw error;
  }
}

// Step 2: Navigate to booking page
async function navigateToBooking(page) {
  try {
    log('Navigating to fitness booking page...');
    await page.goto(BOOKING_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    log('Booking page loaded');
    return page;
  } catch (error) {
    log(`Navigation failed: ${error.message}`, 'ERROR');
    throw error;
  }
}

// Step 3: Book the 7-8 PM slot
async function bookSlot(page) {
  try {
    log('Looking for 7-8 PM time slot...');
    
    // Wait for dropdown/selector to load
    await page.waitForSelector('select, [data-slot], button[aria-label*="7"]', { timeout: 10000 });
    
    // Find and click the 7-8 PM slot
    const slots = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('button, div, option'));
      return elements
        .filter(el => el.textContent.includes('7') && el.textContent.includes('8'))
        .map(el => el.textContent);
    });
    
    log(`Available slots found: ${slots.join(', ')}`);
    
    // Click the slot
    await page.click('button:has-text("7:00"), [data-slot="19:00"]', { timeout: 5000 }).catch(() => {
      log('Trying alternative selector...', 'WARN');
    });
    
    // Confirm booking
    await page.click('button:contains("Book"), button:contains("Confirm")', { timeout: 5000 });
    
    // Wait for success
    await page.waitForFunction(
      () => document.body.innerText.includes('confirmed') || document.body.innerText.includes('booked'),
      { timeout: 10000 }
    );
    
    log('✅ Booking successful!');
    sendNotification('✅ Fitness slot booked for 7-8 PM');
    return true;
  } catch (error) {
    log(`Booking failed: ${error.message}`, 'ERROR');
    sendNotification(`❌ Booking failed: ${error.message}`);
    return false;
  }
}

// Main automation function
async function runAutomation() {
  try {
    log('========== STARTING FITNESS BOOKING AUTOMATION ==========');
    
    // Login
    const page = await login();
    
    // Navigate to booking
    await navigateToBooking(page);
    
    // Book slot
    const success = await bookSlot(page);
    
    // Close browser
    if (browser) await browser.close();
    
    log('========== AUTOMATION COMPLETED ==========');
    return success;
  } catch (error) {
    log(`Critical error: ${error.message}`, 'ERROR');
    if (browser) await browser.close();
    process.exit(1);
  }
}

// Schedule for 5:00 PM daily
cron.schedule('0 17 * * *', () => {
  log('⏰ Scheduled booking triggered at 5:00 PM');
  runAutomation();
});

// For manual testing
if (process.argv.includes('--now')) {
  log('Running immediately (test mode)');
  runAutomation();
} else {
  log('Bot started. Waiting for 5:00 PM booking window...');
}
