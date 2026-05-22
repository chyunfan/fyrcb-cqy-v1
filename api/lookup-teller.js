// 合并查询：根据柜员号同时查询 tell_info 和 cqy_q1
// GET /api/lookup-teller?tellerNumber=xxxxx
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

const TELL_INFO_TABLE = 'tell_info';
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

        // 并行查询 tell_info 和 cqy_q1
        const [tellResp, cqyResp] = await Promise.all([
            fetch(baseUrl + '/' + encodeURIComponent(TELL_INFO_TABLE) + '?filterByFormula=' + encodeURIComponent('{柜员号}=' + num), {
                headers: { 'Authorization': 'Bearer ' + AIRTABLE_TOKEN }
            }),
            fetch(baseUrl + '/' + encodeURIComponent(CQY_Q1_TABLE) + '?filterByFormula=' + encodeURIComponent('{柜员号}=' + num), {
                headers: { 'Authorization': 'Bearer ' + AIRTABLE_TOKEN }
            })
        ]);

        const tellData = await tellResp.json();
        const cqyData = await cqyResp.json();

        if (!tellResp.ok) {
            throw new Error(tellData.error && tellData.error.message || '查询 tell_info 失败');
        }

        if (!cqyResp.ok) {
            throw new Error(cqyData.error && cqyData.error.message || '查询 cqy_q1 失败');
        }

        // tell_info 结果
        let result = {
            tellerNumber: tellerNumber,
            userName: '',
            ygxs: '',
            existingRecord: null
        };

        if (tellData.records && tellData.records.length > 0) {
            const fields = tellData.records[0].fields;
            result.userName = fields['姓名'] || '';
            result.ygxs = fields['ygxs'] || '';
        } else {
            return res.status(404).json({ error: '未找到该柜员号，请检查后重试' });
        }

        // cqy_q1 结果
        if (cqyData.records && cqyData.records.length > 0) {
            const record = cqyData.records[0];
            result.existingRecord = {
                id: record.id,
                fields: record.fields,
                allowEdit: record.fields['是否允许修改'] !== '否'
            };
        }

        return res.status(200).json(result);

    } catch (error) {
        console.error('合并查询失败:', error);
        return res.status(500).json({ error: error.message });
    }
};
