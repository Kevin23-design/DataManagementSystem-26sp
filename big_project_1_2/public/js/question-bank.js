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
const bankListEl = document.getElementById('bankList');
const emptyTip = document.getElementById('emptyTip');
const createBankModal = document.getElementById('createBankModal');
const bankForm = document.getElementById('bankForm');
const bankDetailModal = document.getElementById('bankDetailModal');

let editingBankId = null;
let currentBankId = null;

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

// ===== 加载题库列表 =====
async function loadBanks() {
  try {
    const res = await fetch(`${API}/api/question-banks`, { headers: headers() });
    if (!res.ok) throw new Error('加载失败');
    const banks = await res.json();

    if (banks.length === 0) {
      bankListEl.innerHTML = '';
      emptyTip.classList.remove('hidden');
      return;
    }
    emptyTip.classList.add('hidden');

    bankListEl.innerHTML = banks.map(b => `
      <div class="card survey-item">
        <div class="survey-info">
          <h3>${escapeHtml(b.name)}</h3>
          <div class="survey-meta">
            <span>${b.questionIds.length} 个题目</span>
            <span>创建于 ${new Date(b.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        <div class="survey-actions">
          <button class="btn btn-outline btn-sm" onclick="viewBankDetail('${b._id}')">查看</button>
          <button class="btn btn-outline btn-sm" onclick="editBank('${b._id}', '${escapeHtml(b.name)}', '${escapeHtml(b.description || '')}')">编辑</button>
          <button class="btn btn-danger btn-sm" onclick="deleteBank('${b._id}')">删除</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    showAlert(err.message);
  }
}

// ===== 创建/编辑题库 =====
document.getElementById('createBankBtn').addEventListener('click', () => {
  editingBankId = null;
  document.getElementById('bankModalTitle').textContent = '创建题库';
  bankForm.reset();
  createBankModal.classList.remove('hidden');
  createBankModal.style.display = 'flex';
});

document.getElementById('cancelBank').addEventListener('click', () => {
  createBankModal.classList.add('hidden');
  createBankModal.style.display = 'none';
});

window.editBank = function(id, name, desc) {
  editingBankId = id;
  document.getElementById('bankModalTitle').textContent = '编辑题库';
  document.getElementById('bankName').value = name;
  document.getElementById('bankDesc').value = desc;
  createBankModal.classList.remove('hidden');
  createBankModal.style.display = 'flex';
};

bankForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    name: document.getElementById('bankName').value.trim(),
    description: document.getElementById('bankDesc').value.trim(),
  };

  try {
    let res;
    if (editingBankId) {
      res = await fetch(`${API}/api/question-banks/${editingBankId}`, {
        method: 'PUT', headers: headers(), body: JSON.stringify(body),
      });
    } else {
      res = await fetch(`${API}/api/question-banks`, {
        method: 'POST', headers: headers(), body: JSON.stringify(body),
      });
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    createBankModal.classList.add('hidden');
    createBankModal.style.display = 'none';
    showAlert(editingBankId ? '已更新' : '已创建', 'success');
    loadBanks();
  } catch (err) {
    showAlert(err.message);
  }
});

// 删除题库
window.deleteBank = async function(id) {
  if (!confirm('确定删除此题库？（不会删除题目本身）')) return;
  try {
    const res = await fetch(`${API}/api/question-banks/${id}`, {
      method: 'DELETE', headers: headers(),
    });
    if (!res.ok) throw new Error('删除失败');
    showAlert('已删除', 'success');
    loadBanks();
  } catch (err) {
    showAlert(err.message);
  }
};

// ===== 题库详情 =====
window.viewBankDetail = async function(bankId) {
  currentBankId = bankId;
  try {
    const res = await fetch(`${API}/api/question-banks/${bankId}`, { headers: headers() });
    if (!res.ok) throw new Error('加载失败');
    const { bank, questions } = await res.json();

    document.getElementById('bankDetailTitle').textContent = bank.name;

    // 当前题库中的题目
    document.getElementById('bankQuestionList').innerHTML = questions.length === 0
      ? '<p class="text-secondary">题库中暂无题目</p>'
      : questions.map(q => `
        <div class="card" style="padding:0.8rem;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <strong>${escapeHtml(q.title)}</strong>
            <span class="question-type" style="margin-left:8px;">${typeLabels[q.type]}</span>
          </div>
          <button class="btn btn-danger btn-sm" onclick="removeFromBank('${bankId}', '${q.rootQuestionId || q._id}')">移除</button>
        </div>
      `).join('');

    // 可添加的题目
    const allRes = await fetch(`${API}/api/questions`, { headers: headers() });
    const allQuestions = await allRes.json();
    const bankQIds = bank.questionIds.map(id => id.toString());
    const available = allQuestions.filter(q => !bankQIds.includes((q.rootQuestionId || q._id).toString()));

    document.getElementById('availableQuestions').innerHTML = available.length === 0
      ? '<p class="text-secondary">没有更多可添加的题目</p>'
      : available.map(q => `
        <div class="card" style="padding:0.8rem;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <strong>${escapeHtml(q.title)}</strong>
            <span class="question-type" style="margin-left:8px;">${typeLabels[q.type]}</span>
          </div>
          <button class="btn btn-success btn-sm" onclick="addToBank('${bankId}', '${q._id}')">添加</button>
        </div>
      `).join('');

    bankDetailModal.classList.remove('hidden');
    bankDetailModal.style.display = 'flex';
  } catch (err) {
    showAlert(err.message);
  }
};

document.getElementById('closeBankDetail').addEventListener('click', () => {
  bankDetailModal.classList.add('hidden');
  bankDetailModal.style.display = 'none';
});

window.addToBank = async function(bankId, questionId) {
  try {
    const res = await fetch(`${API}/api/question-banks/${bankId}/questions`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ questionId }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error);
    }
    viewBankDetail(bankId); // refresh
  } catch (err) {
    showAlert(err.message);
  }
};

window.removeFromBank = async function(bankId, questionId) {
  try {
    const res = await fetch(`${API}/api/question-banks/${bankId}/questions/${questionId}`, {
      method: 'DELETE', headers: headers(),
    });
    if (!res.ok) throw new Error('移除失败');
    viewBankDetail(bankId);
  } catch (err) {
    showAlert(err.message);
  }
};

loadBanks();
