// chat.js - 对话式填单逻辑（状态机 + 关键词匹配）

// ========== 状态定义 ==========
const STATE = {
    TELLER:  'TELLER',   // 询问柜员号
    ROUTE:   'ROUTE',    // 询问旅行线路
    MONTH:   'MONTH',    // 询问月份
    FAMILY:  'FAMILY',   // 询问家属人数
    REMARK:  'REMARK',   // 询问备注
    CONFIRM: 'CONFIRM',  // 确认提交
    DONE:    'DONE'      // 已完成（遮罩）
};

let state = STATE.TELLER;
let data = {
    tellerNumber: '',
    userName: '',
    ygxs: '',
    route: '',
    month: '',
    family: 0,
    remark: '',
    recordId: null,
    allowEdit: true,
    isModifying: false   // 是否正在单项修改模式
};
let isProcessing = false; // 防连点

// ========== 初始化 ==========
window.addEventListener('DOMContentLoaded', function() {
    // 检查 sessionStorage 是否已有登录状态
    const saved = sessionStorage.getItem('cqy_teller');
    if (saved) {
        try {
            const info = JSON.parse(saved);
            data.tellerNumber = info.tellerNumber || '';
            data.userName    = info.userName    || '';
            data.ygxs        = info.ygxs        || '';
            data.recordId    = info.recordId    || null;
            data.allowEdit   = info.allowEdit   !== false;

            // 检查是否有报名记录
            if (info.existingRecord && info.existingRecord.fields) {
                const f = info.existingRecord.fields;
                data.route  = f['旅行线路'] || '';
                data.month  = f['月份']     || '';
                data.family = f['家庭成员人数'] != null ? f['家庭成员人数'] : 0;
                data.remark = f['备注'] || '';

                if (!data.allowEdit) {
                    state = STATE.DONE;
                    appendBotMsg('⚠️ 当前不允许修改报名信息，如需调整请联系管理员');
                    showReadonlyView();
                } else {
                    state = STATE.DONE;
                    showSubmittedView();
                }
            } else {
                state = STATE.ROUTE;
                askRoute();
            }

            appendBotMsg('✅ 欢迎回来，' + data.userName + '！');
            setHeaderStatus('已登录：' + data.userName);
            return;
        } catch(e) {}
    }

    // 未登录，开始流程
    state = STATE.TELLER;
    appendBotMsg('👋 您好！我是春秋游报名助手。');
    setTimeout(function() { askTellerNumber(); }, 500);
});

// ========== 发送消息 ==========
function onSend() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg || isProcessing) return;
    input.value = '';
    appendUserMsg(msg);
    processUserInput(msg);
}

// 回车发送
document.getElementById('chatInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        onSend();
    }
});

// ========== 处理用户输入（全局关键词监听）==========
function processUserInput(msg) {
    if (isProcessing) return;
    isProcessing = true;
    setInputDisabled(true);

    // 优先级0：修改意图识别（必须在附件之前，避免"修改线路"被误判）
    const modifyField = matchModifyKeyword(msg);
    if (modifyField) {
        isProcessing = false;
        setInputDisabled(false);
        startModify(modifyField);
        return;
    }

    // 优先级0.5：查看有哪些线路（展示所有线路列表）
    if (matchShowAllRoutes(msg)) {
        isProcessing = false;
        setInputDisabled(false);
        showAllRoutes();
        return;
    }

    // 优先级1：查看附件关键词（已收紧：必须明确表达查看附件意图）
    if (matchAttachmentKeyword(msg)) {
        const route = matchRouteKeyword(msg);
        isProcessing = false;
        setInputDisabled(false);
        showAttachment(route);
        return;
    }

    // 优先级2：查看已提交报名信息
    if (matchCheckInfo(msg)) {
        isProcessing = false;
        setInputDisabled(false);
        showExistingInfo();
        return;
    }

    // 优先级3：重置流程（重新输入柜员号）
    if (matchReset(msg)) {
        isProcessing = false;
        setInputDisabled(false);
        doReset();
        return;
    }

    // 优先级4：DONE 状态下输入有效柜员号 → 重新验证（允许修改）
    if (state === STATE.DONE && validateTellerNumber(msg.trim())) {
        isProcessing = false;
        setInputDisabled(false);
        appendBotMsg('🔄 重新验证柜员号...');
        handleTellerNumber(msg);
        return;
    }

    // 优先级5：正常流程
    switch (state) {
        case STATE.TELLER:
            handleTellerNumber(msg);
            break;
        case STATE.ROUTE:
            handleRoute(msg);
            break;
        case STATE.MONTH:
            handleMonth(msg);
            break;
        case STATE.FAMILY:
            handleFamily(msg);
            break;
        case STATE.REMARK:
            handleRemark(msg);
            break;
        case STATE.CONFIRM:
            handleConfirm(msg);
            break;
        case STATE.DONE:
            // DONE 状态下不识别的输入，提示用户可以说什么
            appendBotMsg('💡 您可以说："修改线路""修改时间""修改人数""修改备注"，或重新输入柜员号');
            isProcessing = false;
            setInputDisabled(false);
            break;
        default:
            isProcessing = false;
            setInputDisabled(false);
    }
}

