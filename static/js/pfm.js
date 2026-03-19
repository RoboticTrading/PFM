/* PFM — Personal Financial Manager
   All data comes from own PostgreSQL via authenticated Flask API.
   User-facing strings escaped via escHtml(). */

// ── API helper ────────────────────────────────────────────────────────

async function api(endpoint, options) {
  options = options || {};
  var resp = await fetch('/api/' + endpoint, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (resp.status === 401) { window.location.href = '/login'; return null; }
  return resp.json();
}

// ── Utilities ─────────────────────────────────────────────────────────

function escHtml(str) { var d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; }

function fmtMoney(n) {
  if (n == null || n === '') return '-';
  var num = parseFloat(n);
  if (isNaN(num)) return '-';
  return (num < 0 ? '-' : '') + '$' + Math.abs(num).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
}

function fmtDate(iso) {
  if (!iso) return '-';
  var d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
}

function fmtDateShort(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString();
}

// ── Toast ─────────────────────────────────────────────────────────────

function showToast(message, type) {
  type = type || 'success';
  var container = document.getElementById('toast-container');
  if (!container) return;
  var toast = document.createElement('div');
  toast.className = 'toast' + (type !== 'success' ? ' toast-' + type : '');
  var msg = document.createElement('span');
  msg.className = 'toast-message';
  msg.textContent = message;
  var close = document.createElement('button');
  close.className = 'toast-close';
  close.textContent = '\u00d7';
  close.addEventListener('click', function() { removeToast(toast); });
  toast.appendChild(msg);
  toast.appendChild(close);
  container.appendChild(toast);
  while (container.children.length > 3) removeToast(container.children[0]);
  setTimeout(function() { removeToast(toast); }, 4000);
}

function removeToast(t) {
  if (!t || !t.parentNode) return;
  t.classList.add('toast-removing');
  setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 200);
}

// ── Modal ─────────────────────────────────────────────────────────────
// Modal content is built from our own DB data, escaped via escHtml()

function openModal(title, bodyHtml) {
  document.getElementById('modal-title').textContent = title;
  setTrustedHtml(document.getElementById('modal-body'), bodyHtml);
  document.getElementById('modal-overlay').classList.add('active');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
}

function setTrustedHtml(el, html) {
  // All HTML built from our own PostgreSQL data, user-strings escaped via escHtml()
  el.innerHTML = html;  // nosemgrep: trusted-source
}

// ── Sortable tables ───────────────────────────────────────────────────

function makeSortable(table) {
  if (!table) return;
  var thead = table.querySelector('thead'), tbody = table.querySelector('tbody');
  if (!thead || !tbody) return;
  var ths = thead.querySelectorAll('th');
  ths.forEach(function(th, colIdx) {
    th.classList.add('sortable');
    th.addEventListener('click', function() {
      var asc = !th.classList.contains('sort-asc');
      ths.forEach(function(h) { h.classList.remove('sort-asc','sort-desc'); });
      th.classList.add(asc ? 'sort-asc' : 'sort-desc');
      var rows = Array.from(tbody.querySelectorAll('tr'));
      rows.sort(function(a,b) {
        var at = (a.cells[colIdx]||{}).textContent||'';
        var bt = (b.cells[colIdx]||{}).textContent||'';
        var an = parseFloat(at.replace(/[$,%h]/g,'').replace(/,/g,''));
        var bn = parseFloat(bt.replace(/[$,%h]/g,'').replace(/,/g,''));
        if (!isNaN(an) && !isNaN(bn)) return asc ? an-bn : bn-an;
        return asc ? at.localeCompare(bt) : bt.localeCompare(at);
      });
      rows.forEach(function(r) { tbody.appendChild(r); });
    });
  });
}

function buildTable(headers, rows) {
  var table = document.createElement('table');
  table.className = 'data-table';
  var thead = document.createElement('thead');
  var headRow = document.createElement('tr');
  headers.forEach(function(h) { var th = document.createElement('th'); th.textContent = h; headRow.appendChild(th); });
  thead.appendChild(headRow);
  table.appendChild(thead);
  var tbody = document.createElement('tbody');
  rows.forEach(function(cells) {
    var tr = document.createElement('tr');
    cells.forEach(function(cell) { var td = document.createElement('td'); td.textContent = cell.text; if (cell.cls) td.className = cell.cls; tr.appendChild(td); });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return table;
}

// ── Page rendering ────────────────────────────────────────────────────

function setPageContent(html) {
  // Context-aware: if #trade-content exists (inside account page), write there
  var tradeContent = document.getElementById('trade-content');
  if (tradeContent) {
    tradeContent.classList.remove('page-enter');
    setTrustedHtml(tradeContent, html);
    void tradeContent.offsetWidth;
    tradeContent.classList.add('page-enter');
    tradeContent.querySelectorAll('table.data-table').forEach(makeSortable);
    return;
  }
  // Otherwise write to main content area
  var c = document.getElementById('page-content');
  c.classList.remove('page-enter');
  setTrustedHtml(c, html);
  void c.offsetWidth;
  c.classList.add('page-enter');
  c.querySelectorAll('table.data-table').forEach(makeSortable);
}

// ── State ─────────────────────────────────────────────────────────────

var _page = 'dashboard';
var _activeAccountId = null;
var _activeAccountType = null;
var _accountSubTab = 'trade';  // 'trade' or 'nontrade'
var _accounts = [];
var _categories = [];

// Position matching state
var _tab = 'unmatched';
var _selected = [];
var _effectFilter = '';
var _symbolFilter = '';
var _brokerage = 'schwab';

// Transaction register state
var _txnPage = 1;
var _txnSearch = '';
var _txnUncatOnly = false;
var _txnCategoryFilter = '';
var _txnSelected = [];
var _txnSort = '';
var _txnOrder = 'desc';

var _INSTRUMENT_TYPES = ['Equities', 'Equity Options', 'Futures', 'Futures Options', 'Index Options'];
var _SUBTYPES = [
  'Long Equity', 'Short Equity', 'Long Futures', 'Short Futures',
  'Long Equity Options', 'Short Equity Options',
  'Bull Put Spread', 'Bear Put Spread', 'Bull Call Spread', 'Bear Call Spread',
  'Iron Condor', 'Iron Butterfly', 'Straddle', 'Strangle',
  'Calendar Spread', 'Diagonal Spread', 'Covered Call', 'Protective Put', 'Other',
];

// ── Init ──────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async function() {
  // Load accounts and categories in parallel
  var results = await Promise.all([api('accounts'), api('categories')]);
  _accounts = results[0] || [];
  _categories = results[1] || [];
  buildNav();
  navigateTo('dashboard');

  // Close category dropdown on outside click
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.category-dropdown') && !e.target.closest('.category-cell')) {
      document.querySelectorAll('.category-dropdown').forEach(function(d) { d.remove(); });
    }
  });
});

// ── Navigation ────────────────────────────────────────────────────────

function buildNav() {
  var container = document.getElementById('nav-accounts');
  if (!container) return;
  container.textContent = '';

  if (_accounts.length === 0) {
    var msg = document.createElement('div');
    msg.className = 'text-xs text-muted';
    msg.style.padding = '8px 16px';
    msg.textContent = 'No accounts configured';
    container.appendChild(msg);
    return;
  }

  // Group accounts by type
  var groups = {};
  _accounts.forEach(function(acct) {
    var type = acct.account_type || 'other';
    if (!groups[type]) groups[type] = [];
    groups[type].push(acct);
  });

  Object.keys(groups).sort().forEach(function(type) {
    var group = document.createElement('div');
    group.className = 'nav-group';

    var header = document.createElement('div');
    header.className = 'nav-group-header';
    var headerLabel = document.createElement('span');
    headerLabel.textContent = type.charAt(0).toUpperCase() + type.slice(1);
    header.appendChild(headerLabel);
    var toggle = document.createElement('span');
    toggle.className = 'nav-group-toggle';
    toggle.textContent = '\u25BC';
    header.appendChild(toggle);
    header.addEventListener('click', function() { group.classList.toggle('collapsed'); });
    group.appendChild(header);

    var items = document.createElement('div');
    items.className = 'nav-group-items';

    groups[type].forEach(function(acct) {
      var link = document.createElement('a');
      link.className = 'nav-sub-item';
      link.href = '#account-' + acct.id;
      link.dataset.page = 'account';
      link.dataset.accountId = acct.id;

      var nameSpan = document.createElement('span');
      nameSpan.textContent = acct.name;
      link.appendChild(nameSpan);

      var uncat = acct.uncategorized_count || 0;
      var badge = document.createElement('span');
      badge.className = 'nav-badge' + (uncat === 0 ? ' zero' : '');
      badge.textContent = uncat;
      link.appendChild(badge);

      link.addEventListener('click', function(e) {
        e.preventDefault();
        _activeAccountId = acct.id;
        _activeAccountType = acct.account_type;
        _accountSubTab = (acct.account_type === 'brokerage') ? 'trade' : 'nontrade';
        _txnPage = 1; _txnSearch = ''; _txnUncatOnly = false; _txnCategoryFilter = ''; _txnSelected = [];
        navigateTo('account');
      });
      items.appendChild(link);
    });

    group.appendChild(items);
    container.appendChild(group);
  });
}

