const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PORT = parseInt(process.env.PORT) || 3000;

// ========== Supabase 配置（只从环境变量读取）==========
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || '';
// ================================================================

const HEADERS = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_KEY,
  'Authorization': 'Bearer ' + SUPABASE_KEY,
};

// ---------- Supabase REST API 工具 ----------
function supabaseRequest(p, method, body) {
  return new Promise((resolve, reject) => {
    // 环境变量预检
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return reject(new Error('SUPABASE_URL 或 SUPABASE_ANON_KEY 未配置！请在环境变量中设置。'));
    }
    const base = SUPABASE_URL.replace(/\/+$/, '');
    const url = base + '/rest/v1/' + p;
    const bodyStr = body ? JSON.stringify(body) : '';
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: method,
      headers: {
        ...HEADERS,
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch(e) { resolve({ status: res.statusCode, data: d }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// 查询记录
async function sbSelect(table, query) {
  const q = query ? '?' + query : '';
  const res = await supabaseRequest(table + q, 'GET');
  return res.data || [];
}

// 插入记录
async function sbInsert(table, records) {
  const res = await supabaseRequest(table + '?prefer=return=representation', 'POST', records);
  return res.data;
}

// 删除记录
async function sbDelete(table, query) {
  const res = await supabaseRequest(table + '?' + query, 'DELETE');
  return res.data;
}

// 查询单条（按字段值）
async function sbFindBy(table, field, value) {
  const q = encodeURIComponent(field) + '=eq.' + encodeURIComponent(value);
  const res = await sbSelect(table, q);
  return res && res.length > 0 ? res[0] : null;
}

// ---------- HTTP 工具 ----------
function readBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { resolve({}); } });
  });
}

function sendJSON(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function sendFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': contentType || 'text/html; charset=utf-8' });
    res.end(data);
  });
}

// ---------- HTTP 服务 ----------
const server = http.createServer(async (req, res) => {
  // 处理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const pathname = urlObj.pathname;

  // 检查是否已提交（前端已用 LocalStorage/Cookie 拦截，后端二次校验）
  // 用 IP+UserAgent 指纹做无感去重
  if (pathname === '/api/check' && req.method === 'GET') {
    const fingerprint = crypto.createHash('sha256')
      .update(req.socket.remoteAddress + '|' + (req.headers['user-agent'] || ''))
      .digest('hex').slice(0, 32);
    try {
      const existing = await sbFindBy('survey_responses', 'fingerprint', fingerprint);
      sendJSON(res, { submitted: !!existing });
    } catch (e) {
      sendJSON(res, { submitted: false });
    }
    return;
  }

  // 提交
  if (pathname === '/api/submit' && req.method === 'POST') {
    const body = await readBody(req);

    // 用 IP+UA 指纹做去重
    const fingerprint = crypto.createHash('sha256')
      .update(req.socket.remoteAddress + '|' + (req.headers['user-agent'] || ''))
      .digest('hex').slice(0, 32);

    try {
      const existing = await sbFindBy('survey_responses', 'fingerprint', fingerprint);
      if (existing) {
        return sendJSON(res, { success: false, message: '您已提交过，无需重复填写！' });
      }

      const record = {
        id: crypto.randomUUID(),
        fingerprint: fingerprint,
        answers: body.answers || {},
        submitted_at: body.submittedAt || new Date().toISOString(),
      };
      await sbInsert('survey_responses', record);
      sendJSON(res, { success: true, message: '提交成功！' });
    } catch (e) {
      sendJSON(res, { success: false, message: '提交失败：' + e.message }, 500);
    }
    return;
  }

  // 管理后台：查看所有记录
  if (pathname === '/api/records' && req.method === 'GET') {
    try {
      const records = await sbSelect('survey_responses', 'order=submitted_at.desc');
      sendJSON(res, { records });
    } catch (e) {
      sendJSON(res, { error: e.message }, 500);
    }
    return;
  }

  // 管理后台：删除记录
  if (pathname === '/api/records' && req.method === 'DELETE') {
    const id = urlObj.searchParams.get('id') || '';
    if (!id) return sendJSON(res, { error: '缺少 id' }, 400);
    try {
      await sbDelete('survey_responses', 'id=eq.' + encodeURIComponent(id));
      sendJSON(res, { success: true });
    } catch (e) {
      sendJSON(res, { error: e.message }, 500);
    }
    return;
  }

  // 管理后台：导出 CSV
  if (pathname === '/api/export' && req.method === 'GET') {
    try {
      const records = await sbSelect('survey_responses', 'order=submitted_at.asc');
      if (!records || records.length === 0) return sendJSON(res, { error: '暂无数据' }, 404);

      // 收集所有答案字段
      const allKeys = new Set();
      records.forEach(r => { if (r.answers) Object.keys(r.answers).forEach(k => allKeys.add(k)); });
      const answerKeys = [...allKeys].sort();

      const headers = ['id', 'fingerprint', ...answerKeys, 'submitted_at'];
      const csv = '\uFEFF' + headers.map(h => `"${h}"`).join(',') + '\n' +
        records.map(r => {
          const row = [];
          row.push(`"${r.id || ''}"`);
          row.push(`"${r.fingerprint || ''}"`);
          answerKeys.forEach(k => row.push(`"${(r.answers?.[k] || '').toString().replace(/"/g, '""')}"`));
          row.push(`"${(r.submitted_at || '').slice(0, 19).replace('T', ' ')}"`);
          return row.join(',');
        }).join('\n');

      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="survey_data.csv"',
      });
      res.end(csv);
    } catch (e) {
      sendJSON(res, { error: e.message }, 500);
    }
    return;
  }

  // 静态文件路由
  let filePath;
  const cleanPath = pathname === '/' ? '/survey-index.html' : pathname;
  if (cleanPath === '/survey-index.html' || cleanPath === '/survey-index') filePath = 'public/survey-index.html';
  else if (cleanPath === '/survey-admin.html' || cleanPath === '/survey-admin' || cleanPath === '/admin') filePath = 'public/survey-admin.html';
  else filePath = cleanPath.slice(1);

  const fullPath = path.join(__dirname, filePath);
  const ext = path.extname(fullPath);
  const ct = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' }[ext] || 'text/plain';
  sendFile(res, fullPath, ct);
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('');
    console.warn('⚠️  警告：SUPABASE_URL 或 SUPABASE_ANON_KEY 未配置，提交功能将不可用！');
    console.warn('   请设置环境变量：');
    console.warn('   export SUPABASE_URL=https://xxx.supabase.co');
    console.warn('   export SUPABASE_ANON_KEY=你的anon_key');
    console.warn('');
  }
});