// ========== 修改意图识别 ==========
// 返回：'route' | 'month' | 'family' | 'remark' | 'choose' | null
function matchModifyKeyword(msg) {
    const lower = msg.toLowerCase();

    // 必须包含"修改"或"改"
    if (!lower.includes('修改') && !lower.includes('改')) return null;

    // 模糊说"修改"（没有指定改哪项）
    if (lower === '修改' || lower === '改一下' || lower === '我想修改') {
        return 'choose';
    }

    if (lower.includes('线路') || lower.includes('路线') || lower.includes('旅游') || lower.includes('旅行')) {
        return 'route';
    }
    if (lower.includes('时间') || lower.includes('月份') || lower.includes('月')) {
        return 'month';
    }
    if (lower.includes('人数') || lower.includes('家属') || lower.includes('同行') || lower.includes('带')) {
        return 'family';
    }
    if (lower.includes('备注') || lower.includes('留言') || lower.includes('说明')) {
        return 'remark';
    }

    // 包含"修改"但没有识别到具体项
    return 'choose';
}

// 开始单项修改
function startModify(field) {
    if (!data.tellerNumber) {
        appendBotMsg('⚠️ 请先告诉我您的柜员号');
        return;
    }
    if (!data.allowEdit) {
        appendBotMsg('⚠️ 当前不允许修改报名信息，如需调整请联系管理员');
        return;
    }

    if (field === 'choose') {
        showModifyOptions();
        return;
    }

    data.isModifying = true;
    data.modifyField = field;

    switch (field) {
        case 'route':
            state = STATE.ROUTE;
            appendBotMsg('🤖 请选择新的线路：');
            showRouteButtons();
            break;
        case 'month':
            state = STATE.MONTH;
            appendBotMsg('🤖 请选择新的月份：');
            showMonthButtons();
            break;
        case 'family':
            state = STATE.FAMILY;
            appendBotMsg('🤖 请选择新的家属人数（<span class="warning">不含本人</span>）：');
            showFamilyButtons();
            break;
        case 'remark':
            state = STATE.REMARK;
            appendBotMsg('🤖 请输入新的备注（选填，没有请说"无"）：');
            break;
    }
}

// 展示修改选项
function showModifyOptions() {
    let html = '<div class="confirm-card">';
    html += '<div class="card-title">✏️ 请选择要修改的项：</div>';
    html += '<div class="btn-group">';
    html += '<button class="chat-btn" onclick="handleModifyChoice(\'route\')">🗺️ 修改线路</button>';
    html += '<button class="chat-btn" onclick="handleModifyChoice(\'month\')">📅 修改月份</button>';
    html += '<button class="chat-btn" onclick="handleModifyChoice(\'family\')">👨👩👧 修改家属人数</button>';
    html += '<button class="chat-btn" onclick="handleModifyChoice(\'remark\')">📝 修改备注</button>';
    html += '</div>';
    html += '<div class="hint">或说"重新报名"走完整流程</div>';
    html += '</div>';
    appendBotMsg(html);
}