function navigateTo(page) {
  _page = page;

  // Update sidebar active states
  document.querySelectorAll('.nav-item').forEach(function(el) {
    el.classList.toggle('active', el.dataset.page === page);
  });
  document.querySelectorAll('.nav-sub-item').forEach(function(el) {
    if (page === 'account') {
      el.classList.toggle('active', el.dataset.accountId == _activeAccountId);
    } else {
      el.classList.remove('active');
    }
  });

  // Wire top-level nav items
  document.querySelectorAll('.nav-item[data-page]').forEach(function(el) {
    el.onclick = function(e) {
      e.preventDefault();
      _activeAccountId = null;
      navigateTo(el.dataset.page);
    };
  });

  renderPage();
}

function renderPage() {
  switch (_page) {
    case 'dashboard': renderDashboard(); break;
    case 'account': renderAccountPage(); break;
    case 'categories': renderCategoryManager(); break;
    case 'reports': renderReports(); break;
    default: renderDashboard();
  }
}

// ── Dashboard ─────────────────────────────────────────────────────────

async function renderDashboard() {
  var data = await api('dashboard/summary');
  if (!data) return;

  var totals = data.totals || {};
  var totalTxns = (totals.categorized || 0) + (totals.uncategorized || 0);
  var pctDone = totalTxns > 0 ? Math.round((totals.categorized / totalTxns) * 100) : 100;

  var c = document.getElementById('page-content');
  c.classList.remove('page-enter');

  // Build dashboard with DOM methods
  c.textContent = '';

  var h2 = document.createElement('h2');
  h2.style.cssText = 'font-family:var(--font-display);font-size:24px;font-weight:600;margin-bottom:20px';
  h2.textContent = 'Dashboard';
  c.appendChild(h2);

  // Stat cards
  var statGrid = document.createElement('div');
  statGrid.className = 'stat-grid';
  var stats = [
    { label: 'Accounts', value: (data.accounts||[]).length, cls: '' },
    { label: 'Categorized', value: totals.categorized||0, cls: 'success' },
    { label: 'Uncategorized', value: totals.uncategorized||0, cls: (totals.uncategorized||0) > 0 ? 'danger' : 'success' },
    { label: 'Overall Progress', value: pctDone + '%', cls: '' }
  ];
  stats.forEach(function(s) {
    var card = document.createElement('div');
    card.className = 'stat-card';
    var lbl = document.createElement('div');
    lbl.className = 'stat-label';
    lbl.textContent = s.label;
    card.appendChild(lbl);
    var val = document.createElement('div');
    val.className = 'stat-value' + (s.cls ? ' ' + s.cls : '');
    val.textContent = s.value;
    card.appendChild(val);
    statGrid.appendChild(card);
  });
  c.appendChild(statGrid);

  // Progress card
  var progCard = document.createElement('div');
  progCard.className = 'card mb-24';
  var progTitle = document.createElement('div');
  progTitle.className = 'card-title mb-16';
  progTitle.textContent = 'Categorization Progress';
  progCard.appendChild(progTitle);
  var progBar = document.createElement('div');
  progBar.className = 'progress-bar';
  progBar.style.height = '10px';
  var progFill = document.createElement('div');
  progFill.className = 'progress-bar-fill' + (pctDone === 100 ? ' complete' : '');
  progFill.style.width = pctDone + '%';
  progBar.appendChild(progFill);
  progCard.appendChild(progBar);
  var progInfo = document.createElement('div');
  progInfo.className = 'text-xs text-muted';
  progInfo.style.marginTop = '6px';
  progInfo.textContent = (totals.categorized||0) + ' of ' + totalTxns + ' transactions categorized';
  progCard.appendChild(progInfo);
  c.appendChild(progCard);

  // Per-account breakdown
  var acctCard = document.createElement('div');
  acctCard.className = 'card';
  var acctTitle = document.createElement('div');
  acctTitle.className = 'card-title mb-16';
  acctTitle.textContent = 'Accounts';
  acctCard.appendChild(acctTitle);

  (data.accounts || []).forEach(function(acct) {
    var total = (acct.categorized || 0) + (acct.uncategorized || 0);
    var pct = total > 0 ? Math.round((acct.categorized / total) * 100) : 100;
    var barClass = pct === 100 ? ' complete' : pct >= 80 ? '' : ' warning';

    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)';

    var nameDiv = document.createElement('div');
    nameDiv.style.cssText = 'flex:0 0 160px;font-size:13px';
    nameDiv.textContent = acct.name;
    row.appendChild(nameDiv);

    var typeDiv = document.createElement('div');
    typeDiv.style.cssText = 'flex:0 0 80px;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted)';
    typeDiv.textContent = acct.account_type;
    row.appendChild(typeDiv);

    var barWrap = document.createElement('div');
    barWrap.style.flex = '1';
    var bar = document.createElement('div');
    bar.className = 'progress-bar';
    var fill = document.createElement('div');
    fill.className = 'progress-bar-fill' + barClass;
    fill.style.width = pct + '%';
    bar.appendChild(fill);
    barWrap.appendChild(bar);
    row.appendChild(barWrap);

    var countDiv = document.createElement('div');
    countDiv.style.cssText = 'flex:0 0 100px;text-align:right;font-size:12px';
    var catSpan = document.createElement('span');
    catSpan.className = 'success';
    catSpan.textContent = acct.categorized;
    countDiv.appendChild(catSpan);
    var sepSpan = document.createElement('span');
    sepSpan.className = 'text-muted';
    sepSpan.textContent = ' / ' + total;
    countDiv.appendChild(sepSpan);
    row.appendChild(countDiv);

    var pctDiv = document.createElement('div');
    pctDiv.style.cssText = 'flex:0 0 40px;text-align:right;font-size:12px;font-weight:500';
    pctDiv.style.color = pct === 100 ? 'var(--success)' : 'var(--text-secondary)';
    pctDiv.textContent = pct + '%';
    row.appendChild(pctDiv);

    acctCard.appendChild(row);
  });
  c.appendChild(acctCard);

  // Balance Forward card
  var bfCard = document.createElement('div');
  bfCard.className = 'card';
  bfCard.style.marginTop = '24px';
  var bfTitle = document.createElement('div');
  bfTitle.className = 'card-title mb-16';
  bfTitle.textContent = 'Balance Forward';
  bfCard.appendChild(bfTitle);
  var bfDesc = document.createElement('div');
  bfDesc.className = 'text-xs text-muted mb-16';
  bfDesc.textContent = 'Starting balance for each account. Used to compute current balances in reports.';
  bfCard.appendChild(bfDesc);

  _accounts.forEach(function(acct) {
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border)';

    var nameDiv = document.createElement('div');
    nameDiv.style.cssText = 'flex:0 0 160px;font-size:13px';
    nameDiv.textContent = acct.name;
    row.appendChild(nameDiv);

    var amtDiv = document.createElement('div');
    amtDiv.style.cssText = 'flex:0 0 120px;font-family:var(--font-mono);font-size:13px';
    var amt = parseFloat(acct.balance_forward_amount) || 0;
    amtDiv.textContent = fmtMoney(amt);
    amtDiv.style.color = amt === 0 ? 'var(--text-muted)' : amt > 0 ? 'var(--success)' : 'var(--danger)';
    row.appendChild(amtDiv);

    var dateDiv = document.createElement('div');
    dateDiv.style.cssText = 'flex:1;font-size:12px;color:var(--text-muted)';
    dateDiv.textContent = acct.balance_forward_date ? 'as of ' + acct.balance_forward_date : 'not set';
    row.appendChild(dateDiv);

    var editBtn = document.createElement('button');
    editBtn.className = 'btn btn-sm btn-ghost';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', function() {
      openBalanceForwardModal(acct);
    });
    row.appendChild(editBtn);

    bfCard.appendChild(row);
  });
  c.appendChild(bfCard);

  void c.offsetWidth;
  c.classList.add('page-enter');
}

