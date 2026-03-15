// ── Bootstrap instances ────────────────────────────────────────────────────────
let bsModalProduct, bsModalClient, bsModalOrder, bsModalOrderDetail, bsModalUser;
let bsToast;

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Init Bootstrap modals
  bsModalProduct     = new bootstrap.Modal(document.getElementById('modalProduct'));
  bsModalClient      = new bootstrap.Modal(document.getElementById('modalClient'));
  bsModalOrder       = new bootstrap.Modal(document.getElementById('modalOrder'));
  bsModalOrderDetail = new bootstrap.Modal(document.getElementById('modalOrderDetail'));
  bsModalUser        = new bootstrap.Modal(document.getElementById('modalUser'));
  bsToast = new bootstrap.Toast(document.getElementById('app-toast'), { delay: 3000 });

  // Enter key on login
  document.getElementById('inp-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });

  // Check saved session
  if (Auth.load()) {
    initApp();
  }
  // else: login screen is shown by default
});

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'bg-dark') {
  const el = document.getElementById('app-toast');
  el.className = `toast align-items-center text-white border-0 ${type}`;
  document.getElementById('toast-msg').textContent = msg;
  bsToast.show();
}
function toastOk(msg)  { showToast(msg, 'bg-success'); }
function toastErr(msg) { showToast(msg, 'bg-danger'); }

// ── Login / Logout ────────────────────────────────────────────────────────────
async function doLogin() {
  const username = document.getElementById('inp-username').value.trim();
  const password = document.getElementById('inp-password').value;
  const alertEl  = document.getElementById('login-alert');

  if (!username || !password) {
    alertEl.textContent = 'Введите логин и пароль';
    alertEl.classList.remove('d-none');
    return;
  }

  try {
    const data = await API.login(username, password);
    Auth.save(data);
    alertEl.classList.add('d-none');
    initApp();
  } catch (err) {
    alertEl.textContent = err.message;
    alertEl.classList.remove('d-none');
  }
}

function doLogout() {
  Auth.clear();
  showLogin();
}

function showLogin() {
  document.getElementById('page-login').classList.remove('d-none');
  document.getElementById('page-app').classList.add('d-none');
  document.getElementById('inp-username').value = '';
  document.getElementById('inp-password').value = '';
}

function initApp() {
  document.getElementById('page-login').classList.add('d-none');
  document.getElementById('page-app').classList.remove('d-none');

  // Set user info in navbar
  document.getElementById('nav-username').textContent = Auth.user.full_name || '';

  // Show/hide admin tab based on role
  const adminLi = document.getElementById('nav-admin-li');
  if (Auth.isAdmin()) {
    adminLi.style.removeProperty('display');
  } else {
    adminLi.style.setProperty('display', 'none', 'important');
  }

  // Load first tab
  showTab('price');
}

// ── Tab routing ────────────────────────────────────────────────────────────────
let currentTab = null;

function showTab(name) {
  // Hide all
  document.querySelectorAll('.tab-content-pane').forEach(el => {
    el.classList.remove('active');
    el.classList.add('d-none');
  });
  // Deactivate nav links
  document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active-tab'));

  // Show target
  const pane = document.getElementById(`tab-content-${name}`);
  if (pane) {
    pane.classList.remove('d-none');
    pane.classList.add('active');
  }

  // Activate nav link
  const link = document.getElementById(`tab-${name}`);
  if (link) link.classList.add('active-tab');

  // Collapse navbar on mobile after click
  const nav = bootstrap.Collapse.getInstance(document.getElementById('mainNav'));
  if (nav) nav.hide();

  // Load data for tab
  currentTab = name;
  if (name === 'price')   { initPriceTab(); }
  if (name === 'clients') { loadClients(); }
  if (name === 'orders')  { loadOrders(); }
  if (name === 'admin')   { initAdminTab(); }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtPrice(n) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(n);
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function statusBadge(status) {
  const map = {
    draft:     ['secondary', 'Черновик'],
    submitted: ['primary',   'Отправлен'],
    exported:  ['success',   'Экспортирован'],
  };
  const [cls, label] = map[status] || ['secondary', status];
  return `<span class="badge bg-${cls}">${label}</span>`;
}

function el(id) { return document.getElementById(id); }
