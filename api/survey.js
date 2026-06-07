const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// 延迟初始化 Supabase，避免环境变量缺失时模块加载崩溃
let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL 或 SUPABASE_SERVICE_KEY 未配置');
  _supabase = createClient(url, key);
  return _supabase;
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function getFingerprint(req) {
  const ip = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',')[0].trim() || '';
  const ua = req.headers['user-agent'] || '';
  return ip ? crypto.createHash('sha256').update(ip + '|' + ua).digest('hex').slice(0, 32) : '';
}

// ========== check: 检查是否已提交 ==========
async function handleCheck(req, res) {
  try {
    const fingerprint = getFingerprint(req);
    let query = getSupabase().from('survey_responses').select('*');
    if (fingerprint) query = query.eq('fingerprint', fingerprint);
    const { data: records } = await query.limit(1);
    return res.status(200).json({ submitted: !!(records && records.length > 0) });
  } catch (e) {
    return res.status(200).json({ submitted: false });
  }
}

// ========== submit: 提交问卷 ==========
async function handleSubmit(req, res) {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const fingerprint = getFingerprint(req);

    // 检查是否已提交
    const { data: existing } = await getSupabase()
      .from('survey_responses')
      .select('*')
      .eq('fingerprint', fingerprint)
      .limit(1);

    if (existing && existing.length > 0) {
      return res.status(200).json({ success: false, message: '您已提交过，无需重复填写！' });
    }

    const record = {
      id: crypto.randomUUID(),
      fingerprint: fingerprint,
      answers: body.answers || {},
      submitted_at: body.submittedAt || new Date().toISOString(),
    };

    const { error } = await getSupabase().from('survey_responses').insert(record);
    if (error) throw error;

    return res.status(200).json({ success: true, message: '提交成功！' });
  } catch (e) {
    return res.status(500).json({ success: false, message: '提交失败：' + (e.message || '') });
  }
}

// ========== records: 查询所有记录 ==========
async function handleRecords(req, res) {
  try {
    const { data: records, error } = await getSupabase()
      .from('survey_responses')
      .select('*')
      .order('submitted_at', { ascending: false });

    if (error) throw error;
    return res.status(200).json({ records: records || [] });
  } catch (e) {
    return res.status(500).json({ error: e.message || '查询失败' });
  }
}

// ========== delete: 删除记录 ==========
async function handleDelete(req, res) {
  try {
    const url = new URL(req.url || '', 'http://' + (req.headers.host || 'localhost'));
    const id = url.searchParams.get('id') || '';
    if (!id) return res.status(400).json({ error: '缺少 id' });

    const { error } = await supabase
      .from('survey_responses')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || '删除失败' });
  }
}

// ========== export: 导出 CSV ==========
async function handleExport(req, res) {
  try {
    const { data: records, error } = await getSupabase()
      .from('survey_responses')
      .select('*')
      .order('submitted_at', { ascending: true });

    if (error) throw error;
    if (!records || records.length === 0) {
      return res.status(404).json({ error: '暂无数据' });
    }

    const allKeys = new Set();
    records.forEach(r => { if (r.answers) Object.keys(r.answers).forEach(k => allKeys.add(k)); });
    const answerKeys = [...allKeys].sort((a, b) => {
      const na = parseInt(a.replace('q', ''));
      const nb = parseInt(b.replace('q', ''));
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
    const headers = ['id', 'fingerprint', ...answerKeys, 'submitted_at'];

    const csv = '\uFEFF' + headers.map(h => '"' + h + '"').join(',') + '\n' +
      records.map(r => {
        const row = [];
        row.push('"' + (r.id || '') + '"');
        row.push('"' + (r.fingerprint || '') + '"');
        answerKeys.forEach(k => row.push('"' + ((r.answers && r.answers[k] || '').toString().replace(/"/g, '""')) + '"'));
        row.push('"' + ((r.submitted_at || '').slice(0, 19).replace('T', ' ')) + '"');
        return row.join(',');
      }).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="survey_data.csv"');
    return res.status(200).end(csv);
  } catch (e) {
    return res.status(500).json({ error: e.message || '导出失败' });
  }
}

// ========== 主路由 ==========
const handlers = {
  check:   { GET: handleCheck },
  submit:  { POST: handleSubmit },
  records: { GET: handleRecords, DELETE: handleDelete },
  export:  { GET: handleExport },
};

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const url = new URL(req.url || '', 'http://' + (req.headers.host || 'localhost'));
  const action = url.searchParams.get('action') || '';
  const handler = handlers[action];

  if (!handler) {
    return res.status(400).json({ error: '未知操作，请传入 action 参数（check/submit/records/delete/export）' });
  }

  const methodHandler = handler[req.method];
  if (!methodHandler) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return methodHandler(req, res);
};
