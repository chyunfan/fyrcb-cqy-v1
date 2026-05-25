// 查询柜员信息 + 报名记录（单表 cqy_q1）
// GET /api/lookup-teller?tellerNumber=xxxxx
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

const CQY_Q1_TABLE = 'cqy_q1';

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

    if (!AIRTABLE_BASE_ID || !AIRTABLE_TOKEN) {
        return res.status(500).json({ error: 'Airtable 配置未设置' });
    }

    try {
        const num = parseInt(tellerNumber, 10);
        const baseUrl = 'https://api.airtable.com/v0/' + AIRTABLE_BASE_ID;

        // 只查 cqy_q1（843 人已预填）
        const cqyResp = await fetch(
            baseUrl + '/' + encodeURIComponent(CQY_Q1_TABLE) +
            '?filterByFormula=' + encodeURIComponent('{柜员号}=' + num),
            { headers: { 'Authorization': 'Bearer ' + AIRTABLE_TOKEN } }
        );

        const cqyData = await cqyResp.json();

        if (!cqyResp.ok) {
            throw new Error(cqyData.error && cqyData.error.message || '查询 cqy_q1 失败');
        }

        if (!cqyData.records || cqyData.records.length === 0) {
            return res.status(404).json({ error: '未找到该柜员号，请检查后重试' });
        }

        const record = cqyData.records[0];
        const fields = record.fields;

        let result = {
            tellerNumber: tellerNumber,
            userName: fields['姓名'] || '',
            ygxs: fields['ygxs'] || '',
            existingRecord: null
        };

        // 判断是否已报名：看"旅行线路"字段是否有值
        if (fields['旅行线路']) {
            result.existingRecord = {
                id: record.id,
                fields: fields,
                allowEdit: fields['是否允许修改'] !== '否'
            };
        }

        return res.status(200).json(result);

    } catch (error) {
        console.error('查询失败:', error);
        return res.status(500).json({ error: error.message });
    }
};
