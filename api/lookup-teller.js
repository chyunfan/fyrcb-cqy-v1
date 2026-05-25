// 查询柜员信息 + 报名记录（Supabase 版）
// GET /api/lookup-teller?tellerNumber=xxxxx
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TABLE_NAME = 'cqy_q1';

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { tellerNumber } = req.query;
    if (!tellerNumber) {
        return res.status(400).json({ error: '缺少柜员号参数' });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'Supabase 配置未设置' });
    }

    try {
        const num = parseInt(tellerNumber, 10);
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // 查询 cqy_q1 表
        const { data, error } = await supabase
            .from(TABLE_NAME)
            .select('*')
            .eq('柜员号', num)
            .single();

        if (error || !data) {
            return res.status(404).json({ error: '未找到该柜员号，请检查后重试' });
        }

        let result = {
            tellerNumber: tellerNumber,
            userName: data['姓名'] || '',
            ygxs: data['ygxs'] || '',
            existingRecord: null
        };

        // 判断是否已报名：看"旅行线路"字段是否有值
        if (data['旅行线路']) {
            result.existingRecord = {
                id: data['id'],
                fields: data,
                allowEdit: data['是否允许修改'] !== '否'
            };
        }

        return res.status(200).json(result);

    } catch (error) {
        console.error('查询失败:', error);
        return res.status(500).json({ error: error.message });
    }
};
