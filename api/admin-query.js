// 管理后台：按条件查询报名记录
// GET /api/admin-query?token=xxx&route=xxx&month=xxx&tellerNumber=xxx&page=1&pageSize=20
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const TABLE_NAME = 'cqy_q1';

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { token, route, month, tellerNumber, page, pageSize } = req.query;

    if (token !== ADMIN_TOKEN) return res.status(401).json({ error: '无权限' });
    if (!AIRTABLE_BASE_ID || !AIRTABLE_TOKEN) return res.status(500).json({ error: 'Airtable 配置未设置' });

    try {
        let formula = '';
        const conditions = [];
        if (route) conditions.push("FIND('" + route + "', {旅行线路})");
        if (month) conditions.push("{月份}='" + month + "'");
        if (tellerNumber) conditions.push('{柜员号}=' + parseInt(tellerNumber, 10));
        if (conditions.length > 0) formula = 'AND(' + conditions.join(',') + ')';

        const url = 'https://api.airtable.com/v0/' + AIRTABLE_BASE_ID + '/' + encodeURIComponent(TABLE_NAME) +
            '?pageSize=100' + (formula ? '&filterByFormula=' + encodeURIComponent(formula) : '');

        const resp = await fetch(url, { headers: { 'Authorization': 'Bearer ' + AIRTABLE_TOKEN } });
        const data = await resp.json();
        if (!resp.ok) throw new Error((data.error && data.error.message) || '查询失败');

        const records = (data.records || []).map(function(r) {
            return { id: r.id, fields: r.fields };
        });

        const p = parseInt(page) || 1;
        const size = parseInt(pageSize) || 20;
        const start = (p - 1) * size;
        const pageRecords = records.slice(start, start + size);

        res.status(200).json({ records: pageRecords, total: records.length, page: p, pageSize: size });
    } catch (err) {
        console.error('admin-query 失败:', err);
        res.status(500).json({ error: err.message });
    }
};
