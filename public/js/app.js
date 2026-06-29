/* ──────────────────────────────────────────────
   가족사랑기프트 - app.js
   ────────────────────────────────────────────── */
const API = '';
var PRODUCT_PAGE_SIZE = 10;
var APPLY_PAGE_SIZE = 10;

// ── 이미지 프록시 ──────────────────────────────
function proxyImg(url) {
  if (!url) return '';
  return API + '/api/img?url=' + encodeURIComponent(url);
}
function productImgHtml(imageUrl, name) {
  if (!imageUrl) return '<div class="product-img-placeholder">🎁</div>';
  return '<img src="' + proxyImg(imageUrl) + '" alt="' + name + '" loading="lazy"' +
    ' onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'" style="width:100%;height:100%;object-fit:cover">' +
    '<div class="product-img-placeholder" style="display:none">🎁</div>';
}

// ── 토스트 ──────────────────────────────────────
function toast(msg, type) {
  var el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(function() { el.remove(); }, 2800);
}

// ── 상태 ───────────────────────────────────────
var state = {
  products: [],
  currentVendor: 'all',
  priceRange: 'all',
  searchQ: '',
  productPage: 1,
  applyVendor: 'all',
  applyPriceRange: 'all',
  applyPage: 1,
  currentStep: 1,
  applicantType: 'new',
  numAnniversaries: 1,
  annSlots: [
    { type: '', date: '', recipient: '', products: [] },
    { type: '', date: '', recipient: '', products: [] },
  ],
  activeAnnSlot: 0,
  remainingBudget: 150000,
  wishlist: [],
};

/* ═══════════════════════════════════════════════
   관리자 잠금
═══════════════════════════════════════════════ */
var ADMIN_TABS = ['admin'];
var _pendingAdminTab = '';

function isAdminAuth() {
  return sessionStorage.getItem('adminAuth') === '1';
}

document.querySelectorAll('.nav-item').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var tab = btn.dataset.tab;
    if (ADMIN_TABS.indexOf(tab) !== -1 && !isAdminAuth()) {
      _pendingAdminTab = tab;
      document.getElementById('adminPwInput').value = '';
      document.getElementById('adminLockError').textContent = '';
      document.getElementById('adminLockModal').classList.remove('hidden');
      setTimeout(function() { document.getElementById('adminPwInput').focus(); }, 100);
      return;
    }
    switchTab(tab);
  });
});

var _activeAdminSub = 'applications';

function switchAdminSub(sub) {
  _activeAdminSub = sub;
  document.querySelectorAll('.admin-sub-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.sub === sub); });
  document.querySelectorAll('.admin-sub-section').forEach(function(s) { s.classList.toggle('active', s.id === 'adminSub-' + sub); });
  if (sub === 'applications') loadApplications();
  if (sub === 'delivery') loadDeliverySchedule();
  if (sub === 'settings') loadSettings();
  document.getElementById('fmansExcelRow').style.display = (sub === 'delivery') ? 'flex' : 'none';
}

document.querySelectorAll('.admin-sub-btn').forEach(function(btn) {
  btn.addEventListener('click', function() { switchAdminSub(btn.dataset.sub); });
});

function switchTab(tab) {
  document.querySelectorAll('.nav-item').forEach(function(b) { b.classList.toggle('active', b.dataset.tab === tab); });
  document.querySelectorAll('.tab-section').forEach(function(s) { s.classList.toggle('active', s.id === 'tab-' + tab); });
  if (tab === 'admin') {
    switchAdminSub(_activeAdminSub);
  }
}

// 관리자 비밀번호 확인
document.getElementById('btnAdminConfirm').addEventListener('click', confirmAdminPw);
document.getElementById('adminPwInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') confirmAdminPw();
});
async function confirmAdminPw() {
  var pw = document.getElementById('adminPwInput').value;
  var errEl = document.getElementById('adminLockError');
  try {
    var res = await fetch(API + '/api/verify-admin', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({password: pw}) });
    var data = await res.json();
    if (data.ok) {
      sessionStorage.setItem('adminAuth', '1');
      document.getElementById('adminLockModal').classList.add('hidden');
      switchTab(_pendingAdminTab);
      _pendingAdminTab = '';
    } else {
      errEl.textContent = '비밀번호가 올바르지 않습니다';
      document.getElementById('adminPwInput').select();
    }
  } catch(e) {
    errEl.textContent = '서버 오류';
  }
}

/* ═══════════════════════════════════════════════
   상품 탭
═══════════════════════════════════════════════ */
function priceInRange(price, range) {
  if (range === 'all') return true;
  if (range === 'low')  return price >= 50000 && price < 80000;
  if (range === 'mid')  return price >= 80000 && price < 130000;
  if (range === 'high') return price >= 130000 && price <= 150000;
  return true;
}

async function loadProducts() {
  var params = new URLSearchParams();
  if (state.currentVendor !== 'all') params.set('vendor', state.currentVendor);
  if (state.searchQ) params.set('q', state.searchQ);
  var grid = document.getElementById('productGrid');
  grid.innerHTML = '<div class="loading">상품 불러오는 중...</div>';
  try {
    var res = await fetch(API + '/api/products?' + params);
    state.products = await res.json();
    renderMainProductGrid();
  } catch(e) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p class="empty-text">상품을 불러오지 못했습니다</p></div>';
  }
}

function renderMainProductGrid() {
  var grid = document.getElementById('productGrid');
  var list = state.products.filter(function(p) { return priceInRange(p.price, state.priceRange); });
  var totalPages = Math.max(1, Math.ceil(list.length / PRODUCT_PAGE_SIZE));
  var page = Math.min(state.productPage, totalPages);
  state.productPage = page;
  renderProductGrid(grid, list.slice((page-1)*PRODUCT_PAGE_SIZE, page*PRODUCT_PAGE_SIZE), false);
  renderMainPagination(list.length, totalPages, page);
}

function renderMainPagination(total, totalPages, current) {
  var bar = document.getElementById('mainPagination');
  if (totalPages <= 1) { bar.innerHTML = ''; return; }
  var html = '';
  if (current > 1) html += '<button class="page-btn" data-page="' + (current-1) + '">‹</button>';
  for (var i = 1; i <= totalPages; i++) {
    html += '<button class="page-btn' + (i === current ? ' active' : '') + '" data-page="' + i + '">' + i + '</button>';
  }
  if (current < totalPages) html += '<button class="page-btn" data-page="' + (current+1) + '">›</button>';
  html += '<span class="page-info">' + total + '개 중 ' + ((current-1)*PRODUCT_PAGE_SIZE+1) + '~' + Math.min(current*PRODUCT_PAGE_SIZE, total) + '</span>';
  bar.innerHTML = html;
  bar.querySelectorAll('.page-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      state.productPage = parseInt(btn.dataset.page);
      renderMainProductGrid();
      document.getElementById('productGrid').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

/* ── 찜하기 (IP 기반 서버 저장) ───────────────── */
async function loadWishlist() {
  try {
    var res = await fetch(API + '/api/wishlist');
    state.wishlist = await res.json();
  } catch(e) { state.wishlist = []; }
}
function isWishlisted(id) {
  return state.wishlist.some(function(p) { return p.id === id; });
}
async function toggleWishlist(product) {
  if (isWishlisted(product.id)) {
    state.wishlist = state.wishlist.filter(function(p) { return p.id !== product.id; });
  } else {
    state.wishlist.push(product);
  }
  var ids = state.wishlist.map(function(p) { return p.id; });
  try {
    await fetch(API + '/api/wishlist', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ids: ids}) });
  } catch(e) {}
  renderMainProductGrid();
}
function renderWishlistSection() {
  var sec = document.getElementById('wishlistSection');
  var itemsEl = document.getElementById('wishlistItems');
  var countEl = document.getElementById('wishlistCount');
  if (!state.wishlist.length) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  countEl.textContent = '(' + state.wishlist.length + '개)';
  itemsEl.innerHTML = state.wishlist.map(function(p) {
    return '<div class="wishlist-item" data-id="' + p.id + '">' +
      '<div class="wishlist-item-img">' + (p.image_url ? '<img src="' + proxyImg(p.image_url) + '" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display=\'none\'">' : '🎁') + '</div>' +
      '<div class="wishlist-item-info">' +
        '<div class="wishlist-item-name">' + p.name + '</div>' +
        '<div class="wishlist-item-price">' + p.price.toLocaleString() + '원</div>' +
      '</div>' +
      '<button class="btn-add-wish" data-id="' + p.id + '">담기</button>' +
    '</div>';
  }).join('');
  itemsEl.querySelectorAll('.btn-add-wish').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var id = parseInt(btn.dataset.id);
      var p = state.wishlist.find(function(x) { return x.id === id; });
      if (p) toggleApplyProduct(p);
    });
  });
}