function handleModifyChoice(choice) {
    data.isModifying = true;
    data.modifyField = choice;

    switch (choice) {
        case 'route':
            state = STATE.ROUTE;
            appendBotMsg('🤖 请选择新的线路：');
            showRouteButtons();
            break;
        case 'month':
            state = STATE.MONTH;
            appendBotMsg('🤖 请选择新的月份：');
            showMonthButtons();
            break;
        case 'family':
            state = STATE.FAMILY;
            appendBotMsg('🤖 请选择新的家属人数（<span class="warning">不含本人</span>）：');
            showFamilyButtons();
            break;
        case 'remark':
            state = STATE.REMARK;
            appendBotMsg('🤖 请输入新的备注（选填，没有请说"无"）：');
            break;
    }
    isProcessing = false;
    setInputDisabled(false);
}

// ========== 各状态处理函数 ==========

// --- S1：询问柜员号 ---
function askTellerNumber() {
    appendBotMsg('🤖 请告诉我您的柜员号：');
    setHeaderStatus('等待输入柜员号');
}

function handleTellerNumber(msg) {
    const num = msg.trim();
    if (!validateTellerNumber(num)) {
        appendBotMsg('⚠️ 柜员号格式不正确，范围：8050003 ~ 8053999\n请重新输入：');
        isProcessing = false;
        setInputDisabled(false);
        return;
    }

    appendBotMsg('⏳ 正在验证柜员号...');
    setHeaderStatus('正在验证...');

    fetch('/api/lookup-teller?tellerNumber=' + encodeURIComponent(num))
        .then(function(res) { return res.json(); })
        .then(function(result) {
            if (result.error) {
                appendBotMsg('❌ ' + result.error + '\n请重新输入柜员号：');
                isProcessing = false;
                setInputDisabled(false);
                return;
            }

            // 保存用户信息
            data.tellerNumber = result.tellerNumber;
            data.userName = result.userName || '';
            data.ygxs = result.ygxs || '';

            // 保存到 sessionStorage
            saveTellerState(result);

            appendBotMsg('✅ 验证成功，' + data.userName + '！');
            setHeaderStatus('已登录：' + data.userName);

            if (result.existingRecord) {
                // 已有报名记录
                data.recordId = result.existingRecord.id;
                data.allowEdit = result.existingRecord.allowEdit;

                const f = result.existingRecord.fields;
                data.route  = f['旅行线路'] || '';
                data.month  = f['月份']     || '';
                data.family = f['家庭成员人数'] != null ? f['家庭成员人数'] : 0;
                data.remark = f['备注'] || '';

                if (!data.allowEdit) {
                    state = STATE.DONE;
                    setTimeout(function() {
                        appendBotMsg('⚠️ 当前不允许修改报名信息，如需调整请联系管理员');
                        showReadonlyView();
                        isProcessing = false;
                        setInputDisabled(false);
                    }, 600);
                    return;
                }

                // 已报名，展示信息
                state = STATE.DONE;
                setTimeout(function() {
                    showSubmittedView();
                    isProcessing = false;
                    setInputDisabled(false);
                }, 600);
                return;
            }

            // 未报名，进入选线路
            state = STATE.ROUTE;
            setTimeout(function() {
                askRoute();
                isProcessing = false;
                setInputDisabled(false);
            }, 600);
        })
        .catch(function(err) {
            appendBotMsg('❌ 验证失败：' + err.message + '\n请稍后重试：');
            isProcessing = false;
            setInputDisabled(false);
        });
}

// --- S2：询问线路 ---
function askRoute() {
    appendBotMsg('🤖 请选择旅行线路：');
    showRouteButtons();
    setHeader('请选择旅行线路');
}

function handleRoute(msg) {
    const route = matchRouteKeyword(msg);
    if (!route) {
        appendBotMsg('⚠️ 未能识别路线，请从以下选项中选择：');
        showRouteButtons();
        isProcessing = false;
        setInputDisabled(false);
        return;
    }

    data.route = route;
    appendBotMsg('✅ 已选择：<span class="highlight">' + route + '</span>');

    // 修改模式：直接保存
    if (data.isModifying) {
        doPatchAndShow('线路已更新为：' + route);
        return;
    }

    state = STATE.MONTH;
    setTimeout(function() {
        askMonth();
        isProcessing = false;
        setInputDisabled(false);
    }, 500);
}

// --- S3：询问月份 ---
function askMonth() {
    appendBotMsg('🤖 请选择预计出行月份：');
    showMonthButtons();
    setHeader('请选择月份');
}

