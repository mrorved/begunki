// ── Order Modal State ─────────────────────────────────────────────────────────
let orderState = {
  step: 1,
  clientId: null,
  clientName: '',
  items: [],       // { code, grd_code, name, price, qty, basePrice }
  editId: null,    // order ID when editing
};

let orderProductSearch = [];  // search results cache
let orderSearchTimer;

// ── Open from cart ────────────────────────────────────────────────────────────
async function openOrderModalFromCart(cartItems) {
  resetOrderModal();

  // Load clients if needed
  if (!allClients.length) {
    try { allClients = await API.getClients(); } catch(_) {}
  }

  // Pre-fill items from cart
  orderState.items = cartItems.map(i => ({
    code: i.code,
    grd_code: i.grd_code,
    name: i.name,
    basePrice: i.price,
    price: i.price,
    qty: i.qty,
  }));

  el('mo-title').textContent = 'Новый заказ из корзины';
  renderOrderClients(allClients);
  bsModalOrder.show();
}

// ── Open / Reset ──────────────────────────────────────────────────────────────
async function openOrderModal(orderId = null, preselectedClientId = null) {
  resetOrderModal();

  // Load clients if needed
  if (!allClients.length) {
    try { allClients = await API.getClients(); } catch(_) {}
  }

  if (orderId) {
    // Edit mode — load existing order
    try {
      const o = await API.getOrders();
      const order = o.find(x => x.id === orderId);
      if (!order) { toastErr('Заказ не найден'); return; }

      orderState.editId = orderId;
      orderState.clientId = order.client_id;
      orderState.clientName = order.client_name;
      el('mo-title').textContent = `Заказ #${orderId}`;
      el('mo-discount').value = order.discount;
      if (el('mo-comment')) el('mo-comment').value = order.comment || '';

      // Rebuild items from order
      orderState.items = order.items.map(i => ({
        code: i.product_code,
        grd_code: i.grd_code,
        name: i.product_name,
        basePrice: i.price / (1 - order.discount / 100) || i.price,
        price: i.price,
        qty: i.qty,
      }));

      orderStep(2);
    } catch(err) {
      toastErr('Ошибка загрузки заказа: ' + err.message);
    }
  } else {
    el('mo-title').textContent = 'Новый заказ';
    renderOrderClients(allClients);

    if (preselectedClientId) {
      const c = allClients.find(x => x.id === preselectedClientId);
      if (c) selectOrderClient(c.id, c.name);
    }
  }

  bsModalOrder.show();
}

function resetOrderModal() {
  orderState = { step: 1, clientId: null, clientName: '', items: [], editId: null };
  if (typeof updatePriceCartButtons === 'function') updatePriceCartButtons();
  el('mo-step1').classList.remove('d-none');
  el('mo-step2').classList.add('d-none');
  el('mo-btn-back').classList.add('d-none');
  el('mo-btn-save').classList.add('d-none');
  el('mo-total-block').classList.add('d-none');
  el('mo-step-ind-1').className = 'fw-semibold text-primary';
  el('mo-step-ind-2').className = 'text-muted';
  el('mo-items-list').innerHTML = '';
  el('mo-search-results').classList.add('d-none');
  el('mo-search').value = '';
  el('mo-quick-code').value = '';
  el('mo-discount').value = '0';
  el('mo-id').value = '';
  if (el('mo-comment')) el('mo-comment').value = '';
}

// ── Step navigation ────────────────────────────────────────────────────────────
function orderStep(n) {
  orderState.step = n;
  if (n === 1) {
    el('mo-step1').classList.remove('d-none');
    el('mo-step2').classList.add('d-none');
    el('mo-btn-back').classList.add('d-none');
    el('mo-btn-save').classList.add('d-none');
    el('mo-total-block').classList.add('d-none');
    el('mo-step-ind-1').className = 'fw-semibold text-primary';
    el('mo-step-ind-2').className = 'text-muted';
  } else {
    el('mo-step1').classList.add('d-none');
    el('mo-step2').classList.remove('d-none');
    el('mo-btn-back').classList.remove('d-none');
    el('mo-btn-save').classList.remove('d-none');
    el('mo-total-block').classList.remove('d-none');
    el('mo-step-ind-1').className = 'text-muted';
    el('mo-step-ind-2').className = 'fw-semibold text-primary';
    el('mo-client-label').textContent = orderState.clientName;
    renderOrderItems();
    recalcOrder();
    // Show "add to cart" buttons on price tab
    if (typeof updatePriceCartButtons === 'function') updatePriceCartButtons();
  }
}