function openBalanceForwardModal(acct) {
  var currentAmt = acct.balance_forward_amount || '';
  var currentDate = acct.balance_forward_date || '';

  openModal('Balance Forward — ' + acct.name,
    '<form id="bf-form">' +
      '<div class="form-group"><label>Amount</label>' +
        '<input class="form-input" id="bf-amount" type="number" step="0.01" style="width:100%" value="' + escHtml(String(currentAmt)) + '" placeholder="0.00">' +
      '</div>' +
      '<div class="form-group"><label>As of Date</label>' +
        '<input class="form-input" id="bf-date" type="date" style="width:100%" value="' + escHtml(currentDate) + '">' +
      '</div>' +
      '<button type="submit" class="btn btn-primary" style="width:100%">Save</button>' +
    '</form>'
  );
  document.getElementById('bf-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    var amt = document.getElementById('bf-amount').value;
    var dt = document.getElementById('bf-date').value;
    await api('accounts/' + acct.id + '/balance-forward', {
      method: 'PUT',
      body: JSON.stringify({
        balance_forward_amount: amt ? parseFloat(amt) : 0,
        balance_forward_date: dt || null
      })
    });
    closeModal();
    showToast('Balance forward updated');
    // Refresh accounts data and re-render
    _accounts = await api('accounts') || _accounts;
    buildNav();
    renderDashboard();
  });
}

// ── Account Page ──────────────────────────────────────────────────────

async function renderAccountPage() {
  if (!_activeAccountId) { navigateTo('dashboard'); return; }

  var acct = _accounts.find(function(a) { return a.id == _activeAccountId; });
  if (!acct) { navigateTo('dashboard'); return; }

  var c = document.getElementById('page-content');
  c.classList.remove('page-enter');
  c.textContent = '';

  // Account header
  var hdr = document.createElement('div');
  hdr.className = 'account-header';
  var h2 = document.createElement('h2');
  h2.textContent = acct.name;
  hdr.appendChild(h2);
  var typeBadge = document.createElement('span');
  typeBadge.className = 'account-type-badge';
  typeBadge.textContent = acct.account_type;
  hdr.appendChild(typeBadge);
  c.appendChild(hdr);

  if (acct.account_type === 'brokerage') {
    // Brokerage: Trade Matching / Non-Trade sub-tabs
    var tabBarDiv = document.createElement('div');
    tabBarDiv.className = 'sub-tab-bar';
    tabBarDiv.id = 'tab-bar';
    c.appendChild(tabBarDiv);

    var tradeDiv = document.createElement('div');
    tradeDiv.id = 'trade-content';
    c.appendChild(tradeDiv);

    var nontradeDiv = document.createElement('div');
    nontradeDiv.id = 'nontrade-content';
    c.appendChild(nontradeDiv);

    void c.offsetWidth;
    c.classList.add('page-enter');

    wireSubTabs(acct);
  } else {
    // Non-brokerage (checking, etc): just the transaction register
    var regDiv = document.createElement('div');
    regDiv.id = 'register-content';
    c.appendChild(regDiv);

    void c.offsetWidth;
    c.classList.add('page-enter');

    renderTransactionRegister(acct, 'register-content');
  }
}

function wireSubTabs(acct) {
  var tabBar = document.getElementById('tab-bar');
  if (!tabBar) return;

  tabBar.textContent = '';
  var tradeContent = document.getElementById('trade-content');
  var nontradeContent = document.getElementById('nontrade-content');

  [['trade', 'Trade Matching'], ['nontrade', 'Non-Trade Transactions']].forEach(function(t) {
    var btn = document.createElement('button');
    btn.className = 'btn btn-sm ' + (_accountSubTab === t[0] ? 'btn-primary' : 'btn-ghost');
    btn.textContent = t[1];
    btn.addEventListener('click', function() {
      _accountSubTab = t[0];
      wireSubTabs(acct);
    });
    tabBar.appendChild(btn);
  });

  if (_accountSubTab === 'trade') {
    tradeContent.style.display = '';
    nontradeContent.style.display = 'none';
    renderTradeMatching();
  } else {
    tradeContent.style.display = 'none';
    nontradeContent.style.display = '';
    renderTransactionRegister(acct, 'nontrade-content');
  }
}

function renderTradeMatching() {
  var tradeContent = document.getElementById('trade-content');
  if (!tradeContent) return;

  // Create the position matching tab bar and content area inside trade-content
  tradeContent.textContent = '';
  var pmTabBar = document.createElement('div');
  pmTabBar.className = 'tab-bar';
  pmTabBar.id = 'pm-tab-bar';
  pmTabBar.style.marginTop = '12px';
  tradeContent.appendChild(pmTabBar);
  var pmContent = document.createElement('div');
  pmContent.id = 'pm-content';
  tradeContent.appendChild(pmContent);

  renderPositionMatchingTabs();
}

function renderPositionMatchingTabs() {
  var tabBar = document.getElementById('pm-tab-bar');
  if (!tabBar) return;
  tabBar.textContent = '';

  [['unmatched','Unmatched Transactions'],['open','Open Positions'],['history','Position History']].forEach(function(t) {
    var btn = document.createElement('button');
    btn.className = 'btn btn-sm ' + (_tab === t[0] ? 'btn-primary' : 'btn-ghost');
    btn.textContent = t[1];
    btn.addEventListener('click', function() { _tab = t[0]; _selected = []; renderPositionMatchingTabs(); });
    tabBar.appendChild(btn);
  });

  if (_tab === 'unmatched') renderUnmatched();
  else if (_tab === 'open') renderOpen();
  else if (_tab === 'history') renderHistory();
}

// Keep the old render() for backwards compat
async function render() {
  var tabBar = document.getElementById('tab-bar');
  if (!tabBar) return;
  renderPositionMatchingTabs();
}

// ── Unmatched ─────────────────────────────────────────────────────────