document.getElementById('btnWishlistInfoClose').addEventListener('click', function() {
  document.getElementById('wishlistInfoModal').classList.add('hidden');
});

function renderProductGrid(container, products, selectable) {
  if (!products.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><p class="empty-text">상품이 없습니다</p></div>';
    return;
  }
  var activeSlotProducts = state.annSlots[state.activeAnnSlot].products;
  container.innerHTML = products.map(function(p) {
    var isSelected = activeSlotProducts.some(function(s) { return s.id === p.id; });
    var wished = isWishlisted(p.id);
    return '<div class="product-card' + (isSelected ? ' selected' : '') + '" data-id="' + p.id + '" data-selectable="' + selectable + '">' +
      '<div class="product-img-wrap">' +
        productImgHtml(p.image_url, p.name) +
        '<button class="btn-wishlist' + (wished ? ' active' : '') + '" data-wid="' + p.id + '">' + (wished ? '♥' : '♡') + '</button>' +
      '</div>' +
      '<div class="product-info">' +
        '<span class="vendor-tag ' + p.vendor + '">' + p.vendor_name + '</span>' +
        '<div class="product-name">' + p.name + '</div>' +
        '<div class="product-price">' + p.price.toLocaleString() + '원</div>' +
        '<a class="btn-shop-link" href="' + p.product_url + '" target="_blank" rel="noopener">쇼핑몰 상세보기 ↗</a>' +
      '</div></div>';
  }).join('');
  container.querySelectorAll('.product-card').forEach(function(card) {
    card.addEventListener('click', function(e) {
      if (e.target.closest('.btn-shop-link')) return;
      if (e.target.closest('.btn-wishlist')) {
        var wid = parseInt(e.target.closest('.btn-wishlist').dataset.wid);
        var wp = products.find(function(p) { return p.id === wid; });
        if (wp) toggleWishlist(wp);
        return;
      }
      var id = parseInt(card.dataset.id);
      var product = products.find(function(p) { return p.id === id; });
      if (card.dataset.selectable === 'true') {
        toggleApplyProduct(product);
      } else {
        openProductModal(product);
      }
    });
  });
}

// 벤더 칩 (상품탭)
document.querySelectorAll('.chip[data-vendor]').forEach(function(chip) {
  chip.addEventListener('click', function() {
    document.querySelectorAll('.chip[data-vendor]').forEach(function(c) { c.classList.remove('active'); });
    chip.classList.add('active');
    state.currentVendor = chip.dataset.vendor;
    state.productPage = 1;
    loadProducts();
  });
});
// 가격 칩 (상품탭)
document.querySelectorAll('.chip[data-price]').forEach(function(chip) {
  chip.addEventListener('click', function() {
    document.querySelectorAll('.chip[data-price]').forEach(function(c) { c.classList.remove('active'); });
    chip.classList.add('active');
    state.priceRange = chip.dataset.price;
    state.productPage = 1;
    renderMainProductGrid();
  });
});

var searchTimer;
document.getElementById('searchInput').addEventListener('input', function(e) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(function() { state.searchQ = e.target.value.trim(); state.productPage = 1; loadProducts(); }, 350);
});

document.getElementById('btnCrawl').addEventListener('click', triggerCrawl);
document.getElementById('btnCrawlFull').addEventListener('click', triggerCrawl);
async function triggerCrawl() {
  var btn = document.getElementById('btnCrawl');
  btn.classList.add('spinning');
  document.getElementById('crawlStatus').textContent = '크롤링 중... (1~2분 소요)';
  try {
    await fetch(API + '/api/crawl', { method: 'POST' });
    toast('상품 새로고침 시작됨 (1~2분 후 반영)');
    setTimeout(function() { loadProducts(); document.getElementById('crawlStatus').textContent = '완료'; }, 90000);
  } catch(e) { toast('크롤링 요청 실패', 'error'); }
  btn.classList.remove('spinning');
}

/* ═══════════════════════════════════════════════
   상품 상세 모달
═══════════════════════════════════════════════ */
var modalProduct = null;
function openProductModal(product) {
  modalProduct = product;
  document.getElementById('pModalName').textContent = product.name;
  document.getElementById('pModalImg').src = proxyImg(product.image_url);
  document.getElementById('pModalLink').href = product.product_url;
  document.getElementById('pModalInfo').innerHTML =
    '<p style="margin-bottom:8px"><span class="vendor-tag ' + product.vendor + '" style="font-size:12px">' + product.vendor_name + '</span></p>' +
    '<p style="font-size:22px;font-weight:700;color:var(--primary);margin-bottom:4px">' + product.price.toLocaleString() + '원</p>' +
    '<p style="font-size:13px;color:var(--text-muted)">' + (product.category || '') + '</p>';
  document.getElementById('productModal').classList.remove('hidden');
}
function closeProductModal() { document.getElementById('productModal').classList.add('hidden'); }
document.getElementById('btnPModalClose').addEventListener('click', closeProductModal);
document.getElementById('btnPModalClose2').addEventListener('click', closeProductModal);
document.getElementById('productModal').addEventListener('click', function(e) { if (e.target === e.currentTarget) closeProductModal(); });

/* ═══════════════════════════════════════════════
   신청 탭 - 스텝 관리
═══════════════════════════════════════════════ */
function goToStep(n) {
  state.currentStep = n;
  document.querySelectorAll('.step-content').forEach(function(el) { el.classList.remove('active'); });
  var target = (n === 'done') ? document.getElementById('stepDone') : document.getElementById('step' + n);
  if (target) target.classList.add('active');
  document.querySelectorAll('.step-tab').forEach(function(tab) {
    var s = parseInt(tab.dataset.step);
    tab.classList.remove('active', 'done');
    if (s === n) tab.classList.add('active');
    else if (s < n) tab.classList.add('done');
  });
  if (n === 3) { state.applyPage = 1; renderStep3(); }
  if (n === 4) { renderOrderSummary(); prefillStep4(); }
}
document.querySelectorAll('.step-tab').forEach(function(tab) {
  tab.addEventListener('click', function() {
    if (tab.classList.contains('done')) goToStep(parseInt(tab.dataset.step));
  });
});

