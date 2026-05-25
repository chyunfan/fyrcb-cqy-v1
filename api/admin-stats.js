// 管理后台：统计数据（含线路×月份交叉分布，Supabase 版）
// GET /api/admin-stats?token=xxx
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

    const { token } = req.query;
    if (token !== ADMIN_TOKEN) return res.status(401).json({ error: '无权限' });
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'Supabase 配置未设置' });

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // 只统计已报名的人（旅行线路有值）
        const { data, error } = await supabase
            .from(TABLE_NAME)
            .select('*')
            .not('旅行线路', 'is', null)
            .neq('旅行线路', '');

        if (error) throw new Error('查询失败：' + error.message);

        const allRecords = data || [];
        const total = allRecords.length;

        // 各线路报名人数
        const routeCount = {};
        // 各月份分布
        const monthCount = {};
        // 线路×月份交叉分布
        const crossTable = {}; // { route: { month: count } }
        // 修改权限统计
        let allowEditCount = 0;
        let notAllowEditCount = 0;

        allRecords.forEach(function(r) {
            const route = r['旅行线路'] || '未知';
            const month = r['月份'] || '未知';

            // 线路统计
            routeCount[route] = (routeCount[route] || 0) + 1;

            // 月份统计
            monthCount[month] = (monthCount[month] || 0) + 1;

            // 交叉分布
            if (!crossTable[route]) crossTable[route] = {};
            crossTable[route][month] = (crossTable[route][month] || 0) + 1;

            // 修改权限
            if (r['是否允许修改'] === '否') {
                notAllowEditCount++;
            } else {
                allowEditCount++;
            }
        });

        res.status(200).json({
            success: true,
            total: total,
            routeCount: routeCount,
            monthCount: monthCount,
            crossTable: crossTable,
            allowEditCount: allowEditCount,
            notAllowEditCount: notAllowEditCount
        });

    } catch (err) {
        console.error('admin-stats 失败:', err);
        res.status(500).json({ error: err.message });
    }
};