async function renderUnmatched() {
  var params = 'brokerage=' + _brokerage + '&effect=' + _effectFilter + '&symbol=' + encodeURIComponent(_symbolFilter);
  var txns = await api('unmatched?' + params) || [];

  var target = document.getElementById('pm-content');

  // Build filter bar with DOM
  var wrapper = document.createElement('div');
  wrapper.className = 'card';

  var filterDiv = document.createElement('div');
  filterDiv.style.cssText = 'display:flex;gap:12px;align-items:center;margin-bottom:16px;flex-wrap:wrap';

  var effectSel = document.createElement('select');
  effectSel.className = 'form-input';
  effectSel.id = 'effect-filter';
  effectSel.style.width = 'auto';
  [['', 'All Effects'], ['OPENING', 'Opening'], ['CLOSING', 'Closing']].forEach(function(o) {
    var opt = document.createElement('option');
    opt.value = o[0]; opt.textContent = o[1];
    if (o[0] === _effectFilter) opt.selected = true;
    effectSel.appendChild(opt);
  });
  filterDiv.appendChild(effectSel);

  var symInput = document.createElement('input');
  symInput.className = 'form-input';
  symInput.id = 'symbol-filter';
  symInput.style.width = '200px';
  symInput.placeholder = 'Filter by symbol...';
  symInput.value = _symbolFilter;
  filterDiv.appendChild(symInput);

  var filterBtn = document.createElement('button');
  filterBtn.className = 'btn btn-sm btn-ghost';
  filterBtn.id = 'apply-filter';
  filterBtn.textContent = 'Filter';
  filterDiv.appendChild(filterBtn);

  var countSpan = document.createElement('span');
  countSpan.className = 'text-xs text-muted';
  countSpan.textContent = txns.length + ' transactions';
  filterDiv.appendChild(countSpan);

  var spacer = document.createElement('div');
  spacer.style.flex = '1';
  filterDiv.appendChild(spacer);

  var selCount = document.createElement('span');
  selCount.className = 'text-xs text-muted';
  selCount.id = 'sel-count';
  selCount.textContent = _selected.length + ' selected';
  filterDiv.appendChild(selCount);

  var createBtn = document.createElement('button');
  createBtn.className = 'btn btn-sm btn-primary';
  createBtn.id = 'create-btn';
  createBtn.disabled = _selected.length === 0;
  createBtn.textContent = 'Create Position';
  filterDiv.appendChild(createBtn);

  wrapper.appendChild(filterDiv);

  // Build table
  var tableWrap = document.createElement('div');
  tableWrap.className = 'table-wrap';
  var table = document.createElement('table');
  table.className = 'data-table';
  var thead = document.createElement('thead');
  var headTr = document.createElement('tr');
  var checkAllTh = document.createElement('th');
  checkAllTh.style.width = '30px';
  var checkAllInput = document.createElement('input');
  checkAllInput.type = 'checkbox';
  checkAllInput.id = 'check-all';
  checkAllTh.appendChild(checkAllInput);
  headTr.appendChild(checkAllTh);
  ['Date','Symbol','Description','Effect','Qty','Price','Net Amount','Commission'].forEach(function(h) {
    var th = document.createElement('th');
    th.textContent = h;
    headTr.appendChild(th);
  });
  thead.appendChild(headTr);
  table.appendChild(thead);

  var tbody = document.createElement('tbody');
  txns.forEach(function(t) {
    var tr = document.createElement('tr');
    var checked = _selected.indexOf(t.activity_id) >= 0;

    var tdCheck = document.createElement('td');
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'txn-check';
    cb.dataset.aid = t.activity_id;
    if (checked) cb.checked = true;
    tdCheck.appendChild(cb);
    tr.appendChild(tdCheck);

    var tdDate = document.createElement('td');
    tdDate.className = 'text-xs';
    tdDate.textContent = fmtDateShort(t.trade_date);
    tr.appendChild(tdDate);

    var tdSym = document.createElement('td');
    tdSym.textContent = t.symbol || '';
    tr.appendChild(tdSym);

    var tdDesc = document.createElement('td');
    tdDesc.className = 'text-xs';
    tdDesc.textContent = (t.instrument_description || t.description || '').substring(0, 60);
    tr.appendChild(tdDesc);

    var tdEffect = document.createElement('td');
    tdEffect.className = t.position_effect === 'OPENING' ? 'success' : t.position_effect === 'CLOSING' ? 'danger' : '';
    tdEffect.textContent = t.position_effect || t.type || '';
    tr.appendChild(tdEffect);

    var tdQty = document.createElement('td');
    tdQty.className = 'mono';
    tdQty.textContent = t.amount || 0;
    tr.appendChild(tdQty);

    var tdPrice = document.createElement('td');
    tdPrice.className = 'mono';
    tdPrice.textContent = fmtMoney(t.price);
    tr.appendChild(tdPrice);

    var tdNet = document.createElement('td');
    var netNum = parseFloat(t.net_amount);
    tdNet.className = 'mono ' + (netNum >= 0 ? 'success' : 'danger');
    tdNet.textContent = fmtMoney(t.net_amount);
    tr.appendChild(tdNet);

    var tdComm = document.createElement('td');
    tdComm.className = 'mono';
    tdComm.textContent = fmtMoney(t.commission);
    tr.appendChild(tdComm);

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  wrapper.appendChild(tableWrap);

  if (target) {
    target.textContent = '';
    target.appendChild(wrapper);
  } else {
    var pc = document.getElementById('page-content');
    pc.textContent = '';
    pc.appendChild(wrapper);
  }
  makeSortable(table);

  // Wire filter
  filterBtn.addEventListener('click', function() {
    _effectFilter = effectSel.value;
    _symbolFilter = symInput.value;
    renderPositionMatchingTabs();
  });
  symInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') filterBtn.click(); });

  // Wire checkboxes
  document.querySelectorAll('.txn-check').forEach(function(cb) {
    cb.addEventListener('change', function() {
      var aid = parseInt(this.dataset.aid);
      if (this.checked) { if (_selected.indexOf(aid) < 0) _selected.push(aid); }
      else { _selected = _selected.filter(function(id) { return id !== aid; }); }
      selCount.textContent = _selected.length + ' selected';
      createBtn.disabled = _selected.length === 0;
    });
  });
  checkAllInput.addEventListener('change', function() {
    var checked = this.checked; _selected = [];
    document.querySelectorAll('.txn-check').forEach(function(cb) {
      cb.checked = checked;
      if (checked) _selected.push(parseInt(cb.dataset.aid));
    });
    selCount.textContent = _selected.length + ' selected';
    createBtn.disabled = _selected.length === 0;
  });

  // Wire create
  createBtn.addEventListener('click', function() {
    var typeOpts = _INSTRUMENT_TYPES.map(function(t) { return '<option value="' + escHtml(t) + '">' + escHtml(t) + '</option>'; }).join('');
    var subtypeOpts = _SUBTYPES.map(function(s) { return '<option value="' + escHtml(s) + '">' + escHtml(s) + '</option>'; }).join('');
    openModal('Create Position (' + _selected.length + ' transactions)',
      '<form id="create-form">' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
          '<div class="form-group"><label>Instrument Type</label><select class="form-input" id="f-type" style="width:100%"><option value="">--</option>' + typeOpts + '</select></div>' +
          '<div class="form-group"><label>Subtype</label><select class="form-input" id="f-subtype" style="width:100%"><option value="">--</option>' + subtypeOpts + '</select></div>' +
        '</div>' +
        '<div class="form-group"><label>Notes</label><textarea class="form-textarea" id="f-notes" rows="2" placeholder="Optional..."></textarea></div>' +
        '<button type="submit" class="btn btn-primary" style="width:100%">Create Position</button>' +
      '</form>'
    );
    document.getElementById('create-form').addEventListener('submit', async function(e) {
      e.preventDefault();
      await api('open-position', { method: 'POST', body: JSON.stringify({
        activity_ids: _selected, brokerage: _brokerage,
        instrument_type: document.getElementById('f-type').value || null,
        subtype: document.getElementById('f-subtype').value || null,
        notes: document.getElementById('f-notes').value || null,
      })});
      closeModal(); _selected = []; showToast('Position created'); renderPositionMatchingTabs();
    });
  });
}

// ── Open Positions ────────────────────────────────────────────────────

async function renderOpen() {
  var positions = await api('positions?status=open&brokerage=' + _brokerage) || [];

  var target = document.getElementById('pm-content');

  if (positions.length === 0) {
    var empty = document.createElement('div');
    empty.className = 'card';
    var emptyInner = document.createElement('div');
    emptyInner.className = 'empty-state';
    emptyInner.textContent = 'No open positions. Select opening transactions and create a position.';
    empty.appendChild(emptyInner);
    if (target) { target.textContent = ''; target.appendChild(empty); }
    return;
  }

  var container = document.createDocumentFragment();
  positions.forEach(function(p) {
    var legs = (p.legs || []).filter(function(l) { return l && l.leg_id; });

    var card = document.createElement('div');
    card.className = 'card mb-24';
    card.style.borderLeft = '3px solid var(--gold)';

    // Header row
    var headerDiv = document.createElement('div');
    headerDiv.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px';

    var leftDiv = document.createElement('div');
    var symStrong = document.createElement('strong');
    symStrong.textContent = p.symbol || 'Position';
    leftDiv.appendChild(symStrong);
    if (p.subtype) {
      var stBadge = document.createElement('span');
      stBadge.className = 'badge badge-gold';
      stBadge.textContent = p.subtype;
      stBadge.style.marginLeft = '6px';
      leftDiv.appendChild(stBadge);
    }
    if (p.instrument_type) {
      var itBadge = document.createElement('span');
      itBadge.className = 'badge badge-open';
      itBadge.textContent = p.instrument_type;
      itBadge.style.marginLeft = '6px';
      leftDiv.appendChild(itBadge);
    }
    headerDiv.appendChild(leftDiv);

    var btnsDiv = document.createElement('div');
    btnsDiv.style.cssText = 'display:flex;gap:8px';
    var editBtn = document.createElement('button');
    editBtn.className = 'btn btn-sm btn-ghost edit-btn';
    editBtn.dataset.pid = p.position_id;
    editBtn.textContent = 'Edit';
    btnsDiv.appendChild(editBtn);
    var closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-sm btn-primary close-btn';
    closeBtn.dataset.pid = p.position_id;
    closeBtn.textContent = 'Close Position';
    btnsDiv.appendChild(closeBtn);
    headerDiv.appendChild(btnsDiv);
    card.appendChild(headerDiv);

    // Meta row
    var metaDiv = document.createElement('div');
    metaDiv.style.cssText = 'display:flex;gap:16px;margin-bottom:12px;font-size:12px;color:var(--text-muted)';
    var metaOpen = document.createElement('span');
    metaOpen.textContent = 'Opened: ' + fmtDateShort(p.opened_at);
    metaDiv.appendChild(metaOpen);
    var metaCost = document.createElement('span');
    var costStrong = document.createElement('strong');
    costStrong.textContent = fmtMoney(p.total_open_cost);
    metaCost.textContent = 'Cost: ';
    metaCost.appendChild(costStrong);
    metaDiv.appendChild(metaCost);
    var metaLegs = document.createElement('span');
    var legsStrong = document.createElement('strong');
    legsStrong.textContent = legs.length;
    metaLegs.textContent = 'Legs: ';
    metaLegs.appendChild(legsStrong);
    metaDiv.appendChild(metaLegs);
    card.appendChild(metaDiv);

    if (p.notes) {
      var notesDiv = document.createElement('div');
      notesDiv.className = 'text-xs text-muted mb-16';
      notesDiv.textContent = p.notes;
      card.appendChild(notesDiv);
    }

    // Legs table
    var legTable = buildTable(
      ['Type', 'Date', 'Symbol', 'Qty', 'Price', 'Net'],
      legs.map(function(l) {
        return [
          { text: l.leg_type, cls: 'text-xs ' + (l.leg_type === 'opening' ? 'success' : 'danger') },
          { text: fmtDateShort(l.trade_date), cls: 'text-xs' },
          { text: l.symbol || '' },
          { text: String(l.amount || 0), cls: 'mono' },
          { text: fmtMoney(l.price), cls: 'mono' },
          { text: fmtMoney(l.net_amount), cls: 'mono' },
        ];
      })
    );
    card.appendChild(legTable);
    container.appendChild(card);
  });

  if (target) { target.textContent = ''; target.appendChild(container); }

  // Wire close buttons
  document.querySelectorAll('.close-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var pid = this.dataset.pid;
      _effectFilter = 'CLOSING'; _tab = 'unmatched'; _selected = [];
      window._closingPositionId = pid;
      renderPositionMatchingTabs();
      setTimeout(function() {
        var createBtn = document.getElementById('create-btn');
        if (createBtn) {
          createBtn.textContent = 'Close Position';
          createBtn.addEventListener('click', async function(e) {
            e.stopImmediatePropagation();
            if (_selected.length === 0) return;
            await api('close-position', { method: 'POST', body: JSON.stringify({ position_id: pid, activity_ids: _selected, brokerage: _brokerage }) });
            _selected = []; _tab = 'history'; showToast('Position closed'); renderPositionMatchingTabs();
          }, { once: true });
        }
      }, 100);
    });
  });

  // Wire edit buttons
  document.querySelectorAll('.edit-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var pid = this.dataset.pid;
      var typeOpts = _INSTRUMENT_TYPES.map(function(t) { return '<option value="' + escHtml(t) + '">' + escHtml(t) + '</option>'; }).join('');
      var subtypeOpts = _SUBTYPES.map(function(s) { return '<option value="' + escHtml(s) + '">' + escHtml(s) + '</option>'; }).join('');
      openModal('Edit Position',
        '<form id="edit-form">' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
            '<div class="form-group"><label>Instrument Type</label><select class="form-input" id="e-type" style="width:100%"><option value="">--</option>' + typeOpts + '</select></div>' +
            '<div class="form-group"><label>Subtype</label><select class="form-input" id="e-subtype" style="width:100%"><option value="">--</option>' + subtypeOpts + '</select></div>' +
          '</div>' +
          '<div class="form-group"><label>Notes</label><textarea class="form-textarea" id="e-notes" rows="2"></textarea></div>' +
          '<button type="submit" class="btn btn-primary" style="width:100%">Save</button>' +
        '</form>'
      );
      document.getElementById('edit-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        await api('update-position', { method: 'POST', body: JSON.stringify({
          position_id: pid,
          instrument_type: document.getElementById('e-type').value || null,
          subtype: document.getElementById('e-subtype').value || null,
          notes: document.getElementById('e-notes').value || null,
        }) });
        closeModal(); showToast('Position updated'); renderPositionMatchingTabs();
      });
    });
  });
}

