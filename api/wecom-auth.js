// 企业微信 OAuth 代理
// GET /api/wecom-auth?code=xxx
const { WECOM_CORPID, WECOM_SECRET } = require('./config');

module.exports = async (req, res) => {
    // 设置 CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    const { code } = req.query;
    
    if (!code) {
        return res.status(400).json({ error: '缺少code参数' });
    }
    
    try {
        // 获取 Access Token
        const tokenUrl = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${WECOM_CORPID}&corpsecret=${WECOM_SECRET}`;
        const tokenResponse = await fetch(tokenUrl);
        const tokenData = await tokenResponse.json();
        
        if (tokenData.errcode) {
            throw new Error(tokenData.errmsg || '获取AccessToken失败');
        }
        
        const accessToken = tokenData.access_token;
        
        // 获取用户信息
        const userUrl = `https://qyapi.weixin.qq.com/cgi-bin/user/getuserinfo?access_token=${accessToken}&code=${code}`;
        const userResponse = await fetch(userUrl);
        const userData = await userResponse.json();
        
        if (userData.errcode && userData.errcode !== 0) {
            throw new Error(userData.errmsg || '获取用户信息失败');
        }
        
        const userId = userData.UserId;
        const userName = userData.name || userData.UserId;
        
        return res.status(200).json({
            userId: userId,
            userName: userName
        });
        
    } catch (error) {
        console.error('企业微信授权失败:', error);
        return res.status(500).json({ error: error.message });
    }
};