function handleMonth(msg) {
    const month = matchMonthKeyword(msg);
    if (!month) {
        appendBotMsg('⚠️ 未能识别月份，请从以下选项中选择：');
        showMonthButtons();
        isProcessing = false;
        setInputDisabled(false);
        return;
    }

    data.month = month;
    appendBotMsg('✅ 已选择：<span class="highlight">' + month + '</span>');

    // 修改模式：直接保存
    if (data.isModifying) {
        doPatchAndShow('月份已更新为：' + month);
        return;
    }

    state = STATE.FAMILY;
    setTimeout(function() {
        askFamily();
        isProcessing = false;
        setInputDisabled(false);
    }, 500);
}

// --- S4：询问家属人数 ---
function askFamily() {
    appendBotMsg('🤖 请选择家庭随行人数（<span class="warning">不含本人</span>）：');
    showFamilyButtons();
    setHeader('请选择家属人数');
}

function handleFamily(msg) {
    const family = parseFamilyNumber(msg);
    if (family === null) {
        appendBotMsg('⚠️ 未能识别人数，请选择：');
        showFamilyButtons();
        isProcessing = false;
        setInputDisabled(false);
        return;
    }

    data.family = family;
    const text = family === 0 ? '0人（仅本人）' : family + '人';
    appendBotMsg('✅ 已选择：<span class="highlight">' + text + '</span>');

    // 修改模式：直接保存
    if (data.isModifying) {
        doPatchAndShow('家属人数已更新为：' + text);
        return;
    }

    state = STATE.REMARK;
    setTimeout(function() {
        askRemark();
        isProcessing = false;
        setInputDisabled(false);
    }, 500);
}

// --- S5：询问备注 ---
function askRemark() {
    appendBotMsg('🤖 有其他需要备注的信息吗？（选填，没有请说"无"）');
    setHeader('备注（选填）');
}

function handleRemark(msg) {
    data.remark = (msg === '无' || msg === '没有' || msg === '不需要') ? '' : msg;
    if (data.remark) {
        appendBotMsg('✅ 备注已记录：<span class="highlight">' + data.remark + '</span>');
    } else {
        appendBotMsg('✅ 已确认：无备注');
    }

    // 修改模式：直接保存
    if (data.isModifying) {
        const remarkText = data.remark || '无';
        doPatchAndShow('备注已更新为：' + remarkText);
        return;
    }

    state = STATE.CONFIRM;
    setTimeout(function() {
        showConfirm();
        isProcessing = false;
        setInputDisabled(false);
    }, 500);
}

// --- S6：确认提交 ---
function showConfirm() {
    const familyText = data.family === 0 ? '0人（仅本人）' : data.family + '人';
    const remarkText = data.remark || '无';

    let html = '<div class="confirm-card">';
    html += '<div class="card-title">📋 请确认报名信息：</div>';
    html += '<div class="info-row"><span class="label">柜员号：</span><span class="value">' + data.tellerNumber + '</span></div>';
    html += '<div class="info-row"><span class="label">姓名：</span><span class="value">' + data.userName + '</span></div>';
    html += '<div class="info-row"><span class="label">线路：</span><span class="value">' + data.route + '</span></div>';
    html += '<div class="info-row"><span class="label">月份：</span><span class="value">' + data.month + '</span></div>';
    html += '<div class="info-row"><span class="label">家属人数：</span><span class="value">' + familyText + '</span></div>';
    html += '<div class="info-row"><span class="label">备注：</span><span class="value">' + remarkText + '</span></div>';
    html += '<div class="btn-group">';
    html += '<button class="chat-btn primary" onclick="handleConfirmClick(true)">✅ 确认提交</button>';
    html += '<button class="chat-btn" onclick="handleConfirmClick(false)">✏️ 修改</button>';
    html += '</div></div>';

    appendBotMsg(html);
    setHeader('请确认报名信息');
}

function handleConfirm(msg) {
    if (typeof msg === 'string') {
        if (msg.includes('确认') || msg.includes('提交')) {
            doSubmit();
        } else {
            doResetFlow();
        }
        return;
    }
}

function handleConfirmClick(confirm) {
    if (confirm) {
        appendUserMsg('确认');
        doSubmit();
    } else {
        appendUserMsg('修改');
        doResetFlow();
    }
}

