module.exports = {
  apps: [
    {
      name: 'script-asset-analyzer',
      script: 'server/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3003
      }
    }
  ]
};