/* ── 기존/신규 신청자 토글 ────────────────────── */
document.getElementById('btnTypeNew').addEventListener('click', function() {
  state.applicantType = 'new';
  document.getElementById('btnTypeNew').classList.add('active');
  document.getElementById('btnTypeExisting').classList.remove('active');
  document.getElementById('existingSearch').classList.add('hidden');
  document.getElementById('applicantForm').style.display = 'block';
  updateAnnCountButtons();
});
document.getElementById('btnTypeExisting').addEventListener('click', function() {
  state.applicantType = 'existing';
  document.getElementById('btnTypeExisting').classList.add('active');
  document.getElementById('btnTypeNew').classList.remove('active');
  document.getElementById('existingSearch').classList.remove('hidden');
  document.getElementById('applicantForm').style.display = 'none';
  document.getElementById('existingNameInput').focus();
});

var existingSearchTimer;
document.getElementById('existingNameInput').addEventListener('input', function(e) {
  clearTimeout(existingSearchTimer);
  var name = e.target.value.trim();
  if (!name) { document.getElementById('existingResults').innerHTML = ''; return; }
  existingSearchTimer = setTimeout(function() { searchExistingApplicant(name); }, 400);
});
async function searchExistingApplicant(name) {
  var resultsEl = document.getElementById('existingResults');
  try {
    var [appsRes, settingsRes] = await Promise.all([
      fetch(API + '/api/applications'),
      fetch(API + '/api/settings')
    ]);
    var apps = await appsRes.json();
    var settings = await settingsRes.json();

    // 명단에서 이름 검색
    var employeeList = (settings.employee_list || '').split('\n')
      .map(function(n) { return n.trim(); })
      .filter(function(n) { return n && n.includes(name); });

    // 신청내역에서 이름 검색 (최신 1건씩)
    var seen = {};
    var matchedApps = apps.filter(function(a) {
      return a.employee_name && a.employee_name.includes(name) && !seen[a.employee_name] && (seen[a.employee_name] = true);
    });

    // 명단에만 있고 신청내역엔 없는 이름
    var appNames = new Set(matchedApps.map(function(a) { return a.employee_name; }));
    var listOnly = employeeList.filter(function(n) { return !appNames.has(n); });

    if (!matchedApps.length && !listOnly.length) {
      resultsEl.innerHTML = '<div class="existing-empty">검색 결과 없음. 신규 신청자로 진행하세요.</div>';
      return;
    }

    var html = matchedApps.map(function(a) {
      var date = new Date(a.submitted_at).toLocaleDateString('ko-KR');
      return '<div class="existing-card" data-id="' + a.id + '">' +
        '<div class="existing-card-name">' + a.employee_name + '</div>' +
        '<div class="existing-card-meta"><span>📁 ' + (a.department||'부서없음') + '</span><span>🪪 ' + (a.employee_id||'-') + '</span><span>📅 ' + date + '</span></div>' +
        '</div>';
    }).join('');
    html += listOnly.map(function(n) {
      return '<div class="existing-card existing-card-list" data-listname="' + n + '">' +
        '<div class="existing-card-name">' + n + '</div>' +
        '<div class="existing-card-meta"><span>📋 명단 등록</span><span style="color:#888;font-size:11px">신청 내역 없음</span></div>' +
        '</div>';
    }).join('');
    resultsEl.innerHTML = html;

    resultsEl.querySelectorAll('.existing-card[data-id]').forEach(function(card) {
      card.addEventListener('click', function() {
        var id = parseInt(card.dataset.id);
        var app = apps.find(function(a) { return a.id === id; });
        if (!app) return;
        document.getElementById('applyName').value = app.employee_name || '';
        document.getElementById('applyDept').value = app.department || '';
        document.getElementById('applyEmpId').value = app.employee_id || '';
        document.getElementById('applyContact').value = app.contact || '';
        document.getElementById('existingSearch').classList.add('hidden');
        document.getElementById('applicantForm').style.display = 'block';
        fetchUsage(app.employee_name);
        toast(app.employee_name + '님 정보 불러옴', 'success');
      });
    });
    resultsEl.querySelectorAll('.existing-card[data-listname]').forEach(function(card) {
      card.addEventListener('click', function() {
        var n = card.dataset.listname;
        document.getElementById('applyName').value = n;
        document.getElementById('applyDept').value = '';
        document.getElementById('applyEmpId').value = '';
        document.getElementById('applyContact').value = '';
        document.getElementById('existingSearch').classList.add('hidden');
        document.getElementById('applicantForm').style.display = 'block';
        fetchUsage(n);
        toast(n + '님 선택됨', 'success');
      });
    });
  } catch(e) { resultsEl.innerHTML = '<div class="existing-empty">불러오기 실패</div>'; }
}

// 이름 입력 → 기존 이력 감지 + 사용 현황
var usageTimer, _pendingAlertName = '';
document.getElementById('applyName').addEventListener('input', function(e) {
  clearTimeout(usageTimer);
  var name = e.target.value.trim();
  if (name.length < 2) { document.getElementById('usageBox').style.display = 'none'; return; }
  usageTimer = setTimeout(function() {
    fetchUsage(name);
    if (state.applicantType === 'new') checkExistingHistory(name);
    else validateEmployeeName(name);
  }, 700);
});
async function fetchUsage(name) {
  try {
    var res = await fetch(API + '/api/usage?name=' + encodeURIComponent(name));
    var data = await res.json();
    state.remainingBudget = data.remaining_budget;
    document.getElementById('usageBox').style.display = 'block';
    document.getElementById('usageCount').textContent = data.count + '/2회';
    document.getElementById('usageBudget').textContent = data.remaining_budget.toLocaleString() + '원';
    var warn = document.getElementById('usageWarn');
    if (data.remaining_count <= 0) { warn.textContent = '올해 신청 횟수(2회)를 모두 사용하셨습니다.'; warn.classList.remove('hidden'); }
    else if (data.remaining_budget <= 0) { warn.textContent = '올해 예산(15만원)을 모두 사용하셨습니다.'; warn.classList.remove('hidden'); }
    else warn.classList.add('hidden');
  } catch(e) {}
}
function getEmployeeList(settings) {
  return (settings.employee_list || '').split('\n').map(function(n) { return n.trim(); }).filter(Boolean);
}

async function validateEmployeeName(name) {
  // 기존신청자 탭: 특별한 검증 없이 패스
}

async function checkExistingHistory(name) {
  try {
    var [appsRes, settingsRes] = await Promise.all([
      fetch(API + '/api/applications'),
      fetch(API + '/api/settings'),
    ]);
    var apps = await appsRes.json();
    var settings = await settingsRes.json();
    var employeeList = getEmployeeList(settings);

    var isInList = employeeList.length > 0 && employeeList.some(function(n) { return n === name; });
    var matched = apps.filter(function(a) { return a.employee_name === name && a.status !== 'cancelled'; });

    // 명단에 있거나 기존 이력이 있으면 팝업
    if (!isInList && !matched.length) return;
    _pendingAlertName = name;

    if (isInList && !matched.length) {
      // 명단에만 있고 DB 이력 없음 → 신규신청 차단 + 기존신청자 전환 유도
      document.getElementById('alertModalTitle').textContent = name + '님은 기존 신청자입니다';
      document.getElementById('alertModalBody').textContent = '임직원 명단에 등록된 분입니다. 기존 신청자 탭에서 이전 신청 내역을 확인해주세요.';
      document.getElementById('alertModalHistory').innerHTML = '';
    } else {
      // 기존 이력이 있는 경우
      document.getElementById('alertModalTitle').textContent = name + '님, 이미 신청 이력이 있습니다';
      document.getElementById('alertModalBody').textContent = '기존 신청자로 전환하면 이전 정보가 자동으로 채워집니다.';
      var history = matched.slice(0, 3).map(function(a) {
        var date = new Date(a.submitted_at).toLocaleDateString('ko-KR');
        var lbl = {pending:'대기',processing:'처리중',done:'완료',cancelled:'취소'};
        return '<div class="alert-history-row">📅 ' + date + ' · ' + a.anniversary_type + ' · <strong>' + (a.total_price||0).toLocaleString() + '원</strong> · ' + (lbl[a.status]||a.status) + '</div>';
      }).join('');
      document.getElementById('alertModalHistory').innerHTML = history;
    }
    document.getElementById('existingAlertModal').classList.remove('hidden');
  } catch(e) {}
}
document.getElementById('btnAlertSwitch').addEventListener('click', function() {
  document.getElementById('existingAlertModal').classList.add('hidden');
  document.getElementById('btnTypeExisting').click();
  document.getElementById('existingNameInput').value = _pendingAlertName;
  searchExistingApplicant(_pendingAlertName);
  _pendingAlertName = '';
});
document.getElementById('btnAlertContinue').addEventListener('click', function() {
  document.getElementById('existingAlertModal').classList.add('hidden');
  _pendingAlertName = '';
});