// ========== 提交（首次或重新报名）==========
function doSubmit() {
    appendBotMsg('⏳ 正在提交报名信息...');
    setHeader('正在提交...');
    isProcessing = true;
    setInputDisabled(true);

    const body = {
        tellerNumber: data.tellerNumber,
        userName: data.userName,
        ygxs: data.ygxs,
        route: data.route,
        month: data.month,
        family: data.family,
        remark: data.remark
    };

    fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })
    .then(function(res) { return res.json(); })
    .then(function(result) {
        if (result.error) {
            appendBotMsg('❌ 提交失败：' + result.error);
            isProcessing = false;
            setInputDisabled(false);
            return;
        }

        appendBotMsg('🎉 <span class="success">提交成功！</span>');
        state = STATE.DONE;

        setTimeout(function() {
            showSubmittedView();
            isProcessing = false;
            setInputDisabled(false);
        }, 600);
    })
    .catch(function(err) {
        appendBotMsg('❌ 提交失败：' + err.message);
        isProcessing = false;
        setInputDisabled(false);
    });
}

// ========== 单项修改后保存 ==========
function doPatchAndShow(successMsg) {
    appendBotMsg('⏳ 正在保存...');
    setHeader('正在保存...');
    isProcessing = true;
    setInputDisabled(true);

    const body = {
        tellerNumber: data.tellerNumber,
        userName: data.userName,
        ygxs: data.ygxs,
        route: data.route,
        month: data.month,
        family: data.family,
        remark: data.remark
    };

    fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })
    .then(function(res) { return res.json(); })
    .then(function(result) {
        if (result.error) {
            appendBotMsg('❌ 保存失败：' + result.error);
            data.isModifying = false;
            isProcessing = false;
            setInputDisabled(false);
            return;
        }

        appendBotMsg('✅ ' + successMsg);
        data.isModifying = false;

        // 更新 sessionStorage
        updateSessionStorage();

        state = STATE.DONE;
        setTimeout(function() {
            showSubmittedView();
            isProcessing = false;
            setInputDisabled(false);
        }, 600);
    })
    .catch(function(err) {
        appendBotMsg('❌ 保存失败：' + err.message);
        data.isModifying = false;
        isProcessing = false;
        setInputDisabled(false);
    });
}

// ========== 展示提交后视图 ==========
function showSubmittedView() {
    const familyText = data.family === 0 ? '0人（仅本人）' : data.family + '人';

    let html = '<div class="confirm-card">';
    html += '<div class="card-title success">✅ 您已提交报名</div>';
    html += '<div class="info-row"><span class="label">线路：</span><span class="value">' + data.route + '</span></div>';
    html += '<div class="info-row"><span class="label">月份：</span><span class="value">' + data.month + '</span></div>';
    html += '<div class="info-row"><span class="label">家属人数：</span><span class="value">' + familyText + '</span></div>';
    if (data.remark) {
        html += '<div class="info-row"><span class="label">备注：</span><span class="value">' + data.remark + '</span></div>';
    }
    html += '<div class="hint">如需修改，请说"修改线路"等，或重新输入柜员号</div>';

    if (data.allowEdit) {
        html += '<div class="btn-group">';
        html += '<button class="chat-btn" onclick="handleModifyChoice(\'route\')">修改线路</button>';
        html += '<button class="chat-btn" onclick="handleModifyChoice(\'month\')">修改月份</button>';
        html += '<button class="chat-btn" onclick="handleModifyChoice(\'family\')">修改人数</button>';
        html += '<button class="chat-btn" onclick="handleModifyChoice(\'remark\')">修改备注</button>';
        html += '</div>';
        html += '<div class="btn-wrapper">';
        html += '<button class="chat-btn" onclick="doResetFlow()">🔄 重新报名（走完整流程）</button>';
        html += '</div>';
    }

    html += '<div class="btn-wrapper">';
    html += '<button class="chat-btn" onclick="doReset()">🔄 切换柜员号</button>';
    html += '</div>';
    html += '</div>';

    appendBotMsg(html);
    setHeader('已提交报名');
}