// ── Client selection in wizard ────────────────────────────────────────────────
function renderOrderClients(clients) {
  const list = el('mo-clients-list');
  list.innerHTML = '';

  if (!clients.length) {
    list.innerHTML = '<p class="text-muted text-center py-3 small">Клиентов пока нет</p>';
    return;
  }

  clients.forEach(c => {
    const item = document.createElement('div');
    item.className = 'list-group-item list-group-item-action border-0 rounded mb-1';
    item.style.cursor = 'pointer';
    item.innerHTML = `
      <div class="d-flex justify-content-between align-items-center">
        <div>
          <div class="fw-semibold">${esc(c.name)}</div>
          <small class="text-muted">${[c.city, c.phone].filter(Boolean).join(' · ')}</small>
        </div>
        <i class="bi bi-chevron-right text-muted"></i>
      </div>`;
    item.onclick = () => selectOrderClient(c.id, c.name);
    list.appendChild(item);
  });
}

function filterOrderClients(q) {
  const filtered = allClients.filter(c =>
    c.name.toLowerCase().includes(q.toLowerCase()) ||
    (c.city || '').toLowerCase().includes(q.toLowerCase())
  );
  renderOrderClients(filtered);
}

function selectOrderClient(id, name) {
  orderState.clientId = id;
  orderState.clientName = name;
  orderStep(2);
}

// ── Product search inside order ────────────────────────────────────────────────
function searchInOrder(query) {
  clearTimeout(orderSearchTimer);
  const results = el('mo-search-results');
  if (!query.trim()) { results.classList.add('d-none'); return; }

  orderSearchTimer = setTimeout(async () => {
    try {
      const data = await API.getProducts({ search: query, limit: 20 });
      orderProductSearch = data.items;

      results.innerHTML = '';
      if (!data.items.length) {
        results.innerHTML = '<p class="text-muted small p-2">Ничего не найдено</p>';
        results.classList.remove('d-none');
        return;
      }

      const lg = document.createElement('div');
      lg.className = 'list-group list-group-flush';

      data.items.forEach(p => {
        const item = document.createElement('a');
        item.href = '#';
        item.className = 'list-group-item list-group-item-action';
        item.innerHTML = `
          <div class="d-flex justify-content-between align-items-center">
            <div class="me-2" style="min-width:0">
              <div class="small fw-semibold text-truncate">${esc(p.name)}</div>
              <small class="text-muted">${esc(p.code)} · ${fmtPrice(p.price)}</small>
            </div>
            <button class="btn btn-primary btn-sm flex-shrink-0" onclick="event.preventDefault();addProductToOrder('${esc(p.code)}')">
              <i class="bi bi-plus-lg"></i>
            </button>
          </div>`;
        lg.appendChild(item);
      });

      results.appendChild(lg);
      results.classList.remove('d-none');
    } catch(e) {
      console.error(e);
    }
  }, 300);
}

async function quickAdd() {
  const code = el('mo-quick-code').value.trim();
  if (!code) return;
  await addProductToOrder(code);
  el('mo-quick-code').value = '';
}

