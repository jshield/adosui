# ADO SuperUI - Self-Hosted Configuration

## Environment Variables

Configure the UI by setting these environment variables before building:

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_USE_PROXY` | `true` | Set to `"false"` for direct API access |
| `VITE_PROXY_URL` | `http://localhost:3131` | Proxy server URL |

## Usage Modes

### Mode 1: With Local Proxy (Default)
Run the proxy and UI separately:
```bash
# Terminal 1: Start the proxy
node ado-proxy.js

# Terminal 2: Start the UI
npm run dev
```

The proxy is required to bypass CORS restrictions when running the UI locally.

### Mode 2: Direct Access (Self-Hosted)
For production/self-hosted deployment, use direct API access:
```bash
VITE_USE_PROXY=false npm run build
```

This builds the app to connect directly to `dev.azure.com` without requiring the proxy.

### Mode 3: Docker/Hosted with Proxy
To run behind a reverse proxy (e.g., nginx):
```bash
# Set up nginx to proxy /api to the ado-proxy
# Then configure the UI:
VITE_PROXY_URL=https://yourhost.com/api VITE_USE_PROXY=true npm run build
```

## Docker Deployment Example

```dockerfile
# Build the UI
FROM node:20-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN VITE_USE_PROXY=false npm run build

# Serve with nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

```nginx
# nginx.conf
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```
