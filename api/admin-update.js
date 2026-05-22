// 管理后台：单条/批量更新"是否允许修改"
// POST /api/admin-update  Body: { token, recordIds: [], allowEdit: "是"|"否" }
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

    const { token, recordIds, allowEdit } = req.body;
    if (token !== ADMIN_TOKEN) return res.status(401).json({ error: '无权限' });
    if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
        return res.status(400).json({ error: '缺少 recordIds' });
    }
    if (allowEdit !== '是' && allowEdit !== '否') {
        return res.status(400).json({ error: 'allowEdit 必须为"是"或"否"' });
    }
    if (!AIRTABLE_BASE_ID || !AIRTABLE_TOKEN) return res.status(500).json({ error: 'Airtable 配置未设置' });

    try {
        // Airtable PATCH 每次最多10条
        let updatedCount = 0;
        for (let i = 0; i < recordIds.length; i += 10) {
            const batch = recordIds.slice(i, i + 10);
            const records = batch.map(id => ({
                id: id,
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
        res.status(200).json({ success: true, updatedCount: updatedCount });
    } catch (err) {
        console.error('admin-update 失败:', err);
        res.status(500).json({ error: err.message });
    }
};
