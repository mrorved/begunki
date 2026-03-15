// ── Price Tab State ───────────────────────────────────────────────────────────
let priceState = {
  items: [],
  total: 0,
  skip: 0,
  limit: 60,
  loading: false,
  filtersLoaded: false,
};

// ── Cart State ────────────────────────────────────────────────────────────────
let cart = []; // { code, grd_code, name, price, qty }

async function initPriceTab() {
  if (!priceState.filtersLoaded) {
    await loadPriceFilters();
  }
  priceState.skip = 0;
  priceState.items = [];
  el('price-grid').innerHTML = '';
  el('btn-load-more').classList.add('d-none');
  await fetchProducts();
  renderCart();
}

async function loadPriceFilters() {
  try {
    const data = await API.getProductFilters();
    const typeEl = el('filter-type');
    const mfrEl  = el('filter-mfr');
    data.types.forEach(t => {
      const o = document.createElement('option');
      o.value = t; o.textContent = t;
      typeEl.appendChild(o);
    });
    data.manufacturers.forEach(m => {
      const o = document.createElement('option');
      o.value = m; o.textContent = m;
      mfrEl.appendChild(o);
    });
    priceState.filtersLoaded = true;
  } catch(e) {
    console.warn('Could not load filters', e);
  }
}

async function fetchProducts(append = false) {
  if (priceState.loading) return;
  priceState.loading = true;
  el('price-loading').classList.remove('d-none');
  el('price-empty').classList.add('d-none');

  const instock = el('filter-instock') && el('filter-instock').checked;
  const params = {
    search: el('price-search').value.trim(),
    type: el('filter-type').value,
    manufacturer: el('filter-mfr').value,
    in_stock: instock ? '1' : '',
    skip: priceState.skip,
    limit: priceState.limit,
  };

  try {
    const data = await API.getProducts(params);
    priceState.total = data.total;
    if (!append) {
      priceState.items = data.items;
    } else {
      priceState.items = priceState.items.concat(data.items);
    }
    renderProducts(data.items, append);
    el('price-count').textContent = 'Найдено: ' + priceState.total;
    if (priceState.items.length < priceState.total) {
      el('btn-load-more').classList.remove('d-none');
    } else {
      el('btn-load-more').classList.add('d-none');
    }
    if (priceState.total === 0) el('price-empty').classList.remove('d-none');
  } catch(err) {
    toastErr('Ошибка загрузки товаров: ' + err.message);
  } finally {
    priceState.loading = false;
    el('price-loading').classList.add('d-none');
  }
}

function renderProducts(items, append = false) {
  const grid = el('price-grid');
  if (!append) grid.innerHTML = '';

  items.forEach(p => {
    const photoUrl = p.photo ? (API_BASE.replace('/api', '') + '/photos/' + p.photo) : null;
    const photoHtml = photoUrl
      ? '<img src="' + photoUrl + '" class="card-img-top" alt="' + esc(p.name) + '" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';" /><div class="card-img-placeholder" style="display:none"><i class="bi bi-image"></i></div>'
      : '<div class="card-img-placeholder"><i class="bi bi-image"></i></div>';

    const stockBadge = p.stock > 0
      ? '<span class="badge bg-success-subtle text-success" style="font-size:.65rem">В наличии</span>'
      : '<span class="badge bg-secondary-subtle text-secondary" style="font-size:.65rem">Нет в наличии</span>';

    const col = document.createElement('div');
    col.className = 'col';
    col.id = 'product-col-' + p.code;
    col.innerHTML =
      '<div class="card product-card shadow-sm border-0 h-100">' +
        '<div onclick="showProduct(\'' + esc(p.code) + '\')">' + photoHtml + '</div>' +
        '<div class="card-body pb-1" onclick="showProduct(\'' + esc(p.code) + '\')">' +
          '<p class="product-name mb-1">' + esc(p.name) + '</p>' +
          '<p class="product-code mb-1">' + esc(p.code) + '</p>' +
          '<p class="product-price mb-1">' + fmtPrice(p.price) + '</p>' +
          stockBadge +
        '</div>' +
        '<div class="card-footer bg-transparent border-0 pt-0 pb-2 px-2">' +
          '<div id="cart-btn-' + esc(p.code) + '">' + makeCartBtn(p) + '</div>' +
        '</div>' +
      '</div>';
    grid.appendChild(col);
  });
}

function makeCartBtn(p) {
  const inCart = cart.find(i => i.code === p.code);
  if (inCart) {
    return '<button class="btn btn-success btn-sm w-100" onclick="event.stopPropagation();removeFromCart(\'' + esc(p.code) + '\')">' +
      '<i class="bi bi-check-lg me-1"></i>В корзине (' + inCart.qty + ')</button>';
  }
  return '<button class="btn btn-outline-primary btn-sm w-100" onclick="event.stopPropagation();addToCart(\'' + esc(p.code) + '\',\'' + esc(p.name) + '\',' + p.price + ',\'' + esc(p.grd_code) + '\')">' +
    '<i class="bi bi-cart-plus me-1"></i>В корзину</button>';
}

let searchTimer;
function onPriceSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    priceState.skip = 0;
    priceState.items = [];
    fetchProducts(false);
  }, 350);
}

function loadMoreProducts() {
  priceState.skip += priceState.limit;
  fetchProducts(true);
}

// ── Cart Logic ────────────────────────────────────────────────────────────────
function addToCart(code, name, price, grd_code) {
  const existing = cart.find(i => i.code === code);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ code, grd_code, name, price, qty: 1 });
  }
  renderCart();
  refreshCartBtn(code);
}

