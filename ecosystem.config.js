/**
 * PM2 Ecosystem Configuration
 * For production VPS deployment
 * 
 * Usage:
 * - Start: pm2 start ecosystem.config.js
 * - Restart: pm2 restart ecosystem.config.js
 * - Logs: pm2 logs arsip-backend
 * - Monitor: pm2 monit
 */

module.exports = {
  apps: [{
    // Application name
    name: 'arsip-backend',
    
    // Entry point
    script: './backend/server.js',
    
    // Clustering (use all CPU cores)
    instances: 'max',
    exec_mode: 'cluster',
    
    // Environment variables
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    
    // Logging
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Auto-restart settings
    watch: false,
    ignore_watch: ['node_modules', 'logs', 'data', 'cache', 'tmp'],
    autorestart: true,
    
    // Graceful shutdown
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 3000,
    
    // Memory limit (restart if exceeds 1GB)
    max_memory_restart: '1G',
    
    // Merge logs from all instances
    merge_logs: true,
    
    // Max number of retries on crashes
    max_restarts: 10,
    
    // Time window for the max_restarts to work
    min_uptime: '10s',
    
    // Listen for SIGTERM
    signal: 'SIGTERM',
    
    // Time to wait before using SIGKILL on restart
    kill_timeout: 5000
  }],
  
  // Deploy configuration (optional)
  deploy: {
    production: {
      user: 'your-vps-user',
      host: 'your-vps-ip',
      ref: 'origin/master',
      repo: 'git@github.com:your-repo/arsipcloudflre.git',
      path: '/var/www/arsipcloudflre',
      'post-deploy': 'npm install && pm2 restart ecosystem.config.js'
    }
  }
};
