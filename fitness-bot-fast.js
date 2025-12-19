// ============================================
// ULTRA-FAST FITNESS BOOKING BOT
// 12 PM Choice → 5 PM Instant Booking
// ============================================

const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const schedule = require('node-schedule');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const GITAM_EMAIL = process.env.GITAM_EMAIL;
const GITAM_PASSWORD = process.env.GITAM_PASSWORD;

const bot = new TelegramBot(BOT_TOKEN, { polling: false });

const GSPORTS_BASE_URL = 'https://gsports.gitam.edu';
const FACILITY_ID = 'MjM.';
const STATE_FILE = 'booking_state.json';

// ============================================
// TIME SLOT MAPPINGS
// ============================================

const TIME_SLOTS = {
  '1': { label: '3-4 PM', slot: '15:00-16:00', emoji: '🕒' },
  '2': { label: '4-5 PM', slot: '16:00-17:00', emoji: '🕓' },
  '3': { label: '5-6 PM', slot: '17:00-18:00', emoji: '🕔' },
  '4': { label: '6-7 PM', slot: '18:00-19:00', emoji: '🕕' },
  '5': { label: '7-8 PM', slot: '19:00-20:00', emoji: '🕖' },
  '6': { label: '8-9 PM', slot: '20:00-21:00', emoji: '🕗' }
};

// ============================================
// STATE MANAGEMENT
// ============================================

let userChoice = null;

function loadChoice() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      userChoice = data.choice;
      console.log('📂 Loaded choice:', userChoice);
      return userChoice;
    }
  } catch (error) {
    console.log('Creating new state file');
  }
  return null;
}

function saveChoice(choice) {
  userChoice = choice;
  fs.writeFileSync(STATE_FILE, JSON.stringify({ choice }, null, 2));
  console.log(`💾 Choice saved: ${choice}`);
}

function clearChoice() {
  userChoice = null;
  if (fs.existsSync(STATE_FILE)) {
    fs.unlinkSync(STATE_FILE);
  }
  console.log('🗑️ Choice cleared');
}

// ============================================
// STEP 1: LOGIN TO GITAM
// ============================================

let cachedSessionToken = null;
let tokenTimestamp = null;

