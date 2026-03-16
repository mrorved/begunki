// ── Admin Tab Init ─────────────────────────────────────────────────────────────
function initAdminTab() {
  loadStats();
}

function adminSubTab(name, linkEl) {
  // Hide all sub-panels
  ['stats', 'users', 'departments', 'import', 'photos'].forEach(t => {
    const panel = el(`admin-sub-${t}`);
    if (panel) panel.classList.add('d-none');
  });
  // Deactivate all tab links
  document.querySelectorAll('#tab-content-admin .nav-link').forEach(l => l.classList.remove('active'));

  // Show target
  el(`admin-sub-${name}`).classList.remove('d-none');
  if (linkEl) linkEl.classList.add('active');

  if (name === 'stats') loadStats();
  if (name === 'users') loadUsers();
  if (name === 'departments') loadDepartments();
}

// ── Statistics ─────────────────────────────────────────────────────────────────
async function loadStats() {
  el('stats-loading').classList.remove('d-none');
  el('stats-content').classList.add('d-none');

  try {
    const s = await API.getStats();
    renderStats(s);
  } catch(err) {
    toastErr('Ошибка загрузки статистики: ' + err.message);
  } finally {
    el('stats-loading').classList.add('d-none');
    el('stats-content').classList.remove('d-none');
  }
}

