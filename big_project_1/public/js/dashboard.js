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
const surveyListEl = document.getElementById('surveyList');
const emptyTip = document.getElementById('emptyTip');

function showAlert(msg, type = 'error') {
  alertEl.innerHTML = `<div class="alert alert-${type}">${msg}</div>`;
  setTimeout(() => alertEl.innerHTML = '', 4000);
}

function headers() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

const statusLabels = { draft: '草稿', published: '已发布', closed: '已关闭' };

async function loadSurveys() {
  try {
    const res = await fetch(`${API}/api/surveys`, { headers: headers() });
    if (!res.ok) throw new Error('加载失败');
    const surveys = await res.json();

    if (surveys.length === 0) {
      surveyListEl.innerHTML = '';
      emptyTip.classList.remove('hidden');
      return;
    }
    emptyTip.classList.add('hidden');

    surveyListEl.innerHTML = surveys.map(s => `
      <div class="card survey-item" data-id="${s._id}">
        <div class="survey-info">
          <h3>${escapeHtml(s.title)}</h3>
          <div class="survey-meta">
            <span class="badge badge-${s.status}">${statusLabels[s.status]}</span>
            <span>创建于 ${new Date(s.createdAt).toLocaleDateString()}</span>
            ${s.deadline ? `<span>截止 ${new Date(s.deadline).toLocaleString()}</span>` : ''}
          </div>
        </div>
        <div class="survey-actions">
          ${s.status === 'draft' ? `
            <button class="btn btn-outline btn-sm" onclick="editSurvey('${s._id}')">编辑</button>
            <button class="btn btn-success btn-sm" onclick="publishSurvey('${s._id}')">发布</button>
            <button class="btn btn-danger btn-sm" onclick="deleteSurvey('${s._id}')">删除</button>
          ` : ''}
          ${s.status === 'published' ? `
            <button class="btn btn-outline btn-sm" onclick="copyLink('${s.shareCode}')">复制链接</button>
            <button class="btn btn-outline btn-sm" onclick="viewStats('${s._id}')">统计</button>
            <button class="btn btn-danger btn-sm" onclick="closeSurvey('${s._id}')">关闭</button>
          ` : ''}
          ${s.status === 'closed' ? `
            <button class="btn btn-outline btn-sm" onclick="viewStats('${s._id}')">统计</button>
            <button class="btn btn-danger btn-sm" onclick="deleteSurvey('${s._id}')">删除</button>
          ` : ''}
        </div>
      </div>
    `).join('');
  } catch (err) {
    showAlert(err.message);
  }
}

// 创建问卷
const createModal = document.getElementById('createModal');
document.getElementById('createBtn').addEventListener('click', () => {
  createModal.classList.remove('hidden');
  createModal.style.display = 'flex';
});
document.getElementById('cancelCreate').addEventListener('click', () => {
  createModal.classList.add('hidden');
  createModal.style.display = 'none';
});

document.getElementById('createForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    title: document.getElementById('surveyTitle').value.trim(),
    description: document.getElementById('surveyDesc').value.trim(),
    allowAnonymous: document.getElementById('surveyAnonymous').checked,
    deadline: document.getElementById('surveyDeadline').value || null,
  };

  try {
    const res = await fetch(`${API}/api/surveys`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    createModal.classList.add('hidden');
    createModal.style.display = 'none';
    document.getElementById('createForm').reset();
    showAlert('创建成功！', 'success');
    // 跳转到编辑页
    window.location.href = `/create.html?id=${data._id}`;
  } catch (err) {
    showAlert(err.message);
  }
});

function editSurvey(id) {
  window.location.href = `/create.html?id=${id}`;
}

async function publishSurvey(id) {
  if (!confirm('确定要发布？发布后不可修改题目。')) return;
  try {
    const res = await fetch(`${API}/api/surveys/${id}/publish`, {
      method: 'PUT',
      headers: headers(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showAlert('发布成功！', 'success');
    loadSurveys();
  } catch (err) {
    showAlert(err.message);
  }
}

async function closeSurvey(id) {
  if (!confirm('确定要关闭？关闭后无法再填写。')) return;
  try {
    const res = await fetch(`${API}/api/surveys/${id}/close`, {
      method: 'PUT',
      headers: headers(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showAlert('已关闭', 'success');
    loadSurveys();
  } catch (err) {
    showAlert(err.message);
  }
}

async function deleteSurvey(id) {
  if (!confirm('确定要删除？此操作不可撤销。')) return;
  try {
    const res = await fetch(`${API}/api/surveys/${id}`, {
      method: 'DELETE',
      headers: headers(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showAlert('已删除', 'success');
    loadSurveys();
  } catch (err) {
    showAlert(err.message);
  }
}

function copyLink(shareCode) {
  const url = `${window.location.origin}/fill.html?code=${shareCode}`;
  navigator.clipboard.writeText(url).then(() => {
    showAlert('链接已复制到剪贴板', 'success');
  }).catch(() => {
    prompt('复制链接:', url);
  });
}

function viewStats(id) {
  window.location.href = `/stats.html?id=${id}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

loadSurveys();
