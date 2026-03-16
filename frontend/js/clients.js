function statusClientBadge(status) {
  const map = {
    new:       ['secondary', '🆕 Новый'],
    potential: ['info',      '💡 Потенциальный'],
    revived:   ['warning',   '🔄 Оживший'],
    active:    ['success',   '✅ Действующий'],
  };
  const [cls, label] = map[status] || ['secondary', status || 'Новый'];
  return `<span class="badge bg-${cls} bg-opacity-75">${label}</span>`;
}


// ── Inline client form inside order modal ────────────────────────────────────
function toggleInlineClientForm(e) {
  e.preventDefault();
  const form = el('mo-inline-client-form');
  const icon = el('mo-new-client-icon');
  const label = el('mo-new-client-label');
  const isOpen = !form.classList.contains('d-none');

  if (isOpen) {
    form.classList.add('d-none');
    icon.className = 'bi bi-plus-circle';
    label.textContent = 'Создать нового клиента';
  } else {
    form.classList.remove('d-none');
    icon.className = 'bi bi-dash-circle';
    label.textContent = 'Скрыть форму';
    // Clear fields
    ['moc-inn','moc-name','moc-phone','moc-email','moc-contact','moc-city','moc-address','moc-comment'].forEach(id => {
      const f = el(id); if (f) f.value = '';
    });
    el('moc-inn-status').textContent = '';
  }
}