function renderStats(s) {
  el('stats-content').innerHTML = `
    <div class="row g-3 mb-4">
      <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm text-center">
          <div class="card-body py-3">
            <div class="fs-2 fw-bold text-primary">${s.total_orders}</div>
            <div class="text-muted small">Заказов всего</div>
          </div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm text-center">
          <div class="card-body py-3">
            <div class="fs-4 fw-bold text-success">${fmtPrice(s.total_sum)}</div>
            <div class="text-muted small">Общая сумма</div>
          </div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm text-center">
          <div class="card-body py-3">
            <div class="fs-2 fw-bold text-info">${s.total_clients}</div>
            <div class="text-muted small">Клиентов</div>
          </div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card border-0 shadow-sm text-center">
          <div class="card-body py-3">
            <div class="fs-2 fw-bold text-secondary">${s.total_products}</div>
            <div class="text-muted small">Товаров в прайсе</div>
          </div>
        </div>
      </div>
    </div>

    <h6 class="mb-3">Заказы по агентам</h6>
    ${s.by_agent.length ? `
    <div class="card border-0 shadow-sm">
      <div class="table-responsive">
        <table class="table table-hover mb-0">
          <thead class="table-light">
            <tr>
              <th>Агент</th>
              <th class="text-center">Заказов</th>
              <th class="text-end">Сумма</th>
            </tr>
          </thead>
          <tbody>
            ${s.by_agent.map(a => `
              <tr>
                <td class="fw-semibold">${esc(a.agent_name)}</td>
                <td class="text-center">
                  <span class="badge bg-primary-subtle text-primary">${a.orders_count}</span>
                </td>
                <td class="text-end fw-semibold text-success">${fmtPrice(a.orders_sum)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : '<p class="text-muted small">Агентов пока нет</p>'}`;
}

// ── Users Management ───────────────────────────────────────────────────────────
let allUsers = [];

async function loadUsers() {
  el('users-list').innerHTML = '<div class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div></div>';

  try {
    allUsers = await API.getUsers();
    renderUsers();
  } catch(err) {
    toastErr('Ошибка загрузки пользователей: ' + err.message);
  }
}

function renderUsers() {
  const list = el('users-list');

  if (!allUsers.length) {
    list.innerHTML = '<p class="text-muted">Пользователей нет</p>';
    return;
  }

  list.innerHTML = `
    <div class="card border-0 shadow-sm">
      <div class="table-responsive">
        <table class="table table-hover mb-0">
          <thead class="table-light">
            <tr>
              <th>Логин</th>
              <th>Имя</th>
              <th>Роль</th>
              <th>Отдел</th>
              <th>Статус</th>
              <th>Добавлен</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${allUsers.map(u => `
              <tr>
                <td class="fw-semibold">${esc(u.username)}</td>
                <td>${esc(u.full_name || '—')}</td>
                <td>
                  ${{'admin':'<span class="badge bg-warning text-dark">Администратор</span>',
                     'director':'<span class="badge bg-purple text-white" style="background:#6f42c1">Дирекция</span>',
                     'head':'<span class="badge bg-primary">Нач. отдела</span>',
                     'agent':'<span class="badge bg-info text-dark">Агент</span>'}[u.role] || u.role}
                </td>
                <td>${esc(u.department_name || '—')}</td>
                <td>
                  ${u.is_active
                    ? '<span class="badge bg-success">Активен</span>'
                    : '<span class="badge bg-secondary">Отключён</span>'}
                </td>
                <td class="text-muted small">${fmtDate(u.created_at)}</td>
                <td class="text-end">
                  <div class="dropdown">
                    <button class="btn btn-sm btn-light" data-bs-toggle="dropdown">
                      <i class="bi bi-three-dots-vertical"></i>
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end">
                      <li><a class="dropdown-item" href="#" onclick="openUserModal(${u.id})">
                        <i class="bi bi-pencil me-2"></i>Редактировать</a></li>
                      <li><a class="dropdown-item" href="#" onclick="toggleUserActive(${u.id}, ${!u.is_active})">
                        <i class="bi bi-${u.is_active ? 'pause' : 'play'} me-2"></i>
                        ${u.is_active ? 'Отключить' : 'Активировать'}</a></li>
                      <li><hr class="dropdown-divider"></li>
                      <li><a class="dropdown-item text-danger" href="#" onclick="deleteUser(${u.id}, '${esc(u.username)}')">
                        <i class="bi bi-trash me-2"></i>Удалить</a></li>
                    </ul>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

async function openUserModal(userId = null) {
  // Load departments for select
  if (!allDepartments.length) {
    try { allDepartments = await API.getDepartments(); } catch(_) {}
  }

  // Populate dept select
  const deptSel = el('mu-department');
  deptSel.innerHTML = '<option value="">— Без отдела —</option>';
  allDepartments.forEach(d => {
    const o = document.createElement('option');
    o.value = d.id; o.textContent = d.name;
    deptSel.appendChild(o);
  });

  el('mu-id').value = userId || '';
  el('mu-username').value = '';
  el('mu-fullname').value = '';
  el('mu-password').value = '';
  el('mu-role').value = 'agent';
  deptSel.value = '';

  if (userId) {
    el('mu-title').textContent = 'Редактировать пользователя';
    el('mu-pass-hint').textContent = '(оставьте пустым чтобы не менять)';
    el('mu-username').setAttribute('readonly', true);
    const u = allUsers.find(x => x.id === userId);
    if (u) {
      el('mu-username').value = u.username;
      el('mu-fullname').value = u.full_name || '';
      el('mu-role').value = u.role;
      deptSel.value = u.department_id || '';
    }
  } else {
    el('mu-title').textContent = 'Новый пользователь';
    el('mu-pass-hint').textContent = '(обязательно для нового)';
    el('mu-username').removeAttribute('readonly');
  }

  bsModalUser.show();
}

async function saveUser() {
  const id = parseInt(el('mu-id').value);
  const username = el('mu-username').value.trim();
  const fullname = el('mu-fullname').value.trim();
  const password = el('mu-password').value;
  const role     = el('mu-role').value;

  if (!id && (!username || !password)) {
    toastErr('Заполните логин и пароль');
    return;
  }

  const department_id = el('mu-department').value ? parseInt(el('mu-department').value) : null;

  try {
    if (id) {
      const data = { full_name: fullname, role, department_id };
      if (password) data.password = password;
      await API.updateUser(id, data);
      toastOk('Пользователь обновлён');
    } else {
      await API.createUser({ username, password, full_name: fullname, role, department_id });
      toastOk('Пользователь создан');
    }
    bsModalUser.hide();
    loadUsers();
  } catch(err) {
    toastErr('Ошибка: ' + err.message);
  }
}

async function toggleUserActive(id, isActive) {
  try {
    await API.updateUser(id, { is_active: isActive });
    toastOk(isActive ? 'Пользователь активирован' : 'Пользователь отключён');
    loadUsers();
  } catch(err) {
    toastErr('Ошибка: ' + err.message);
  }
}

async function deleteUser(id, username) {
  if (!confirm(`Удалить пользователя «${username}»?`)) return;
  try {
    await API.deleteUser(id);
    toastOk('Пользователь удалён');
    loadUsers();
  } catch(err) {
    toastErr('Ошибка: ' + err.message);
  }
}

// ── Price Import ───────────────────────────────────────────────────────────────
async function doImportPrice() {
  const fileInput = el('price-file');
  if (!fileInput.files.length) { toastErr('Выберите файл Excel'); return; }

  const resultEl = el('import-result');
  resultEl.innerHTML = '<div class="spinner-border spinner-border-sm text-primary me-2"></div>Импортируется...';

  try {
    const result = await API.importPrice(fileInput.files[0]);
    resultEl.innerHTML = `
      <div class="alert alert-success mb-0 py-2">
        <i class="bi bi-check-circle me-1"></i>
        Импортировано: <strong>${result.imported}</strong> товаров.
        ${result.skipped ? `Пропущено: ${result.skipped}.` : ''}
      </div>`;
    fileInput.value = '';
    // Reset filters cache so they reload
    priceState.filtersLoaded = false;
    toastOk(`Прайс загружен: ${result.imported} товаров`);
  } catch(err) {
    resultEl.innerHTML = `<div class="alert alert-danger mb-0 py-2">${esc(err.message)}</div>`;
    toastErr('Ошибка импорта: ' + err.message);
  }
}

// ── Photo Upload ───────────────────────────────────────────────────────────────
async function doUploadPhotos() {
  const fileInput = el('photo-files');
  if (!fileInput.files.length) { toastErr('Выберите файлы фотографий'); return; }

  const resultEl = el('photos-result');
  const files = Array.from(fileInput.files);

  resultEl.innerHTML = `<div class="spinner-border spinner-border-sm text-primary me-2"></div>Загружается 0 / ${files.length}...`;

  let ok = 0, fail = 0;
  for (let i = 0; i < files.length; i++) {
    try {
      await API.uploadPhoto(files[i]);
      ok++;
    } catch(_) {
      fail++;
    }
    resultEl.innerHTML = `<div class="spinner-border spinner-border-sm text-primary me-2"></div>Загружается ${i + 1} / ${files.length}...`;
  }

  resultEl.innerHTML = `
    <div class="alert ${fail ? 'alert-warning' : 'alert-success'} mb-0 py-2">
      <i class="bi bi-${fail ? 'exclamation-triangle' : 'check-circle'} me-1"></i>
      Загружено: <strong>${ok}</strong>${fail ? `, ошибок: ${fail}` : ''}.
    </div>`;
  fileInput.value = '';
  toastOk(`Фото загружено: ${ok} файлов`);
}

// ── Departments Management ────────────────────────────────────────────────────
let allDepartments = [];

async function loadDepartments() {
  const list = el('departments-list');
  list.innerHTML = '<div class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div></div>';
  try {
    allDepartments = await API.getDepartments();
    renderDepartments();
  } catch(err) {
    toastErr('Ошибка загрузки отделов: ' + err.message);
  }
}

function renderDepartments() {
  const list = el('departments-list');
  if (!allDepartments.length) {
    list.innerHTML = '<p class="text-muted">Отделов пока нет. Создайте первый отдел.</p>';
    return;
  }
  list.innerHTML = `
    <div class="card border-0 shadow-sm">
      <div class="table-responsive">
        <table class="table table-hover mb-0">
          <thead class="table-light">
            <tr><th>Название</th><th></th></tr>
          </thead>
          <tbody>
            ${allDepartments.map(d => `
              <tr>
                <td class="fw-semibold">${esc(d.name)}</td>
                <td class="text-end">
                  <button class="btn btn-sm btn-outline-secondary me-1" onclick="openDeptModal(${d.id})">
                    <i class="bi bi-pencil"></i>
                  </button>
                  <button class="btn btn-sm btn-outline-danger" onclick="deleteDept(${d.id}, '${esc(d.name)}')">
                    <i class="bi bi-trash"></i>
                  </button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function openDeptModal(deptId = null) {
  el('md-id').value = deptId || '';
  el('md-name').value = '';
  el('md-title').textContent = deptId ? 'Редактировать отдел' : 'Новый отдел';
  if (deptId) {
    const d = allDepartments.find(x => x.id === deptId);
    if (d) el('md-name').value = d.name;
  }
  bsModalDept.show();
}

async function saveDept() {
  const name = el('md-name').value.trim();
  if (!name) { toastErr('Введите название отдела'); return; }
  const id = parseInt(el('md-id').value);
  try {
    if (id) {
      await API.updateDepartment(id, { name });
      toastOk('Отдел обновлён');
    } else {
      await API.createDepartment({ name });
      toastOk('Отдел создан');
    }
    bsModalDept.hide();
    loadDepartments();
  } catch(err) {
    toastErr('Ошибка: ' + err.message);
  }
}

async function deleteDept(id, name) {
  if (!confirm(`Удалить отдел «${name}»?`)) return;
  try {
    await API.deleteDepartment(id);
    toastOk('Отдел удалён');
    loadDepartments();
  } catch(err) {
    toastErr('Ошибка: ' + err.message);
  }
}

function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