// ── Position History ──────────────────────────────────────────────────

async function renderHistory() {
  var closed = await api('positions?status=closed&brokerage=' + _brokerage) || [];
  var target = document.getElementById('pm-content');

  if (closed.length === 0) {
    var empty = document.createElement('div');
    empty.className = 'card';
    var emptyInner = document.createElement('div');
    emptyInner.className = 'empty-state';
    emptyInner.textContent = 'No closed positions yet.';
    empty.appendChild(emptyInner);
    if (target) { target.textContent = ''; target.appendChild(empty); }
    return;
  }

  var totalPnl = 0, wins = 0;
  closed.forEach(function(p) { var n = parseFloat(p.net_pnl) || 0; totalPnl += n; if (n > 0) wins++; });
  var wr = ((wins / closed.length) * 100).toFixed(1);

  var frag = document.createDocumentFragment();

  // Stat cards
  var statGrid = document.createElement('div');
  statGrid.className = 'stat-grid';
  [
    { label: 'Closed Trades', value: closed.length, cls: '' },
    { label: 'Net P&L', value: fmtMoney(totalPnl), cls: totalPnl >= 0 ? 'success' : 'danger' },
    { label: 'Win Rate', value: wr + '%', cls: '' },
    { label: 'Winners', value: wins, cls: 'success' },
    { label: 'Losers', value: closed.length - wins, cls: 'danger' }
  ].forEach(function(s) {
    var card = document.createElement('div');
    card.className = 'stat-card';
    var lbl = document.createElement('div');
    lbl.className = 'stat-label';
    lbl.textContent = s.label;
    card.appendChild(lbl);
    var val = document.createElement('div');
    val.className = 'stat-value' + (s.cls ? ' ' + s.cls : '');
    val.textContent = s.value;
    card.appendChild(val);
    statGrid.appendChild(card);
  });
  frag.appendChild(statGrid);

  // Table card
  var card = document.createElement('div');
  card.className = 'card';
  card.style.padding = '20px';
  var title = document.createElement('div');
  title.className = 'card-title mb-16';
  title.textContent = 'Closed Positions';
  card.appendChild(title);

  var table = buildTable(
    ['Symbol', 'Subtype', 'Type', 'Opened', 'Closed', 'Hold', 'Cost', 'Proceeds', 'Net P&L'],
    closed.map(function(p) {
      var pnl = parseFloat(p.net_pnl) || 0;
      return [
        { text: p.symbol || '' }, { text: p.subtype || '-' }, { text: p.instrument_type || '-' },
        { text: fmtDateShort(p.opened_at), cls: 'text-xs' }, { text: fmtDateShort(p.closed_at), cls: 'text-xs' },
        { text: p.hold_duration || '-', cls: 'mono text-xs' },
        { text: fmtMoney(p.total_open_cost), cls: 'mono' }, { text: fmtMoney(p.total_close_proceeds), cls: 'mono' },
        { text: fmtMoney(pnl), cls: 'mono ' + (pnl >= 0 ? 'success' : 'danger') },
      ];
    })
  );
  card.appendChild(table);
  makeSortable(table);
  frag.appendChild(card);

  if (target) { target.textContent = ''; target.appendChild(frag); }
}

// ── Transaction Register ──────────────────────────────────────────────