/* ── Step 1 버튼 ──────────────────────────────── */
document.getElementById('btnStep1Next').addEventListener('click', function() {
  var name = document.getElementById('applyName').value.trim();
  if (!name) { toast('이름을 입력해주세요', 'error'); return; }
  updateAnnCountButtons();
  goToStep(2);
});

/* ── Step 2 - 기념일 횟수 + 슬롯 ─────────────── */
function updateAnnCountButtons() {
  var btn2 = document.querySelector('.ann-count-btn[data-count="2"]');
  if (state.applicantType === 'existing') {
    btn2.disabled = true;
    btn2.title = '기존 신청자는 1회만 신청 가능합니다';
    btn2.style.opacity = '0.4';
    // 강제 1회로 리셋
    document.querySelectorAll('.ann-count-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.count === '1'); });
    state.numAnniversaries = 1;
    document.getElementById('annSlot1').classList.add('hidden');
  } else {
    btn2.disabled = false;
    btn2.title = '';
    btn2.style.opacity = '';
  }
}

document.querySelectorAll('.ann-count-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    if (btn.disabled) return;
    document.querySelectorAll('.ann-count-btn').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    state.numAnniversaries = parseInt(btn.dataset.count);
    document.getElementById('annSlot1').classList.toggle('hidden', state.numAnniversaries < 2);
  });
});
document.getElementById('btnStep2Prev').addEventListener('click', function() { goToStep(1); });
document.getElementById('btnStep2Next').addEventListener('click', function() {
  for (var i = 0; i < state.numAnniversaries; i++) {
    var annType = document.querySelector('input[name="annType' + i + '"]:checked');
    var annDate = document.getElementById('applyAnnDate' + i).value;
    var recipient = document.getElementById('applyRecipient' + i).value.trim();
    if (!annType) { toast('기념일 ' + (i+1) + '의 종류를 선택해주세요', 'error'); return; }
    if (!annDate) { toast('기념일 ' + (i+1) + '의 날짜를 입력해주세요', 'error'); return; }
    if (!recipient) { toast('기념일 ' + (i+1) + '의 수령인을 입력해주세요', 'error'); return; }
    // 신청 마감일 체크: 기념일 전월 20일
    var d = new Date(annDate);
    var deadline = new Date(d.getFullYear(), d.getMonth() - 1, 20);
    var today = new Date(); today.setHours(0,0,0,0);
    if (today > deadline) {
      var deadlineStr = (d.getMonth()) + '월 20일'; // 전월
      showDeadlineAlert(
        (d.getMonth() + 1) + '월 기념일 신청 마감',
        (d.getMonth() + 1) + '월 기념일은 ' + deadlineStr + '까지 신청 가능합니다.\n\n마감일이 지나 신청이 제한됩니다.\n\n신청이 필요한 경우 인사조직관리팀 이슬에게 문의 부탁드립니다. (배송일 최소 3일 필요)'
      );
      return;
    }
    state.annSlots[i].type = annType.value;
    state.annSlots[i].date = annDate;
    state.annSlots[i].recipient = recipient;
  }
  goToStep(3);
});

function showDeadlineAlert(title, message) {
  var modal = document.getElementById('deadlineAlertModal');
  document.getElementById('deadlineAlertTitle').textContent = title;
  document.getElementById('deadlineAlertMsg').textContent = message;
  modal.style.display = 'flex';
}

/* ── Step 3 - 기념일별 상품 ───────────────────── */
function renderStep3() {
  state.activeAnnSlot = 0;
  renderAnnTabBar();
  renderWishlistSection();
  renderApplyProductGrid();
}

function getTotalAllSlots() {
  var t = 0;
  for (var i = 0; i < state.numAnniversaries; i++) {
    t += state.annSlots[i].products.reduce(function(s, p) { return s + p.price + (p.cakeAdded ? 34000 : 0); }, 0);
  }
  return t;
}

function renderAnnTabBar() {
  var bar = document.getElementById('annTabBar');
  if (state.numAnniversaries < 2) { bar.innerHTML = ''; return; }
  var remaining = state.remainingBudget - getTotalAllSlots();
  bar.innerHTML = [0, 1].slice(0, state.numAnniversaries).map(function(i) {
    var slot = state.annSlots[i];
    var total = slot.products.reduce(function(s, p) { return s + p.price; }, 0);
    var isActive = state.activeAnnSlot === i;
    return '<button class="ann-tab-btn' + (isActive ? ' active' : '') + '" data-slot="' + i + '">' +
      '기념일 ' + (i+1) + ': ' + slot.type +
      '<span class="ann-tab-budget">' + total.toLocaleString() + '원</span>' +
      '</button>';
  }).join('') +
  '<span class="ann-tab-remaining">잔여 <strong>' + remaining.toLocaleString() + '원</strong></span>';
  bar.querySelectorAll('.ann-tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      state.activeAnnSlot = parseInt(btn.dataset.slot);
      renderAnnTabBar();
      renderApplyProductGrid();
    });
  });
}

function toggleApplyProduct(product) {
  var slot = state.annSlots[state.activeAnnSlot];
  var idx = slot.products.findIndex(function(p) { return p.id === product.id; });
  if (idx !== -1) {
    slot.products.splice(idx, 1);
  } else {
    if (slot.products.length >= 1) { toast('기념일당 상품은 1개만 선택 가능합니다', 'error'); return; }
    var totalAll = getTotalAllSlots();
    var remaining = state.remainingBudget - totalAll;
    var exceeded;
    if (state.applicantType === 'existing') {
      var budgetTierCeil = (Math.floor(remaining / 10000) + 1) * 10000;
      exceeded = remaining <= 0 || product.price >= budgetTierCeil;
    } else {
      exceeded = product.price > remaining;
    }
    if (exceeded) {
      toast('잔여 예산을 초과합니다 (잔여 ' + remaining.toLocaleString() + '원)', 'error');
      return;
    }
    slot.products.push(product);
  }
  renderSelectedPreview();
  renderAnnTabBar();
  document.getElementById('applyProductGrid').querySelectorAll('.product-card').forEach(function(card) {
    var id = parseInt(card.dataset.id);
    card.classList.toggle('selected', slot.products.some(function(p) { return p.id === id; }));
  });
}

