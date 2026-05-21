// 企业微信 OAuth 代理
// GET /api/wecom-auth?code=xxx
// 流程：获取 AccessToken -> 用 code 换 UserId -> 用 UserId 获取完整用户信息

module.exports = async (req, res) => {
    // 设置 CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // 获取环境变量
    const WECOM_CORPID = process.env.WECOM_CORPID;
    const WECOM_SECRET = process.env.WECOM_SECRET;
    
    if (!WECOM_CORPID || !WECOM_SECRET) {
        return res.status(500).json({ error: '企业微信配置未设置' });
    }
    
    const { code } = req.query;
    
    if (!code) {
        return res.status(400).json({ error: '缺少code参数' });
    }
    
    try {
        // Step 1: 获取 Access Token
        const tokenUrl = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${WECOM_CORPID}&corpsecret=${WECOM_SECRET}`;
        const tokenResponse = await fetch(tokenUrl);
        const tokenData = await tokenResponse.json();
        
        if (tokenData.errcode) {
            throw new Error(tokenData.errmsg || '获取AccessToken失败');
        }
        
        const accessToken = tokenData.access_token;
        
        // Step 2: 用 code 换取 UserId
        const userUrl = `https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=${accessToken}&code=${code}`;
        const userResponse = await fetch(userUrl);
        const userData = await userResponse.json();
        
        if (userData.errcode && userData.errcode !== 0) {
            throw new Error(userData.errmsg || '获取用户信息失败');
        }
        
        const userId = userData.userid;
        
        // Step 3: 用 UserId 获取完整用户信息（含姓名、柜员号）
        const detailUrl = `https://qyapi.weixin.qq.com/cgi-bin/user/get?access_token=${accessToken}&userid=${userId}`;
        const detailResponse = await fetch(detailUrl);
        const detailData = await detailResponse.json();
        
        if (detailData.errcode && detailData.errcode !== 0) {
            throw new Error(detailData.errmsg || '获取用户详情失败');
        }
        
        // 解析用户信息
        const userName = detailData.name || '';
        
        // 柜员号：可能在 extattr（自定义字段）中
        let tellerNumber = '';
        if (detailData.extattr && detailData.extattr.attrs) {
            const attr = detailData.extattr.attrs.find(a => a.name === '柜员号');
            if (attr) {
                tellerNumber = attr.value;
            }
        }
        
        return res.status(200).json({
            userId: userId,              // 企业微信 UserId（用于查询/存储）
            userName: userName,          // 姓名
            tellerNumber: tellerNumber   // 柜员号（用于展示）
        });
        
    } catch (error) {
        console.error('企业微信授权失败:', error);
        return res.status(500).json({ error: error.message });
    }
};