async function addProductToOrder(code) {
  // Check if already in order
  const existing = orderState.items.find(i => i.code === code);
  if (existing) {
    existing.qty += 1;
    recalcOrder();
    renderOrderItems();
    toastOk('Количество увеличено');
    return;
  }

  try {
    const p = await API.getProductByCode(code);
    orderState.items.push({
      code: p.code,
      grd_code: p.grd_code,
      name: p.name,
      basePrice: p.price,
      price: p.price,
      qty: 1,
    });
    recalcOrder();
    renderOrderItems();
    // Clear search
    el('mo-search').value = '';
    el('mo-search-results').classList.add('d-none');
    toastOk(`Добавлено: ${p.name}`);
  } catch(err) {
    toastErr('Товар не найден: ' + code);
  }
}

function removeOrderItem(code) {
  orderState.items = orderState.items.filter(i => i.code !== code);
  recalcOrder();
  renderOrderItems();
}

function changeQty(code, delta) {
  const item = orderState.items.find(i => i.code === code);
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  recalcOrder();
  renderOrderItems();
}

function setQty(code, val) {
  const item = orderState.items.find(i => i.code === code);
  if (!item) return;
  const n = parseInt(val);
  if (n > 0) { item.qty = n; recalcOrder(); }
}

// ── Recalc prices with discount ───────────────────────────────────────────────
function getDiscountValue() {
  const sel = el('mo-discount').value;
  if (sel === 'custom') {
    return parseFloat(el('mo-discount-val').value) || 0;
  }
  return parseFloat(sel) || 0;
}

function onDiscountSelect() {
  const sel = el('mo-discount').value;
  if (sel === 'custom') {
    el('mo-discount-custom').classList.remove('d-none');
    el('mo-discount-val').focus();
  } else {
    el('mo-discount-custom').classList.add('d-none');
  }
  recalcOrder();
}

function recalcOrder() {
  // discount > 0 = наценка (цена растёт), discount < 0 = скидка (цена падает)
  const discount = getDiscountValue();
  let total = 0;

  orderState.items.forEach(item => {
    item.price = Math.round(item.basePrice * (1 + discount / 100) * 100) / 100;
    total += item.price * item.qty;
  });

  el('mo-total').textContent = fmtPrice(Math.round(total * 100) / 100);
  el('mo-items-count').textContent = orderState.items.length;
}

// ── Render order items ─────────────────────────────────────────────────────────
function renderOrderItems() {
  const list = el('mo-items-list');
  list.innerHTML = '';
  el('mo-items-count').textContent = orderState.items.length;

  if (!orderState.items.length) {
    list.innerHTML = '<p class="text-muted small text-center py-3">Добавьте товары через поиск или по коду</p>';
    return;
  }

  orderState.items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'oi-row d-flex align-items-center gap-2 py-2';
    row.innerHTML = `
      <div class="flex-grow-1 min-w-0">
        <div class="small fw-semibold text-truncate" style="max-width:200px">${esc(item.name)}</div>
        <small class="text-muted">${esc(item.code)} · ${fmtPrice(item.price)} за шт.</small>
      </div>
      <div class="d-flex align-items-center gap-1 flex-shrink-0">
        <button class="btn btn-outline-secondary btn-sm px-2 py-0" onclick="changeQty('${esc(item.code)}', -1)">−</button>
        <input type="number" class="form-control form-control-sm text-center"
          style="width:50px;padding:2px 4px;"
          value="${item.qty}" min="1"
          onchange="setQty('${esc(item.code)}', this.value)"
          onblur="recalcOrder();renderOrderItems();" />
        <button class="btn btn-outline-secondary btn-sm px-2 py-0" onclick="changeQty('${esc(item.code)}', 1)">+</button>
      </div>
      <div class="text-end flex-shrink-0" style="min-width:70px">
        <div class="fw-bold text-primary small">${fmtPrice(item.price * item.qty)}</div>
      </div>
      <button class="btn btn-link btn-sm text-danger p-0 flex-shrink-0" onclick="removeOrderItem('${esc(item.code)}')">
        <i class="bi bi-x-lg"></i>
      </button>`;
    list.appendChild(row);
  });
}

