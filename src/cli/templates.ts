import fs from "node:fs";
import path from "node:path";

export function generateEnvProduction(outDir: string): string {
  const filePath = path.join(outDir, ".env.production");
  const content = `# Production Environment Configuration
NODE_ENV=production
NEXULAR_ENV=production

# Auth Configuration
NEXULAR_AUTH_PLUGINS=bearer,api-key,internal-token
NEXULAR_AUTH_INTERNAL_TOKEN=\${INTERNAL_TOKEN_SECRET}
NEXULAR_AUTH_API_KEY=\${API_KEY_SECRET}

# Security - Observability Protection
NEXULAR_OBSERVABILITY_TOKEN=\${OBSERVABILITY_TOKEN_SECRET}

# Security - CORS
NEXULAR_SECURITY_CORS_ALLOW_LIST=https://yourdomain.com,https://api.yourdomain.com

# Security - Plugin Signature Enforcement
NEXULAR_SECURITY_REQUIRE_PLUGIN_SIGNATURE=true
NEXULAR_AUTH_PLUGIN_SIGNATURE_SECRET=\${PLUGIN_SIGNATURE_SECRET}
`;
  fs.writeFileSync(filePath, content);
  return filePath;
}

export function generateGitHubSecrets(outDir: string): string {
  const filePath = path.join(outDir, ".github-secrets.example.yml");
  const content = `# GitHub Actions Secrets Setup Guide
# Add these secrets in repository Settings > Secrets and variables > Actions

# NPM Publishing (for releases)
NPM_TOKEN: your-npm-token-here

# Environment Secrets (for CI/CD)
INTERNAL_TOKEN_SECRET: your-internal-token
API_KEY_SECRET: your-api-key
OBSERVABILITY_TOKEN_SECRET: your-observability-token
PLUGIN_SIGNATURE_SECRET: your-plugin-signature-secret

# How to add:
# 1. Go to https://github.com/YOUR_ORG/YOUR_REPO/settings/secrets/actions
# 2. Click "New repository secret"
# 3. Add each secret name and value
# 4. Use in workflows as: \${{ secrets.SECRET_NAME }}
`;
  fs.writeFileSync(filePath, content);
  return filePath;
}

export function generateK8sManifest(outDir: string, appName: string): string {
  const filePath = path.join(outDir, "k8s-deployment.yaml");
  const content = `apiVersion: v1
kind: Namespace
metadata:
  name: ${appName}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${appName}
  namespace: ${appName}
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ${appName}
  template:
    metadata:
      labels:
        app: ${appName}
    spec:
      containers:
      - name: app
        image: your-registry/${appName}:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: NEXULAR_ENV
          value: "production"
        - name: NEXULAR_OBSERVABILITY_TOKEN
          valueFrom:
            secretKeyRef:
              name: ${appName}-secrets
              key: observability-token
        - name: NEXULAR_AUTH_INTERNAL_TOKEN
          valueFrom:
            secretKeyRef:
              name: ${appName}-secrets
              key: internal-token
        - name: NEXULAR_AUTH_API_KEY
          valueFrom:
            secretKeyRef:
              name: ${appName}-secrets
              key: api-key
        - name: NEXULAR_AUTH_PLUGIN_SIGNATURE_SECRET
          valueFrom:
            secretKeyRef:
              name: ${appName}-secrets
              key: plugin-signature-secret
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: ${appName}
  namespace: ${appName}
spec:
  selector:
    app: ${appName}
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: ClusterIP
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ${appName}
  namespace: ${appName}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ${appName}
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
`;
  fs.writeFileSync(filePath, content);
  return filePath;
}

export function generateNginxConfig(outDir: string, domain: string): string {
  const filePath = path.join(outDir, "nginx.conf.example");
  const content = `upstream app {
    server localhost:3000;
}

server {
    listen 80;
    server_name ${domain};
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${domain};

    # SSL Certificates (use Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/${domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    # CSP Header
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'" always;

    # Proxy to upstream
    location / {
        proxy_pass http://app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Cache static assets
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://app;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
`;
  fs.writeFileSync(filePath, content);
  return filePath;
}

export function generateMonitoringConfig(outDir: string): string {
  const filePath = path.join(outDir, "monitoring.example.yaml");
  const content = `# Prometheus scrape config for Nexular app
# Add to prometheus.yml:

scrape_configs:
  - job_name: 'nexular-app'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/_nexular/metrics'
    scrape_interval: 15s

# Grafana alert rules (example)
# Create in Grafana > Dashboards > Prometheus
# for metrics: nexular_action_requests, nexular_auth_failures, nexular_ssr_render_time

# Health check endpoint (should be added to server.ts)
# GET /_health
# Expected status: 200 OK
# Response: { "ok": true, "version": "0.1.0", "uptime": 12345 }
`;
  fs.writeFileSync(filePath, content);
  return filePath;
}
