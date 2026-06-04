// 提交/更新考试报名
// POST /api/exam-register
// Body: { tellerId, session }
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// 场次容量限制
const SESSION_LIMIT = 30;

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'Supabase 配置未设置' });
    }

    try {
        const { tellerId, session } = req.body;

        if (!tellerId || !session) {
            return res.status(400).json({ error: '缺少必填参数' });
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // 验证柜员号是否存在
        const { data: empData, error: empError } = await supabase
            .from('employees')
            .select('*')
            .eq('柜员号', tellerId)
            .single();

        if (empError || !empData) {
            return res.status(404).json({ error: '柜员号不存在' });
        }

        // 检查该场次已报名人数
        const { count, error: countError } = await supabase
            .from('exam_registration')
            .select('*', { count: 'exact', head: false })
            .eq('场次', session);

        if (countError) throw new Error('查询场次人数失败：' + countError.message);

        if (count >= SESSION_LIMIT) {
            return res.status(400).json({ error: `该场次已满（${SESSION_LIMIT}人），请选择其他场次` });
        }

        // 尝试插入报名记录（利用 UNIQUE 约束防止重复报名）
        const { data, error } = await supabase
            .from('exam_registration')
            .insert([
                {
                    柜员号: tellerId,
                    场次: session,
                    报名时间: new Date().toISOString()
                }
            ])
            .select()
            .single();

        if (error) {
            if (error.code === '23505') { // 唯一约束冲突
                return res.status(400).json({ error: '您已报名，无法重复报名' });
            }
            throw new Error('报名失败：' + error.message);
        }

        return res.status(200).json({
            success: true,
            message: '报名成功',
            data: {
                tellerId: tellerId,
                name: empData['姓名'],
                session: session,
                registeredAt: data['报名时间']
            }
        });

    } catch (error) {
        console.error('报名失败:', error);
        return res.status(500).json({ error: error.message });
    }
};