// ── Save Order ─────────────────────────────────────────────────────────────────
async function saveOrder() {
  if (!orderState.clientId) { toastErr('Выберите клиента'); return; }
  if (!orderState.items.length) { toastErr('Добавьте хотя бы один товар'); return; }

  const payload = {
    client_id: orderState.clientId,
    discount: getDiscountValue(),
    comment: el('mo-comment') ? el('mo-comment').value.trim() || null : null,
    items: orderState.items.map(i => ({ product_code: i.code, qty: i.qty })),
  };

  try {
    if (orderState.editId) {
      await API.updateOrder(orderState.editId, payload);
      toastOk('Заказ обновлён');
    } else {
      await API.createOrder(payload);
      toastOk('Заказ сохранён');
    }
    bsModalOrder.hide();
    resetOrderModal();
    // Clear cart after successful order
    if (typeof clearCart === 'function') clearCart();
    if (currentTab === 'orders') loadOrders();
  } catch(err) {
    toastErr('Ошибка сохранения: ' + err.message);
  }
}

// ── Orders List ────────────────────────────────────────────────────────────────
let allOrders = [];

async function initOrdersTab() {
  // Show advanced filters for admin/director
  if (Auth.canViewAll()) {
    const adv = el('orders-advanced-filters');
    if (adv) adv.classList.remove('d-none');
    // Hide "New order" button for director
    if (Auth.isDirector()) {
      const btn = el('btn-new-order');
      if (btn) btn.classList.add('d-none');
    }
    // Load departments for filter
    try {
      const depts = await API.getDepartments();
      const deptSel = el('orders-filter-dept');
      if (deptSel) {
        depts.forEach(d => {
          const o = document.createElement('option');
          o.value = d.id; o.textContent = d.name;
          deptSel.appendChild(o);
        });
      }
    } catch(_) {}
    // Load clients for filter
    try {
      const clients = await API.getClients();
      const cSel = el('orders-filter-client');
      if (cSel) {
        clients.forEach(c => {
          const o = document.createElement('option');
          o.value = c.id; o.textContent = c.name;
          cSel.appendChild(o);
        });
      }
    } catch(_) {}
  }
  await loadOrders();
}

async function onDeptFilterChange() {
  // When dept changes — reload agents for that dept
  const deptId = el('orders-filter-dept') ? el('orders-filter-dept').value : '';
  const agentSel = el('orders-filter-agent');
  if (agentSel) {
    agentSel.innerHTML = '<option value="">Все агенты</option>';
    if (deptId) {
      try {
        const users = await apiGet('/admin/users');
        users.filter(u => String(u.department_id) === String(deptId) && u.role !== 'director')
          .forEach(u => {
            const o = document.createElement('option');
            o.value = u.id; o.textContent = u.full_name || u.username;
            agentSel.appendChild(o);
          });
      } catch(_) {}
    }
  }
  loadOrders();
}

async function loadOrders() {
  el('orders-loading').classList.remove('d-none');
  el('orders-list').innerHTML = '';
  el('orders-empty').classList.add('d-none');

  try {
    const params = {
      status: el('orders-filter-status') ? el('orders-filter-status').value : '',
    };
    // Add dept/agent/client filters for admin/director
    if (Auth.canViewAll()) {
      const deptEl = el('orders-filter-dept');
      const agentEl = el('orders-filter-agent');
      const clientEl = el('orders-filter-client');
      if (deptEl) params.department_id = deptEl.value;
      if (agentEl) params.agent_id = agentEl.value;
      if (clientEl) params.client_id = clientEl.value;
    }
    allOrders = await API.getOrdersFiltered(params);
    renderOrders(allOrders);
  } catch(err) {
    toastErr('Ошибка загрузки заказов: ' + err.message);
  } finally {
    el('orders-loading').classList.add('d-none');
  }
}