function showReadonlyView() {
    const familyText = data.family === 0 ? '0人（仅本人）' : data.family + '人';

    let html = '<div class="confirm-card readonly">';
    html += '<div class="card-title warning">⚠️ 当前不允许修改</div>';
    html += '<div class="info-row"><span class="label">线路：</span><span class="value">' + data.route + '</span></div>';
    html += '<div class="info-row"><span class="label">月份：</span><span class="value">' + data.month + '</span></div>';
    html += '<div class="info-row"><span class="label">家属人数：</span><span class="value">' + familyText + '</span></div>';
    if (data.remark) {
        html += '<div class="info-row"><span class="label">备注：</span><span class="value">' + data.remark + '</span></div>';
    }
    html += '<div class="readonly-hint">如需调整，请联系管理员</div>';
    html += '<div class="btn-wrapper">';
    html += '<button class="chat-btn" onclick="doReset()">🔄 切换柜员号</button>';
    html += '</div>';
    html += '</div>';

    appendBotMsg(html);
    setHeader('不允许修改');
}

// ========== 重置流程 ==========
function doResetFlow() {
    data.isModifying = false;
    data.route  = '';
    data.month  = '';
    data.family = 0;
    data.remark = '';
    state = STATE.ROUTE;
    appendBotMsg('✏️ 好的，我们重新填写。');
    setTimeout(function() { askRoute(); }, 500);
}

function doReset() {
    sessionStorage.removeItem('cqy_teller');
    data = {
        tellerNumber: '', userName: '', ygxs: '',
        route: '', month: '', family: 0, remark: '',
        recordId: null, allowEdit: true,
        isModifying: false
    };
    state = STATE.TELLER;
    appendBotMsg('🔄 已重置，请重新输入柜员号：');
    setHeader('等待输入柜员号');
    setTimeout(function() { askTellerNumber(); }, 500);
}

// ========== 全局关键词匹配 ==========

// 匹配"查看所有线路列表"意图
function matchShowAllRoutes(msg) {
    const keywords = ['有哪些线路', '有什么线路', '线路列表', '所有线路', '全部线路', '几条线路', '查看线路', '线路介绍', '看下线路', '看线路', '看其它线路', '其它线路', '看所有'];
    const lower = msg.toLowerCase();
    return keywords.some(function(kw) { return lower.includes(kw); });
}

// 匹配路线关键词 → 返回路线名或 null
function matchRouteKeyword(msg) {
    const routeMap = {
        '江西庐山3天2晚': ['庐山', '江西'],
        '福建厦门3天2晚': ['厦门', '福建'],
        '上海2天1晚': ['上海'],
        '泰顺苍南3天2晚': ['泰顺', '苍南'],
        '宁海3天2晚': ['宁海'],
        '台州椒江3天2晚': ['台州', '椒江']
    };
    const lower = msg.toLowerCase();
    for (let [route, keywords] of Object.entries(routeMap)) {
        for (let kw of keywords) {
            if (lower.includes(kw.toLowerCase())) return route;
        }
    }
    return null;
}

// 匹配附件关键词（收紧：必须明确表达查看附件意图，且不包含"修改"）
function matchAttachmentKeyword(msg) {
    const lower = msg.toLowerCase();
    // 如果包含"修改"或"改"，不是查看附件意图
    if (lower.includes('修改') || lower.includes('改')) return false;
    // 附件相关词（宽泛：包含"看下""看看"等自然语言）
    const attachKeywords = ['附件', '图片', 'pdf', '行程', '路线介绍', '路线详情', '看下', '看看', '看附件', '看图片', '看pdf', '看行程'];
    return attachKeywords.some(function(kw) { return lower.includes(kw); });
}

// 匹配查看报名信息关键词
function matchCheckInfo(msg) {
    const keywords = ['报名信息', '我报的', '查看报名', '我的报名', '提交的信息', '我报的什么'];
    const lower = msg.toLowerCase();
    return keywords.some(function(kw) { return lower.includes(kw); });
}

// 匹配重置关键词（重新输入柜员号）
function matchReset(msg) {
    const keywords = ['重新输入', '重新填写', '重新开始', '重置', '切换柜员'];
    const lower = msg.toLowerCase();
    return keywords.some(function(kw) { return lower.includes(kw); });
}

