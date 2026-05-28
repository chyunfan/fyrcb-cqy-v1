// 管理后台：导出 CSV 明细（Supabase 版）
// GET /api/admin-export?token=xxx&route=xxx&month=xxx&signedUp=是
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
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
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'Supabase 配置未设置' });

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // 构建查询
        let query = supabase
            .from(TABLE_NAME)
            .select('*');

        // 应用筛选条件
        if (route) {
            query = query.ilike('旅行线路', '%' + route + '%');
        }
        if (month) {
            query = query.eq('月份', month);
        }
        // 是否报名筛选
        if (signedUp === '是') {
            query = query.not('旅行线路', 'is', null);
            query = query.neq('旅行线路', '');
        } else if (signedUp === '否') {
            query = query.or('旅行线路.is.null,旅行线路.eq.""');
        }

        const { data, error } = await query;

        if (error) throw new Error('查询失败：' + error.message);

        const allRecords = data || [];

        // 生成 CSV（含 BOM，Excel 打开中文不乱码）
        const BOM = '\uFEFF';
        const headers = ['柜员号', '姓名', 'ygxs', '旅行线路', '月份', '家庭成员人数', '备注', '是否允许修改', '提交时间'];
        const rows = allRecords.map(function(r) {
            return [
                r['柜员号'] || '',
                r['姓名'] || '',
                r['ygxs'] || '',
                r['旅行线路'] || '',
                r['月份'] || '',
                r['家庭成员人数'] || '',
                (r['备注'] || '').replace(/"/g, '""'),
                r['是否允许修改'] || '是',
                r['created_at'] || ''  // Supabase 中的创建时间字段
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
        // RFC 5987 编码中文文件名，兼容所有浏览器
        const encodedFileName = encodeURIComponent(fileName);

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="export.csv"; filename*=UTF-8\'' + encodedFileName);
        return res.status(200).send(csv);

    } catch (err) {
        console.error('admin-export 失败:', err);
        res.status(500).json({ error: err.message });
    }
};
