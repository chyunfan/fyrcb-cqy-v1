// 管理员：查看报名统计
// GET /api/exam-stats?token=xxx
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

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

        // 总员工数
        const { count: totalEmployees, error: empError } = await supabase
            .from('employees')
            .select('*', { count: 'exact', head: false });

        if (empError) throw new Error('查询员工数失败：' + empError.message);

        // 已报名人数
        const { data: regData, error: regError } = await supabase
            .from('exam_registration')
            .select('*');

        if (regError) throw new Error('查询报名数据失败：' + regError.message);

        const totalRegistered = regData.length;
        const notRegistered = totalEmployees - totalRegistered;

        // 各场次报名人数
        const sessionCount = {};
        regData.forEach(record => {
            const session = record['场次'] || '未知';
            sessionCount[session] = (sessionCount[session] || 0) + 1;
        });

        // 场次容量
        const SESSION_LIMIT = 30;
        const sessionStats = {};
        Object.keys(sessionCount).forEach(session => {
            sessionStats[session] = {
                count: sessionCount[session],
                limit: SESSION_LIMIT,
                remaining: SESSION_LIMIT - sessionCount[session]
            };
        });

        res.status(200).json({
            success: true,
            totalEmployees: totalEmployees,
            totalRegistered: totalRegistered,
            notRegistered: notRegistered,
            registrationRate: ((totalRegistered / totalEmployees) * 100).toFixed(2) + '%',
            sessionStats: sessionStats,
            recentRegistrations: regData
                .sort((a, b) => new Date(b['报名时间']) - new Date(a['报名时间']))
                .slice(0, 10)
        });

    } catch (err) {
        console.error('exam-stats 失败:', err);
        res.status(500).json({ error: err.message });
    }
};
