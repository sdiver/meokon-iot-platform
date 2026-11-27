#!/usr/bin/env node
/**
 * 本地模拟 Vercel 部署：静态文件来自 web/dist，/api/* 按 vercel.json 改写后交给 api/index.js 处理。
 *   PORT=3000 node scripts/vercel-local.js
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'web', 'dist');
const { default: handler } = await import(path.join(root, 'api', 'index.js'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.json': 'application/json' };

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname.startsWith('/api/')) {
    // 与 vercel.json 的 rewrites 一致
    u.searchParams.set('__p', u.pathname.slice(5));
    req.url = `/api/index?${u.searchParams}`;
    return handler(req, res);
  }
  let f = path.join(dist, decodeURIComponent(u.pathname));
  if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, 'index.html');
  res.setHeader('Content-Type', TYPES[path.extname(f)] || 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
}).listen(Number(process.env.PORT || 3000), () => console.log(`Vercel 本地模拟：http://localhost:${process.env.PORT || 3000}`));
