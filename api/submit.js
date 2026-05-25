// 提交/更新报名记录 API（Supabase 版）
// POST /api/submit
// Body: { tellerNumber, userName, ygxs, route, month, family, remark }
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TABLE_NAME = 'cqy_q1';

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'Supabase 配置未设置' });
    }

    try {
        const body = req.body;
        const { tellerNumber, userName, ygxs, route, month, family, remark } = body;

        if (!tellerNumber || !userName) {
            return res.status(400).json({ error: '缺少必填参数' });
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        const num = parseInt(tellerNumber, 10);

        // 构建更新字段
        const fields = {};
        if (userName) fields['姓名'] = userName;
        if (ygxs !== undefined) fields['ygxs'] = ygxs || '';
        if (route) fields['旅行线路'] = route;
        if (month) fields['月份'] = month;
        if (family !== undefined) fields['家庭成员人数'] = parseInt(family) || 0;
        if (remark !== undefined) fields['备注'] = remark || '';
        fields['updated_at'] = new Date().toISOString();

        // 根据柜员号更新记录（记录一定存在，因为 843 人已预填）
        const { data, error } = await supabase
            .from(TABLE_NAME)
            .update(fields)
            .eq('柜员号', num)
            .select()
            .single();

        if (error) {
            throw new Error('提交失败：' + error.message);
        }

        return res.status(200).json({ success: true, record: data });

    } catch (error) {
        console.error('提交记录失败:', error);
        return res.status(500).json({ error: error.message });
    }
};
