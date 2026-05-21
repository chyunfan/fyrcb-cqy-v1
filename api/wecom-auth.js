// 企业微信 OAuth 代理
// GET /api/wecom-auth?code=xxx
// 流程：获取 AccessToken -> 用 code 换 UserId -> 用 UserId 获取完整用户信息（含柜员号）

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
        
        // Step 3: 用 UserId 获取完整用户信息（含姓名、自定义字段柜员号）
        const detailUrl = `https://qyapi.weixin.qq.com/cgi-bin/user/get?access_token=${accessToken}&userid=${userId}`;
        const detailResponse = await fetch(detailUrl);
        const detailData = await detailResponse.json();
        
        if (detailData.errcode && detailData.errcode !== 0) {
            throw new Error(detailData.errmsg || '获取用户详情失败');
        }
        
        // 解析用户信息
        // 姓名：直接取 name
        const userName = detailData.name || '';
        
        // 柜员号：可能在 extattr（自定义字段）中
        // 企业微信自定义字段格式：{ attrs: [ { name: '柜员号', value: '8051797', type: 0 } ] }
        let tellerNumber = '';
        if (detailData.extattr && detailData.extattr.attrs) {
            const attr = detailData.extattr.attrs.find(a => a.name === '柜员号');
            if (attr) {
                tellerNumber = attr.value;
            }
        }
        
        // 如果 extattr 中没有，尝试其他可能的位置
        if (!tellerNumber && detailData.external_profile && detailData.external_profile.external_attr) {
            const attr = detailData.external_profile.external_attr.find(a => a.name === '柜员号');
            if (attr) {
                tellerNumber = attr.value;
            }
        }
        
        // 备用：如果没有找到柜员号，使用 UserId（可能数字格式本身就是柜员号）
        if (!tellerNumber) {
            // 如果 UserId 是纯数字，可能就是柜员号
            if (/^\d+$/.test(userId)) {
                tellerNumber = userId;
            }
        }
        
        return res.status(200).json({
            userId: tellerNumber || userId,  // 返回柜员号（如果获取到）
            userName: userName,
            rawUserId: userId,  // 原始 UserId（调试用）
            detail: detailData  // 完整用户信息（调试用，生产环境可移除）
        });
        
    } catch (error) {
        console.error('企业微信授权失败:', error);
        return res.status(500).json({ error: error.message });
    }
};
