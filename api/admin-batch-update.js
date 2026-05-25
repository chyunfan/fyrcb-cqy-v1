// 管理后台：按条件一键设置"是否允许修改"（Supabase 版）
// POST /api/admin-batch-update  Body: { token, allowEdit, filters: { route, month, signedUp, tellerNumberStart, tellerNumberEnd } }
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

    const { token, allowEdit, filters } = req.body;
    if (token !== ADMIN_TOKEN) return res.status(401).json({ error: '无权限' });
    if (allowEdit !== '是' && allowEdit !== '否') {
        return res.status(400).json({ error: 'allowEdit 必须为"是"或"否"' });
    }
    if (!filters || Object.keys(filters).length === 0) {
        return res.status(400).json({ error: '请至少填写一个筛选条件' });
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'Supabase 配置未设置' });

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // 1. 先查询符合条件的记录（用于返回 matchedCount）
        let query = supabase
            .from(TABLE_NAME)
            .select('id', { count: 'exact' });

        // 应用筛选条件
        if (filters.route) {
            query = query.ilike('旅行线路', '%' + filters.route + '%');
        }
        if (filters.month) {
            query = query.eq('月份', filters.month);
        }
        if (filters.signedUp === '是') {
            query = query.not('旅行线路', 'is', null);
            query = query.neq('旅行线路', '');
        } else if (filters.signedUp === '否') {
            query = query.or('旅行线路.is.null,旅行线路.eq.""');
        }
        if (filters.tellerNumberStart) {
            query = query.gte('柜员号', parseInt(filters.tellerNumberStart, 10));
        }
        if (filters.tellerNumberEnd) {
            query = query.lte('柜员号', parseInt(filters.tellerNumberEnd, 10));
        }

        const { data: matchedData, error: matchError, count } = await query;

        if (matchError) throw new Error('查询失败：' + matchError.message);

        const matchedCount = count || 0;
        if (matchedCount === 0) {
            return res.status(200).json({ success: true, matchedCount: 0, updatedCount: 0 });
        }

        // 2. 批量更新（使用相同的筛选条件）
        let updateQuery = supabase
            .from(TABLE_NAME)
            .update({ '是否允许修改': allowEdit, updated_at: new Date().toISOString() });

        // 重新应用筛选条件（Supabase 不支持复用 query 对象）
        if (filters.route) {
            updateQuery = updateQuery.ilike('旅行线路', '%' + filters.route + '%');
        }
        if (filters.month) {
            updateQuery = updateQuery.eq('月份', filters.month);
        }
        if (filters.signedUp === '是') {
            updateQuery = updateQuery.not('旅行线路', 'is', null);
            updateQuery = updateQuery.neq('旅行线路', '');
        } else if (filters.signedUp === '否') {
            updateQuery = updateQuery.or('旅行线路.is.null,旅行线路.eq.""');
        }
        if (filters.tellerNumberStart) {
            updateQuery = updateQuery.gte('柜员号', parseInt(filters.tellerNumberStart, 10));
        }
        if (filters.tellerNumberEnd) {
            updateQuery = updateQuery.lte('柜员号', parseInt(filters.tellerNumberEnd, 10));
        }

        const { data: updatedData, error: updateError } = await updateQuery.select('id');

        if (updateError) throw new Error('批量更新失败：' + updateError.message);

        res.status(200).json({
            success: true,
            matchedCount: matchedCount,
            updatedCount: (updatedData || []).length
        });

    } catch (err) {
        console.error('admin-batch-update 失败:', err);
        res.status(500).json({ error: err.message });
    }
};