async function renderTransactionRegister(acct, containerId) {
  var container = document.getElementById(containerId);
  if (!container) return;

  var params = 'view=nontrade' +
    '&page=' + _txnPage +
    '&per_page=50' +
    '&search=' + encodeURIComponent(_txnSearch) +
    '&uncategorized_only=' + _txnUncatOnly +
    '&sort=' + encodeURIComponent(_txnSort) +
    '&order=' + _txnOrder +
    '&category_id=' + encodeURIComponent(_txnCategoryFilter);

  var data = await api('accounts/' + acct.id + '/transactions?' + params);
  if (!data) return;

  var txns = data.transactions || [];
  var totalPages = data.pages || 1;
  var isChecking = (acct.account_type === 'checking');

  container.textContent = '';

  // Filter bar
  var filterBar = document.createElement('div');
  filterBar.className = 'filter-bar';

  var searchInput = document.createElement('input');
  searchInput.className = 'form-input';
  searchInput.id = 'txn-search';
  searchInput.placeholder = 'Search description...';
  searchInput.value = _txnSearch;
  searchInput.style.width = '200px';
  filterBar.appendChild(searchInput);

  // Category filter select
  var catSel = document.createElement('select');
  catSel.className = 'form-input';
  catSel.id = 'txn-cat-filter';
  catSel.style.width = 'auto';
  var defaultOpt = document.createElement('option');
  defaultOpt.value = ''; defaultOpt.textContent = 'All Categories';
  catSel.appendChild(defaultOpt);
  var uncatOpt = document.createElement('option');
  uncatOpt.value = 'uncategorized'; uncatOpt.textContent = 'Uncategorized';
  catSel.appendChild(uncatOpt);

  var catByRoot = {};
  _categories.forEach(function(c) {
    if (!c.is_active) return;
    var root = c.root_type || 'other';
    if (!catByRoot[root]) catByRoot[root] = [];
    catByRoot[root].push(c);
  });
  ['income', 'expense', 'transfer'].forEach(function(root) {
    if (catByRoot[root]) {
      var optGroup = document.createElement('optgroup');
      optGroup.label = root.charAt(0).toUpperCase() + root.slice(1);
      catByRoot[root].forEach(function(c) {
        var opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        if (_txnCategoryFilter == c.id) opt.selected = true;
        optGroup.appendChild(opt);
      });
      catSel.appendChild(optGroup);
    }
  });
  filterBar.appendChild(catSel);

  var uncatLabel = document.createElement('label');
  uncatLabel.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:12px;color:var(--text-secondary);cursor:pointer';
  var uncatCb = document.createElement('input');
  uncatCb.type = 'checkbox';
  uncatCb.id = 'txn-uncat-only';
  if (_txnUncatOnly) uncatCb.checked = true;
  uncatLabel.appendChild(uncatCb);
  uncatLabel.appendChild(document.createTextNode(' Uncategorized only'));
  filterBar.appendChild(uncatLabel);

  var applyBtn = document.createElement('button');
  applyBtn.className = 'btn btn-sm btn-ghost';
  applyBtn.id = 'txn-apply-filter';
  applyBtn.textContent = 'Filter';
  filterBar.appendChild(applyBtn);

  var filterSpacer = document.createElement('div');
  filterSpacer.style.flex = '1';
  filterBar.appendChild(filterSpacer);

  var totalSpan = document.createElement('span');
  totalSpan.className = 'text-xs text-muted';
  totalSpan.textContent = (data.total || 0) + ' transactions';
  filterBar.appendChild(totalSpan);

  if (_txnSelected.length > 0) {
    var selSpan = document.createElement('span');
    selSpan.className = 'text-xs text-muted';
    selSpan.id = 'txn-sel-count';
    selSpan.textContent = _txnSelected.length + ' selected';
    filterBar.appendChild(selSpan);
    var bulkBtn = document.createElement('button');
    bulkBtn.className = 'btn btn-sm btn-primary';
    bulkBtn.id = 'bulk-cat-btn';
    bulkBtn.textContent = 'Categorize Selected';
    filterBar.appendChild(bulkBtn);
  }

  container.appendChild(filterBar);

  // Table
  var tableCard = document.createElement('div');
  tableCard.className = 'card';
  var tableWrap = document.createElement('div');
  tableWrap.className = 'table-wrap';
  var table = document.createElement('table');
  table.className = 'data-table';

  var thead = document.createElement('thead');
  var headTr = document.createElement('tr');
  var checkAllTh = document.createElement('th');
  checkAllTh.style.width = '30px';
  var checkAllCb = document.createElement('input');
  checkAllCb.type = 'checkbox';
  checkAllCb.id = 'txn-check-all';
  checkAllTh.appendChild(checkAllCb);
  headTr.appendChild(checkAllTh);

  var headers = ['Date', 'Description', isChecking ? 'Reference' : 'Type', 'Amount', 'Category'];
  headers.forEach(function(h) {
    var th = document.createElement('th');
    th.textContent = h;
    headTr.appendChild(th);
  });
  thead.appendChild(headTr);
  table.appendChild(thead);

  var tbody = document.createElement('tbody');
  txns.forEach(function(t) {
    var txnId = t[acct.id_column] || t.id || t.activity_id;
    var checked = _txnSelected.indexOf(String(txnId)) >= 0 || _txnSelected.indexOf(txnId) >= 0;
    var dateVal = t[acct.date_column] || t.date || t.trade_date || '';
    var descVal = t[acct.description_column] || t.description || '';
    var amtVal = t[acct.amount_column] || t.amount || t.net_amount || 0;
    var amtNum = parseFloat(amtVal);

    var tr = document.createElement('tr');
    if (checked) tr.className = 'txn-row-selected';
    tr.dataset.txnId = txnId;

    var tdCheck = document.createElement('td');
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'txn-reg-check';
    cb.dataset.txnId = txnId;
    if (checked) cb.checked = true;
    tdCheck.appendChild(cb);
    tr.appendChild(tdCheck);

    var tdDate = document.createElement('td');
    tdDate.className = 'text-xs';
    tdDate.textContent = fmtDateShort(dateVal);
    tr.appendChild(tdDate);

    var tdDesc = document.createElement('td');
    tdDesc.textContent = String(descVal).substring(0, 80);
    tr.appendChild(tdDesc);

    var tdType = document.createElement('td');
    if (isChecking) {
      tdType.className = 'mono text-xs';
      tdType.textContent = t.reference || t.check_number || '-';
    } else {
      var txnType = t.type || t.transaction_type || '-';
      var badge = document.createElement('span');
      badge.className = 'badge badge-gold';
      badge.textContent = txnType;
      tdType.appendChild(badge);
    }
    tr.appendChild(tdType);

    var tdAmt = document.createElement('td');
    tdAmt.className = 'mono ' + (isNaN(amtNum) ? '' : (amtNum >= 0 ? 'success' : 'danger'));
    tdAmt.textContent = fmtMoney(amtVal);
    tr.appendChild(tdAmt);

    var tdCat = document.createElement('td');
    tdCat.className = 'category-cell';
    tdCat.dataset.txnId = txnId;
    tdCat.dataset.accountId = acct.id;
    if (t.category_id && t.category_name) {
      var catBadge = document.createElement('span');
      catBadge.className = 'category-badge';
      var color = t.category_color || '#6a7080';
      catBadge.style.background = color + '22';
      catBadge.style.color = color;
      catBadge.textContent = t.category_name;
      tdCat.appendChild(catBadge);
    } else {
      var uncatBadge = document.createElement('span');
      uncatBadge.className = 'category-badge-uncategorized';
      uncatBadge.textContent = '+ Categorize';
      tdCat.appendChild(uncatBadge);
    }
    tr.appendChild(tdCat);

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  tableCard.appendChild(tableWrap);

  // Pagination
  if (totalPages > 1) {
    var pagDiv = document.createElement('div');
    pagDiv.className = 'pagination';

    var prevBtn = document.createElement('button');
    prevBtn.id = 'pg-prev';
    prevBtn.textContent = 'Prev';
    if (_txnPage <= 1) prevBtn.disabled = true;
    pagDiv.appendChild(prevBtn);

    var startPage = Math.max(1, _txnPage - 2);
    var endPage = Math.min(totalPages, startPage + 4);
    if (startPage > 1) {
      var firstBtn = document.createElement('button');
      firstBtn.className = 'pg-btn';
      firstBtn.dataset.pg = '1';
      firstBtn.textContent = '1';
      pagDiv.appendChild(firstBtn);
      var dots = document.createElement('span');
      dots.className = 'page-info';
      dots.textContent = '...';
      pagDiv.appendChild(dots);
    }
    for (var i = startPage; i <= endPage; i++) {
      var pgBtn = document.createElement('button');
      pgBtn.className = 'pg-btn' + (i === _txnPage ? ' active' : '');
      pgBtn.dataset.pg = String(i);
      pgBtn.textContent = i;
      pagDiv.appendChild(pgBtn);
    }
    if (endPage < totalPages) {
      var dots2 = document.createElement('span');
      dots2.className = 'page-info';
      dots2.textContent = '...';
      pagDiv.appendChild(dots2);
      var lastBtn = document.createElement('button');
      lastBtn.className = 'pg-btn';
      lastBtn.dataset.pg = String(totalPages);
      lastBtn.textContent = totalPages;
      pagDiv.appendChild(lastBtn);
    }

    var nextBtn = document.createElement('button');
    nextBtn.id = 'pg-next';
    nextBtn.textContent = 'Next';
    if (_txnPage >= totalPages) nextBtn.disabled = true;
    pagDiv.appendChild(nextBtn);

    var pageInfo = document.createElement('span');
    pageInfo.className = 'page-info';
    pageInfo.textContent = 'Page ' + _txnPage + ' of ' + totalPages;
    pagDiv.appendChild(pageInfo);

    tableCard.appendChild(pagDiv);
  }

  container.appendChild(tableCard);
  makeSortable(table);

  // Wire filter
  applyBtn.addEventListener('click', function() {
    _txnSearch = searchInput.value;
    _txnUncatOnly = uncatCb.checked;
    _txnCategoryFilter = catSel.value;
    if (_txnCategoryFilter === 'uncategorized') { _txnUncatOnly = true; _txnCategoryFilter = ''; }
    _txnPage = 1;
    renderTransactionRegister(acct, containerId);
  });
  searchInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') applyBtn.click(); });

  // Wire checkboxes
  document.querySelectorAll('.txn-reg-check').forEach(function(cb) {
    cb.addEventListener('change', function() {
      var tid = String(this.dataset.txnId);
      if (this.checked) { if (_txnSelected.indexOf(tid) < 0) _txnSelected.push(tid); }
      else { _txnSelected = _txnSelected.filter(function(id) { return String(id) !== tid; }); }
      this.closest('tr').classList.toggle('txn-row-selected', this.checked);
      // Re-render to update bulk button visibility
      renderTransactionRegister(acct, containerId);
    });
  });
  checkAllCb.addEventListener('change', function() {
    var checked = this.checked; _txnSelected = [];
    document.querySelectorAll('.txn-reg-check').forEach(function(cb) {
      cb.checked = checked;
      cb.closest('tr').classList.toggle('txn-row-selected', checked);
      if (checked) _txnSelected.push(String(cb.dataset.txnId));
    });
    renderTransactionRegister(acct, containerId);
  });

  // Wire pagination
  document.querySelectorAll('.pg-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      _txnPage = parseInt(this.dataset.pg);
      renderTransactionRegister(acct, containerId);
    });
  });
  var pgPrev = document.getElementById('pg-prev');
  if (pgPrev) pgPrev.addEventListener('click', function() { _txnPage--; renderTransactionRegister(acct, containerId); });
  var pgNext = document.getElementById('pg-next');
  if (pgNext) pgNext.addEventListener('click', function() { _txnPage++; renderTransactionRegister(acct, containerId); });

  // Wire bulk categorize
  var bulkCatBtn = document.getElementById('bulk-cat-btn');
  if (bulkCatBtn) {
    bulkCatBtn.addEventListener('click', function() { openBulkCategorizeModal(acct, containerId); });
  }

  // Wire inline category pickers
  wireInlineCategoryPickers(acct, containerId);
}

