const API = '';
const token = localStorage.getItem('token');
const username = localStorage.getItem('username');
if (!token) window.location.href = '/index.html';

document.getElementById('navUser').textContent = username || '';
document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.clear();
  window.location.href = '/index.html';
});

const alertEl = document.getElementById('alert');
const questionListEl = document.getElementById('questionList');
const emptyTip = document.getElementById('emptyTip');
const questionModal = document.getElementById('questionModal');
const questionForm = document.getElementById('questionForm');
const shareModal = document.getElementById('shareModal');
const versionsModal = document.getElementById('versionsModal');
const surveysModal = document.getElementById('surveysModal');
const crossStatsModal = document.getElementById('crossStatsModal');

let editingQuestionId = null;

function headers() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

function showAlert(msg, type = 'error') {
  alertEl.innerHTML = `<div class="alert alert-${type}">${msg}</div>`;
  setTimeout(() => alertEl.innerHTML = '', 4000);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

const typeLabels = {
  single_choice: '单选题',
  multiple_choice: '多选题',
  text_input: '文本填空',
  number_input: '数字填空',
};

// ===== 加载题目列表 =====
async function loadQuestions() {
  try {
    const res = await fetch(`${API}/api/questions`, { headers: headers() });
    if (!res.ok) throw new Error('加载失败');
    const questions = await res.json();

    if (questions.length === 0) {
      questionListEl.innerHTML = '';
      emptyTip.classList.remove('hidden');
      return;
    }
    emptyTip.classList.add('hidden');

    questionListEl.innerHTML = questions.map(q => `
      <div class="card question-lib-card">
        <div class="question-header">
          <div>
            <h3 style="margin-bottom:4px;">${escapeHtml(q.title)} ${q.required ? '<span style="color:var(--danger);">*</span>' : ''}</h3>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
              <span class="question-type">${typeLabels[q.type]}</span>
              <span class="badge badge-draft">v${q.version}</span>
              ${q.creatorId !== q.creatorId ? '<span class="badge">共享</span>' : ''}
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="btn btn-outline btn-sm" onclick="editQuestion('${q._id}')">编辑</button>
            <button class="btn btn-outline btn-sm" onclick="shareQuestion('${q._id}')">共享</button>
            <button class="btn btn-outline btn-sm" onclick="viewVersions('${q._id}')">版本</button>
            <button class="btn btn-outline btn-sm" onclick="viewSurveyRefs('${q._id}')">引用</button>
            <button class="btn btn-outline btn-sm" onclick="viewCrossStats('${q._id}')">统计</button>
            <button class="btn btn-danger btn-sm" onclick="deleteQuestion('${q._id}')">删除</button>
          </div>
        </div>
        ${q.options && q.options.length ? `
          <ul class="option-list" style="margin-top:8px;">
            ${q.options.map(o => `<li class="option-item" style="cursor:default;">${escapeHtml(o)}</li>`).join('')}
          </ul>
        ` : ''}
      </div>
    `).join('');
  } catch (err) {
    showAlert(err.message);
  }
}

// ===== 创建/编辑题目弹窗 =====
const qTypeSelect = document.getElementById('qType');
const optionsArea = document.getElementById('optionsArea');
const validationArea = document.getElementById('validationArea');
const optionsList = document.getElementById('optionsList');
const jumpRulesList = document.getElementById('jumpRulesList');

document.getElementById('createQuestionBtn').addEventListener('click', () => {
  editingQuestionId = null;
  document.getElementById('modalTitle').textContent = '创建题目';
  questionForm.reset();
  optionsList.innerHTML = '';
  jumpRulesList.innerHTML = '';
  addOption('');
  addOption('');
  updateFormByType();
  questionModal.classList.remove('hidden');
  questionModal.style.display = 'flex';
});

document.getElementById('cancelQuestion').addEventListener('click', closeModal);

function closeModal() {
  questionModal.classList.add('hidden');
  questionModal.style.display = 'none';
}

qTypeSelect.addEventListener('change', updateFormByType);

function updateFormByType() {
  const type = qTypeSelect.value;
  const isChoice = type === 'single_choice' || type === 'multiple_choice';
  optionsArea.classList.toggle('hidden', !isChoice);

  let validationHtml = '';
  if (type === 'multiple_choice') {
    validationHtml = `
      <div class="form-group"><label>至少选择</label><input type="number" class="form-control" id="vMinSelect" min="0"></div>
      <div class="form-group"><label>最多选择</label><input type="number" class="form-control" id="vMaxSelect" min="0"></div>
      <div class="form-group"><label>必须选择</label><input type="number" class="form-control" id="vExactSelect" min="0"></div>
    `;
  } else if (type === 'text_input') {
    validationHtml = `
      <div class="form-group"><label>最少字符数</label><input type="number" class="form-control" id="vMinLength" min="0"></div>
      <div class="form-group"><label>最多字符数</label><input type="number" class="form-control" id="vMaxLength" min="0"></div>
    `;
  } else if (type === 'number_input') {
    validationHtml = `
      <div class="form-group"><label>最小值</label><input type="number" class="form-control" id="vMin"></div>
      <div class="form-group"><label>最大值</label><input type="number" class="form-control" id="vMax"></div>
      <div class="form-group checkbox-group">
        <input type="checkbox" id="vIntegerOnly">
        <label for="vIntegerOnly" style="margin-bottom:0;">仅限整数</label>
      </div>
    `;
  }
  validationArea.innerHTML = validationHtml;
  jumpRulesList.innerHTML = '';
}

function addOption(val) {
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;';
  div.innerHTML = `
    <input type="text" class="form-control option-input" value="${escapeHtml(val)}" placeholder="选项内容">
    <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">×</button>
  `;
  optionsList.appendChild(div);
}

document.getElementById('addOptionBtn').addEventListener('click', () => addOption(''));

function addJumpRule(condType = 'equals', condValue = '', target = '') {
  const type = qTypeSelect.value;
  const isChoice = type === 'single_choice' || type === 'multiple_choice';

  let valueInputHtml;
  if (isChoice) {
    const options = [];
    document.querySelectorAll('.option-input').forEach(input => {
      const v = input.value.trim();
      if (v) options.push(v);
    });
    valueInputHtml = `<select class="form-control jump-cond-value" style="flex:1;min-width:80px;">
      ${options.map(o => `<option value="${escapeHtml(o)}" ${String(o) === String(condValue) ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}
    </select>`;
  } else {
    valueInputHtml = `<input type="text" class="form-control jump-cond-value" value="${escapeHtml(String(condValue))}" placeholder="值" style="flex:1;min-width:80px;">`;
  }

  const div = document.createElement('div');
  div.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;align-items:center;';
  div.innerHTML = `
    <select class="form-control jump-cond-type" style="width:auto;flex:0 0 100px;">
      <option value="equals" ${condType === 'equals' ? 'selected' : ''}>等于</option>
      <option value="contains" ${condType === 'contains' ? 'selected' : ''}>包含</option>
      <option value="gt" ${condType === 'gt' ? 'selected' : ''}>大于</option>
      <option value="lt" ${condType === 'lt' ? 'selected' : ''}>小于</option>
      <option value="gte" ${condType === 'gte' ? 'selected' : ''}>大于等于</option>
      <option value="lte" ${condType === 'lte' ? 'selected' : ''}>小于等于</option>
    </select>
    ${valueInputHtml}
    <span style="font-size:0.8rem;color:var(--text-secondary);">→ 第</span>
    <input type="number" class="form-control jump-target" value="${target}" placeholder="题号" style="width:70px;" min="1">
    <span style="font-size:0.8rem;color:var(--text-secondary);">题</span>
    <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">×</button>
  `;
  jumpRulesList.appendChild(div);
}

document.getElementById('addJumpRuleBtn').addEventListener('click', () => addJumpRule());

// 编辑题目
window.editQuestion = async function(qId) {
  try {
    const res = await fetch(`${API}/api/questions/${qId}`, { headers: headers() });
    if (!res.ok) throw new Error('加载题目失败');
    const q = await res.json();

    editingQuestionId = qId;
    document.getElementById('modalTitle').textContent = '编辑题目';
    document.getElementById('qTitle').value = q.title;
    document.getElementById('qType').value = q.type;
    document.getElementById('qRequired').checked = q.required;

    optionsList.innerHTML = '';
    if (q.options) q.options.forEach(o => addOption(o));

    updateFormByType();

    const v = q.validation || {};
    if (q.type === 'multiple_choice') {
      if (v.minSelect) safeSet('vMinSelect', v.minSelect);
      if (v.maxSelect) safeSet('vMaxSelect', v.maxSelect);
      if (v.exactSelect) safeSet('vExactSelect', v.exactSelect);
    } else if (q.type === 'text_input') {
      if (v.minLength) safeSet('vMinLength', v.minLength);
      if (v.maxLength) safeSet('vMaxLength', v.maxLength);
    } else if (q.type === 'number_input') {
      if (v.min != null) safeSet('vMin', v.min);
      if (v.max != null) safeSet('vMax', v.max);
      if (v.integerOnly) {
        const el = document.getElementById('vIntegerOnly');
        if (el) el.checked = true;
      }
    }

    jumpRulesList.innerHTML = '';
    if (q.jumpRules) {
      q.jumpRules.forEach(r => addJumpRule(r.condition.type, r.condition.value, r.targetQuestionOrder));
    }

    questionModal.classList.remove('hidden');
    questionModal.style.display = 'flex';
  } catch (err) {
    showAlert(err.message);
  }
};

function safeSet(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

// 保存题目
questionForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const type = qTypeSelect.value;
  const isChoice = type === 'single_choice' || type === 'multiple_choice';

  const options = [];
  if (isChoice) {
    document.querySelectorAll('.option-input').forEach(input => {
      const v = input.value.trim();
      if (v) options.push(v);
    });
    if (options.length < 2) {
      return showAlert('至少需要2个选项');
    }
  }

  const validation = {};
  if (type === 'multiple_choice') {
    const mins = document.getElementById('vMinSelect')?.value;
    const maxs = document.getElementById('vMaxSelect')?.value;
    const exs = document.getElementById('vExactSelect')?.value;
    if (mins) validation.minSelect = Number(mins);
    if (maxs) validation.maxSelect = Number(maxs);
    if (exs) validation.exactSelect = Number(exs);
  } else if (type === 'text_input') {
    const minl = document.getElementById('vMinLength')?.value;
    const maxl = document.getElementById('vMaxLength')?.value;
    if (minl) validation.minLength = Number(minl);
    if (maxl) validation.maxLength = Number(maxl);
  } else if (type === 'number_input') {
    const mn = document.getElementById('vMin')?.value;
    const mx = document.getElementById('vMax')?.value;
    const io = document.getElementById('vIntegerOnly')?.checked;
    if (mn !== '' && mn != null) validation.min = Number(mn);
    if (mx !== '' && mx != null) validation.max = Number(mx);
    if (io) validation.integerOnly = true;
  }

  const jumpRules = [];
  document.querySelectorAll('#jumpRulesList > div').forEach(div => {
    const ct = div.querySelector('.jump-cond-type').value;
    const cv = div.querySelector('.jump-cond-value').value.trim();
    const tgt = div.querySelector('.jump-target').value;
    if (cv && tgt) {
      jumpRules.push({
        condition: { type: ct, value: cv },
        targetQuestionOrder: Number(tgt),
      });
    }
  });

  const body = { type, title: document.getElementById('qTitle').value.trim(), required: document.getElementById('qRequired').checked, options, validation, jumpRules };

  try {
    let res;
    if (editingQuestionId) {
      res = await fetch(`${API}/api/questions/${editingQuestionId}`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify(body),
      });
    } else {
      res = await fetch(`${API}/api/questions`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
      });
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    closeModal();

    if (data.newVersionCreated) {
      showAlert('已创建新版本（旧版本保持不变）', 'success');
    } else {
      showAlert(editingQuestionId ? '已更新' : '已创建', 'success');
    }
    loadQuestions();
  } catch (err) {
    showAlert(err.message);
  }
});

// 删除题目
window.deleteQuestion = async function(qId) {
  if (!confirm('确定删除这道题？')) return;
  try {
    const res = await fetch(`${API}/api/questions/${qId}`, {
      method: 'DELETE',
      headers: headers(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showAlert('已删除', 'success');
    loadQuestions();
  } catch (err) {
    showAlert(err.message);
  }
};

// ===== 共享 =====
let sharingQuestionId = null;

window.shareQuestion = function(qId) {
  sharingQuestionId = qId;
  document.getElementById('shareUsername').value = '';
  document.getElementById('shareAlert').innerHTML = '';
  shareModal.classList.remove('hidden');
  shareModal.style.display = 'flex';
};

document.getElementById('cancelShare').addEventListener('click', () => {
  shareModal.classList.add('hidden');
  shareModal.style.display = 'none';
});

document.getElementById('confirmShare').addEventListener('click', async () => {
  const uname = document.getElementById('shareUsername').value.trim();
  if (!uname) {
    document.getElementById('shareAlert').innerHTML = '<div class="alert alert-error">请输入用户名</div>';
    return;
  }
  try {
    const res = await fetch(`${API}/api/questions/${sharingQuestionId}/share`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ username: uname }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    shareModal.classList.add('hidden');
    shareModal.style.display = 'none';
    showAlert(data.message, 'success');
  } catch (err) {
    document.getElementById('shareAlert').innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
  }
});

// ===== 版本历史 =====
window.viewVersions = async function(qId) {
  try {
    const res = await fetch(`${API}/api/questions/${qId}/versions`, { headers: headers() });
    if (!res.ok) throw new Error('加载失败');
    const versions = await res.json();

    document.getElementById('versionsList').innerHTML = versions.map(v => `
      <div class="card" style="padding:1rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div>
            <strong>v${v.version}</strong> — ${escapeHtml(v.title)}
            <span class="question-type" style="margin-left:8px;">${typeLabels[v.type]}</span>
            ${v.isLatest ? '<span class="badge badge-published" style="margin-left:8px;">最新</span>' : ''}
          </div>
          <div style="display:flex;gap:6px;">
            ${!v.isLatest ? `<button class="btn btn-outline btn-sm" onclick="revertVersion('${qId}', '${v._id}')">恢复此版本</button>` : ''}
          </div>
        </div>
        <div class="text-secondary" style="font-size:0.8rem;margin-top:4px;">
          创建于 ${new Date(v.createdAt).toLocaleString('zh-CN')}
        </div>
      </div>
    `).join('');

    versionsModal.classList.remove('hidden');
    versionsModal.style.display = 'flex';
  } catch (err) {
    showAlert(err.message);
  }
};

document.getElementById('closeVersions').addEventListener('click', () => {
  versionsModal.classList.add('hidden');
  versionsModal.style.display = 'none';
});

window.revertVersion = async function(qId, versionId) {
  if (!confirm('确定恢复到此版本？将创建一个新版本。')) return;
  try {
    const res = await fetch(`${API}/api/questions/${qId}/revert/${versionId}`, {
      method: 'POST',
      headers: headers(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showAlert('已恢复（创建了新版本 v' + data.version + '）', 'success');
    versionsModal.classList.add('hidden');
    versionsModal.style.display = 'none';
    loadQuestions();
  } catch (err) {
    showAlert(err.message);
  }
};

// ===== 引用查看 =====
window.viewSurveyRefs = async function(qId) {
  try {
    const res = await fetch(`${API}/api/questions/${qId}/surveys`, { headers: headers() });
    if (!res.ok) throw new Error('加载失败');
    const surveys = await res.json();

    const statusLabels = { draft: '草稿', published: '已发布', closed: '已关闭' };
    document.getElementById('surveyRefsList').innerHTML = surveys.length === 0
      ? '<p class="text-center text-secondary">暂无问卷引用此题目</p>'
      : surveys.map(s => `
        <div class="card" style="padding:1rem;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <strong>${escapeHtml(s.title)}</strong>
            <span class="badge badge-${s.status}">${statusLabels[s.status]}</span>
          </div>
          <div class="text-secondary" style="font-size:0.8rem;margin-top:4px;">
            创建于 ${new Date(s.createdAt).toLocaleString('zh-CN')}
          </div>
        </div>
      `).join('');

    surveysModal.classList.remove('hidden');
    surveysModal.style.display = 'flex';
  } catch (err) {
    showAlert(err.message);
  }
};

document.getElementById('closeSurveyRefs').addEventListener('click', () => {
  surveysModal.classList.add('hidden');
  surveysModal.style.display = 'none';
});

// ===== 跨问卷统计 =====
window.viewCrossStats = async function(qId) {
  try {
    const res = await fetch(`${API}/api/questions/${qId}/stats`, { headers: headers() });
    if (!res.ok) throw new Error('加载失败');
    const stat = await res.json();

    let html = `
      <div class="card" style="padding:1rem;">
        <h3 style="margin-bottom:8px;">${escapeHtml(stat.title)}</h3>
        <div style="display:flex;gap:12px;margin-bottom:12px;">
          <span class="question-type">${typeLabels[stat.type]}</span>
          <span class="text-secondary" style="font-size:0.8rem;">${stat.totalSurveys} 个问卷使用</span>
          <span class="text-secondary" style="font-size:0.8rem;">${stat.totalAnswered} 人回答</span>
        </div>
    `;

    if (stat.optionCounts) {
      const total = stat.totalAnswered || 1;
      html += '<div class="stat-bar-container">';
      for (const [label, count] of Object.entries(stat.optionCounts)) {
        const pct = ((count / total) * 100).toFixed(1);
        html += `
          <div class="stat-bar">
            <span class="stat-bar-label">${escapeHtml(label)}</span>
            <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${pct}%"></div></div>
            <span class="stat-bar-value">${count} (${pct}%)</span>
          </div>
        `;
      }
      html += '</div>';
    }

    if (stat.average !== undefined) {
      html += `
        <div class="stat-number" style="margin-top:12px;">
          <div class="stat-number-item"><div class="value">${stat.average.toFixed(2)}</div><div class="label">平均值</div></div>
          <div class="stat-number-item"><div class="value">${stat.min}</div><div class="label">最小值</div></div>
          <div class="stat-number-item"><div class="value">${stat.max}</div><div class="label">最大值</div></div>
        </div>
      `;
    }

    if (stat.allAnswers && stat.type === 'text_input') {
      html += '<div style="margin-top:12px;max-height:200px;overflow-y:auto;">';
      stat.allAnswers.forEach(a => {
        html += `<div style="padding:6px 10px;background:var(--bg-secondary);border-radius:6px;margin-bottom:4px;font-size:0.85rem;">${escapeHtml(String(a))}</div>`;
      });
      html += '</div>';
    }

    // 按问卷来源分组展示
    if (stat.perSurvey && stat.perSurvey.length > 0) {
      const statusLabels = { draft: '草稿', published: '已发布', closed: '已关闭' };
      html += '<div style="margin-top:20px;border-top:1px solid var(--border);padding-top:16px;">';
      html += '<h4 style="margin-bottom:12px;">📊 按问卷来源分组</h4>';

      for (const ps of stat.perSurvey) {
        html += `
          <div class="card" style="padding:1rem;margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
              <div>
                <strong>${escapeHtml(ps.surveyTitle)}</strong>
                <span class="badge badge-${ps.surveyStatus}" style="margin-left:8px;">${statusLabels[ps.surveyStatus] || ps.surveyStatus}</span>
              </div>
              <div style="display:flex;gap:12px;font-size:0.85rem;">
                <span>${ps.answerCount} 人回答</span>
                <span style="font-weight:600;color:var(--primary);">占比 ${ps.proportion}%</span>
              </div>
            </div>
        `;

        // 选项分布
        if (ps.optionCounts) {
          const surveyTotal = ps.answerCount || 1;
          html += '<div class="stat-bar-container" style="margin-top:6px;">';
          for (const [label, count] of Object.entries(ps.optionCounts)) {
            const pct = ((count / surveyTotal) * 100).toFixed(1);
            html += `
              <div class="stat-bar">
                <span class="stat-bar-label">${escapeHtml(label)}</span>
                <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${pct}%"></div></div>
                <span class="stat-bar-value">${count} (${pct}%)</span>
              </div>
            `;
          }
          html += '</div>';
        }

        // 数字统计
        if (ps.average !== undefined) {
          html += `
            <div class="stat-number" style="margin-top:8px;">
              <div class="stat-number-item"><div class="value">${ps.average}</div><div class="label">平均值</div></div>
              <div class="stat-number-item"><div class="value">${ps.min}</div><div class="label">最小值</div></div>
              <div class="stat-number-item"><div class="value">${ps.max}</div><div class="label">最大值</div></div>
            </div>
          `;
        }

        // 文本回答
        if (ps.answers) {
          html += '<div style="margin-top:8px;max-height:120px;overflow-y:auto;">';
          ps.answers.forEach(a => {
            html += `<div style="padding:4px 8px;background:var(--bg-secondary);border-radius:4px;margin-bottom:3px;font-size:0.8rem;">${escapeHtml(String(a))}</div>`;
          });
          html += '</div>';
        }

        html += '</div>'; // card
      }

      html += '</div>'; // 分组区域
    }

    html += '</div>';
    document.getElementById('crossStatsContent').innerHTML = html;
    crossStatsModal.classList.remove('hidden');
    crossStatsModal.style.display = 'flex';
  } catch (err) {
    showAlert(err.message);
  }
};

document.getElementById('closeCrossStats').addEventListener('click', () => {
  crossStatsModal.classList.add('hidden');
  crossStatsModal.style.display = 'none';
});

loadQuestions();
