// 反假币考试报名 - 统一API（合并 lookup/register/stats/export）
// GET  /api/exam-api?action=lookup&tellerId=xxx
// POST /api/exam-api  body: { action: "register", tellerId, session }
// GET  /api/exam-api?action=stats&token=xxx
// GET  /api/exam-api?action=export&token=xxx
// GET  /api/exam-api?action=get-deadline
// POST /api/exam-api  body: { action: "set-deadline", token, deadline }
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const SESSION_LIMIT = 30;
const DEFAULT_DEADLINE = '2026-06-15'; // 默认截止日期

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'Supabase 配置未设置' });

    try {
        // 支持 GET query 和 POST body 两种方式传 action
        let action, tellerId, session, token;
        if (req.method === 'POST') {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            action = body.action;
            tellerId = body.tellerId;
            session = body.session;
            token = body.token || req.query.token;
        } else {
            action = req.query.action;
            tellerId = req.query.tellerId;
            session = req.query.session;
            token = req.query.token;
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        switch (action) {
            case 'lookup':
                return await handleLookup(supabase, res, tellerId);
            case 'register':
                return await handleRegister(supabase, res, tellerId, session);
            case 'stats':
                return await handleStats(supabase, res, token);
            case 'export':
                return await handleExport(supabase, res, token);
            case 'get-deadline':
                return await handleGetDeadline(supabase, res);
            case 'set-deadline':
                return await handleSetDeadline(supabase, res, token, session);
            default:
                return res.status(400).json({ error: '无效的 action 参数' });
        }
    } catch (err) {
        console.error('exam-api 错误:', err);
        return res.status(500).json({ error: err.message });
    }
};

// === 查询柜员信息 ===
async function handleLookup(supabase, res, tellerId) {
    if (!tellerId) return res.status(400).json({ error: '缺少柜员号参数' });

    const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('柜员号', tellerId)
        .single();

    if (error || !data) {
        return res.status(404).json({ error: '未找到该柜员号，请检查后重试' });
    }

    // 检查是否已报名
    const { data: regData } = await supabase
        .from('exam_registration')
        .select('*')
        .eq('柜员号', tellerId)
        .single();

    // 获取各场次统计（前端需要显示容量）
    const { data: allReg } = await supabase
        .from('exam_registration')
        .select('场次');

    const sessionCount = {};
    allReg.forEach(r => {
        const s = r['场次'] || '未知';
        sessionCount[s] = (sessionCount[s] || 0) + 1;
    });

    const result = {
        tellerId: tellerId,
        name: data['姓名'] || '',
        department: data['部门'] || '',
        alreadyRegistered: !!regData,
        registration: regData ? {
            session: regData['场次'],
            registeredAt: regData['报名时间']
        } : null,
        sessionStats: sessionCount
    };

    return res.status(200).json(result);
}

