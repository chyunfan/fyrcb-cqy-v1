// 查询报名记录 API
// GET /api/query?userId=柜员号

const AIRTABLE_TABLE = 'cqy_q1';

module.exports = async (req, res) => {
    // 设置 CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const userId = req.query.userId;
    if (!userId) {
        return res.status(400).json({ error: '缺少柜员号参数' });
    }
    
    // 获取环境变量
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
    const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
    
    if (!AIRTABLE_BASE_ID || !AIRTABLE_TOKEN) {
        return res.status(500).json({ error: 'Airtable 配置未设置' });
    }
    
    try {
        // Airtable API 查询
        const filterFormula = encodeURIComponent(`{柜员号}=${userId}`);
        const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE}?filterByFormula=${filterFormula}`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${AIRTABLE_TOKEN}`
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error?.message || '查询失败');
        }
        
        // 返回记录（如果有）
        if (data.records && data.records.length > 0) {
            return res.status(200).json(data.records[0]);
        } else {
            return res.status(200).json(null);
        }
        
    } catch (error) {
        console.error('查询记录失败:', error);
        return res.status(500).json({ error: error.message });
    }
};