function removeFromCart(code) {
  cart = cart.filter(i => i.code !== code);
  renderCart();
  refreshCartBtn(code);
}

function changeCartQty(code, delta) {
  const item = cart.find(i => i.code === code);
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  renderCart();
  refreshCartBtn(code);
}

function setCartQty(code, val) {
  const item = cart.find(i => i.code === code);
  if (!item) return;
  const n = parseInt(val);
  if (n >= 1) { item.qty = n; renderCart(); refreshCartBtn(code); }
}

function clearCart() {
  const codes = cart.map(i => i.code);
  cart = [];
  renderCart();
  codes.forEach(c => refreshCartBtn(c));
}

function refreshCartBtn(code) {
  const wrap = document.getElementById('cart-btn-' + code);
  if (!wrap) return;
  const p = priceState.items.find(x => x.code === code);
  if (!p) return;
  wrap.innerHTML = makeCartBtn(p);
}

function renderCart() {
  const itemsEl  = el('cart-items');
  const emptyEl  = el('cart-empty-msg');
  const footerEl = el('cart-footer');
  const clearBtn = el('cart-clear-btn');
  const badge    = el('cart-badge');

  if (!cart.length) {
    itemsEl.innerHTML = '';
    emptyEl.style.display = 'block';
    footerEl.style.display = 'none';
    clearBtn.style.display = 'none';
    badge.classList.add('d-none');
    return;
  }

  emptyEl.style.display = 'none';
  footerEl.style.display = 'block';
  clearBtn.style.display = 'inline-block';
  badge.classList.remove('d-none');
  badge.textContent = cart.length;

  let total = 0;
  itemsEl.innerHTML = '';
  cart.forEach(item => {
    total += item.price * item.qty;
    const row = document.createElement('div');
    row.className = 'border-bottom pb-2 mb-2';
    row.innerHTML =
      '<div class="d-flex justify-content-between align-items-start gap-1 mb-1">' +
        '<span class="small fw-semibold" style="line-height:1.3">' + esc(item.name) + '</span>' +
        '<button class="btn btn-link btn-sm text-danger p-0 flex-shrink-0" onclick="removeFromCart(\'' + esc(item.code) + '\')">' +
          '<i class="bi bi-x-lg"></i></button>' +
      '</div>' +
      '<div class="d-flex justify-content-between align-items-center">' +
        '<div class="d-flex align-items-center gap-1">' +
          '<button class="btn btn-outline-secondary btn-sm px-2 py-0" style="line-height:1.4" onclick="changeCartQty(\'' + esc(item.code) + '\',-1)">−</button>' +
          '<input type="number" class="form-control form-control-sm text-center" style="width:46px;padding:1px 4px;" value="' + item.qty + '" min="1" onchange="setCartQty(\'' + esc(item.code) + '\',this.value)" />' +
          '<button class="btn btn-outline-secondary btn-sm px-2 py-0" style="line-height:1.4" onclick="changeCartQty(\'' + esc(item.code) + '\',1)">+</button>' +
        '</div>' +
        '<span class="fw-bold text-primary small">' + fmtPrice(item.price * item.qty) + '</span>' +
      '</div>';
    itemsEl.appendChild(row);
  });

  el('cart-count').textContent = cart.length;
  el('cart-total').textContent = fmtPrice(Math.round(total * 100) / 100);
}

function cartCheckout() {
  if (!cart.length) { toastErr('Корзина пуста'); return; }
  openOrderModalFromCart(cart);
}

// ── Product Detail Modal ───────────────────────────────────────────────────────
async function showProduct(code) {
  try {
    const p = await API.getProductByCode(code);

    el('mp-name').textContent = p.name;
    el('mp-code').textContent = p.code;
    el('mp-grd').textContent  = p.grd_code;
    el('mp-price').textContent = fmtPrice(p.price);
    el('mp-package').textContent = p.package;
    el('mp-stock').textContent = p.stock > 0 ? (p.stock + ' (в наличии)') : 'Нет в наличии';
    el('mp-type').textContent  = p.type || '—';
    el('mp-manufacturer').textContent = p.manufacturer || '—';

    const photoEl = el('mp-photo');
    const phEl    = el('mp-photo-placeholder');
    if (p.photo) {
      photoEl.src = API_BASE.replace('/api', '') + '/photos/' + p.photo;
      photoEl.classList.remove('d-none');
      phEl.classList.add('d-none');
    } else {
      photoEl.classList.add('d-none');
      phEl.classList.remove('d-none');
    }

    const footer = el('mp-footer');
    const inCart = cart.find(i => i.code === p.code);
    if (inCart) {
      footer.innerHTML =
        '<button class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Закрыть</button>' +
        '<button class="btn btn-success btn-sm" data-bs-dismiss="modal" onclick="removeFromCart(\'' + esc(p.code) + '\')">' +
          '<i class="bi bi-check-lg me-1"></i>В корзине — убрать</button>';
    } else {
      footer.innerHTML =
        '<button class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Закрыть</button>' +
        '<button class="btn btn-primary btn-sm" data-bs-dismiss="modal" onclick="addToCart(\'' + esc(p.code) + '\',\'' + esc(p.name) + '\',' + p.price + ',\'' + esc(p.grd_code) + '\')">' +
          '<i class="bi bi-cart-plus me-1"></i>В корзину</button>';
    }

    bsModalProduct.show();
  } catch(err) {
    toastErr('Ошибка загрузки товара: ' + err.message);
  }
}

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
