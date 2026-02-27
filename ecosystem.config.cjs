module.exports = {
  apps: [
    {
      name: "shaxsiy-oyin-server",
      script: "server/index.js",
      cwd: "/home/ailabs/private_game",
      env: {
        PORT: 3010,
        NODE_ENV: "production",
      },
      max_memory_restart: "200M",
      exp_backoff_restart_delay: 100,
    },
    {
      name: "shaxsiy-oyin-tunnel",
      script: "/home/ailabs/.local/bin/cloudflared",
      args: "tunnel --config /home/ailabs/.cloudflared/shaxsiy-oyin.yml run shaxsiy-oyin",
      autorestart: true,
      max_memory_restart: "150M",
    },
  ],
};
