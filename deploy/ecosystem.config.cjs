// pm2 process definition: keeps the API running, restarts it on a crash and after a reboot.
// Settings (DB password, JWT secret, ...) come from the .env file in the backend folder.
module.exports = {
  apps: [
    {
      name: 'rsr-api',
      script: 'dist/main.js',
      cwd: __dirname + '/..',
      instances: 1,
      max_memory_restart: '400M',
      env: { NODE_ENV: 'production' },
    },
  ],
};
