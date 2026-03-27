const API = '';
const token = localStorage.getItem('token');
const username = localStorage.getItem('username');
if (!token) window.location.href = '/index.html';

document.getElementById('navUser').textContent = username || '';

const params = new URLSearchParams(window.location.search);
const surveyId = params.get('id');
if (!surveyId) window.location.href = '/dashboard.html';

const alertEl = document.getElementById('alert');
const surveyInfoEl = document.getElementById('surveyInfo');
const questionListEl = document.getElementById('questionList');
const questionModal = document.getElementById('questionModal');
const questionForm = document.getElementById('questionForm');

let editingQuestionId = null;
let surveyData = null;
let questionsData = [];

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

document.getElementById('backBtn').addEventListener('click', () => {
  window.location.href = '/dashboard.html';
});

async function loadSurvey() {
  try {
    const res = await fetch(`${API}/api/surveys/${surveyId}`, { headers: headers() });
    if (!res.ok) throw new Error('加载失败');
    surveyData = await res.json();

    document.getElementById('pageTitle').textContent = surveyData.title;
    surveyInfoEl.innerHTML = `
      <h3>${escapeHtml(surveyData.title)}</h3>
      <p class="text-secondary">${escapeHtml(surveyData.description || '暂无说明')}</p>
      <div class="survey-meta" style="margin-top:8px;">
        <span>状态: ${surveyData.status === 'draft' ? '草稿' : surveyData.status === 'published' ? '已发布' : '已关闭'}</span>
        <span>匿名: ${surveyData.allowAnonymous ? '是' : '否'}</span>
        ${surveyData.shareCode ? `<span>分享码: ${surveyData.shareCode}</span>` : ''}
      </div>
    `;

    // 非草稿状态禁用编辑
    if (surveyData.status !== 'draft') {
      document.getElementById('addQuestionBtn').classList.add('hidden');
    }

    await loadQuestions();
  } catch (err) {
    showAlert(err.message);
  }
}

async function loadQuestions() {
  try {
    const res = await fetch(`${API}/api/surveys/${surveyId}/questions`, { headers: headers() });
    if (!res.ok) throw new Error('加载题目失败');
    questionsData = await res.json();

    const typeLabels = {
      single_choice: '单选题',
      multiple_choice: '多选题',
      text_input: '文本填空',
      number_input: '数字填空',
    };

    if (questionsData.length === 0) {
      questionListEl.innerHTML = '<p class="text-center text-secondary" style="margin-top:32px;">暂无题目，点击"添加题目"开始</p>';
      return;
    }

    questionListEl.innerHTML = questionsData.map(q => `
      <div class="card question-card">
        <span class="question-order">${q.order}</span>
        <div class="question-header">
          <div>
            <h3 style="margin-bottom:4px;">${escapeHtml(q.title)} ${q.required ? '<span style="color:var(--danger);">*</span>' : ''}</h3>
            <span class="question-type">${typeLabels[q.type]}</span>
          </div>
          ${surveyData.status === 'draft' ? `
          <div style="display:flex;gap:6px;">
            <button class="btn btn-outline btn-sm" onclick="editQuestion('${q._id}')">编辑</button>
            <button class="btn btn-danger btn-sm" onclick="deleteQuestion('${q._id}')">删除</button>
          </div>
          ` : ''}
        </div>
        ${q.options && q.options.length ? `
          <ul class="option-list" style="margin-top:8px;">
            ${q.options.map(o => `<li class="option-item" style="cursor:default;">${escapeHtml(o)}</li>`).join('')}
          </ul>
        ` : ''}
        ${renderValidation(q)}
        ${q.jumpRules && q.jumpRules.length ? `
          <div style="margin-top:8px;font-size:0.8rem;color:var(--text-secondary);">
            跳转规则: ${q.jumpRules.map(r => `${r.condition.type} "${r.condition.value}" → 第${r.targetQuestionOrder}题`).join('; ')}
          </div>
        ` : ''}
      </div>
    `).join('');
  } catch (err) {
    showAlert(err.message);
  }
}

