import http from 'http';
import axios from 'axios';

// Replace with production URL when deploying
const CLOUD_API_BASE = 'http://127.0.0.1:3000/api';

export function startLocalBridge() {
  const port = 3002;
  const server = http.createServer((req, res) => {
    // Add CORS headers for Chrome Extension
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', async () => {
        let parsedBody;
        try {
          if (body) parsedBody = JSON.parse(body);
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
          return;
        }

        try {
          // Route extension calls directly to the cloud backend
          if (req.url === '/bridge/save-pms-credentials') {
            const response = await axios.post(`${CLOUD_API_BASE}/save-pms-credentials`, parsedBody);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response.data));
            return;
          }

          if (req.url === '/bridge/sync-inventory') {
            const response = await axios.post(`${CLOUD_API_BASE}/sync-inventory`, parsedBody);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response.data));
            return;
          }

          if (req.url === '/bridge/log-network-traffic') {
            const response = await axios.post(`${CLOUD_API_BASE}/log-network-traffic`, parsedBody);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response.data));
            return;
          }
          
          if (req.url === '/bridge/record-sale') {
             const response = await axios.post(`${CLOUD_API_BASE}/record-sale`, parsedBody);
             res.writeHead(200, { 'Content-Type': 'application/json' });
             res.end(JSON.stringify(response.data));
             return;
          }
        } catch (error: any) {
          console.error('[Bridge] Error forwarding to cloud:', error.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to forward to cloud' }));
          return;
        }

        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not Found' }));
      });
      return;
    }

    // Healthcheck endpoint for extension (background.js)
    if (req.method === 'GET' && req.url === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'connected', version: '1.4.2' }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`[Synkk Bridge] Local bridge listening on http://127.0.0.1:${port}`);
  });
}
