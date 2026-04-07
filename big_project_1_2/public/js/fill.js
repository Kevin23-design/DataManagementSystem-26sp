const API = '';
const token = localStorage.getItem('token');
const username = localStorage.getItem('username');

const params = new URLSearchParams(window.location.search);
const shareCode = params.get('code');
if (!shareCode) {
  document.getElementById('surveyTitle').textContent = '无效链接';
}

if (username) {
  document.getElementById('navUser').textContent = username;
}

const alertEl = document.getElementById('alert');
const questionArea = document.getElementById('questionArea');
const submitArea = document.getElementById('submitArea');
const successArea = document.getElementById('successArea');

let surveyInfo = null;
let questions = [];
let answers = {}; // questionId -> value

function showAlert(msg, type = 'error') {
  alertEl.innerHTML = `<div class="alert alert-${type}">${msg}</div>`;
  setTimeout(() => alertEl.innerHTML = '', 4000);
}

function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function loadSurvey() {
  if (!shareCode) return;
  try {
    const res = await fetch(`${API}/api/survey/${shareCode}`, {
      headers: authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    surveyInfo = data.survey;
    questions = data.questions;

    document.getElementById('surveyTitle').textContent = surveyInfo.title;
    document.getElementById('surveyDesc').textContent = surveyInfo.description || '';
    document.title = `填写问卷 - ${surveyInfo.title}`;

    if (questions.length === 0) {
      questionArea.innerHTML = '<p class="text-center text-secondary">该问卷没有题目</p>';
      return;
    }

    renderAllQuestions();
    applyJumpVisibility();
    submitArea.classList.remove('hidden');
  } catch (err) {
    document.getElementById('surveyTitle').textContent = '无法加载';
    showAlert(err.message);
  }
}

function renderAllQuestions() {
  questionArea.innerHTML = questions.map(q => `
    <div class="card fill-question" id="q-${q._id}" data-order="${q.order}">
      <h3 style="margin-bottom:12px;">
        <span style="color:var(--accent);margin-right:6px;">${q.order}.</span>
        ${escapeHtml(q.title)}
        ${q.required ? '<span style="color:var(--danger);margin-left:4px;">*</span>' : ''}
      </h3>
      ${renderQuestionInput(q)}
      ${renderHint(q)}
    </div>
  `).join('');
}

function renderQuestionInput(q) {
  switch (q.type) {
    case 'single_choice':
      return `<ul class="option-list">
        ${q.options.map(o => `
          <li class="option-item" onclick="selectSingle('${q._id}', '${escapeHtml(o)}', this)">
            <input type="radio" name="q_${q._id}" value="${escapeHtml(o)}">
            <span>${escapeHtml(o)}</span>
          </li>
        `).join('')}
      </ul>`;

    case 'multiple_choice':
      return `<ul class="option-list">
        ${q.options.map(o => `
          <li class="option-item" onclick="toggleMultiple('${q._id}', '${escapeHtml(o)}', this)">
            <input type="checkbox" value="${escapeHtml(o)}">
            <span>${escapeHtml(o)}</span>
          </li>
        `).join('')}
      </ul>`;

    case 'text_input':
      return `<textarea class="form-control" placeholder="请输入..."
        oninput="handleInputChange('${q._id}', this.value)"></textarea>`;

    case 'number_input':
      return `<input type="number" class="form-control" placeholder="请输入数字"
        oninput="handleInputChange('${q._id}', this.value)" step="any">`;

    default:
      return '';
  }
}

function renderHint(q) {
  const parts = [];
  const v = q.validation || {};
  if (q.type === 'multiple_choice') {
    if (v.minSelect) parts.push(`至少选${v.minSelect}个`);
    if (v.maxSelect) parts.push(`最多选${v.maxSelect}个`);
    if (v.exactSelect) parts.push(`必须选${v.exactSelect}个`);
  }
  if (q.type === 'text_input') {
    if (v.minLength) parts.push(`至少${v.minLength}字`);
    if (v.maxLength) parts.push(`最多${v.maxLength}字`);
  }
  if (q.type === 'number_input') {
    if (v.min != null) parts.push(`最小${v.min}`);
    if (v.max != null) parts.push(`最大${v.max}`);
    if (v.integerOnly) parts.push('仅限整数');
  }
  if (parts.length === 0) return '';
  return `<p style="margin-top:8px;font-size:0.8rem;color:var(--text-secondary);">提示: ${parts.join(', ')}</p>`;
}

function matchCondition(questionType, condition, answerValue) {
  const condType = condition?.type;
  const condValue = condition?.value;

  switch (condType) {
    case 'equals':
      if (questionType === 'number_input') return Number(answerValue) === Number(condValue);
      return String(answerValue) === String(condValue);
    case 'contains':
      return Array.isArray(answerValue) ? answerValue.map(String).includes(String(condValue)) : false;
    case 'gt':
      return Number(answerValue) > Number(condValue);
    case 'lt':
      return Number(answerValue) < Number(condValue);
    case 'gte':
      return Number(answerValue) >= Number(condValue);
    case 'lte':
      return Number(answerValue) <= Number(condValue);
    default:
      return false;
  }
}

function getNextQuestionOrder(question, answerValue, defaultNextOrder) {
  if (!question.jumpRules || question.jumpRules.length === 0) {
    return defaultNextOrder;
  }

  // 未作答时不匹配跳转规则
  if (answerValue === undefined || answerValue === null || answerValue === '') {
    return defaultNextOrder;
  }
  if (Array.isArray(answerValue) && answerValue.length === 0) {
    return defaultNextOrder;
  }

  for (const rule of question.jumpRules) {
    if (matchCondition(question.type, rule.condition, answerValue)) {
      return rule.targetQuestionOrder;
    }
  }

  return defaultNextOrder;
}

function getVisibleQuestionIdSet() {
  const visible = new Set();
  if (questions.length === 0) return visible;

  const orderToIndex = new Map(questions.map((q, idx) => [q.order, idx]));
  const visited = new Set();
  let idx = 0;

  while (idx >= 0 && idx < questions.length && !visited.has(idx)) {
    visited.add(idx);
    const question = questions[idx];
    visible.add(String(question._id));

    const defaultNextOrder = idx + 1 < questions.length ? questions[idx + 1].order : null;
    const answerValue = answers[String(question._id)];
    const nextOrder = getNextQuestionOrder(question, answerValue, defaultNextOrder);

    if (nextOrder == null) break;
    if (!orderToIndex.has(nextOrder)) break;
    idx = orderToIndex.get(nextOrder);
  }

  return visible;
}

function getVisibleQuestionsInOrder() {
  const visibleSet = getVisibleQuestionIdSet();
  return questions.filter(q => visibleSet.has(String(q._id)));
}

function applyJumpVisibility() {
  const visibleSet = getVisibleQuestionIdSet();
  questions.forEach(q => {
    const qId = String(q._id);
    const el = document.getElementById(`q-${q._id}`);
    if (!el) return;
    const isVisible = visibleSet.has(qId);
    el.classList.toggle('hidden', !isVisible);
    // Bug 7 修复: 隐藏的题目清除旧答案，避免幽灵答案
    if (!isVisible && answers[qId] !== undefined) {
      delete answers[qId];
    }
  });
}

function scrollToNextVisibleQuestion(currentQuestionId) {
  const ordered = getVisibleQuestionsInOrder();
  const idx = ordered.findIndex(q => String(q._id) === String(currentQuestionId));
  if (idx === -1 || idx + 1 >= ordered.length) return;

  const next = ordered[idx + 1];
  const nextEl = document.getElementById(`q-${next._id}`);
  if (nextEl) {
    nextEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// 单选
window.selectSingle = function(qId, value, el) {
  answers[qId] = value;
  const parent = el.closest('.option-list');
  parent.querySelectorAll('.option-item').forEach(li => li.classList.remove('selected'));
  el.classList.add('selected');
  el.querySelector('input[type="radio"]').checked = true;
  applyJumpVisibility();
  scrollToNextVisibleQuestion(qId);
};

// 多选
window.toggleMultiple = function(qId, value, el) {
  if (!answers[qId]) answers[qId] = [];
  const idx = answers[qId].indexOf(value);
  if (idx > -1) {
    answers[qId].splice(idx, 1);
    el.classList.remove('selected');
    el.querySelector('input[type="checkbox"]').checked = false;
  } else {
    answers[qId].push(value);
    el.classList.add('selected');
    el.querySelector('input[type="checkbox"]').checked = true;
  }
  applyJumpVisibility();
};

window.handleInputChange = function(qId, value) {
  answers[qId] = value;
  applyJumpVisibility();
};

// 提交
document.getElementById('submitBtn').addEventListener('click', async () => {
  const visibleQuestions = getVisibleQuestionsInOrder();

  // 构建 answers 数组
  const submittedAnswers = visibleQuestions
    .filter(q => answers[q._id] !== undefined && answers[q._id] !== '' && answers[q._id] !== null)
    .map(q => ({
      questionId: q._id,
      value: q.type === 'number_input' ? Number(answers[q._id]) : answers[q._id],
    }));

  // 检查必答题
  for (const q of visibleQuestions) {
    if (q.required) {
      const val = answers[q._id];
      if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
        showAlert(`"${q.title}" 为必答题`);
        document.getElementById(`q-${q._id}`)?.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }
  }

  try {
    const res = await fetch(`${API}/api/survey/${shareCode}/submit`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ answers: submittedAnswers }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    questionArea.classList.add('hidden');
    submitArea.classList.add('hidden');
    document.getElementById('surveyHeader').classList.add('hidden');
    successArea.classList.remove('hidden');
  } catch (err) {
    showAlert(err.message);
  }
});

loadSurvey();