function renderOrders(orders) {
  const list = el('orders-list');
  list.innerHTML = '';

  if (!orders.length) {
    el('orders-empty').classList.remove('d-none');
    return;
  }
  el('orders-empty').classList.add('d-none');

  const table = document.createElement('div');
  table.className = 'card shadow-sm border-0';

  orders.forEach((o, idx) => {
    const discountStr = o.discount > 0 ? `+${o.discount}%` : o.discount < 0 ? `${o.discount}%` : '0%';
    const row = document.createElement('div');
    row.className = `order-row p-3 ${idx < orders.length - 1 ? 'border-bottom' : ''}`;
    row.innerHTML = `
      <div class="d-flex justify-content-between align-items-start">
        <div class="flex-grow-1 me-2" onclick="showOrderDetail(${o.id})" style="cursor:pointer">
          <div class="d-flex align-items-center gap-2 mb-1">
            <span class="fw-semibold">Заказ #${o.id}</span>
            ${statusBadge(o.status)}
          </div>
          <div class="small text-muted mb-1">
            <i class="bi bi-person me-1"></i>${esc(o.client_name || '—')}
            ${o.client_city ? `<span class="ms-1">· ${esc(o.client_city)}</span>` : ''}
          </div>
          <div class="d-flex gap-3 small">
            <span class="text-muted">${fmtDate(o.created_at)}</span>
            <span class="text-muted">Поз.: ${o.items.length}</span>
            <span class="text-muted">Скидка: ${discountStr}</span>
            <span class="fw-semibold text-primary">${fmtPrice(o.total)}</span>
          </div>
          ${(Auth.isAdmin() || Auth.isDirector() || Auth.isHead()) ? `<small class="text-muted"><i class="bi bi-person-badge me-1"></i>Агент: ${esc(o.agent_name || '—')}</small>` : ''}
        </div>
        <div class="dropdown flex-shrink-0">
          <button class="btn btn-sm btn-light" data-bs-toggle="dropdown">
            <i class="bi bi-three-dots-vertical"></i>
          </button>
          <ul class="dropdown-menu dropdown-menu-end">
            <li><a class="dropdown-item" href="#" onclick="showOrderDetail(${o.id})">
              <i class="bi bi-eye me-2"></i>Просмотр</a></li>
            ${o.status !== 'exported' && o.status !== 'processing' ? `
            <li><a class="dropdown-item" href="#" onclick="openOrderModal(${o.id})">
              <i class="bi bi-pencil me-2"></i>Редактировать</a></li>
            <li><a class="dropdown-item text-primary fw-semibold" href="#" onclick="processOrder(${o.id})">
              <i class="bi bi-arrow-right-circle me-2"></i>Отправить в обработку</a></li>` : ''}
            <li><a class="dropdown-item text-success" href="#" onclick="doExportOrder(${o.id})">
              <i class="bi bi-download me-2"></i>Экспорт .grd</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item text-danger" href="#" onclick="deleteOrder(${o.id})">
              <i class="bi bi-trash me-2"></i>Удалить</a></li>
          </ul>
        </div>
      </div>`;
    table.appendChild(row);
  });

  list.appendChild(table);
}

