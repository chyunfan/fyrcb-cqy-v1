// 管理后台：导出 CSV 明细
// GET /api/admin-export?token=xxx&route=xxx&month=xxx
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const TABLE_NAME = 'cqy_q1';

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { token, route, month, signedUp } = req.query;
    if (token !== ADMIN_TOKEN) return res.status(401).json({ error: '无权限' });
    if (!AIRTABLE_BASE_ID || !AIRTABLE_TOKEN) return res.status(500).json({ error: 'Airtable 配置未设置' });

    try {
        // 构建筛选条件
        const conditions = [];
        if (route) conditions.push("FIND('" + route + "', {旅行线路})");
        if (month) conditions.push("{月份}='" + month + "'");
        // 是否报名筛选（默认"是"，只导出已报名）
        if (signedUp === '是') {
            conditions.push('LEN({旅行线路}) > 0');
        } else if (signedUp === '否') {
            conditions.push('LEN({旅行线路}) = 0');
        }
        let url = 'https://api.airtable.com/v0/' + AIRTABLE_BASE_ID + '/' + encodeURIComponent(TABLE_NAME) + '?pageSize=100';
        if (conditions.length > 0) {
            url += '&filterByFormula=' + encodeURIComponent('AND(' + conditions.join(',') + ')');
        }

        // 分页取全部记录
        let allRecords = [];
        let offset = null;
        do {
            let pageUrl = url;
            if (offset) pageUrl += '&offset=' + encodeURIComponent(offset);
            const resp = await fetch(pageUrl, { headers: { 'Authorization': 'Bearer ' + AIRTABLE_TOKEN } });
            const data = await resp.json();
            if (!resp.ok) throw new Error((data.error && data.error.message) || '查询失败');
            allRecords = allRecords.concat(data.records || []);
            offset = data.offset || null;
        } while (offset);

        // 生成 CSV（含 BOM，Excel 打开中文不乱码）
        const BOM = '\uFEFF';
        const headers = ['柜员号', '姓名', 'ygxs', '旅行线路', '月份', '家庭成员人数', '备注', '是否允许修改', '提交时间'];
        const rows = allRecords.map(function(r) {
            const f = r.fields;
            return [
                f['柜员号'] || '',
                f['姓名'] || '',
                f['ygxs'] || '',
                f['旅行线路'] || '',
                f['月份'] || '',
                f['家庭成员人数'] || '',
                (f['备注'] || '').replace(/"/g, '""'),
                f['是否允许修改'] || '是',
                f['提交时间'] || ''
            ];
        });

        // 转义 CSV 字段
        function csvEscape(val) {
            var str = String(val);
            if (str.indexOf(',') !== -1 || str.indexOf('"') !== -1 || str.indexOf('\n') !== -1) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        }

        let csv = BOM + headers.map(csvEscape).join(',') + '\n';
        rows.forEach(function(row) {
            csv += row.map(csvEscape).join(',') + '\n';
        });

        const fileName = '春秋游报名明细_' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '.csv';

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="' + fileName + '"');
        return res.status(200).send(csv);

    } catch (err) {
        console.error('admin-export 失败:', err);
        res.status(500).json({ error: err.message });
    }
};
