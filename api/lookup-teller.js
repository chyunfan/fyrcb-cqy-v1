// 根据柜员号查询 tell_info 表，返回姓名和 ygxs
// GET /api/lookup-teller?tellerNumber=xxxxx
const AIRTABLE_TABLE = 'tell_info';

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
    const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

    if (!AIRTABLE_BASE_ID || !AIRTABLE_TOKEN) {
        return res.status(500).json({ error: 'Airtable 配置未设置' });
    }

    const { tellerNumber } = req.query;
    if (!tellerNumber) {
        return res.status(400).json({ error: '缺少柜员号参数' });
    }

    try {
        const tableName = encodeURIComponent(AIRTABLE_TABLE);
        const url = 'https://api.airtable.com/v0/' + AIRTABLE_BASE_ID + '/' + tableName;
        const filter = encodeURIComponent('{柜员号}="' + tellerNumber + '"');
        const apiUrl = url + '?filterByFormula=' + filter;

        const response = await fetch(apiUrl, {
            headers: { 'Authorization': 'Bearer ' + AIRTABLE_TOKEN }
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error && data.error.message || '查询失败');
        }

        if (!data.records || data.records.length === 0) {
            return res.status(404).json({ error: '未找到该柜员号，请检查后重试' });
        }

        const fields = data.records[0].fields;
        return res.status(200).json({
            tellerNumber: tellerNumber,
            userName: fields['姓名'] || '',
            ygxs: fields['ygxs'] || ''
        });

    } catch (error) {
        console.error('查询柜员号失败:', error);
        return res.status(500).json({ error: error.message });
    }
};