// === 提交报名 ===
async function handleRegister(supabase, res, tellerId, session) {
    if (!tellerId || !session) return res.status(400).json({ error: '缺少必填参数' });

    // 检查是否超过截止日期
    const { data: deadlineData } = await supabase
        .from('exam_config')
        .select('value')
        .eq('key', 'deadline')
        .single();

    const deadline = deadlineData?.value || DEFAULT_DEADLINE;
    const today = new Date().toISOString().split('T')[0];

    if (today > deadline) {
        return res.status(400).json({ error: `报名已截止（截止日期：${deadline}）` });
    }

    // 验证柜员号
    const { data: empData, error: empError } = await supabase
        .from('employees')
        .select('*')
        .eq('柜员号', tellerId)
        .single();

    if (empError || !empData) return res.status(404).json({ error: '柜员号不存在' });

    // 检查场次容量
    const { count, error: countError } = await supabase
        .from('exam_registration')
        .select('*', { count: 'exact', head: false })
        .eq('场次', session);

    if (countError) throw new Error('查询场次人数失败：' + countError.message);
    if (count >= SESSION_LIMIT) {
        return res.status(400).json({ error: `该场次已满（${SESSION_LIMIT}人），请选择其他场次` });
    }

    // upsert：有则更新，无则插入（截止日期前允许修改）
    const { data, error } = await supabase
        .from('exam_registration')
        .upsert([{ 柜员号: tellerId, 场次: session, 报名时间: new Date().toISOString() }], { onConflict: '柜员号' })
        .select()
        .single();

    if (error) {
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
}

// === 查看统计 ===
async function handleStats(supabase, res, token) {
    if (token !== ADMIN_TOKEN) return res.status(401).json({ error: '无权限' });

    const { count: totalEmployees, error: empError } = await supabase
        .from('employees')
        .select('*', { count: 'exact', head: false });

    if (empError) throw new Error('查询员工数失败：' + empError.message);

    const { data: regData, error: regError } = await supabase
        .from('exam_registration')
        .select('*');

    if (regError) throw new Error('查询报名数据失败：' + regError.message);

    const totalRegistered = regData.length;

    // 各场次报名人数
    const sessionCount = {};
    regData.forEach(record => {
        const s = record['场次'] || '未知';
        sessionCount[s] = (sessionCount[s] || 0) + 1;
    });

    // 场次统计（含所有6个场次，即使无人报名）
    const allSessions = [
        '6月25日第1场 15:40开始', '6月25日第2场 18:20开始', '6月25日第3场 19:40开始',
        '6月26日第1场 15:40开始', '6月26日第2场 18:20开始', '6月26日第3场 19:40开始'
    ];
    const sessionStats = {};
    allSessions.forEach(s => {
        sessionStats[s] = {
            count: sessionCount[s] || 0,
            limit: SESSION_LIMIT,
            remaining: SESSION_LIMIT - (sessionCount[s] || 0)
        };
    });

    // 最近报名记录（关联员工信息）
    const { data: empAll } = await supabase.from('employees').select('*');
    const empMap = {};
    empAll.forEach(e => { empMap[e['柜员号']] = e; });

    const recent = regData
        .sort((a, b) => new Date(b['报名时间']) - new Date(a['报名时间']))
        .slice(0, 20)
        .map(r => {
            const emp = empMap[r['柜员号']] || {};
            return {
                '柜员号': r['柜员号'],
                '姓名': emp['姓名'] || '-',
                '部门': emp['部门'] || '-',
                '场次': r['场次'],
                '报名时间': r['报名时间']
            };
        });

    return res.status(200).json({
        success: true,
        totalEmployees,
        totalRegistered,
        registrationRate: totalEmployees > 0 ? ((totalRegistered / totalEmployees) * 100).toFixed(2) + '%' : '0%',
        sessionStats,
        recentRegistrations: recent
    });
}

// === 导出CSV ===
async function handleExport(supabase, res, token) {
    if (token !== ADMIN_TOKEN) return res.status(401).json({ error: '无权限' });

    const { data: regData, error: regError } = await supabase
        .from('exam_registration')
        .select('*')
        .order('报名时间', { ascending: false });

    if (regError) throw new Error('查询报名数据失败：' + regError.message);

    const { data: empData, error: empError } = await supabase
        .from('employees')
        .select('*');

    if (empError) throw new Error('查询员工数据失败：' + empError.message);

    const empMap = {};
    empData.forEach(emp => { empMap[emp['柜员号']] = emp; });

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

    const BOM = '\uFEFF';
    let csv = BOM;
    csv += '柜员号,姓名,部门,场次,报名时间\n';
    mergedData.forEach(row => {
        csv += `${row['柜员号']},"${row['姓名']}","${row['部门']}","${row['场次']}","${row['报名时间']}"\n`;
    });

    csv += '\n统计信息\n';
    csv += `总报名人数,${mergedData.length}\n`;
    csv += `导出时间,"${new Date().toLocaleString('zh-CN')}"\n`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="exam-registration.csv"');
    return res.status(200).send(csv);
}

// === 获取截止日期 ===
async function handleGetDeadline(supabase, res) {
    try {
        const { data, error } = await supabase
            .from('exam_config')
            .select('value')
            .eq('key', 'deadline')
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
            // 表可能不存在，返回默认值
            return res.status(200).json({ deadline: DEFAULT_DEADLINE });
        }

        return res.status(200).json({ deadline: data?.value || DEFAULT_DEADLINE });
    } catch (err) {
        return res.status(200).json({ deadline: DEFAULT_DEADLINE });
    }
}

// === 设置截止日期 ===
async function handleSetDeadline(supabase, res, token, deadline) {
    if (token !== ADMIN_TOKEN) return res.status(401).json({ error: '无权限' });

    if (!deadline) {
        return res.status(400).json({ error: '缺少截止日期参数' });
    }

    // 验证日期格式
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
        return res.status(400).json({ error: '日期格式错误，应为 YYYY-MM-DD' });
    }

    try {
        // 尝试更新
        const { data: updateData, error: updateError } = await supabase
            .from('exam_config')
            .update({ value: deadline, updated_at: new Date().toISOString() })
            .eq('key', 'deadline')
            .select()
            .single();

        if (updateData) {
            return res.status(200).json({ success: true, deadline: deadline });
        }

        // 如果更新失败（记录不存在），则插入
        const { data: insertData, error: insertError } = await supabase
            .from('exam_config')
            .insert([{ key: 'deadline', value: deadline, updated_at: new Date().toISOString() }])
            .select()
            .single();

        if (insertError) {
            throw new Error('保存截止日期失败：' + insertError.message);
        }

        return res.status(200).json({ success: true, deadline: deadline });
    } catch (err) {
        console.error('设置截止日期错误:', err);
        return res.status(500).json({ error: err.message });
    }
}