// 匹配月份关键词
function matchMonthKeyword(msg) {
    const months = ['6月', '7月', '8月'];
    for (let m of months) {
        if (msg.includes(m)) return m;
    }
    return null;
}

// 解析家属人数（上限2）
function parseFamilyNumber(msg) {
    if (msg === '0' || msg.includes('0人') || msg.includes('仅本人')) return 0;
    if (msg === '1' || msg.includes('1人') || msg.includes('一个孩子')) return 1;
    if (msg === '2' || msg.includes('2人') || msg.includes('两个孩子')) return 2;
    const match = msg.match(/(\d+)/);
    if (match) {
        const n = parseInt(match[1], 10);
        if (n >= 0 && n <= 2) return n;
    }
    return null;
}

// ========== 展示所有线路列表 ==========
function showAllRoutes() {
    let html = '<div class="confirm-card">';
    html += '<div class="card-title">🗺️ 可选线路（共6条）：</div>';
    html += '<div class="info-row"><span class="value">1. 江西庐山3天2晚</span></div>';
    html += '<div class="info-row"><span class="value">2. 福建厦门3天2晚</span></div>';
    html += '<div class="info-row"><span class="value">3. 上海2天1晚</span></div>';
    html += '<div class="info-row"><span class="value">4. 泰顺苍南3天2晚</span></div>';
    html += '<div class="info-row"><span class="value">5. 宁海3天2晚</span></div>';
    html += '<div class="info-row"><span class="value">6. 台州椒江3天2晚</span></div>';
    html += '<div class="hint">说「看一下厦门」等查看具体线路附件</div>';
    html += '<div class="btn-group">';
    html += '<button class="chat-btn primary" onclick="window.open(\'https://www.chyunfan.cn/attachments.html\', \'_blank\')">📋 查看所有线路附件</button>';
    html += '</div>';
    html += '</div>';
    appendBotMsg(html);
}

// ========== 展示附件 ==========
function showAttachment(route) {
    if (route) {
        const pdfUrl = 'https://www.chyunfan.cn/Route/pdf/' + encodeURIComponent(route) + '.pdf';
        const imgUrl = 'https://cyf-1435491785.cos.ap-guangzhou.myqcloud.com/Route/' + encodeURIComponent(route) + '/1.jpg';
        let html = '📎 <span class="highlight">' + route + '</span> 附件：';
        html += '<div class="btn-group">';
        html += '<button class="chat-btn" onclick="window.open(\'' + imgUrl + '\', \'_blank\')">🖼️ 查看图片</button>';
        html += '<button class="chat-btn" onclick="window.open(\'' + pdfUrl + '\', \'_blank\')">📄 下载PDF</button>';
        html += '</div>';
        appendBotMsg(html);
    } else {
        let html = '📎 查看各线路附件：';
        html += '<div class="btn-group">';
        html += '<button class="chat-btn primary" onclick="window.open(\'https://www.chyunfan.cn/attachments.html\', \'_blank\')">📋 查看所有线路附件</button>';
        html += '</div>';
        appendBotMsg(html);
    }
}

function showExistingInfo() {
    if (!data.tellerNumber) {
        appendBotMsg('⚠️ 请先告诉我您的柜员号');
        return;
    }
    if (!data.route) {
        appendBotMsg('⚠️ 您还没有报名，请先完成报名流程。');
        return;
    }

    const familyText = data.family === 0 ? '0人（仅本人）' : data.family + '人';
    let html = '<div class="confirm-card">';
    html += '<div class="card-title">📋 您的报名信息：</div>';
    html += '<div class="info-row"><span class="label">线路：</span><span class="value">' + data.route + '</span></div>';
    html += '<div class="info-row"><span class="label">月份：</span><span class="value">' + data.month + '</span></div>';
    html += '<div class="info-row"><span class="label">家属人数：</span><span class="value">' + familyText + '</span></div>';
    if (data.remark) html += '<div class="info-row"><span class="label">备注：</span><span class="value">' + data.remark + '</span></div>';
    html += '</div>';

    if (data.allowEdit) {
        html += '<div class="hint">如需修改，请说"修改线路"等</div>';
    }

    appendBotMsg(html);
}

