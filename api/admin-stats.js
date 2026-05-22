// 管理后台：统计数据（含线路×月份交叉分布）
// GET /api/admin-stats?token=xxx
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

    const { token } = req.query;
    if (token !== ADMIN_TOKEN) return res.status(401).json({ error: '无权限' });
    if (!AIRTABLE_BASE_ID || !AIRTABLE_TOKEN) return res.status(500).json({ error: 'Airtable 配置未设置' });

    try {
        // 分页取全部记录
        let allRecords = [];
        let offset = null;
        do {
            let url = 'https://api.airtable.com/v0/' + AIRTABLE_BASE_ID + '/' + encodeURIComponent(TABLE_NAME) + '?pageSize=100';
            if (offset) url += '&offset=' + encodeURIComponent(offset);
            const resp = await fetch(url, { headers: { 'Authorization': 'Bearer ' + AIRTABLE_TOKEN } });
            const data = await resp.json();
            if (!resp.ok) throw new Error((data.error && data.error.message) || '查询失败');
            allRecords = allRecords.concat(data.records || []);
            offset = data.offset || null;
        } while (offset);

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
            const f = r.fields;
            const route = f['旅行线路'] || '未知';
            const month = f['月份'] || '未知';

            // 线路统计
            routeCount[route] = (routeCount[route] || 0) + 1;

            // 月份统计
            monthCount[month] = (monthCount[month] || 0) + 1;

            // 交叉分布
            if (!crossTable[route]) crossTable[route] = {};
            crossTable[route][month] = (crossTable[route][month] || 0) + 1;

            // 修改权限
            if (f['是否允许修改'] === '否') {
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
