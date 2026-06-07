/**
 * Survey 共用 JS — 员工工作状态调研问卷
 * 包含：LocalStorage/Cookie 双保险、填写页逻辑、管理后台逻辑
 */

// ========== 通用工具：LocalStorage + Cookie 双保险 ==========

const SURVEY_STORAGE_KEY = 'survey_submitted_2026';
const SURVEY_COOKIE_KEY = 'survey_submitted_2026';

function surveyGetCookie(name) {
  var m = document.cookie.match(new RegExp('(^| )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[2]) : null;
}

function surveySetCookie(name, value, days) {
  var d = new Date();
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = name + '=' + encodeURIComponent(value) + ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax';
}

function surveyHasLocalSubmitted() {
  if (localStorage.getItem(SURVEY_STORAGE_KEY) === '1') return true;
  if (surveyGetCookie(SURVEY_COOKIE_KEY) === '1') return true;
  return false;
}

function surveyMarkLocalSubmitted() {
  try { localStorage.setItem(SURVEY_STORAGE_KEY, '1'); } catch (e) {}
  surveySetCookie(SURVEY_COOKIE_KEY, '1', 365);
}

// ========== 填写页（survey-index.html）逻辑 ==========

function surveyInitForm() {
  var submittedMsg = document.getElementById('submittedMsg');
  var formArea = document.getElementById('formArea');
  if (!submittedMsg || !formArea) return; // 不在填写页则跳过

  // 先检查本地标记
  if (surveyHasLocalSubmitted()) {
    surveyShowSubmitted();
    return;
  }

  // 再检查后端是否已提交
  fetch('/api/survey/check')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (data.submitted) {
        surveyMarkLocalSubmitted();
        surveyShowSubmitted();
      } else {
        surveyShowForm();
      }
    })
    .catch(function () {
      surveyShowForm();
    });
}

function surveyShowForm() {
  var el = document.getElementById('formArea');
  if (el) el.style.display = 'block';
}

function surveyShowSubmitted() {
  var el = document.getElementById('submittedMsg');
  if (el) el.style.display = 'block';
  var form = document.getElementById('formArea');
  if (form) form.style.display = 'none';
}

function surveySubmitForm() {
  // 再次检查本地标记
  if (surveyHasLocalSubmitted()) {
    surveyShowSubmitted();
    return;
  }

  // 收集答案
  var answers = {};
  for (var i = 1; i <= 20; i++) {
    if (i === 20) {
      var ta = document.getElementById('q20');
      answers['q20'] = ta ? ta.value.trim() : '';
    } else {
      var inputs = document.querySelectorAll('input[name="q' + i + '"]:checked');
      if (inputs.length > 0) {
        answers['q' + i] = Array.from(inputs).map(function (r) { return r.value; }).join(',');
      }
    }
  }

  // 必填题校验
  var required = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
  var missing = [];
  required.forEach(function (q) {
    if (!answers['q' + q]) missing.push(q);
  });
  if (missing.length > 0) {
    surveyShowMsg('第 ' + missing.join('、') + ' 题未作答，请完成后再提交', 'error');
    var el = document.querySelector('[data-q="' + missing[0] + '"]');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  var btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = '提交中…';

  fetch('/api/survey/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      answers: answers,
      submittedAt: new Date().toISOString(),
    })
  })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (data.success) {
        surveyMarkLocalSubmitted();
        surveyShowSubmitted();
      } else {
        surveyShowMsg(data.message || '提交失败', 'error');
        btn.disabled = false;
        btn.textContent = '提交问卷';
      }
    })
    .catch(function () {
      surveyShowMsg('提交失败，请重试', 'error');
      btn.disabled = false;
      btn.textContent = '提交问卷';
    });
}

function surveyShowMsg(text, type) {
  var el = document.getElementById('msg');
  if (!el) return;
  el.style.display = 'block';
  el.className = 'msg msg-' + type;
  el.textContent = text;
}

// ========== 管理后台（survey-admin.html）逻辑 ==========