// ========== 按钮生成 ==========
function showRouteButtons() {
    const routes = [
        '江西庐山3天2晚',
        '福建厦门3天2晚',
        '上海2天1晚',
        '泰顺苍南3天2晚',
        '宁海3天2晚',
        '台州椒江3天2晚'
    ];
    let html = '<div class="btn-group">';
    routes.forEach(function(r) {
        const short = r.replace('3天2晚', '').replace('2天1晚', '');
        html += '<button class="chat-btn" onclick="onBtnClick(\'' + r.replace(/'/g, "\\'") + '\')">' + short + '</button>';
    });
    html += '</div>';
    appendBotMsg(html);
}

function showMonthButtons() {
    const months = ['6月', '7月', '8月'];
    let html = '<div class="btn-group">';
    months.forEach(function(m) {
        html += '<button class="chat-btn" onclick="onBtnClick(\'' + m + '\')">' + m + '</button>';
    });
    html += '</div>';
    appendBotMsg(html);
}

function showFamilyButtons() {
    const families = [
        { val: 0, label: '0人' },
        { val: 1, label: '1人' },
        { val: 2, label: '2人' }
    ];
    let html = '<div class="btn-group">';
    families.forEach(function(f) {
        const text = f.val === 0 ? f.label + '（仅本人）' : f.label;
        html += '<button class="chat-btn" onclick="onBtnClick(\'' + f.val + '\')">' + text + '</button>';
    });
    html += '</div>';
    appendBotMsg(html);
}

// 按钮点击
function onBtnClick(val) {
    if (isProcessing) return;
    appendUserMsg(String(val));
    processUserInput(String(val));
}

// ========== 消息渲染 ==========
function appendBotMsg(html) {
    const container = document.getElementById('chatMessages');
    const div = document.createElement('div');
    div.className = 'message bot';
    div.innerHTML = '<div class="msg-avatar"><i class="fa-solid fa-robot"></i></div>' +
                    '<div class="msg-content">' + html + '</div>';
    container.appendChild(div);
    scrollToBottom();
}

function appendUserMsg(text) {
    const container = document.getElementById('chatMessages');
    const div = document.createElement('div');
    div.className = 'message user';
    div.innerHTML = '<div class="msg-avatar"><i class="fa-solid fa-user"></i></div>' +
                    '<div class="msg-content">' + escapeHtml(text) + '</div>';
    container.appendChild(div);
    scrollToBottom();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function scrollToBottom() {
    const container = document.getElementById('chatMessages');
    setTimeout(function() {
        container.scrollTop = container.scrollHeight;
    }, 50);
}

// ========== 工具函数 ==========
function setHeaderStatus(text) {
    const el = document.getElementById('headerStatus');
    if (el) el.textContent = text;
}

function setHeader(text) {
    setHeaderStatus(text);
}

function setInputDisabled(disabled) {
    document.getElementById('chatInput').disabled = disabled;
    document.getElementById('sendBtn').disabled = disabled;
}

function validateTellerNumber(num) {
    const n = parseInt(num, 10);
    return !isNaN(n) && n > 8050002 && n < 8054000;
}

function saveTellerState(result) {
    const state = {
        tellerNumber: result.tellerNumber,
        userName: result.userName,
        ygxs: result.ygxs,
        recordId: result.existingRecord ? result.existingRecord.id : null,
        allowEdit: result.existingRecord ? result.existingRecord.allowEdit : true,
        existingRecord: result.existingRecord || null
    };
    sessionStorage.setItem('cqy_teller', JSON.stringify(state));
}

function updateSessionStorage() {
    const saved = sessionStorage.getItem('cqy_teller');
    if (!saved) return;
    try {
        const state = JSON.parse(saved);
        if (state.existingRecord) {
            state.existingRecord.fields['旅行线路'] = data.route;
            state.existingRecord.fields['月份'] = data.month;
            state.existingRecord.fields['家庭成员人数'] = data.family;
            state.existingRecord.fields['备注'] = data.remark;
            sessionStorage.setItem('cqy_teller', JSON.stringify(state));
        }
    } catch(e) {}
}

// ========== Toast ==========
function showToast(msg, type) {
    const toast = document.getElementById('chatToast');
    toast.textContent = msg;
    toast.className = 'chat-toast show';
    setTimeout(function() {
        toast.className = 'chat-toast';
    }, 2500);
}
