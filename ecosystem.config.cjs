module.exports = {
  apps: [
    {
      name: "yoonseul-market",
      script: "./server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      watch: false,
      autorestart: true,
      max_memory_restart: "700M",
      env: {
        NODE_ENV: "production",
        HOST: "0.0.0.0",
        PORT: 3000,
        MAX_BODY_MB: 80
      }
    }
  ]
};