function renderValidation(q) {
  const parts = [];
  const v = q.validation || {};
  if (q.type === 'multiple_choice') {
    if (v.minSelect) parts.push(`至少选${v.minSelect}个`);
    if (v.maxSelect) parts.push(`最多选${v.maxSelect}个`);
    if (v.exactSelect) parts.push(`必须选${v.exactSelect}个`);
  }
  if (q.type === 'text_input') {
    if (v.minLength) parts.push(`最少${v.minLength}字`);
    if (v.maxLength) parts.push(`最多${v.maxLength}字`);
  }
  if (q.type === 'number_input') {
    if (v.min != null) parts.push(`最小值${v.min}`);
    if (v.max != null) parts.push(`最大值${v.max}`);
    if (v.integerOnly) parts.push('仅整数');
  }
  if (parts.length === 0) return '';
  return `<div style="margin-top:6px;font-size:0.8rem;color:var(--text-secondary);">校验: ${parts.join(', ')}</div>`;
}

// ===== 题目编辑弹窗 =====
const qTypeSelect = document.getElementById('qType');
const optionsArea = document.getElementById('optionsArea');
const validationArea = document.getElementById('validationArea');
const optionsList = document.getElementById('optionsList');
const jumpRulesList = document.getElementById('jumpRulesList');

document.getElementById('addQuestionBtn').addEventListener('click', () => {
  editingQuestionId = null;
  document.getElementById('modalTitle').textContent = '添加题目';
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

  // 动态校验字段
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
    <input type="text" class="form-control jump-cond-value" value="${escapeHtml(String(condValue))}" placeholder="值" style="flex:1;min-width:80px;">
    <span style="font-size:0.8rem;color:var(--text-secondary);">→ 第</span>
    <input type="number" class="form-control jump-target" value="${target}" placeholder="题号" style="width:70px;" min="1">
    <span style="font-size:0.8rem;color:var(--text-secondary);">题</span>
    <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">×</button>
  `;
  jumpRulesList.appendChild(div);
}

document.getElementById('addJumpRuleBtn').addEventListener('click', () => addJumpRule());

// 编辑题目
window.editQuestion = function(qId) {
  const q = questionsData.find(x => x._id === qId);
  if (!q) return;

  editingQuestionId = qId;
  document.getElementById('modalTitle').textContent = '编辑题目';
  document.getElementById('qTitle').value = q.title;
  document.getElementById('qType').value = q.type;
  document.getElementById('qRequired').checked = q.required;

  // options
  optionsList.innerHTML = '';
  if (q.options) q.options.forEach(o => addOption(o));

  updateFormByType();

  // fill validation
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

  // jump rules
  jumpRulesList.innerHTML = '';
  if (q.jumpRules) {
    q.jumpRules.forEach(r => addJumpRule(r.condition.type, r.condition.value, r.targetQuestionOrder));
  }

  questionModal.classList.remove('hidden');
  questionModal.style.display = 'flex';
};

function safeSet(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

// 删除题目
window.deleteQuestion = async function(qId) {
  if (!confirm('确定删除这道题？')) return;
  try {
    const res = await fetch(`${API}/api/questions/${qId}`, {
      method: 'DELETE',
      headers: headers(),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error);
    }
    showAlert('已删除', 'success');
    loadQuestions();
  } catch (err) {
    showAlert(err.message);
  }
};

// 保存题目
questionForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const type = qTypeSelect.value;
  const isChoice = type === 'single_choice' || type === 'multiple_choice';

  // 收集选项
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

  // 收集校验
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

  // 收集跳转规则
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

  const body = {
    type,
    title: document.getElementById('qTitle').value.trim(),
    required: document.getElementById('qRequired').checked,
    options,
    validation,
    jumpRules,
  };

  try {
    let res;
    if (editingQuestionId) {
      res = await fetch(`${API}/api/questions/${editingQuestionId}`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify(body),
      });
    } else {
      res = await fetch(`${API}/api/surveys/${surveyId}/questions`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
      });
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    closeModal();
    showAlert(editingQuestionId ? '已更新' : '已添加', 'success');
    loadQuestions();
  } catch (err) {
    showAlert(err.message);
  }
});

loadSurvey();
