// ============================================
// Airtable API 配置模板
// 复制此文件为 config.js 并填写实际值
// ============================================

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || '';
const AIRTABLE_TABLE = 'cqy_q1'; // 表名单独配置，不从环境变量读取

const WECOM_CORPID = process.env.WECOM_CORPID || '';
const WECOM_SECRET = process.env.WECOM_SECRET || '';

module.exports = {
    AIRTABLE_BASE_ID,
    AIRTABLE_TOKEN,
    AIRTABLE_TABLE,
    WECOM_CORPID,
    WECOM_SECRET
};
