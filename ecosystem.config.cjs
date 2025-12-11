module.exports = {
  apps: [
    {
      name: 'teamtime',
      script: './build/index.js',
      cwd: '/home/robug/teamtime',

      // Environment - loads from .env file, with overrides below
      env_file: '.env',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        BODY_SIZE_LIMIT: 'Infinity',  // Disable body size limit (app does own validation)
        TZ: 'America/Los_Angeles'     // Pacific timezone for correct time display
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