// ── Order detail modal ─────────────────────────────────────────────────────────
function showOrderDetail(id) {
  const o = allOrders.find(x => x.id === id);
  if (!o) return;

  const discountStr = o.discount > 0 ? `+${o.discount}%` : o.discount < 0 ? `${o.discount}%` : '0%';

  el('mod-title').textContent = `Заказ #${o.id}`;

  el('mod-body').innerHTML = `
    <div class="row g-2 mb-3 small">
      <div class="col-6"><span class="text-muted">Статус:</span> ${statusBadge(o.status)}</div>
      <div class="col-6"><span class="text-muted">Дата:</span> <strong>${fmtDate(o.created_at)}</strong></div>
      <div class="col-12"><span class="text-muted">Клиент:</span> <strong>${esc(o.client_name || '—')}</strong>
        ${o.client_city ? `<span class="text-muted ms-1">(${esc(o.client_city)})</span>` : ''}</div>
      ${(Auth.isAdmin() || Auth.isDirector() || Auth.isHead()) ? `<div class="col-12"><span class="text-muted">Агент:</span> <strong>${esc(o.agent_name || '—')}</strong></div>` : ''}
      <div class="col-6"><span class="text-muted">Скидка/наценка:</span> <strong>${discountStr}</strong></div>
      <div class="col-6"><span class="text-muted">Итого:</span> <strong class="text-primary">${fmtPrice(o.total)}</strong></div>
      ${o.comment ? `<div class="col-12"><span class="text-muted">Комментарий:</span> <span class="fst-italic">${esc(o.comment)}</span></div>` : ''}
    </div>
    <hr class="my-2" />
    <p class="small text-muted mb-2">Позиции (${o.items.length}):</p>
    <div class="table-responsive">
      <table class="table table-sm table-hover mb-0 small">
        <thead class="table-light">
          <tr>
            <th>Товар</th>
            <th class="text-center">Кол-во</th>
            <th class="text-end">Цена</th>
            <th class="text-end">Сумма</th>
          </tr>
        </thead>
        <tbody>
          ${o.items.map(i => `
            <tr>
              <td>
                <div class="fw-semibold">${esc(i.product_name || i.product_code)}</div>
                <small class="text-muted">${esc(i.product_code)} · ГРД: ${esc(i.grd_code)}</small>
              </td>
              <td class="text-center">${i.qty}</td>
              <td class="text-end">${fmtPrice(i.price)}</td>
              <td class="text-end fw-semibold">${fmtPrice(i.total)}</td>
            </tr>`).join('')}
        </tbody>
        <tfoot class="table-light">
          <tr>
            <td colspan="3" class="text-end fw-bold">Итого:</td>
            <td class="text-end fw-bold text-primary">${fmtPrice(o.total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>`;

  const exportBtn = `<button class="btn btn-success btn-sm" onclick="doExportOrder(${o.id})"><i class="bi bi-download me-1"></i>Экспорт .grd</button>`;
  const canEdit = o.status !== 'exported' && o.status !== 'processing' &&
    (Auth.isAdmin() || Auth.isHead() || o.agent_id === Auth.user.id);
  const editBtn = canEdit
    ? `<button class="btn btn-outline-primary btn-sm" onclick="bsModalOrderDetail.hide();openOrderModal(${o.id})"><i class="bi bi-pencil me-1"></i>Редактировать</button>`
    : '';
  const processBtn = canEdit
    ? `<button class="btn btn-primary btn-sm" onclick="bsModalOrderDetail.hide();processOrder(${o.id})"><i class="bi bi-arrow-right-circle me-1"></i>В обработку</button>`
    : '';

  el('mod-footer').innerHTML = `
    <button class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Закрыть</button>
    ${editBtn}
    ${processBtn}
    ${exportBtn}`;

  bsModalOrderDetail.show();
}

// ── Order actions ──────────────────────────────────────────────────────────────
async function submitOrder(id) {
  if (!confirm('Отправить заказ?')) return;
  try {
    await API.submitOrder(id);
    toastOk('Заказ отправлен');
    loadOrders();
  } catch(err) {
    toastErr('Ошибка: ' + err.message);
  }
}

async function processOrder(id) {
  if (!confirm('Отправить заказ в обработку? После этого он исчезнет из основного списка.')) return;
  try {
    await API.processOrder(id);
    toastOk('Заказ отправлен в обработку');
    loadOrders();
  } catch(err) {
    toastErr('Ошибка: ' + err.message);
  }
}

async function doExportOrder(id) {
  try {
    await API.exportOrder(id);
    toastOk('Файл .grd скачан');
    loadOrders();
    // Update detail if open
    const o = allOrders.find(x => x.id === id);
    if (o) o.status = 'exported';
  } catch(err) {
    toastErr('Ошибка экспорта: ' + err.message);
  }
}

async function deleteOrder(id) {
  if (!confirm('Удалить заказ?')) return;
  try {
    await API.deleteOrder(id);
    toastOk('Заказ удалён');
    loadOrders();
  } catch(err) {
    toastErr('Ошибка: ' + err.message);
  }
}