var SURVEY_QUESTION_MAP = {
  q1: '1、您的性别？',
  q2: '2、您的年龄段？',
  q3: '3、您目前从事的岗位类型？',
  q4: '4、您在本单位的工作年限？',
  q5: '5、您在当前岗位的工作年限？',
  q6: '6、专业经验与岗位匹配度？',
  q7: '7、是否清楚岗位职责？',
  q8: '8、遇到难题通常怎么做？',
  q9: '9、岗位工作安排存在问题？（多选）',
  q10: '10、工作积极性如何？',
  q11: '11、员工懈怠的主要原因？（多选）',
  q12: '12、工作压力来源？（多选）',
  q13: '13、面对成长机会的态度？',
  q14: '14、对薪资福利是否满意？',
  q15: '15、绩效考核机制是否合理？',
  q16: '16、调动积极性最有效方式？',
  q17: '17、考核激励机制存在问题？（多选）',
  q18: '18、未来发展是否有规划？',
  q19: '19、单位最需要优化内容？（多选）',
  q20: '20、建议或意见（简答）',
};

function surveyLoadRecords() {
  fetch('/api/survey/records')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      var records = data.records || [];

      document.getElementById('count').textContent = '共 ' + records.length + ' 条';

      // 统计
      var genderMap = {}, ageMap = {}, postMap = {};
      records.forEach(function (r) {
        var a = r.answers || {};
        if (a.q1) genderMap[a.q1] = (genderMap[a.q1] || 0) + 1;
        if (a.q2) ageMap[a.q2] = (ageMap[a.q2] || 0) + 1;
        if (a.q3) postMap[a.q3] = (postMap[a.q3] || 0) + 1;
      });

      var statsEl = document.getElementById('stats');
      if (statsEl) {
        statsEl.innerHTML =
          '<div class="stat-card"><div class="stat-num">' + records.length + '</div><div class="stat-label">总提交数</div></div>' +
          '<div class="stat-card"><div class="stat-num">' + Object.keys(genderMap).length + '</div><div class="stat-label">性别分布</div></div>' +
          '<div class="stat-card"><div class="stat-num">' + Object.keys(ageMap).length + '</div><div class="stat-label">年龄段分布</div></div>' +
          '<div class="stat-card"><div class="stat-num">' + Object.keys(postMap).length + '</div><div class="stat-label">岗位类型</div></div>';
      }

      // 表格
      var tbody = document.getElementById('tbody');
      if (!tbody) return;
      if (records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty">暂无数据</td></tr>';
        return;
      }
      tbody.innerHTML = records.map(function (r, i) {
        var a = r.answers || {};
        return '<tr>' +
          '<td>' + (i + 1) + '</td>' +
          '<td>' + (r.submitted_at ? new Date(r.submitted_at).toLocaleString('zh-CN') : '-') + '</td>' +
          '<td>' + (a.q1 || '-') + '</td>' +
          '<td>' + (a.q2 || '-') + '</td>' +
          '<td>' + (a.q3 || '-') + '</td>' +
          '<td>' +
            '<span style="color:#1890ff;cursor:pointer;margin-right:12px;" onclick="surveyShowDetail(\'' + r.id + '\')">查看</span>' +
            '<span style="color:#ff4d4f;cursor:pointer;" onclick="surveyDelRecord(\'' + r.id + '\')">删除</span>' +
          '</td>' +
          '</tr>';
      }).join('');

      // 存储完整数据供模态框使用
      window.__surveyRecords = records;
    });
}

function surveyShowDetail(id) {
  var records = window.__surveyRecords || [];
  var r = records.find(function (x) { return x.id === id; });
  if (!r) return;
  var a = r.answers || {};
  var html = '';
  Object.keys(SURVEY_QUESTION_MAP).forEach(function (q) {
    if (a[q]) {
      html += '<div class="detail-item"><div class="detail-q">' + SURVEY_QUESTION_MAP[q] + '</div><div class="detail-a">' + a[q] + '</div></div>';
    }
  });
  if (!html) html = '<div style="color:#999;">暂无答案数据</div>';
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal').style.display = 'flex';
}

function surveyCloseModal() {
  document.getElementById('modal').style.display = 'none';
}

function surveyDelRecord(id) {
  if (!confirm('确定删除该记录？')) return;
  fetch('/api/survey/records?id=' + id, { method: 'DELETE' })
    .then(function () { surveyLoadRecords(); });
}

function surveyExportCSV() {
  window.open('/api/survey/export', '_blank');
}

// ========== 页面自动初始化 ==========
document.addEventListener('DOMContentLoaded', function () {
  // 填写页初始化
  if (document.getElementById('formArea')) {
    surveyInitForm();
  }
  // 管理后台初始化
  if (document.getElementById('tbody')) {
    surveyLoadRecords();
  }
});
