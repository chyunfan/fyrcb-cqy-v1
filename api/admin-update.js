// 管理后台：单条/批量更新"是否允许修改"（Supabase 版）
// POST /api/admin-update  Body: { token, recordIds: [], allowEdit: "是"|"否" }
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
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
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'Supabase 配置未设置' });

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // recordIds 在 Supabase 中对应的是 id 字段（数字）
        const { data, error } = await supabase
            .from(TABLE_NAME)
            .update({ '是否允许修改': allowEdit, updated_at: new Date().toISOString() })
            .in('id', recordIds)
            .select('id');

        if (error) throw new Error('批量更新失败：' + error.message);

        res.status(200).json({ success: true, updatedCount: (data || []).length });

    } catch (err) {
        console.error('admin-update 失败:', err);
        res.status(500).json({ error: err.message });
    }
};