// ── Inline Category Picker ────────────────────────────────────────────

function wireInlineCategoryPickers(acct, containerId) {
  document.querySelectorAll('.category-cell').forEach(function(cell) {
    cell.addEventListener('click', function(e) {
      e.stopPropagation();
      // Remove any existing dropdown
      document.querySelectorAll('.category-dropdown').forEach(function(d) { d.remove(); });
      var txnId = cell.dataset.txnId;
      var accountId = cell.dataset.accountId;
      showCategoryDropdown(cell, accountId, txnId, acct, containerId);
    });
  });
}

function showCategoryDropdown(cell, accountId, txnId, acct, containerId) {
  var dropdown = document.createElement('div');
  dropdown.className = 'category-dropdown';

  // Search input
  var search = document.createElement('input');
  search.className = 'category-dropdown-search';
  search.placeholder = 'Search categories...';
  search.type = 'text';
  dropdown.appendChild(search);

  var listContainer = document.createElement('div');
  dropdown.appendChild(listContainer);

  function renderItems(filter) {
    listContainer.textContent = '';
    var catByRoot = {};
    _categories.forEach(function(c) {
      if (!c.is_active) return;
      if (filter && c.name.toLowerCase().indexOf(filter.toLowerCase()) < 0) return;
      var root = c.root_type || 'other';
      if (!catByRoot[root]) catByRoot[root] = [];
      catByRoot[root].push(c);
    });

    ['income', 'expense', 'transfer'].forEach(function(root) {
      if (!catByRoot[root] || catByRoot[root].length === 0) return;
      var groupLabel = document.createElement('div');
      groupLabel.className = 'category-dropdown-group';
      groupLabel.textContent = root.charAt(0).toUpperCase() + root.slice(1);
      listContainer.appendChild(groupLabel);

      catByRoot[root].forEach(function(c) {
        var item = document.createElement('div');
        item.className = 'category-dropdown-item';
        var dot = document.createElement('span');
        dot.className = 'cat-color';
        dot.style.background = c.color || '#6a7080';
        item.appendChild(dot);
        var name = document.createElement('span');
        name.textContent = c.name;
        item.appendChild(name);
        item.addEventListener('click', async function(e) {
          e.stopPropagation();
          await api('categorize', { method: 'POST', body: JSON.stringify({
            account_id: accountId, source_txn_id: txnId, category_id: c.id
          }) });
          dropdown.remove();
          showToast('Categorized as ' + c.name);
          renderTransactionRegister(acct, containerId);
          refreshNavBadges();
        });
        listContainer.appendChild(item);
      });
    });

    // Clear category option
    var clearDiv = document.createElement('div');
    clearDiv.className = 'category-dropdown-clear';
    clearDiv.textContent = 'Remove category';
    clearDiv.addEventListener('click', async function(e) {
      e.stopPropagation();
      await api('categorize', { method: 'DELETE', body: JSON.stringify({
        account_id: accountId, source_txn_id: txnId
      }) });
      dropdown.remove();
      showToast('Category removed');
      renderTransactionRegister(acct, containerId);
      refreshNavBadges();
    });
    listContainer.appendChild(clearDiv);
  }

  renderItems('');
  search.addEventListener('input', function() { renderItems(this.value); });
  search.addEventListener('click', function(e) { e.stopPropagation(); });

  cell.appendChild(dropdown);
  search.focus();
}

// ── Bulk Categorize Modal ─────────────────────────────────────────────

function openBulkCategorizeModal(acct, containerId) {
  var catByRoot = {};
  _categories.forEach(function(c) {
    if (!c.is_active) return;
    var root = c.root_type || 'other';
    if (!catByRoot[root]) catByRoot[root] = [];
    catByRoot[root].push(c);
  });

  var catOpts = '<option value="">-- Select Category --</option>';
  ['income', 'expense', 'transfer'].forEach(function(root) {
    if (catByRoot[root]) {
      catOpts += '<optgroup label="' + escHtml(root.charAt(0).toUpperCase() + root.slice(1)) + '">';
      catByRoot[root].forEach(function(c) {
        catOpts += '<option value="' + c.id + '">' + escHtml(c.name) + '</option>';
      });
      catOpts += '</optgroup>';
    }
  });

  openModal('Categorize ' + _txnSelected.length + ' Transactions',
    '<form id="bulk-cat-form">' +
      '<div class="form-group"><label>Category</label>' +
        '<select class="form-input" id="bulk-cat-select" style="width:100%">' + catOpts + '</select>' +
      '</div>' +
      '<button type="submit" class="btn btn-primary" style="width:100%">Apply to ' + _txnSelected.length + ' transactions</button>' +
    '</form>'
  );

  document.getElementById('bulk-cat-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    var catId = document.getElementById('bulk-cat-select').value;
    if (!catId) { showToast('Select a category', 'error'); return; }
    await api('categorize/bulk', { method: 'POST', body: JSON.stringify({
      account_id: acct.id, source_txn_ids: _txnSelected, category_id: parseInt(catId)
    }) });
    closeModal();
    _txnSelected = [];
    showToast('Bulk categorization applied');
    renderTransactionRegister(acct, containerId);
    refreshNavBadges();
  });
}

// ── Refresh Nav Badges ────────────────────────────────────────────────

async function refreshNavBadges() {
  var accounts = await api('accounts');
  if (!accounts) return;
  _accounts = accounts;
  buildNav();
  // Re-set active states
  document.querySelectorAll('.nav-item').forEach(function(el) {
    el.classList.toggle('active', el.dataset.page === _page);
  });
  document.querySelectorAll('.nav-sub-item').forEach(function(el) {
    if (_page === 'account') {
      el.classList.toggle('active', el.dataset.accountId == _activeAccountId);
    }
  });
}

// ── Category Manager ──────────────────────────────────────────────────