function renderSelectedPreview() {
  var container = document.getElementById('selectedPreview');
  var slot = state.annSlots[state.activeAnnSlot];
  var products = slot.products;
  var slotLabel = state.numAnniversaries > 1 ? '기념일 ' + (state.activeAnnSlot + 1) + ' (' + slot.type + ')' : '';
  var totalAll = getTotalAllSlots();
  var remaining = state.remainingBudget - totalAll;
  var remainColor = remaining < 30000 ? 'var(--primary)' : (remaining < 70000 ? '#F39C12' : 'var(--secondary)');
  var budgetRow = '<div class="preview-budget-row">전체 잔여 예산 <strong style="color:' + remainColor + '">' + remaining.toLocaleString() + '원</strong> / ' + state.remainingBudget.toLocaleString() + '원</div>';

  if (!products.length) {
    container.innerHTML = budgetRow + '<div class="empty-selection">' + (slotLabel ? '[' + slotLabel + '] ' : '') + '상품을 선택해주세요 (0/2)</div>';
    return;
  }
  var total = products.reduce(function(s, p) { return s + p.price + (p.cakeAdded ? 34000 : 0); }, 0);
  var header = slotLabel ? '<div style="font-size:12px;color:var(--secondary);font-weight:600;margin-bottom:8px">[' + slotLabel + ']</div>' : '';
  container.innerHTML = budgetRow + header + products.map(function(p) {
    var imgHtml = p.image_url ? '<img src="' + proxyImg(p.image_url) + '" style="width:44px;height:44px;border-radius:6px;object-fit:cover" onerror="this.style.display=\'none\'">' : '🎁';
    var cakeCheck = p.vendor === 'fmans'
      ? '<label class="cake-option"><input type="checkbox" class="chk-cake" data-id="' + p.id + '"' + (p.cakeAdded ? ' checked' : '') + '> 🎂 케이크 추가 <span>+34,000원</span></label>'
      : '';
    return '<div class="selected-item">' +
      '<div class="selected-item-img-ph" style="padding:0;background:none">' + imgHtml + '</div>' +
      '<div class="selected-item-info">' +
        '<div class="selected-item-name">' + p.name + '</div>' +
        '<div class="selected-item-price">' + p.price.toLocaleString() + '원' + (p.cakeAdded ? ' + 🎂 34,000원' : '') + '</div>' +
        cakeCheck +
      '</div>' +
      '<button class="btn-remove-sel" data-id="' + p.id + '">✕</button>' +
      '</div>';
  }).join('') + '<div class="selected-total">이 기념일 소계: <strong>' + total.toLocaleString() + '원</strong></div>';
  container.querySelectorAll('.chk-cake').forEach(function(chk) {
    chk.addEventListener('change', function() {
      var id = parseInt(chk.dataset.id);
      var slot = state.annSlots[state.activeAnnSlot];
      var prod = slot.products.find(function(p) { return p.id === id; });
      if (prod) {
        prod.cakeAdded = chk.checked;
        renderSelectedPreview();
        renderAnnTabBar();
      }
    });
  });
  container.querySelectorAll('.btn-remove-sel').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var id = parseInt(btn.dataset.id);
      state.annSlots[state.activeAnnSlot].products = state.annSlots[state.activeAnnSlot].products.filter(function(p) { return p.id !== id; });
      renderSelectedPreview();
      renderAnnTabBar();
      renderApplyProductGrid();
    });
  });
}

function renderApplyProductGrid() {
  var grid = document.getElementById('applyProductGrid');
  var list = state.products;
  if (state.applyVendor !== 'all') list = list.filter(function(p) { return p.vendor === state.applyVendor; });
  list = list.filter(function(p) { return priceInRange(p.price, state.applyPriceRange); });
  var totalPages = Math.ceil(list.length / APPLY_PAGE_SIZE);
  var page = Math.min(state.applyPage, Math.max(1, totalPages));
  state.applyPage = page;
  renderProductGrid(grid, list.slice((page-1)*APPLY_PAGE_SIZE, page*APPLY_PAGE_SIZE), true);
  renderSelectedPreview();
  renderApplyPagination(list.length, totalPages, page);
}

function renderApplyPagination(total, totalPages, current) {
  var bar = document.getElementById('applyPagination');
  if (totalPages <= 1) { bar.innerHTML = ''; return; }
  var html = '';
  if (current > 1) html += '<button class="page-btn" data-page="' + (current-1) + '">‹</button>';
  for (var i = 1; i <= totalPages; i++) {
    html += '<button class="page-btn' + (i===current?' active':'') + '" data-page="' + i + '">' + i + '</button>';
  }
  if (current < totalPages) html += '<button class="page-btn" data-page="' + (current+1) + '">›</button>';
  html += '<span class="page-info">' + total + '개 중 ' + ((current-1)*APPLY_PAGE_SIZE+1) + '~' + Math.min(current*APPLY_PAGE_SIZE,total) + '</span>';
  bar.innerHTML = html;
  bar.querySelectorAll('.page-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { state.applyPage = parseInt(btn.dataset.page); renderApplyProductGrid(); });
  });
}

// 신청 탭 벤더·가격 칩
document.querySelectorAll('.chip[data-pvendor]').forEach(function(chip) {
  chip.addEventListener('click', function() {
    document.querySelectorAll('.chip[data-pvendor]').forEach(function(c) { c.classList.remove('active'); });
    chip.classList.add('active'); state.applyVendor = chip.dataset.pvendor; state.applyPage = 1; renderApplyProductGrid();
  });
});
document.querySelectorAll('.chip[data-pprice]').forEach(function(chip) {
  chip.addEventListener('click', function() {
    document.querySelectorAll('.chip[data-pprice]').forEach(function(c) { c.classList.remove('active'); });
    chip.classList.add('active'); state.applyPriceRange = chip.dataset.pprice; state.applyPage = 1; renderApplyProductGrid();
  });
});

document.getElementById('btnStep3Prev').addEventListener('click', function() { goToStep(2); });
document.getElementById('btnStep3Next').addEventListener('click', function() {
  for (var i = 0; i < state.numAnniversaries; i++) {
    if (!state.annSlots[i].products.length) {
      toast('기념일 ' + (i+1) + '(' + state.annSlots[i].type + ')에 상품을 1개 이상 선택해주세요', 'error'); return;
    }
  }
  goToStep(4);
});

/* ── Step 4 - 배송 + 요약 ─────────────────────── */
function renderOrderSummary() {
  var html = '<div class="order-summary-title">주문 요약</div>';
  for (var i = 0; i < state.numAnniversaries; i++) {
    var slot = state.annSlots[i];
    var total = slot.products.reduce(function(s, p) { return s + p.price; }, 0);
    if (state.numAnniversaries > 1) html += '<div style="font-size:12px;font-weight:700;color:var(--secondary);margin:8px 0 4px">기념일 ' + (i+1) + ': ' + slot.type + ' (' + slot.recipient + ')</div>';
    slot.products.forEach(function(p) {
      var short = p.name.length > 20 ? p.name.substring(0,20)+'…' : p.name;
      html += '<div class="order-item-row"><span>' + short + '</span><span style="font-weight:600">' + p.price.toLocaleString() + '원</span></div>';
    });
    html += '<div class="order-total-row"><span>소계</span><span style="color:var(--primary)">' + total.toLocaleString() + '원</span></div>';
  }
  document.getElementById('orderSummary').innerHTML = html;
}

function hasFmansProduct() {
  for (var i = 0; i < state.numAnniversaries; i++) {
    if (state.annSlots[i].products.some(function(p) { return p.vendor === 'fmans'; })) return true;
  }
  return false;
}

function prefillStep4() {
  var recipientEl = document.getElementById('applyRecipientName');
  if (!recipientEl.value) {
    recipientEl.value = state.annSlots[0].recipient || '';
  }
  document.getElementById('delivTimeGroup').style.display = hasFmansProduct() ? 'block' : 'none';
}

document.getElementById('btnStep4Prev').addEventListener('click', function() { goToStep(3); });

