// 查询柜员信息（从 employees 表）
// GET /api/exam-lookup?tellerId=xxxxx
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { tellerId } = req.query;
    if (!tellerId) return res.status(400).json({ error: '缺少柜员号参数' });
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'Supabase 配置未设置' });

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // 查询 employees 表
        const { data, error } = await supabase
            .from('employees')
            .select('*')
            .eq('柜员号', tellerId)
            .single();

        if (error || !data) {
            return res.status(404).json({ error: '未找到该柜员号，请检查后重试' });
        }

        // 检查是否已报名
        const { data: regData, error: regError } = await supabase
            .from('exam_registration')
            .select('*')
            .eq('柜员号', tellerId)
            .single();

        let result = {
            tellerId: tellerId,
            name: data['姓名'] || '',
            department: data['部门'] || '',
            alreadyRegistered: false,
            registration: null
        };

        if (regData) {
            result.alreadyRegistered = true;
            result.registration = {
                session: regData['场次'],
                registeredAt: regData['报名时间']
            };
        }

        return res.status(200).json(result);

    } catch (error) {
        console.error('查询失败:', error);
        return res.status(500).json({ error: error.message });
    }
};
