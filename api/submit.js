// 提交/更新报名记录 API（单表 cqy_q1，记录已预填）
// POST /api/submit
// Body: { tellerNumber, userName, ygxs, route, month, family, remark }
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_TABLE = 'cqy_q1';

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

    if (!AIRTABLE_BASE_ID || !AIRTABLE_TOKEN) {
        return res.status(500).json({ error: 'Airtable 配置未设置' });
    }

    try {
        const body = req.body;
        const { tellerNumber, userName, ygxs, route, month, family, remark } = body;

        if (!tellerNumber || !userName) {
            return res.status(400).json({ error: '缺少必填参数' });
        }

        const baseUrl = 'https://api.airtable.com/v0/' + AIRTABLE_BASE_ID;

        // 根据柜员号查找 Airtable 记录 ID
        const filter = encodeURIComponent('{柜员号}=' + parseInt(tellerNumber, 10));
        const listResp = await fetch(
            baseUrl + '/' + encodeURIComponent(AIRTABLE_TABLE) + '?filterByFormula=' + filter,
            { headers: { 'Authorization': 'Bearer ' + AIRTABLE_TOKEN } }
        );
        const listData = await listResp.json();

        if (!listResp.ok) {
            throw new Error((listData.error && listData.error.message) || '查找记录失败');
        }

        if (!listData.records || listData.records.length === 0) {
            return res.status(404).json({ error: '未找到该柜员号记录，请联系管理员' });
        }

        const recordId = listData.records[0].id;

        // PATCH 更新报名字段
        const fields = {};
        if (userName) fields['姓名'] = userName;
        if (ygxs !== undefined) fields['ygxs'] = ygxs || '';
        if (route) fields['旅行线路'] = route;
        if (month) fields['月份'] = month;
        if (family !== undefined) fields['家庭成员人数'] = parseInt(family) || 0;
        if (remark !== undefined) fields['备注'] = remark || '';

        const patchResp = await fetch(
            baseUrl + '/' + encodeURIComponent(AIRTABLE_TABLE) + '/' + recordId,
            {
                method: 'PATCH',
                headers: {
                    'Authorization': 'Bearer ' + AIRTABLE_TOKEN,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ fields: fields })
            }
        );

        const result = await patchResp.json();

        if (!patchResp.ok) {
            throw new Error((result.error && result.error.message) || '提交失败');
        }

        return res.status(200).json({ success: true, record: result });

    } catch (error) {
        console.error('提交记录失败:', error);
        return res.status(500).json({ error: error.message });
    }
};
