const API = '';
const token = localStorage.getItem('token');
const username = localStorage.getItem('username');
if (!token) window.location.href = '/index.html';

document.getElementById('navUser').textContent = username || '';
document.getElementById('backBtn').addEventListener('click', () => {
  window.location.href = '/dashboard.html';
});

const params = new URLSearchParams(window.location.search);
const surveyId = params.get('id');
if (!surveyId) window.location.href = '/dashboard.html';

const alertEl = document.getElementById('alert');
const statsContainer = document.getElementById('statsContainer');

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

async function loadStats() {
  try {
    const res = await fetch(`${API}/api/surveys/${surveyId}/stats`, { headers: headers() });
    if (!res.ok) throw new Error('加载统计失败');
    const data = await res.json();

    document.getElementById('pageTitle').textContent = data.title + ' - 统计';
    document.getElementById('totalResponses').textContent = data.totalResponses;

    if (data.questions.length === 0) {
      statsContainer.innerHTML = '<p class="text-center text-secondary">暂无数据</p>';
      return;
    }

    const typeLabels = {
      single_choice: '单选题',
      multiple_choice: '多选题',
      text_input: '文本填空',
      number_input: '数字填空',
    };

    statsContainer.innerHTML = data.questions.map(q => `
      <div class="card" style="margin-bottom:16px;">
        <h3 style="margin-bottom:4px;">
          <span style="color:var(--accent);">${q.order}.</span>
          ${escapeHtml(q.title)}
        </h3>
        <div style="display:flex;gap:12px;margin-bottom:12px;">
          <span class="question-type">${typeLabels[q.type]}</span>
          <span class="text-secondary" style="font-size:0.8rem;">${q.totalAnswered} 人回答</span>
        </div>
        ${renderStats(q)}
      </div>
    `).join('');
  } catch (err) {
    showAlert(err.message);
  }
}

function renderStats(q) {
  switch (q.type) {
    case 'single_choice':
    case 'multiple_choice':
      return renderBarStats(q);
    case 'text_input':
      return renderTextStats(q);
    case 'number_input':
      return renderNumberStats(q);
    default:
      return '';
  }
}

function renderBarStats(q) {
  if (!q.optionCounts) return '';
  const total = q.totalAnswered || 1;

  return `<div class="stat-bar-container">
    ${Object.entries(q.optionCounts).map(([label, count]) => {
      const pct = ((count / total) * 100).toFixed(1);
      return `
        <div class="stat-bar">
          <span class="stat-bar-label">${escapeHtml(label)}</span>
          <div class="stat-bar-track">
            <div class="stat-bar-fill" style="width:${pct}%"></div>
          </div>
          <span class="stat-bar-value">${count} (${pct}%)</span>
        </div>
      `;
    }).join('')}
  </div>`;
}

function renderTextStats(q) {
  if (!q.allAnswers || q.allAnswers.length === 0) return '<p class="text-secondary">暂无回答</p>';
  return `<div style="max-height:300px;overflow-y:auto;">
    ${q.allAnswers.map(a => `
      <div style="padding:8px 12px;background:var(--bg-secondary);border-radius:6px;margin-bottom:6px;font-size:0.9rem;">
        ${escapeHtml(String(a))}
      </div>
    `).join('')}
  </div>`;
}

function renderNumberStats(q) {
  let html = '';
  if (q.average !== undefined) {
    html += `<div class="stat-number" style="margin-bottom:12px;">
      <div class="stat-number-item"><div class="value">${q.average.toFixed(2)}</div><div class="label">平均值</div></div>
      <div class="stat-number-item"><div class="value">${q.min}</div><div class="label">最小值</div></div>
      <div class="stat-number-item"><div class="value">${q.max}</div><div class="label">最大值</div></div>
    </div>`;
  }
  if (q.allAnswers && q.allAnswers.length > 0) {
    html += `<div style="max-height:200px;overflow-y:auto;">
      ${q.allAnswers.map(a => `
        <div style="display:inline-block;padding:4px 12px;background:var(--bg-secondary);border-radius:6px;margin:3px;font-size:0.85rem;">
          ${escapeHtml(String(a))}
        </div>
      `).join('')}
    </div>`;
  }
  return html || '<p class="text-secondary">暂无回答</p>';
}

loadStats();
