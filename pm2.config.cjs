module.exports = {
  apps: [
    {
      name: "web-check",
      script: "server.js",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "web-check-mcp",
      script: "mcp-server.js",
      env: {
        NODE_ENV: "production",
        MCP_MODE: "production",
      },
      // Allow optional disable via env
      autorestart: true,
      watch: false,
      max_restarts: 5,
    },
  ],
};
