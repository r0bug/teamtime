// Load .env file
require('dotenv').config({ path: '/home/robug/teamtime/.env' });

module.exports = {
  apps: [
    {
      name: 'teamtime',
      script: './build/index.js',
      cwd: '/home/robug/teamtime',

      // Environment - merged from .env file and overrides
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        BODY_SIZE_LIMIT: 'Infinity',  // Disable body size limit (app does own validation)
        TZ: 'America/Los_Angeles',    // Pacific timezone for correct time display
        // Database
        DATABASE_URL: process.env.DATABASE_URL,
        // Auth
        AUTH_SECRET: process.env.AUTH_SECRET,
        // Google Maps
        GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
        // VAPID
        VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
        VAPID_SUBJECT: process.env.VAPID_SUBJECT,
        // SMTP
        SMTP_HOST: process.env.SMTP_HOST,
        SMTP_PORT: process.env.SMTP_PORT,
        SMTP_USER: process.env.SMTP_USER,
        SMTP_PASSWORD: process.env.SMTP_PASSWORD,
        SMTP_FROM: process.env.SMTP_FROM,
        // Twilio
        TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
        TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
        TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,
        // App
        PUBLIC_APP_URL: process.env.PUBLIC_APP_URL,
        CRON_SECRET: process.env.CRON_SECRET
      },

      // Restart behavior - CRITICAL for preventing crash loops
      restart_delay: 3000,        // Wait 3 seconds between restarts
      max_restarts: 10,           // Max 10 restarts within exp_backoff_restart_delay window
      min_uptime: 5000,           // Consider crashed if dies within 5 seconds
      exp_backoff_restart_delay: 100, // Exponential backoff starting at 100ms

      // Graceful shutdown
      kill_timeout: 5000,         // Give 5 seconds to gracefully shutdown
      wait_ready: true,           // Wait for process.send('ready') if available
      listen_timeout: 10000,      // Wait 10 seconds for app to be listening

      // Logging
      error_file: '/home/robug/.pm2/logs/teamtime-error.log',
      out_file: '/home/robug/.pm2/logs/teamtime-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Resource limits
      max_memory_restart: '500M', // Restart if memory exceeds 500MB

      // Clustering (optional - single instance for now)
      instances: 1,
      exec_mode: 'fork'
    }
  ]
};
