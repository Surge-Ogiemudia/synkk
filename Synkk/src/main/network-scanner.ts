import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as net from 'net';

export interface TerminalDiscoveryResult {
  status: 'connected' | 'needs_password' | 'failed';
  ip?: string;
  port?: number;
  engine?: 'mysql' | 'mssql' | 'postgres';
  message?: string;
  credentials?: { username: string; password?: string };
}

export async function startTerminalDiscovery(appFolder: string): Promise<TerminalDiscoveryResult> {
  console.log(`Starting Terminal Discovery in ${appFolder}`);
  
  // Step 1: Scan Config for IP and Creds
  const configClues = extractConfigClues(appFolder);
  console.log(`Config clues extracted: IP=${configClues.ip || 'none'}, User=${configClues.username || 'none'}`);

  // Step 2: Determine Target IPs
  const targetIps = configClues.ip ? [configClues.ip] : getSubnetIps();

  if (targetIps.length === 0) {
    return { status: 'failed', message: "We couldn't connect to your main system automatically. Please install Synkk directly on the main computer where medicines are added." };
  }

  // Step 3: Parallel Port Scan
  console.log(`Scanning ${targetIps.length} IPs for open database ports...`);
  const openPortResult = await parallelPortScan(targetIps);
  
  if (!openPortResult) {
    console.log(`No open database ports found on the network.`);
    return { status: 'failed', message: "We couldn't connect to your main system automatically. Please install Synkk directly on the main computer where medicines are added." };
  }

  const { ip, port, engine } = openPortResult;
  console.log(`Discovered active ${engine} database at ${ip}:${port}`);

  // Step 4: Test Extracted Credentials
  if (configClues.username) {
    console.log(`Testing extracted credentials for user ${configClues.username}...`);
    const success = await testDatabaseConnection(ip, port, engine, configClues.username, configClues.password || '');
    if (success) {
      console.log(`Success with extracted credentials!`);
      return { status: 'connected', ip, port, engine, credentials: { username: configClues.username, password: configClues.password || '' } };
    }
  }

  // Step 5: Test Default Credentials
  const defaults = [
    { u: 'root', p: '' }, { u: 'root', p: 'root' }, { u: 'root', p: '1234' },
    { u: 'root', p: 'admin' }, { u: 'root', p: 'password' }, { u: 'admin', p: 'admin' },
    { u: 'sa', p: '1234' }, { u: 'postgres', p: 'postgres' }
  ];

  console.log(`Testing default credential combinations...`);
  for (const cred of defaults) {
    const success = await testDatabaseConnection(ip, port, engine, cred.u, cred.p);
    if (success) {
      console.log(`Success with default credentials: ${cred.u}`);
      return { status: 'connected', ip, port, engine, credentials: { username: cred.u, password: cred.p } };
    }
  }

  // Step 6: Graceful Failure requesting password
  console.log(`All connection attempts failed. Requesting manual password entry.`);
  return { 
    status: 'needs_password', 
    ip, port, engine,
    credentials: { username: configClues.username || (engine === 'mssql' ? 'sa' : (engine === 'postgres' ? 'postgres' : 'root')) },
    message: "Your pharmacy stock is on another computer. To connect we need the login details for that system. Please ask whoever installed your pharmacy software for the database password." 
  };
}

function extractConfigClues(folderPath: string): { ip?: string, username?: string, password?: string } {
  const clues: any = {};
  const exts = ['.ini', '.xml', '.env', '.properties', '.txt', '.config'];
  
  try {
    const files = fs.readdirSync(folderPath);
    for (const f of files) {
      const fullPath = path.join(folderPath, f);
      if (fs.statSync(fullPath).isFile() && exts.includes(path.extname(f).toLowerCase())) {
        const content = fs.readFileSync(fullPath, 'utf8');
        
        // Extract IP
        const ipMatch = content.match(/\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/);
        if (ipMatch && !clues.ip) clues.ip = ipMatch[0];
        
        // Extract Username
        const userMatch = content.match(/(?:user|username|uid)\s*[=:]\s*["']?([^"'\s;]+)["']?/i);
        if (userMatch && !clues.username) clues.username = userMatch[1];
        
        // Extract Password
        const pwdMatch = content.match(/(?:password|pwd)\s*[=:]\s*["']?([^"'\s;]+)["']?/i);
        if (pwdMatch && !clues.password) clues.password = pwdMatch[1];
      }
    }
  } catch (e) {
    // Ignore read errors
  }
  return clues;
}

function getSubnetIps(): string[] {
  const ips: string[] = [];
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const parts = iface.address.split('.');
        const base = `${parts[0]}.${parts[1]}.${parts[2]}`;
        for (let i = 1; i < 255; i++) {
          ips.push(`${base}.${i}`);
        }
      }
    }
  }
  return ips;
}

async function parallelPortScan(ips: string[]): Promise<{ip: string, port: number, engine: 'mysql'|'mssql'|'postgres'} | null> {
  const ports = [
    { p: 3306, e: 'mysql' as const }, 
    { p: 1433, e: 'mssql' as const }, 
    { p: 5432, e: 'postgres' as const }
  ];

  return new Promise((resolve) => {
    let resolved = false;
    let pending = ips.length * ports.length;

    if (pending === 0) return resolve(null);

    const checkDone = () => {
      pending--;
      if (pending === 0 && !resolved) {
         resolve(null);
      }
    };

    for (const ip of ips) {
      for (const { p, e } of ports) {
        const socket = new net.Socket();
        socket.setTimeout(500);
        
        socket.on('connect', () => {
          if (!resolved) {
            resolved = true;
            resolve({ ip, port: p, engine: e });
          }
          socket.destroy();
        });

        socket.on('timeout', () => { socket.destroy(); checkDone(); });
        socket.on('error', () => { socket.destroy(); checkDone(); });
        
        socket.connect(p, ip);
      }
    }
  });
}

export async function testDatabaseConnection(ip: string, port: number, engine: string, user: string, pass: string): Promise<boolean> {
  try {
    if (engine === 'mysql') {
      const mysql = require('mysql2/promise');
      const conn = await mysql.createConnection({ host: ip, port, user, password: pass, connectTimeout: 1500 });
      await conn.end();
      return true;
    } else if (engine === 'mssql') {
      const sql = require('mssql');
      await sql.connect({ user, password: pass, server: ip, port, options: { connectTimeout: 1500, encrypt: false, trustServerCertificate: true } });
      await sql.close();
      return true;
    } else if (engine === 'postgres') {
      const { Client } = require('pg');
      const client = new Client({ host: ip, port, user, password: pass, connectionTimeoutMillis: 1500 });
      await client.connect();
      await client.end();
      return true;
    }
  } catch (e: any) {
    // console.log(`Connection failed for ${user}:`, e.message);
    return false;
  }
  return false;
}
