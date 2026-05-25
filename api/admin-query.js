// 管理后台：按条件查询报名记录（Supabase 版）
// GET /api/admin-query?token=xxx&route=xxx&month=xxx&tellerNumber=xxx&signedUp=是&page=1&pageSize=20
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const TABLE_NAME = 'cqy_q1';

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { token, route, month, tellerNumber, signedUp, page, pageSize } = req.query;

    if (token !== ADMIN_TOKEN) return res.status(401).json({ error: '无权限' });
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'Supabase 配置未设置' });

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        const p = parseInt(page) || 1;
        const size = parseInt(pageSize) || 20;
        const start = (p - 1) * size;
        const end = start + size - 1;

        // 构建查询
        let query = supabase
            .from(TABLE_NAME)
            .select('*', { count: 'exact' });

        // 筛选条件
        if (route) {
            // 模糊匹配旅行线路
            query = query.ilike('旅行线路', '%' + route + '%');
        }
        if (month) {
            query = query.eq('月份', month);
        }
        if (tellerNumber) {
            query = query.eq('柜员号', parseInt(tellerNumber, 10));
        }
        // 是否报名筛选
        if (signedUp === '是') {
            query = query.not('旅行线路', 'is', null);
            query = query.neq('旅行线路', '');
        } else if (signedUp === '否') {
            query = query.or('旅行线路.is.null,旅行线路.eq.""');
        }

        // 分页
        query = query.range(start, end);

        const { data, error, count } = await query;

        if (error) throw new Error('查询失败：' + error.message);

        // 转换为前端期望的格式（兼容旧代码）
        const records = (data || []).map(function(r) {
            return { id: r['id'], fields: r };
        });

        res.status(200).json({ records: records, total: count || 0, page: p, pageSize: size });

    } catch (err) {
        console.error('admin-query 失败:', err);
        res.status(500).json({ error: err.message });
    }
};