async function renderCategoryManager() {
  // Refresh categories
  _categories = await api('categories') || [];

  var roots = ['income', 'expense', 'transfer'];
  var rootColors = { income: 'var(--success)', expense: 'var(--danger)', transfer: 'var(--info)' };

  var c = document.getElementById('page-content');
  c.classList.remove('page-enter');
  c.textContent = '';

  var h2 = document.createElement('h2');
  h2.style.cssText = 'font-family:var(--font-display);font-size:24px;font-weight:600;margin-bottom:20px';
  h2.textContent = 'Categories';
  c.appendChild(h2);

  roots.forEach(function(root) {
    var cats = _categories.filter(function(cat) { return cat.root_type === root; });
    var parents = cats.filter(function(cat) { return !cat.parent_id; });

    var treeRoot = document.createElement('div');
    treeRoot.className = 'category-tree-root';

    var header = document.createElement('div');
    header.className = 'category-tree-header';
    var headerLabel = document.createElement('span');
    headerLabel.className = 'category-tree-header-label';
    headerLabel.style.color = rootColors[root];
    headerLabel.textContent = root.charAt(0).toUpperCase() + root.slice(1) + ' (' + cats.length + ')';
    header.appendChild(headerLabel);
    var addBtn = document.createElement('button');
    addBtn.className = 'btn btn-sm btn-ghost add-cat-btn';
    addBtn.dataset.root = root;
    addBtn.textContent = '+ Add';
    header.appendChild(addBtn);
    treeRoot.appendChild(header);

    var itemsDiv = document.createElement('div');
    itemsDiv.className = 'category-tree-items';

    if (parents.length === 0) {
      var emptyItem = document.createElement('div');
      emptyItem.className = 'category-tree-item';
      var emptyText = document.createElement('span');
      emptyText.className = 'text-muted text-xs';
      emptyText.textContent = 'No categories yet';
      emptyItem.appendChild(emptyText);
      itemsDiv.appendChild(emptyItem);
    } else {
      parents.forEach(function(cat) {
        itemsDiv.appendChild(buildCategoryTreeItemDOM(cat, false));
        var children = cats.filter(function(ch) { return ch.parent_id === cat.id; });
        children.forEach(function(child) {
          itemsDiv.appendChild(buildCategoryTreeItemDOM(child, true));
        });
      });
    }

    treeRoot.appendChild(itemsDiv);
    c.appendChild(treeRoot);
  });

  void c.offsetWidth;
  c.classList.add('page-enter');

  // Wire add buttons
  document.querySelectorAll('.add-cat-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      openCategoryModal(null, this.dataset.root);
    });
  });

  // Wire edit buttons
  document.querySelectorAll('.edit-cat-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var catId = parseInt(this.dataset.catId);
      var cat = _categories.find(function(c) { return c.id === catId; });
      if (cat) openCategoryModal(cat, cat.root_type);
    });
  });

  // Wire delete buttons
  document.querySelectorAll('.delete-cat-btn').forEach(function(btn) {
    btn.addEventListener('click', async function(e) {
      e.stopPropagation();
      var catId = parseInt(this.dataset.catId);
      var cat = _categories.find(function(c) { return c.id === catId; });
      if (!cat) return;
      if (!confirm('Delete category "' + cat.name + '"? This will uncategorize all transactions using it.')) return;
      await api('categories/' + catId, { method: 'DELETE' });
      showToast('Category deleted');
      renderCategoryManager();
    });
  });
}

function buildCategoryTreeItemDOM(cat, isChild) {
  var item = document.createElement('div');
  item.className = 'category-tree-item' + (isChild ? ' category-tree-child' : '');

  var left = document.createElement('div');
  left.className = 'category-tree-item-left';
  var colorDot = document.createElement('span');
  colorDot.className = 'category-tree-item-color';
  colorDot.style.background = cat.color || '#6a7080';
  left.appendChild(colorDot);
  var nameSpan = document.createElement('span');
  nameSpan.textContent = cat.name;
  left.appendChild(nameSpan);
  if (cat.usage_count) {
    var usageSpan = document.createElement('span');
    usageSpan.className = 'text-xs text-muted';
    usageSpan.textContent = '(' + cat.usage_count + ')';
    left.appendChild(usageSpan);
  }
  item.appendChild(left);

  var actions = document.createElement('div');
  actions.className = 'category-tree-item-actions';
  var editBtn = document.createElement('button');
  editBtn.className = 'btn btn-sm btn-ghost edit-cat-btn';
  editBtn.dataset.catId = cat.id;
  editBtn.textContent = 'Edit';
  actions.appendChild(editBtn);
  var deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn btn-sm btn-danger delete-cat-btn';
  deleteBtn.dataset.catId = cat.id;
  deleteBtn.textContent = 'Delete';
  actions.appendChild(deleteBtn);
  item.appendChild(actions);

  return item;
}

function openCategoryModal(cat, rootType) {
  var isEdit = !!cat;
  var title = isEdit ? 'Edit Category' : 'Add ' + rootType.charAt(0).toUpperCase() + rootType.slice(1) + ' Category';

  // Build parent options
  var parentOpts = '<option value="">-- None (top level) --</option>';
  _categories.filter(function(c) { return c.root_type === rootType && !c.parent_id && c.is_active; }).forEach(function(c) {
    if (isEdit && c.id === cat.id) return;
    parentOpts += '<option value="' + c.id + '"' + (isEdit && cat.parent_id === c.id ? ' selected' : '') + '>' + escHtml(c.name) + '</option>';
  });

  var defaultColors = ['#5a9e6f', '#b05555', '#5a7faa', '#c49a3c', '#b4964f', '#8a7340', '#7a6fa0', '#6a9e8f', '#c97070', '#aa8855'];

  // Build modal body with string concat (modal content is from our DB data)
  var colorSwatches = defaultColors.map(function(clr) {
    var selected = isEdit && cat.color === clr;
    return '<span class="cat-color-swatch" data-color="' + clr + '" style="display:inline-block;width:24px;height:24px;border-radius:50%;background:' + clr + ';cursor:pointer;border:2px solid ' + (selected ? 'var(--gold)' : 'transparent') + ';margin:2px"></span>';
  }).join('');

  openModal(title,
    '<form id="cat-form">' +
      '<div class="form-group"><label>Name</label><input class="form-input" id="cat-name" style="width:100%" value="' + escHtml(isEdit ? cat.name : '') + '" required></div>' +
      '<div class="form-group"><label>Parent</label><select class="form-input" id="cat-parent" style="width:100%">' + parentOpts + '</select></div>' +
      '<div class="form-group"><label>Color</label><div id="cat-colors" style="display:flex;flex-wrap:wrap;gap:4px">' + colorSwatches + '</div>' +
        '<input type="hidden" id="cat-color" value="' + escHtml(isEdit && cat.color ? cat.color : defaultColors[0]) + '">' +
      '</div>' +
      '<button type="submit" class="btn btn-primary" style="width:100%">' + (isEdit ? 'Save' : 'Create') + '</button>' +
    '</form>'
  );

  // Wire color swatches
  document.querySelectorAll('.cat-color-swatch').forEach(function(sw) {
    sw.addEventListener('click', function() {
      document.querySelectorAll('.cat-color-swatch').forEach(function(s) { s.style.borderColor = 'transparent'; });
      sw.style.borderColor = 'var(--gold)';
      document.getElementById('cat-color').value = sw.dataset.color;
    });
  });

  document.getElementById('cat-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    var name = document.getElementById('cat-name').value.trim();
    if (!name) { showToast('Name is required', 'error'); return; }
    var parentId = document.getElementById('cat-parent').value || null;
    var color = document.getElementById('cat-color').value;

    if (isEdit) {
      await api('categories/' + cat.id, { method: 'PUT', body: JSON.stringify({
        name: name, parent_id: parentId ? parseInt(parentId) : null, color: color
      }) });
      showToast('Category updated');
    } else {
      await api('categories', { method: 'POST', body: JSON.stringify({
        name: name, root_type: rootType, parent_id: parentId ? parseInt(parentId) : null, color: color
      }) });
      showToast('Category created');
    }
    closeModal();
    renderCategoryManager();
  });
}

// ── Reports (placeholder) ─────────────────────────────────────────────

function renderReports() {
  var c = document.getElementById('page-content');
  c.classList.remove('page-enter');
  c.textContent = '';

  var h2 = document.createElement('h2');
  h2.style.cssText = 'font-family:var(--font-display);font-size:24px;font-weight:600;margin-bottom:20px';
  h2.textContent = 'Reports';
  c.appendChild(h2);

  var card = document.createElement('div');
  card.className = 'card';
  var emptyDiv = document.createElement('div');
  emptyDiv.className = 'empty-state';
  var heading = document.createElement('div');
  heading.style.cssText = 'font-size:28px;margin-bottom:12px;color:var(--text-muted)';
  heading.textContent = 'Coming Soon';
  emptyDiv.appendChild(heading);
  var desc = document.createElement('div');
  desc.className = 'text-sm text-muted';
  desc.textContent = 'Income vs. Expense summaries, category breakdowns, and tax reports will appear here.';
  emptyDiv.appendChild(desc);
  card.appendChild(emptyDiv);
  c.appendChild(card);

  void c.offsetWidth;
  c.classList.add('page-enter');
}
