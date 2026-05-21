// 提交/更新报名记录 API
// POST /api/submit
// Body: { userId, userName, route, month, family, remark, recordId }
const AIRTABLE_TABLE = 'cqy_q1';

module.exports = async (req, res) => {
    // 设置 CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    // 获取环境变量
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
    const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
    
    if (!AIRTABLE_BASE_ID || !AIRTABLE_TOKEN) {
        return res.status(500).json({ error: 'Airtable 配置未设置' });
    }
    
    try {
        const body = req.body;
        const { userId, userName, route, month, family, remark, recordId } = body;
        
        if (!userId || !userName) {
            return res.status(400).json({ error: '缺少必填参数' });
        }
        
        const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE}`;
        
        const fields = {
            'id': parseInt(userId),
            '姓名': userName,
            '旅行线路': route,
            '月份': month,
            '家庭成员人数': parseInt(family) || 0,
            '备注': remark || ''
        };
        
        let result;
        let apiResponse;
        
        if (recordId) {
            // 更新现有记录
            const updateUrl = `${url}/${recordId}`;
            apiResponse = await fetch(updateUrl, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ fields })
            });
            result = await apiResponse.json();
        } else {
            // 新增记录
            apiResponse = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    records: [{ fields }]
                })
            });
            const data = await apiResponse.json();
            result = data.records?.[0] || data;
        }
        
        if (!apiResponse.ok) {
            throw new Error(result.error?.message || '提交失败');
        }
        
        return res.status(200).json({
            success: true,
            record: result
        });
        
    } catch (error) {
        console.error('提交记录失败:', error);
        return res.status(500).json({ error: error.message });
    }
};