document.getElementById('btnAddrSearch').addEventListener('click', function() {
  if (typeof daum === 'undefined' || !daum.Postcode) {
    toast('주소 검색 서비스를 불러오는 중입니다. 잠시 후 다시 시도해주세요.', 'error');
    return;
  }
  new daum.Postcode({
    theme: { bgColor: '#FF6B6B', titleColor: '#ffffff', searchBgColor: '#ffffff' },
    oncomplete: function(data) {
      var addr = data.roadAddress || data.autoRoadAddress || data.jibunAddress;
      document.getElementById('applyPostcode').value = data.zonecode;
      document.getElementById('applyAddr').value = addr;
      document.getElementById('applyAddrDetail').value = '';
      document.getElementById('applyAddrDetail').focus();
    },
  }).open();
});
document.getElementById('btnSubmit').addEventListener('click', submitApplication);

async function submitApplication() {
  if (!document.getElementById('agreeCheck').checked) { toast('동의 체크를 해주세요', 'error'); return; }
  var recipientName = document.getElementById('applyRecipientName').value.trim();
  var recipientContact = document.getElementById('applyRecipientContact').value.trim();
  var postcode = document.getElementById('applyPostcode').value.trim();
  var addr = document.getElementById('applyAddr').value.trim();
  var delivContact = document.getElementById('applyDelivContact').value.trim();
  var delivTime = '';
  if (hasFmansProduct()) {
    var checkedTime = document.querySelector('input[name="delivTime"]:checked');
    if (!checkedTime) { toast('꽃집청년들 배송 시간대를 선택해주세요', 'error'); return; }
    delivTime = checkedTime.value;
  }
  if (!recipientName) { toast('받는 분 성함을 입력해주세요', 'error'); return; }
  if (!recipientContact) { toast('받는 분 연락처를 입력해주세요', 'error'); return; }
  if (!addr) { toast('배송 주소를 입력해주세요', 'error'); return; }
  if (!delivContact) { toast('배송 연락처를 입력해주세요', 'error'); return; }

  var btn = document.getElementById('btnSubmit');
  btn.disabled = true; btn.textContent = '처리 중...';

  var base = {
    employee_name: document.getElementById('applyName').value.trim(),
    department: document.getElementById('applyDept').value.trim(),
    employee_id: document.getElementById('applyEmpId').value.trim(),
    contact: document.getElementById('applyContact').value.trim(),
    recipient_name_delivery: recipientName,
    recipient_contact: recipientContact,
    delivery_address: (postcode ? '[' + postcode + '] ' : '') + addr + ' ' + document.getElementById('applyAddrDetail').value.trim(),
    delivery_contact: delivContact,
    delivery_time: delivTime,
    note: document.getElementById('applyNote').value.trim(),
  };

  var errors = [];
  for (var i = 0; i < state.numAnniversaries; i++) {
    var slot = state.annSlots[i];
    try {
      var res = await fetch(API + '/api/applications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({}, base, {
          anniversary_type: slot.type,
          anniversary_date: slot.date,
          recipient_name: slot.recipient,
          products: slot.products.map(function(p) { return { id: p.id, name: p.name, price: p.price, vendor: p.vendor, cakeAdded: !!p.cakeAdded }; }),
        })),
      });
      var data = await res.json();
      if (!res.ok) errors.push('기념일 ' + (i+1) + ': ' + (data.error || '오류'));
    } catch(e) { errors.push('기념일 ' + (i+1) + ': 네트워크 오류'); }
  }

  btn.disabled = false; btn.textContent = '✓ 신청 완료';
  if (errors.length) { toast(errors.join('\n'), 'error'); return; }

  var totalAll = 0;
  for (var j = 0; j < state.numAnniversaries; j++) {
    totalAll += state.annSlots[j].products.reduce(function(s, p) { return s + p.price; }, 0);
  }
  document.getElementById('doneMessage').textContent =
    base.employee_name + '님의 ' + state.numAnniversaries + '건 선물 신청이 완료됐습니다. (총 ' + totalAll.toLocaleString() + '원)';
  goToStep('done');
  state.annSlots.forEach(function(s) { s.products = []; });
}

/* ── 새 신청하기 ───────────────────────────────── */
document.getElementById('btnNewApply').addEventListener('click', function() {
  ['applyName','applyDept','applyEmpId','applyContact','applyRecipientName','applyRecipientContact','applyPostcode','applyAddr','applyAddrDetail','applyDelivContact','applyNote'].forEach(function(id) {
    document.getElementById(id).value = '';
  });
  [0,1].forEach(function(i) {
    document.querySelectorAll('input[name="annType' + i + '"]').forEach(function(r) { r.checked = false; });
    var dateEl = document.getElementById('applyAnnDate' + i);
    var recipEl = document.getElementById('applyRecipient' + i);
    if (dateEl) dateEl.value = '';
    if (recipEl) recipEl.value = '';
    state.annSlots[i].type = '';
    state.annSlots[i].date = '';
    state.annSlots[i].recipient = '';
    state.annSlots[i].products = [];
  });
  document.querySelectorAll('input[name="delivTime"]').forEach(function(r) { r.checked = false; });
  document.getElementById('delivTimeGroup').style.display = 'none';
  document.getElementById('agreeCheck').checked = false;
  state.numAnniversaries = 1; state.applicantType = 'new'; state.activeAnnSlot = 0; state.remainingBudget = 150000;
  document.getElementById('usageBox').style.display = 'none';
  document.getElementById('existingNameInput').value = '';
  document.getElementById('existingResults').innerHTML = '';
  document.getElementById('existingSearch').classList.add('hidden');
  document.getElementById('applicantForm').style.display = 'block';
  document.getElementById('btnTypeNew').classList.add('active');
  document.getElementById('btnTypeExisting').classList.remove('active');
  document.getElementById('annSlot1').classList.add('hidden');
  document.querySelectorAll('.ann-count-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.count === '1'); });
  goToStep(1);
});

/* ═══════════════════════════════════════════════
   신청 내역 탭
═══════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════
   배송 관리
═══════════════════════════════════════════════ */
var _deliveryVendor = 'fmans';
var _deliveryMonth = String(new Date().getMonth() + 1);

document.querySelectorAll('.dvend-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.dvend-btn').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    _deliveryVendor = btn.dataset.dvendor;
    document.getElementById('fmansExcelRow').style.display = _deliveryVendor === 'fmans' ? 'flex' : 'none';
    document.getElementById('sirloinOrderRow').style.display = _deliveryVendor === 'sirloin' ? 'flex' : 'none';
    document.getElementById('allfreshOrderRow').style.display = _deliveryVendor === 'allfresh' ? 'flex' : 'none';
    renderDeliveryList();
  });
});

document.querySelectorAll('.dmonth-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.dmonth-btn').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    _deliveryMonth = btn.dataset.month;
    renderDeliveryList();
  });
});

function initDeliveryMonthBar() {
  var cur = String(new Date().getMonth() + 1);
  document.querySelectorAll('.dmonth-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.month === cur);
  });
}

var _pendingOrderVendor = '';
var VENDOR_LABELS = { fmans: '꽃집청년들', sirloin: '설로인', allfresh: '올프레쉬' };

document.querySelectorAll('.btn-order-email').forEach(function(btn) {
  btn.addEventListener('click', async function() {
    _pendingOrderVendor = btn.dataset.vendor;
    await showOrderPreview(_pendingOrderVendor);
  });
});

