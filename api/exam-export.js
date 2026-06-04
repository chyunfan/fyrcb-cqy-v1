// 管理员：导出报名明细（CSV格式）
// GET /api/exam-export?token=xxx&format=csv
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

    const { token, format = 'csv' } = req.query;
    if (token !== ADMIN_TOKEN) return res.status(401).json({ error: '无权限' });
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'Supabase 配置未设置' });

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // 获取所有报名记录，并关联员工信息
        const { data: regData, error: regError } = await supabase
            .from('exam_registration')
            .select('*')
            .order('报名时间', { ascending: false });

        if (regError) throw new Error('查询报名数据失败：' + regError.message);

        // 获取所有员工信息
        const { data: empData, error: empError } = await supabase
            .from('employees')
            .select('*');

        if (empError) throw new Error('查询员工数据失败：' + empError.message);

        // 创建员工映射（柜员号 -> 员工信息）
        const empMap = {};
        empData.forEach(emp => {
            empMap[emp['柜员号']] = emp;
        });

        // 合并数据
        const mergedData = regData.map(reg => {
            const emp = empMap[reg['柜员号']] || {};
            return {
                柜员号: reg['柜员号'],
                姓名: emp['姓名'] || '未知',
                部门: emp['部门'] || '未知',
                场次: reg['场次'],
                报名时间: reg['报名时间'] ? new Date(reg['报名时间']).toLocaleString('zh-CN') : ''
            };
        });

        if (format === 'json') {
            return res.status(200).json({ success: true, data: mergedData });
        }

        // CSV格式
        const BOM = '\uFEFF'; // UTF-8 BOM for Excel
        let csv = BOM;
        csv += '柜员号,姓名,部门,场次,报名时间\n';

        mergedData.forEach(row => {
            csv += `${row['柜员号']},"${row['姓名']}","${row['部门']}","${row['场次']}","${row['报名时间']}"\n`;
        });

        // 添加统计信息
        csv += '\n统计信息\n';
        csv += `总报名人数,${mergedData.length}\n`;
        csv += `导出时间,"${new Date().toLocaleString('zh-CN')}"\n`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="exam-registration.csv"');
        return res.status(200).send(csv);

    } catch (err) {
        console.error('exam-export 失败:', err);
        res.status(500).json({ error: err.message });
    }
};