async function loginToGITAM() {
  try {
    // Use cached token if less than 1 hour old
    if (cachedSessionToken && tokenTimestamp && (Date.now() - tokenTimestamp) < 3600000) {
      console.log('♻️ Using cached session token');
      return cachedSessionToken;
    }
    
    console.log('🔐 Logging into GITAM...');
    
    const response = await axios.post(
      'https://login.gitam.edu/api/login',
      {
        email: GITAM_EMAIL,
        password: GITAM_PASSWORD
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': '*/*'
        },
        timeout: 8000,
        validateStatus: () => true
      }
    );
    
    const token = response.data.token || response.data.session;
    if (token) {
      cachedSessionToken = token;
      tokenTimestamp = Date.now();
      console.log('✅ Login successful');
      return token;
    }
    
    throw new Error('No token in response');
  } catch (error) {
    console.error('❌ Login failed:', error.message);
    return null;
  }
}

// ============================================
// STEP 2: ULTRA-FAST BOOKING
// ============================================

async function bookSessionUltraFast(timeSlot) {
  try {
    console.log(`⚡ ULTRA-FAST BOOKING: ${timeSlot}`);
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const day = String(tomorrow.getDate()).padStart(2, '0');
    const month = tomorrow.toLocaleString('en-US', { month: 'short' }).toUpperCase();
    const year = tomorrow.getFullYear();
    const dateStr = `${day}-${month}-${year}`;
    
    const sessionToken = await loginToGITAM();
    if (!sessionToken) {
      return {
        success: false,
        message: '❌ Login failed. Check credentials.'
      };
    }
    
    const bookingPayload = {
      facility_id: FACILITY_ID,
      date: dateStr,
      time_slot: timeSlot,
      court_id: 'room-1'
    };
    
    const response = await axios.post(
      `${GSPORTS_BASE_URL}/api/book`,
      bookingPayload,
      {
        headers: {
          'Cookie': `session=${sessionToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0',
          'Connection': 'keep-alive'
        },
        timeout: 5000,
        validateStatus: () => true
      }
    );
    
    console.log('Response status:', response.status);
    
    if (response.status === 200 || response.status === 201) {
      console.log('✅ BOOKING SUCCESS - INSTANT');
      return {
        success: true,
        message: `✅ BOOKED!\n\n📅 Tomorrow at ${timeSlot.split('-')[0].substring(0, 5)}\n⚡ Booking confirmed!`
      };
    } else if (response.status === 409) {
      return {
        success: false,
        message: '⚠️ Weekly limit reached (3 slots max)\nCannot book more this week'
      };
    } else {
      return {
        success: false,
        message: `❌ Booking failed (Status: ${response.status})`
      };
    }
  } catch (error) {
    console.error('❌ Booking error:', error.message);
    return {
      success: false,
      message: `❌ Error: ${error.message}`
    };
  }
}

// ============================================
// STEP 3: SEND 12 PM REMINDER
// ============================================

async function sendNoonReminder() {
  try {
    console.log('📤 Sending 12 PM reminder...');
    
    const buttons = [
      [
        { text: '🕒 3-4 PM', callback_data: '1' },
        { text: '🕓 4-5 PM', callback_data: '2' }
      ],
      [
        { text: '🕔 5-6 PM', callback_data: '3' },
        { text: '🕕 6-7 PM', callback_data: '4' }
      ],
      [
        { text: '🕖 7-8 PM', callback_data: '5' },
        { text: '🕗 8-9 PM', callback_data: '6' }
      ],
      [
        { text: '❌ Skip Today', callback_data: 'skip' }
      ]
    ];
    
    await bot.sendMessage(
      CHAT_ID,
      `🏋️ *NOON REMINDER*\n\nWant to book a fitness session today?\n\nSelect time below:\n\n(You can answer anytime until 5:00 PM)\n\n_Booking starts at 5:00 PM_`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: buttons
        }
      }
    );
    
    console.log('✅ Reminder sent');
  } catch (error) {
    console.error('❌ Send reminder failed:', error.message);
  }
}

// ============================================
// STEP 4: HANDLE BUTTON CLICKS
// ============================================

bot.on('callback_query', async (query) => {
  const data = query.data;
  
  try {
    if (data === 'skip') {
      await bot.answerCallbackQuery(query.id, '✌️ Skipped for today');
      await bot.editMessageText(
        '✌️ No booking today. Ask me tomorrow!',
        { chat_id: CHAT_ID, message_id: query.message.message_id }
      );
      clearChoice();
    } 
    else if (TIME_SLOTS[data]) {
      const selectedTime = TIME_SLOTS[data];
      saveChoice(data);
      
      await bot.answerCallbackQuery(
        query.id,
        `⏳ Selected: ${selectedTime.label}\n\nBooking at 5:00 PM...`,
        false,
        5
      );
      
      await bot.editMessageText(
        `✅ *Choice Saved*\n\n⏰ Time: ${selectedTime.label}\n🕕 Will book at 5:00 PM today\n\n_You can change your choice anytime_`,
        {
          chat_id: CHAT_ID,
          message_id: query.message.message_id,
          parse_mode: 'Markdown'
        }
      );
      
      console.log(`✅ User choice saved: ${selectedTime.label}`);
    }
  } catch (error) {
    console.error('Error handling callback:', error.message);
  }
});

// ============================================
// STEP 5: 5:00 PM INSTANT BOOKING
// ============================================

async function triggerInstantBooking() {
  try {
    console.log('⏰ 5:00 PM TRIGGERED - INSTANT BOOKING START');
    
    const choice = loadChoice();
    
    if (!choice || !TIME_SLOTS[choice]) {
      console.log('⚠️ No booking choice made today');
      await bot.sendMessage(CHAT_ID, '⚠️ You didn\'t select a time. Booking skipped for today.');
      return;
    }
    
    const timeSlot = TIME_SLOTS[choice].slot;
    const label = TIME_SLOTS[choice].label;
    
    console.log(`⚡ INSTANT BOOKING STARTING for ${label}...`);
    
    const result = await bookSessionUltraFast(timeSlot);
    
    if (result.success) {
      await bot.sendMessage(
        CHAT_ID,
        result.message,
        { parse_mode: 'Markdown' }
      );
      console.log('✅ BOOKING COMPLETE - INSTANT');
    } else {
      await bot.sendMessage(
        CHAT_ID,
        result.message,
        { parse_mode: 'Markdown' }
      );
      console.log('❌ Booking failed');
    }
    
    clearChoice();
  } catch (error) {
    console.error('❌ Booking trigger error:', error.message);
    await bot.sendMessage(CHAT_ID, `❌ Error: ${error.message}`);
  }
}

// ============================================
// MAIN EXECUTION
// ============================================

console.log('🚀 Fitness Bot Started');

// Check command line argument to determine which job to run
const job = process.argv[2];

if (job === 'noon') {
  console.log('Running NOON job...');
  sendNoonReminder();
} else if (job === 'booking') {
  console.log('Running BOOKING job...');
  triggerInstantBooking();
} else {
  console.log('Running scheduler mode...');
  loadChoice();
  
  // 12:00 PM IST (6:30 AM UTC)
  schedule.scheduleJob('30 6 * * *', () => {
    console.log('\n🔔 12:00 PM TRIGGER');
    sendNoonReminder();
  });
  
  // 5:00 PM IST (11:30 AM UTC)
  schedule.scheduleJob('30 11 * * *', () => {
    console.log('\n🔔 5:00 PM TRIGGER');
    triggerInstantBooking();
  });
  
  console.log('✅ Schedules set - waiting...');
  setInterval(() => {}, 1