async function showOrderPreview(vendor) {
  var modal = document.getElementById('orderPreviewModal');
  var body = document.getElementById('orderPreviewBody');
  var title = document.getElementById('orderPreviewTitle');
  title.textContent = VENDOR_LABELS[vendor] + ' 발주 미리보기';
  body.innerHTML = '<div class="loading">불러오는 중...</div>';
  modal.classList.remove('hidden');

  try {
    var [appsRes, settingsRes] = await Promise.all([
      fetch(API + '/api/applications'),
      fetch(API + '/api/settings'),
    ]);
    var apps = await appsRes.json();
    var settings = await settingsRes.json();
    var vendorEmail = settings['vendor_' + vendor + 'email'] || '(이메일 미설정)';

    var filtered = apps.filter(function(a) {
      if (a.status === 'cancelled') return false;
      if (!(a.products || []).some(function(p) { return p.vendor === vendor; })) return false;
      if (_deliveryMonth !== 'all') {
        if (!a.anniversary_date) return false;
        if (parseInt(a.anniversary_date.split('-')[1]) !== parseInt(_deliveryMonth)) return false;
      }
      return true;
    }).sort(function(a, b) { return (a.anniversary_date || '').localeCompare(b.anniversary_date || ''); });

    if (!filtered.length) {
      body.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p class="empty-text">발주할 신청 내역이 없습니다</p></div>';
      return;
    }

    var hasExcel = vendor === 'fmans';
    var rows = filtered.map(function(a, i) {
      var prods = (a.products || []).filter(function(p) { return p.vendor === vendor; });
      return '<tr style="background:' + (i % 2 === 0 ? '#fff' : '#fff8fb') + '">' +
        '<td style="padding:8px 10px;border-bottom:1px solid #FFE3E6;font-size:13px">' + (i+1) + '</td>' +
        '<td style="padding:8px 10px;border-bottom:1px solid #FFE3E6;font-size:13px"><strong>' + a.employee_name + '</strong><br><span style="color:#aaa;font-size:11px">' + (a.department||'') + '</span></td>' +
        '<td style="padding:8px 10px;border-bottom:1px solid #FFE3E6;font-size:13px">' + a.anniversary_type + '<br><span style="color:#aaa;font-size:11px">' + (a.anniversary_date||'') + '</span></td>' +
        '<td style="padding:8px 10px;border-bottom:1px solid #FFE3E6;font-size:13px">' + (a.recipient_name_delivery||a.recipient_name||'-') + '</td>' +
        '<td style="padding:8px 10px;border-bottom:1px solid #FFE3E6;font-size:12px">' + prods.map(function(p){ return p.name + ' (' + p.price.toLocaleString() + '원)'; }).join('<br>') + '</td>' +
        (vendor === 'fmans' ? '<td style="padding:8px 10px;border-bottom:1px solid #FFE3E6;font-size:12px">' + (a.delivery_time||'-') + '</td>' : '') +
        '</tr>';
    }).join('');

    body.innerHTML =
      '<div style="background:#FFF5F8;border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:13px">' +
        '<div>📧 수신: <strong>' + vendorEmail + '</strong></div>' +
        '<div style="margin-top:4px">📦 총 <strong>' + filtered.length + '건</strong>' + (hasExcel ? ' · 📎 엑셀 파일 첨부' : '') + '</div>' +
      '</div>' +
      '<div style="overflow-x:auto">' +
      '<table style="width:100%;border-collapse:collapse;min-width:420px">' +
        '<thead><tr style="background:#F48CAE;color:white">' +
          '<th style="padding:8px 10px;font-size:12px;font-weight:600">#</th>' +
          '<th style="padding:8px 10px;font-size:12px;font-weight:600">신청자</th>' +
          '<th style="padding:8px 10px;font-size:12px;font-weight:600">기념일</th>' +
          '<th style="padding:8px 10px;font-size:12px;font-weight:600">수령인</th>' +
          '<th style="padding:8px 10px;font-size:12px;font-weight:600">상품</th>' +
          (vendor === 'fmans' ? '<th style="padding:8px 10px;font-size:12px;font-weight:600">시간대</th>' : '') +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table></div>';
  } catch(e) {
    body.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p class="empty-text">불러오기 실패</p></div>';
  }
}

document.getElementById('btnOrderPreviewClose').addEventListener('click', function() {
  document.getElementById('orderPreviewModal').classList.add('hidden');
});
document.getElementById('btnOrderPreviewCancel').addEventListener('click', function() {
  document.getElementById('orderPreviewModal').classList.add('hidden');
});
document.getElementById('btnOrderPreviewSend').addEventListener('click', async function() {
  var btn = this;
  btn.disabled = true;
  btn.textContent = '발송 중...';
  try {
    var res = await fetch(API + '/api/send-order-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendor: _pendingOrderVendor, month: _deliveryMonth }),
    });
    var data = await res.json();
    document.getElementById('orderPreviewModal').classList.add('hidden');
    if (res.ok) {
      toast(VENDOR_LABELS[_pendingOrderVendor] + ' 발주 이메일 발송 완료 (' + data.count + '건)', 'success');
    } else {
      toast(data.error || '발송 실패', 'error');
    }
  } catch(e) {
    toast('발송 실패', 'error');
  }
  btn.disabled = false;
  btn.textContent = '📧 이메일 발송';
});

function getOrderDeadline(anniversaryDateStr) {
  if (!anniversaryDateStr) return null;
  var d = new Date(anniversaryDateStr);
  // 기념일 전월 20일
  return new Date(d.getFullYear(), d.getMonth() - 1, 20);
}
function daysUntil(date) {
  if (!date) return 9999;
  var today = new Date(); today.setHours(0,0,0,0);
  return Math.floor((date - today) / 86400000);
}
function deadlineBadge(daysLeft) {
  if (daysLeft < 0) return '<span class="dbadge past">마감</span>';
  if (daysLeft === 0) return '<span class="dbadge today">D-day</span>';
  if (daysLeft <= 7) return '<span class="dbadge urgent">D-' + daysLeft + '</span>';
  if (daysLeft <= 14) return '<span class="dbadge soon">D-' + daysLeft + '</span>';
  return '<span class="dbadge ok">D-' + daysLeft + '</span>';
}

async function loadDeliverySchedule() {
  initDeliveryMonthBar();
  if (!allApplications.length) {
    var res = await fetch(API + '/api/applications');
    allApplications = await res.json();
  }
  renderDeliveryList();
}

function filterByMonth(apps) {
  if (_deliveryMonth === 'all') return apps;
  var m = parseInt(_deliveryMonth);
  return apps.filter(function(a) {
    if (!a.anniversary_date) return false;
    return parseInt(a.anniversary_date.split('-')[1]) === m;
  });
}