async function lookupInnInline() {
  const inn = el('moc-inn').value.trim();
  if (!inn || (inn.length !== 10 && inn.length !== 12)) {
    el('moc-inn-status').innerHTML = '<span class="text-danger">ИНН: 10 или 12 цифр</span>';
    return;
  }
  const btn = el('moc-inn-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
  el('moc-inn-status').innerHTML = '<span class="text-muted">Поиск...</span>';
  try {
    const data = await apiGet('/clients/inn/' + inn);
    el('moc-name').value = data.name || '';
    el('moc-city').value    = data.city    || '';
    el('moc-address').value = data.address || '';
    el('moc-inn-status').innerHTML =
      '<span class="text-success"><i class="bi bi-check-circle me-1"></i>' + esc(data.name) + '</span>';
  } catch(err) {
    el('moc-inn-status').innerHTML =
      '<span class="text-danger">' + err.message + '</span>';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-search"></i>';
  }
}

async function saveInlineClient() {
  const name = el('moc-name').value.trim();
  if (!name) { toastErr('Введите название клиента'); return; }

  const data = {
    name,
    inn:            el('moc-inn').value.trim()     || null,
    phone:          el('moc-phone').value.trim()   || null,
    email:          el('moc-email') ? el('moc-email').value.trim() || null : null,
    contact_person: el('moc-contact').value.trim() || null,
    city:           el('moc-city').value.trim()    || null,
    address:        el('moc-address') ? el('moc-address').value.trim() || null : null,
    status:         el('moc-status') ? el('moc-status').value || 'new' : 'new',
    comment:        el('moc-comment') ? el('moc-comment').value.trim() || null : null,
  };

  try {
    const saved = await API.createClient(data);
    toastOk('Клиент создан: ' + saved.name);

    // Refresh clients list
    allClients = await API.getClients();

    // Auto-select the new client and go to step 2
    selectOrderClient(saved.id, saved.name);

    // Hide form
    el('mo-inline-client-form').classList.add('d-none');
    el('mo-new-client-icon').className = 'bi bi-plus-circle';
    el('mo-new-client-label').textContent = 'Создать нового клиента';
  } catch(err) {
    toastErr('Ошибка: ' + err.message);
  }
}


// ── INN Lookup ────────────────────────────────────────────────────────────────
async function lookupInn() {
  const inn = el('mc-inn').value.trim();
  if (!inn || (inn.length !== 10 && inn.length !== 12)) {
    el('mc-inn-status').innerHTML = '<span class="text-danger">ИНН должен содержать 10 или 12 цифр</span>';
    return;
  }

  const btn = el('mc-inn-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
  el('mc-inn-status').innerHTML = '<span class="text-muted">Поиск...</span>';

  try {
    const data = await apiGet('/clients/inn/' + inn);
    el('mc-name').value    = data.name    || '';
    el('mc-city').value    = data.city    || '';
    el('mc-address').value = data.address || '';
    el('mc-inn').value     = data.inn     || inn;
    el('mc-inn-status').innerHTML =
      '<span class="text-success"><i class="bi bi-check-circle me-1"></i>Найдено: ' + esc(data.name) + '</span>';
  } catch(err) {
    el('mc-inn-status').innerHTML =
      '<span class="text-danger"><i class="bi bi-exclamation-circle me-1"></i>' + err.message + '</span>';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-search"></i> Найти';
  }
}

// ── Clients State ─────────────────────────────────────────────────────────────
let allClients = [];

async function loadClients() {
  el('clients-loading').classList.remove('d-none');
  el('clients-list').innerHTML = '';
  el('clients-empty').classList.add('d-none');

  try {
    allClients = await API.getClients();
    renderClients(allClients);
  } catch(err) {
    toastErr('Ошибка загрузки клиентов: ' + err.message);
  } finally {
    el('clients-loading').classList.add('d-none');
  }
}

function renderClients(clients) {
  const list = el('clients-list');
  list.innerHTML = '';

  if (!clients.length) {
    el('clients-empty').classList.remove('d-none');
    return;
  }
  el('clients-empty').classList.add('d-none');

  clients.forEach(c => {
    const col = document.createElement('div');
    col.className = 'col-12 col-sm-6 col-lg-4';
    col.innerHTML = `
      <div class="card client-card shadow-sm border-0 h-100">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start">
            <div class="flex-grow-1 me-2">
              <div class="d-flex align-items-center gap-2 flex-wrap mb-1">
                <h6 class="mb-0 fw-semibold">${esc(c.name)}</h6>
                ${statusClientBadge(c.status)}
              </div>
              ${c.city ? `<small class="text-muted"><i class="bi bi-geo-alt me-1"></i>${esc(c.city)}</small>` : ''}
            </div>
            <div class="dropdown">
              <button class="btn btn-sm btn-light" data-bs-toggle="dropdown">
                <i class="bi bi-three-dots-vertical"></i>
              </button>
              <ul class="dropdown-menu dropdown-menu-end">
                <li><a class="dropdown-item" href="#" onclick="openClientModal(false, ${c.id})">
                  <i class="bi bi-pencil me-2"></i>Редактировать</a></li>
                <li><a class="dropdown-item" href="#" onclick="openOrderForClient(${c.id})">
                  <i class="bi bi-bag-plus me-2"></i>Создать заказ</a></li>
                <li><hr class="dropdown-divider"></li>
                <li><a class="dropdown-item text-danger" href="#" onclick="deleteClient(${c.id}, '${esc(c.name)}')">
                  <i class="bi bi-trash me-2"></i>Удалить</a></li>
              </ul>
            </div>
          </div>
          <div class="mt-2 small text-muted">
            ${c.phone        ? `<div><i class="bi bi-telephone me-1"></i>${esc(c.phone)}</div>` : ''}
            ${c.email        ? `<div><i class="bi bi-envelope me-1"></i>${esc(c.email)}</div>` : ''}
            ${c.contact_person ? `<div><i class="bi bi-person me-1"></i>${esc(c.contact_person)}</div>` : ''}
            ${c.address      ? `<div><i class="bi bi-house me-1"></i>${esc(c.address)}</div>` : ''}
            ${c.comment      ? `<div class="mt-1 text-muted fst-italic">${esc(c.comment)}</div>` : ''}
          </div>
          <div class="mt-2">
            <small class="text-muted">Добавлен: ${fmtDate(c.created_at)}</small>
          </div>
        </div>
      </div>`;
    list.appendChild(col);
  });
}

function filterClients(query) {
  const q = query.toLowerCase();
  const filtered = allClients.filter(c =>
    c.name.toLowerCase().includes(q) ||
    (c.city || '').toLowerCase().includes(q) ||
    (c.phone || '').toLowerCase().includes(q) ||
    (c.contact_person || '').toLowerCase().includes(q)
  );
  renderClients(filtered);
}

// ── Client Modal ──────────────────────────────────────────────────────────────
// fromOrder: bool — called from order creation flow
// clientId: int | null — for edit
let clientModalFromOrder = false;

function openClientModal(fromOrder = false, clientId = null) {
  clientModalFromOrder = fromOrder;

  el('mc-id').value = clientId || '';
  el('mc-name').value = '';
  el('mc-inn').value = '';
  el('mc-phone').value = '';
  el('mc-email').value = '';
  el('mc-contact').value = '';
  el('mc-city').value = '';
  el('mc-address').value = '';
  el('mc-comment').value = '';
  el('mc-status').value = 'new';
  el('mc-inn-status').textContent = '';

  if (clientId) {
    el('mc-title').textContent = 'Редактировать клиента';
    const c = allClients.find(x => x.id === clientId);
    if (c) {
      el('mc-name').value    = c.name    || '';
      el('mc-inn').value     = c.inn     || '';
      el('mc-phone').value   = c.phone   || '';
      el('mc-email').value   = c.email   || '';
      el('mc-contact').value = c.contact_person || '';
      el('mc-city').value    = c.city    || '';
      el('mc-address').value = c.address || '';
      el('mc-comment').value = c.comment || '';
      el('mc-status').value  = c.status  || 'new';
    }
  } else {
    el('mc-title').textContent = 'Новый клиент';
  }

  bsModalClient.show();
}

async function saveClient() {
  const name = el('mc-name').value.trim();
  if (!name) { toastErr('Введите название клиента'); return; }

  const data = {
    name,
    inn:            el('mc-inn').value.trim()     || null,
    phone:          el('mc-phone').value.trim()   || null,
    email:          el('mc-email').value.trim()   || null,
    contact_person: el('mc-contact').value.trim() || null,
    city:           el('mc-city').value.trim()    || null,
    address:        el('mc-address').value.trim() || null,
    comment:        el('mc-comment').value.trim() || null,
    status:         el('mc-status').value || 'new',
  };

  const id = parseInt(el('mc-id').value);

  try {
    let saved;
    if (id) {
      saved = await API.updateClient(id, data);
      toastOk('Клиент обновлён');
    } else {
      saved = await API.createClient(data);
      toastOk('Клиент создан');
    }

    bsModalClient.hide();

    // Refresh client list
    allClients = await API.getClients();
    if (currentTab === 'clients') renderClients(allClients);

    // If called from order wizard — re-render client list there
    if (clientModalFromOrder) {
      renderOrderClients(allClients);
    }
  } catch(err) {
    toastErr('Ошибка: ' + err.message);
  }
}

async function deleteClient(id, name) {
  if (!confirm(`Удалить клиента «${name}»?`)) return;
  try {
    await API.deleteClient(id);
    allClients = allClients.filter(c => c.id !== id);
    renderClients(allClients);
    toastOk('Клиент удалён');
  } catch(err) {
    toastErr('Ошибка удаления: ' + err.message);
  }
}

function openOrderForClient(clientId) {
  openOrderModal(null, clientId);
}
