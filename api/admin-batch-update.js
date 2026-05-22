// 管理后台：按条件一键设置"是否允许修改"
// POST /api/admin-batch-update  Body: { token, allowEdit, filters: { route, month, tellerNumberStart, tellerNumberEnd } }
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const TABLE_NAME = 'cqy_q1';

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { token, allowEdit, filters } = req.body;
    if (token !== ADMIN_TOKEN) return res.status(401).json({ error: '无权限' });
    if (allowEdit !== '是' && allowEdit !== '否') {
        return res.status(400).json({ error: 'allowEdit 必须为"是"或"否"' });
    }
    if (!filters || Object.keys(filters).length === 0) {
        return res.status(400).json({ error: '请至少填写一个筛选条件' });
    }
    if (!AIRTABLE_BASE_ID || !AIRTABLE_TOKEN) return res.status(500).json({ error: 'Airtable 配置未设置' });

    try {
        // 1. 先查询符合条件的记录
        const conditions = [];
        if (filters.route) conditions.push("FIND('" + filters.route + "', {旅行线路})");
        if (filters.month) conditions.push("{月份}='" + filters.month + "'");
        if (filters.tellerNumberStart) conditions.push('{柜员号}>=' + parseInt(filters.tellerNumberStart, 10));
        if (filters.tellerNumberEnd) conditions.push('{柜员号}<=' + parseInt(filters.tellerNumberEnd, 10));

        const formula = 'AND(' + conditions.join(',') + ')';
        let allRecords = [];
        let offset = null;

        do {
            let url = 'https://api.airtable.com/v0/' + AIRTABLE_BASE_ID + '/' + encodeURIComponent(TABLE_NAME) +
                '?pageSize=100&filterByFormula=' + encodeURIComponent(formula);
            if (offset) url += '&offset=' + encodeURIComponent(offset);
            const resp = await fetch(url, { headers: { 'Authorization': 'Bearer ' + AIRTABLE_TOKEN } });
            const data = await resp.json();
            if (!resp.ok) throw new Error((data.error && data.error.message) || '查询失败');
            allRecords = allRecords.concat(data.records || []);
            offset = data.offset || null;
        } while (offset);

        if (allRecords.length === 0) {
            return res.status(200).json({ success: true, matchedCount: 0, updatedCount: 0 });
        }

        // 2. 批量更新
        let updatedCount = 0;
        for (let i = 0; i < allRecords.length; i += 10) {
            const batch = allRecords.slice(i, i + 10);
            const records = batch.map(r => ({
                id: r.id,
                fields: { '是否允许修改': allowEdit }
            }));
            const resp = await fetch('https://api.airtable.com/v0/' + AIRTABLE_BASE_ID + '/' + encodeURIComponent(TABLE_NAME), {
                method: 'PATCH',
                headers: {
                    'Authorization': 'Bearer ' + AIRTABLE_TOKEN,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ records: records })
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error((data.error && data.error.message) || '批量更新失败');
            updatedCount += (data.records || []).length;
        }

        res.status(200).json({ success: true, matchedCount: allRecords.length, updatedCount: updatedCount });
    } catch (err) {
        console.error('admin-batch-update 失败:', err);
        res.status(500).json({ error: err.message });
    }
};