function renderDeliveryList() {
  var list = document.getElementById('deliveryList');
  var apps = allApplications.filter(function(a) {
    return a.status !== 'cancelled' &&
      (a.products || []).some(function(p) { return p.vendor === _deliveryVendor; });
  });
  apps = filterByMonth(apps);
  apps.sort(function(a, b) { return (a.anniversary_date||'').localeCompare(b.anniversary_date||''); });
  if (!apps.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p class="empty-text">해당 업체 신청 내역이 없습니다</p></div>';
    return;
  }
  var vLabel = {fmans:'꽃집청년들', sirloin:'설로인', allfresh:'올프레쉬'};
  list.innerHTML = apps.map(function(a) {
    var products = (a.products||[]).filter(function(p) { return p.vendor === _deliveryVendor; });
    var deadline = getOrderDeadline(a.anniversary_date);
    var dLeft = daysUntil(deadline);
    var deadlineStr = deadline ? deadline.toLocaleDateString('ko-KR', {month:'long',day:'numeric'}) : '-';
    var statusLabel = {pending:'대기',processing:'처리중',done:'완료',cancelled:'취소'}[a.status] || a.status;
    var cakeInfo = products.some(function(p) { return p.cakeAdded; }) ? '<span class="cake-badge">🎂 케이크 추가</span>' : '';
    return '<div class="delivery-card">' +
      '<div class="delivery-card-top">' +
        '<div><span class="dname">' + a.employee_name + '</span> <span class="ddept">' + (a.department||'') + '</span></div>' +
        '<div class="dbadge-row">' + deadlineBadge(dLeft) + ' <span class="app-status ' + a.status + '">' + statusLabel + '</span></div>' +
      '</div>' +
      '<div class="delivery-ann">📅 ' + a.anniversary_type + ' · ' + (a.anniversary_date||'') + ' · 수령인: <strong>' + (a.recipient_name||'') + '</strong></div>' +
      '<div class="delivery-products">' + products.map(function(p) {
        return '<div class="dprod">' + p.name + ' <span>' + p.price.toLocaleString() + '원</span>' + (p.cakeAdded ? ' <span class="cake-badge-sm">🎂+34,000</span>' : '') + '</div>';
      }).join('') + cakeInfo + '</div>' +
      '<div class="delivery-addr">🚚 ' + (a.delivery_address||'-') + '<br>📞 ' + (a.delivery_contact||'-') + '</div>' +
      '<div class="delivery-deadline">주문 마감: <strong>' + deadlineStr + '</strong></div>' +
      '</div>';
  }).join('');
}

/* ── 꽃집청년들 Excel 내보내기 (서버 템플릿 사용) ── */
document.getElementById('btnFmansExcel').addEventListener('click', function() {
  toast('Excel 생성 중...', '');
  window.location.href = API + '/api/applications/fmans-excel';
});

var allApplications = [];
async function loadApplications() {
  var list = document.getElementById('applicationList');
  list.innerHTML = '<div class="loading">불러오는 중...</div>';
  try {
    var res = await fetch(API + '/api/applications');
    allApplications = await res.json();
    renderApplications();
  } catch(e) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p class="empty-text">불러오기 실패</p></div>';
  }
}
function renderApplications() {
  var search = document.getElementById('adminSearch').value.toLowerCase();
  var statusFilter = document.getElementById('adminStatus').value;
  var statusLabel = { pending:'대기', processing:'처리중', done:'완료', cancelled:'취소' };
  var filtered = allApplications.filter(function(a) {
    var ms = !search || (a.employee_name||'').toLowerCase().includes(search) || (a.department||'').toLowerCase().includes(search);
    var mst = !statusFilter || a.status === statusFilter;
    return ms && mst;
  });
  var list = document.getElementById('applicationList');
  if (!filtered.length) { list.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p class="empty-text">신청 내역이 없습니다</p></div>'; return; }
  list.innerHTML = filtered.map(function(a) {
    var date = new Date(a.submitted_at).toLocaleDateString('ko-KR');
    var pTags = (a.products||[]).map(function(p) {
      var icon = p.vendor==='fmans'?'🌸':p.vendor==='sirloin'?'🥩':'🍎';
      var sn = p.name.length>15?p.name.substring(0,15)+'…':p.name;
      return '<div class="app-product-tag">' + icon + ' ' + sn + ' · ' + p.price.toLocaleString() + '원</div>';
    }).join('');
    var statBtns = ['pending','processing','done','cancelled'].map(function(s) {
      return '<button class="btn-status' + (a.status===s?' active':'') + '" data-id="'+a.id+'" data-status="'+s+'">' + statusLabel[s] + '</button>';
    }).join('');
    return '<div class="app-card" data-id="'+a.id+'">' +
      '<div class="app-card-header"><div><div class="app-name">'+a.employee_name+'</div><div class="app-dept">'+(a.department||'')+' '+(a.employee_id||'')+'</div></div><span class="app-status '+a.status+'">'+(statusLabel[a.status]||a.status)+'</span></div>' +
      '<div class="app-detail">📅 <strong>'+a.anniversary_type+'</strong> ('+a.anniversary_date+') · 수령인: '+a.recipient_name+'<br>신청일: '+date+' · 합계: <strong>'+(a.total_price||0).toLocaleString()+'원</strong></div>' +
      '<div class="app-products">'+pTags+'</div>' +
      '<div class="app-detail" style="margin-bottom:8px">🚚 '+a.delivery_address+' · '+a.delivery_contact+(a.note?'<br>💬 '+a.note:'')+'</div>' +
      '<div class="app-actions">'+statBtns+'<button class="btn-del-app" data-id="'+a.id+'">삭제</button></div>' +
      '</div>';
  }).join('');
  list.querySelectorAll('.btn-status').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      var id = parseInt(btn.dataset.id), status = btn.dataset.status;
      try {
        await fetch(API+'/api/applications/'+id+'/status', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status:status}) });
        var app = allApplications.find(function(a){return a.id===id;});
        if (app) app.status = status;
        renderApplications();
      } catch(e) { toast('상태 변경 실패','error'); }
    });
  });
  list.querySelectorAll('.btn-del-app').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      if (!confirm('삭제하시겠습니까?')) return;
      var id = parseInt(btn.dataset.id);
      await fetch(API+'/api/applications/'+id, { method:'DELETE' });
      allApplications = allApplications.filter(function(a){return a.id!==id;});
      renderApplications();
    });
  });
}
document.getElementById('adminSearch').addEventListener('input', renderApplications);
document.getElementById('adminStatus').addEventListener('change', renderApplications);

/* ═══════════════════════════════════════════════
   설정 탭
═══════════════════════════════════════════════ */
async function loadSettings() {
  try {
    var res = await fetch(API + '/api/settings');
    var s = await res.json();
    document.getElementById('settingAdminPw').value = '';
    document.getElementById('settingEmployeeList').value = s.employee_list || '';
    // 업체 담당자
    var fields = ['FmansName','FmansEmail','FmansPhone','SirloinName','SirloinEmail','SirloinPhone','AllfreshName','AllfreshEmail','AllfreshPhone'];
    fields.forEach(function(f) {
      var el = document.getElementById('setting' + f);
      if (el) el.value = s['vendor_' + f.toLowerCase()] || '';
    });
  } catch(e) {}
}
document.getElementById('btnSaveSettings').addEventListener('click', async function() {
  var payload = {};
  var newPw = document.getElementById('settingAdminPw').value;
  if (newPw) payload.admin_pw = newPw;
  var fields = ['FmansName','FmansEmail','FmansPhone','SirloinName','SirloinEmail','SirloinPhone','AllfreshName','AllfreshEmail','AllfreshPhone'];
  fields.forEach(function(f) {
    var el = document.getElementById('setting' + f);
    if (el) payload['vendor_' + f.toLowerCase()] = el.value.trim();
  });
  try {
    await fetch(API+'/api/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    toast('저장 완료', 'success');
  } catch(e) { toast('저장 실패','error'); }
});
document.getElementById('btnSaveEmployeeList').addEventListener('click', async function() {
  var list = document.getElementById('settingEmployeeList').value;
  try {
    await fetch(API+'/api/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({employee_list: list}) });
    document.getElementById('employeeListStatus').textContent = '저장 완료 (' + list.split('\n').filter(function(n){return n.trim();}).length + '명)';
    toast('명단 저장 완료', 'success');
  } catch(e) { toast('저장 실패','error'); }
});

/* ── server.js settings allowed keys에 admin_pw, employee_list 추가 필요 ── */

/* ═══════════════════════════════════════════════
   초기화
═══════════════════════════════════════════════ */
loadProducts();
loadWishlist();
loadSettings();
