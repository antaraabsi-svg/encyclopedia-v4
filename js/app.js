(function () {
  'use strict';

  var E = window.ENC, X = window.EXTRAS;
  var GLS = window.GLOSSARY || [], LEGAL = window.LEGAL || [], SUM = window.SUMMARIES || {}, QZ = window.QUIZZES || [], SESS = window.SESSIONS || [], TL = window.TOOLS || [];
  var N = E.dims.length;
  var $ = function (id) { return document.getElementById(id); };
  var pad = function (n) { return ('00' + n).slice(-3); };
  var pageSrc = function (p) { return 'pages/' + pad(p) + '.webp'; };
  var thumbSrc = function (p) { return 'thumbs/' + pad(p) + '.jpg'; };

  /* ───────── معلومات الصفحات ───────── */
  var INFO = new Array(N + 1);
  E.groups.forEach(function (g, gi) {
    g.sections.forEach(function (s, si) {
      s.items.forEach(function (it) {
        INFO[it[0]] = { p: it[0], n: it[1], t: it[2], k: it[3], g: gi, s: si };
      });
    });
  });
  var CUR_G = function (p) { return E.groups[INFO[p].g]; };
  var CUR_S = function (p) { return E.groups[INFO[p].g].sections[INFO[p].s]; };
  var SERIES_NO = function (p) { var id = CUR_G(p).id; return id.charAt(0) === 's' ? id.slice(1) : ''; };

  /* ───────── أدوات ───────── */
  function norm(s) {
    return String(s).toLowerCase()
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 1632); })
      .replace(/\s+/g, ' ').trim();
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  var toastTimer;
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 2000);
  }
  var STAR = '<svg class="fav" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z"/></svg>';
  var CHEV = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" transform="scale(-1,1) translate(-24,0)"/></svg>';
  var CHECK = '<svg class="ck" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  function plural(n, one) { return n + ' ' + one; }

  /* ───────── تخزين محلي (مع بديل في الذاكرة) ───────── */
  var mem = {};
  var store = {
    get: function (k, d) {
      try { var v = localStorage.getItem('enc:' + k); return v === null ? d : JSON.parse(v); }
      catch (e) { return k in mem ? mem[k] : d; }
    },
    set: function (k, v) {
      mem[k] = v;
      try { localStorage.setItem('enc:' + k, JSON.stringify(v)); } catch (e) { /* تجاهل */ }
    }
  };
  var validP = function (p) { return typeof p === 'number' && p >= 1 && p <= N; };
  var favs = store.get('favs', []).filter(validP);
  var notes = store.get('notes', {});
  var hist = store.get('hist', []).filter(validP);
  var pathDone = store.get('pathdone', {});
  var lastPage = store.get('last', 0);
  function noteCount() { return Object.keys(notes).length; }
  function isFav(p) { return favs.indexOf(p) > -1; }
  function toggleFav(p) {
    var i = favs.indexOf(p);
    if (i > -1) { favs.splice(i, 1); toast('أُزيلت الصفحة ' + p + ' من المفضلة'); }
    else { favs.push(p); toast('أُضيفت الصفحة ' + p + ' إلى المفضلة'); }
    store.set('favs', favs);
    refreshFavUI();
  }

  /* ───────── المواضيع والصفحات ذات الصلة ───────── */
  var PT = {}, TAGN = {}, TAGS = {};
  X.tags.forEach(function (t) { TAGS[t.id] = t; TAGN[t.id] = 0; t._kw = t.kw.map(norm); });
  for (var pi = 1; pi <= N; pi++) {
    if (INFO[pi].k) continue;
    var tx = norm(INFO[pi].t), list = [];
    X.tags.forEach(function (t) {
      var hit = (t.groups && t.groups.indexOf(INFO[pi].g) > -1) || t._kw.some(function (k) { return tx.indexOf(k) > -1; });
      if (hit) { list.push(t.id); TAGN[t.id]++; }
    });
    if (list.length) PT[pi] = list;
  }
  function related(p) {
    var mine = PT[p] || [], out = [];
    if (!mine.length) return out;
    for (var q = 1; q <= N; q++) {
      if (q === p || INFO[q].k || !PT[q]) continue;
      var sc = 0;
      PT[q].forEach(function (t) { if (mine.indexOf(t) > -1) sc += 10 / Math.sqrt(TAGN[t]); });
      if (!sc) continue;
      if (INFO[q].g === INFO[p].g && INFO[q].s === INFO[p].s) sc += 1.5;
      sc -= Math.min(Math.abs(q - p), 60) / 120;
      out.push([q, sc]);
    }
    out.sort(function (a, b) { return b[1] - a[1]; });
    return out.slice(0, 8).map(function (x) { return x[0]; });
  }

  /* فهرس بحث */
  var SEARCH = [];
  for (var sp = 1; sp <= N; sp++) {
    SEARCH.push({ p: sp, n: INFO[sp].n, text: norm(INFO[sp].t + ' ' + CUR_S(sp).title + ' ' + CUR_G(sp).title + ' ' + (PT[sp] || []).map(function (t) { return TAGS[t].label; }).join(' ')) });
  }

  /* ───────── المظهر وحجم الخط ───────── */
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    var m = document.querySelector('meta[name=theme-color]');
    if (m) m.setAttribute('content', t === 'dark' ? '#0a1122' : '#0d2150');
  }
  var savedTheme = store.get('theme', null);
  applyTheme(savedTheme || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  $('btnTheme').onclick = function () {
    var t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(t); store.set('theme', t);
  };
  var fs = store.get('fs', 0);
  function applyFs() { document.documentElement.setAttribute('data-fs', fs); }
  applyFs();
  $('btnFont').onclick = function () {
    fs = (fs + 1) % 3; store.set('fs', fs); applyFs();
    toast('حجم الخط: ' + ['عادي', 'كبير', 'أكبر'][fs]);
  };

  /* ───────── الرئيسية ───────── */
  function pathProgress(pt) {
    var done = (pathDone[pt.id] || []).filter(function (p) { return pt.pages.indexOf(p) > -1; });
    return { done: done.length, total: pt.pages.length, next: pt.pages.filter(function (p) { return done.indexOf(p) < 0; })[0] };
  }
  function buildHome() {
    var sg = $('seriesGrid'); sg.innerHTML = '';
    var nums = ['السلسلة الأولى', 'السلسلة الثانية', 'السلسلة الثالثة', 'السلسلة الرابعة'];
    E.groups.forEach(function (g, gi) {
      if (!g.cover) return;
      var first = g.sections[0].items[0][0];
      var last = g.sections[g.sections.length - 1].items.slice(-1)[0][0];
      var name = g.title.replace(/^[^:]+:\s*/, '');
      var a = document.createElement('div');
      a.className = 's-card'; a.setAttribute('data-series', String(gi));
      a.innerHTML =
        '<a class="cv" href="#/p/' + g.cover + '" aria-label="افتح غلاف ' + esc(g.short) + '"><img loading="lazy" src="' + pageSrc(g.cover) + '" alt="غلاف ' + esc(g.title) + '"></a>' +
        '<div class="s-body"><span class="s-no">' + nums[gi - 1] + '</span>' +
        '<a class="s-t" style="text-decoration:none" href="#/p/' + g.cover + '">' + esc(name) + '</a>' +
        '<span class="s-sub">' + esc(g.sub) + '</span>' +
        '<div class="s-meta"><span>ص ' + first + '–' + last + '</span><a href="#/toc/' + gi + '">فهرس السلسلة</a></div></div>';
      sg.appendChild(a);
    });
    var quick = [['رؤية الموسوعة', 11], ['رسالة الموسوعة', 12], ['أهداف الموسوعة', 13], ['الفئات المستفيدة', 14], ['الفهرس العام', 2], ['صدقة جارية', 280], ['ملخص الموسوعة', 281]];
    $('quick').innerHTML = quick.map(function (q) { return '<a href="#/p/' + q[1] + '">' + q[0] + '<b>' + q[1] + '</b></a>'; }).join('') + '<a href="#/map">خريطة الموسوعة الذهنية</a>';
    $('topicChips').innerHTML = X.tags.map(function (t) { return '<a class="chip" href="#/gallery/t-' + t.id + '">' + esc(t.label) + '<small>' + TAGN[t.id] + '</small></a>'; }).join('');
    refreshHome();
  }
  function miniHTML(p, wide) {
    return '<a class="mini' + (wide ? ' wide' : '') + '" href="#/p/' + p + '"><img loading="lazy" src="' + thumbSrc(p) + '" alt=""><div><b>ص ' + p + '</b>' + esc(INFO[p].t) + '</div></a>';
  }
  function refreshHome() {
    var cta = $('ctaResume');
    if (lastPage > 1) { cta.href = '#/p/' + lastPage; cta.textContent = 'تابع القراءة — الصفحة ' + lastPage; }
    else { cta.href = '#/p/1'; cta.textContent = 'ابدأ القراءة'; }
    var sr = $('stripResume');
    if (hist.length) { sr.hidden = false; $('stripResumeRow').innerHTML = hist.slice(0, 8).map(function (p, i) { return miniHTML(p, i === 0); }).join(''); } else sr.hidden = true;
    var sf = $('stripFav');
    if (favs.length) { sf.hidden = false; $('stripFavRow').innerHTML = favs.slice().sort(function (a, b) { return a - b; }).slice(0, 14).map(function (p) { return miniHTML(p); }).join(''); }
    else sf.hidden = true;
    $('pathsMini').innerHTML = X.paths.map(function (pt) {
      var pr = pathProgress(pt), first = pr.next || pt.pages[0];
      return '<a class="pm" href="#/p/' + first + '/' + pt.id + '"><b>' + esc(pt.title) + '</b><span>' + pt.pages.length + ' صفحة' + (pr.done ? ' · أنجزتَ ' + pr.done : '') + '</span><i class="pb-bar"><u style="width:' + Math.round(pr.done / pr.total * 100) + '%"></u></i></a>';
    }).join('');
  }

  /* ───────── الفهرس (شجرة + بحث) ───────── */
  function rowHTML(p, opts) {
    opts = opts || {};
    var i = INFO[p];
    var cls = 'row' + (i.k === 'c' ? ' cover' : '') + (isFav(p) ? ' isfav' : '') + (notes[p] ? ' hasnote' : '');
    var crumb = opts.crumb ? '<small>' + esc(CUR_G(p).short + ' › ' + CUR_S(p).title) + '</small>' : '';
    var title = opts.hl ? highlight(i.t, opts.hl) : esc(i.t);
    var href = '#/p/' + p + (opts.path ? '/' + opts.path : '');
    var done = opts.done ? ' done' : '';
    return '<a class="' + cls + done + '" data-p="' + p + '" data-series="' + SERIES_NO(p) + '" href="' + href + '">' + (opts.check ? CHECK : '') + '<span class="pg">' + p + '</span>' +
      '<span class="tt">' + title + crumb + '</span>' + (i.n ? '<span class="nm">' + i.n + '</span>' : '') + STAR + '</a>';
  }
  function highlight(text, tokens) {
    var out = esc(text);
    tokens.forEach(function (t) {
      if (!t || /^\d+$/.test(t)) return;
      var re; try { re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'g'); } catch (e) { return; }
      out = out.replace(re, '<mark>$1</mark>');
    });
    return out;
  }
  function buildToc(root, openP) {
    var h = '';
    E.groups.forEach(function (g, gi) {
      var first = g.sections[0].items[0][0];
      var last = g.sections[g.sections.length - 1].items.slice(-1)[0][0];
      var openG = openP && INFO[openP].g === gi;
      h += '<details class="grp" data-g="' + gi + '"' + (openG ? ' open' : '') + '><summary class="g-sum">' + CHEV +
        '<span class="gt"><b>' + esc(g.title) + '</b><small>' + esc(g.sub) + '</small></span><span class="range">ص ' + first + '–' + last + '</span></summary><div class="g-body">';
      g.sections.forEach(function (s, si) {
        var openS = openG && INFO[openP].s === si;
        h += '<details class="sec"' + (openS ? ' open' : '') + '><summary class="s-sum">' + CHEV + '<span>' + esc(s.title) + '</span><small>' + s.items.length + ' ص</small></summary><div class="rows">';
        s.items.forEach(function (it) { h += rowHTML(it[0]); });
        h += '</div></details>';
      });
      h += '</div></details>';
    });
    root.innerHTML = h;
    markNow(root, openP);
  }
  function markNow(root, p) {
    var old = root.querySelectorAll('.row.now');
    for (var i = 0; i < old.length; i++) old[i].classList.remove('now');
    if (!p) return;
    var r = root.querySelector('.row[data-p="' + p + '"]');
    if (r) r.classList.add('now');
  }
  function doSearch(q, resBox, treeBox, extraHide) {
    var nq = norm(q);
    if (!nq) { resBox.hidden = true; treeBox.hidden = false; if (extraHide) extraHide.hidden = false; return; }
    var tokens = nq.split(' ');
    var isNum = /^\d+$/.test(nq);
    var found = [];
    if (isNum) {
      var v = parseInt(nq, 10);
      SEARCH.forEach(function (s) {
        if (s.p === v) found.push({ s: s, w: 0 });
        else if (s.n && parseInt(s.n, 10) === v) found.push({ s: s, w: 1 });
        else if (s.text.indexOf(nq) > -1) found.push({ s: s, w: 2 });
      });
    } else {
      SEARCH.forEach(function (s) {
        var ok = tokens.every(function (t) { return s.text.indexOf(t) > -1; });
        if (ok) found.push({ s: s, w: INFO[s.p].k ? 3 : 1 });
      });
    }
    found.sort(function (a, b) { return a.w - b.w || a.s.p - b.s.p; });
    var html = '<p class="res-count">' + (found.length ? found.length + ' نتيجة' : '') + '</p>';
    if (!found.length) html = '<p class="empty">لا توجد نتائج مطابقة لـ «' + esc(q) + '». جرّب كلمة أقصر أو رقم الصفحة.</p>';
    html += found.slice(0, 80).map(function (f) { return rowHTML(f.s.p, { crumb: true, hl: tokens }); }).join('');
    if (found.length > 80) html += '<p class="res-count">تم عرض أول 80 نتيجة، ضيّق البحث لنتائج أدق.</p>';
    resBox.innerHTML = html; resBox.hidden = false; treeBox.hidden = true;
    if (extraHide) extraHide.hidden = true;
  }
  var tocBuilt = false;
  function showToc(arg) {
    if (!tocBuilt) { buildToc($('tocRoot'), null); tocBuilt = true; }
    var g = arg !== undefined && arg !== '' ? parseInt(arg, 10) : NaN;
    if (!isNaN(g)) {
      var ds = $('tocRoot').querySelectorAll('details.grp');
      for (var i = 0; i < ds.length; i++) ds[i].open = (i === g);
      setTimeout(function () { var d = ds[g]; if (d) d.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 30);
    }
  }
  $('q').addEventListener('input', function () {
    $('qClear').hidden = !this.value;
    doSearch(this.value, $('tocResults'), $('tocRoot'), $('tocTools'));
  });
  $('qClear').onclick = function () { $('q').value = ''; $('qClear').hidden = true; doSearch('', $('tocResults'), $('tocRoot'), $('tocTools')); $('q').focus(); };
  $('btnExpand').onclick = function () { [].forEach.call($('tocRoot').querySelectorAll('details'), function (d) { d.open = true; }); };
  $('btnCollapse').onclick = function () { [].forEach.call($('tocRoot').querySelectorAll('details'), function (d) { d.open = false; }); };

  /* ───────── المسارات ───────── */
  function showPaths() {
    $('pathsList').innerHTML = X.paths.map(function (pt, i) {
      var pr = pathProgress(pt), dn = pathDone[pt.id] || [];
      var startP = pr.next || pt.pages[0];
      var label = pr.done === 0 ? 'ابدأ المسار' : pr.done >= pr.total ? 'أعد المسار' : 'تابع المسار';
      var rows = pt.pages.map(function (p) { return rowHTML(p, { path: pt.id, check: true, done: dn.indexOf(p) > -1 }); }).join('');
      return '<article class="path" data-id="' + pt.id + '">' +
        '<div class="path-h"><span class="path-n">' + (i + 1) + '</span><div class="path-t"><h2>' + esc(pt.title) + '</h2><p>' + esc(pt.desc) + '</p></div></div>' +
        '<div class="path-m"><span>' + pr.done + ' من ' + pr.total + ' صفحة</span><i class="pb-bar"><u style="width:' + Math.round(pr.done / pr.total * 100) + '%"></u></i></div>' +
        '<div class="path-a"><a class="btn primary" href="#/p/' + (pr.done >= pr.total ? pt.pages[0] : startP) + '/' + pt.id + '">' + label + '</a>' +
        '<button class="btn" data-print="' + pt.id + '">طباعة المسار</button>' +
        (pr.done ? '<button class="link" data-reset="' + pt.id + '">تصفير التقدّم</button>' : '') + '</div>' +
        '<details class="path-d"><summary>عرض صفحات المسار</summary><div class="rows">' + rows + '</div></details></article>';
    }).join('');
  }
  $('pathsList').addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button'); if (!b) return;
    if (b.dataset.print) { var pt = X.paths.filter(function (x) { return x.id === b.dataset.print; })[0]; openPack(pt.pages.join(', ')); }
    if (b.dataset.reset) { delete pathDone[b.dataset.reset]; store.set('pathdone', pathDone); showPaths(); refreshHome(); toast('صُفّر تقدّم المسار'); }
  });

  /* ───────── المعرض ───────── */
  function tileHTML(p) {
    return '<a class="tile' + (isFav(p) ? ' isfav' : '') + (notes[p] ? ' hasnote' : '') + '" data-p="' + p + '" href="#/p/' + p + '"><span class="star"><svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z"/></svg></span>' +
      '<div class="th"><img loading="lazy" decoding="async" src="' + thumbSrc(p) + '" alt=""></div><div class="cap"><b>ص ' + p + '</b>' + esc(INFO[p].t) + '</div></a>';
  }
  var galFilter = 'all';
  function galList(f) {
    var out = [];
    for (var p = 1; p <= N; p++) {
      if (f === 'all') out.push(p);
      else if (f.indexOf('t-') === 0) { if ((PT[p] || []).indexOf(f.slice(2)) > -1) out.push(p); }
      else if (INFO[p].g === parseInt(f, 10)) out.push(p);
    }
    return out;
  }
  function showGallery(f) {
    galFilter = f || 'all';
    var chips = [['all', 'الكل', N]];
    E.groups.forEach(function (g, gi) { chips.push([String(gi), g.short, galList(String(gi)).length]); });
    var tchips = X.tags.map(function (t) { return ['t-' + t.id, t.label, TAGN[t.id]]; });
    var mk = function (arr) {
      return arr.map(function (c) { return '<button class="chip" role="tab" data-f="' + c[0] + '" aria-selected="' + (c[0] === galFilter) + '">' + esc(c[1]) + '<small>' + c[2] + '</small></button>'; }).join('');
    };
    $('chips').innerHTML = mk(chips) + '<span class="chips-sep" aria-hidden="true"></span>' + mk(tchips);
    [].forEach.call($('chips').querySelectorAll('.chip'), function (b) { b.onclick = function () { location.hash = '#/gallery' + (b.dataset.f === 'all' ? '' : '/' + b.dataset.f); }; });
    var list = galList(galFilter);
    var tg = galFilter.indexOf('t-') === 0 ? TAGS[galFilter.slice(2)] : null;
    $('galTitle').textContent = tg ? 'موضوع: ' + tg.label : 'معرض الصفحات';
    $('galSub').textContent = tg ? list.length + ' صفحة تتناول هذا الموضوع عبر السلاسل الأربع.' : 'كل صفحات الموسوعة مصغّرة، اضغط على أي صفحة لفتحها.';
    $('galEmpty').hidden = list.length > 0;
    $('galEmpty').textContent = 'لا توجد صفحات في هذا التصنيف.';
    $('grid').innerHTML = list.map(tileHTML).join('');
  }

  /* ───────── مكتبتي ───────── */
  function showMine() {
    var fl = favs.slice().sort(function (a, b) { return a - b; });
    $('mineFavN').textContent = fl.length ? '(' + fl.length + ')' : '';
    $('mineFavGrid').innerHTML = fl.map(tileHTML).join('');
    $('mineFavEmpty').hidden = fl.length > 0;
    $('mineFavPrint').hidden = !fl.length;
    var nk = Object.keys(notes).map(Number).sort(function (a, b) { return a - b; });
    $('mineNoteN').textContent = nk.length ? '(' + nk.length + ')' : '';
    $('mineNotes').innerHTML = nk.map(function (p) {
      return '<a class="note-item" href="#/p/' + p + '/note"><span class="pg">' + p + '</span><span class="tt"><b>' + esc(INFO[p].t) + '</b><em>' + esc(notes[p].slice(0, 220)) + (notes[p].length > 220 ? '…' : '') + '</em></span></a>';
    }).join('');
    $('mineNotesEmpty').hidden = nk.length > 0;
    $('mineNoteExport').hidden = !nk.length;
  }
  function download(name, text, type) {
    var blob = new Blob([text], { type: type + ';charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  $('mineNoteExport').onclick = function () {
    var nk = Object.keys(notes).map(Number).sort(function (a, b) { return a - b; });
    var txt = 'ملاحظاتي على موسوعة الإنفوغرافيك المهني\n' + '='.repeat(40) + '\n\n' +
      nk.map(function (p) { return 'صفحة ' + p + ' — ' + INFO[p].t + '\n' + notes[p] + '\n'; }).join('\n' + '-'.repeat(40) + '\n\n');
    download('ملاحظاتي.txt', txt, 'text/plain');
  };
  $('mineFavPrint').onclick = function () { openPack(favs.slice().sort(function (a, b) { return a - b; }).join(', ')); };
  $('bkExport').onclick = function () {
    download('نسخة-احتياطية-الموسوعة.json', JSON.stringify({ v: 1, favs: favs, notes: notes, pathdone: pathDone, hist: hist }, null, 1), 'application/json');
  };
  $('bkImport').addEventListener('change', function () {
    var f = this.files && this.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var d = JSON.parse(r.result);
        (d.favs || []).filter(validP).forEach(function (p) { if (favs.indexOf(p) < 0) favs.push(p); });
        Object.keys(d.notes || {}).forEach(function (k) { if (validP(+k) && typeof d.notes[k] === 'string' && d.notes[k]) notes[k] = d.notes[k]; });
        Object.keys(d.pathdone || {}).forEach(function (k) { var a = pathDone[k] || []; (d.pathdone[k] || []).forEach(function (p) { if (a.indexOf(p) < 0) a.push(p); }); pathDone[k] = a; });
        store.set('favs', favs); store.set('notes', notes); store.set('pathdone', pathDone);
        refreshFavUI(); toast('تمت الاستعادة بنجاح');
      } catch (e) { toast('الملف غير صالح'); }
    };
    r.readAsText(f); this.value = '';
  });

  function refreshFavUI() {
    var c = $('favCount'), total = favs.length + noteCount(); c.textContent = total; c.hidden = !total;
    [].forEach.call(document.querySelectorAll('.row[data-p]'), function (r) { var p = +r.dataset.p; r.classList.toggle('isfav', isFav(p)); r.classList.toggle('hasnote', !!notes[p]); });
    if (reader.open) {
      var f = isFav(reader.cur);
      $('rFav').setAttribute('aria-pressed', f);
      $('rFav').title = f ? 'إزالة من المفضلة (B)' : 'إضافة إلى المفضلة (B)';
      $('rNote').setAttribute('aria-pressed', !!notes[reader.cur]);
    }
    refreshHome();
    if (currentView === 'gallery') showGallery(galFilter);
    if (currentView === 'mine') showMine();
  }

  /* ═════════════ الملاحظات ═════════════ */
  var noteFor = 0, noteTimer = null;
  function flushNote() {
    if (noteTimer) { clearTimeout(noteTimer); noteTimer = null; }
    if (!noteFor) return;
    var v = $('noteText').value.replace(/\s+$/, ''), changed = false;
    if (v) { if (notes[noteFor] !== v) { notes[noteFor] = v; changed = true; } }
    else if (notes[noteFor]) { delete notes[noteFor]; changed = true; }
    if (changed) { store.set('notes', notes); $('noteState').textContent = 'محفوظة'; refreshFavUI(); }
  }
  function loadNote() {
    flushNote();
    noteFor = reader.cur;
    $('noteText').value = notes[noteFor] || '';
    $('noteHead').textContent = 'ص ' + noteFor + ' — ' + INFO[noteFor].t;
    $('noteState').textContent = notes[noteFor] ? 'محفوظة' : 'ملاحظة جديدة';
  }
  $('noteText').addEventListener('input', function () {
    $('noteState').textContent = 'جارٍ الحفظ…';
    clearTimeout(noteTimer); noteTimer = setTimeout(flushNote, 500);
  });
  $('noteText').addEventListener('blur', flushNote);
  $('noteDel').onclick = function () { $('noteText').value = ''; flushNote(); $('noteState').textContent = 'حُذفت'; };

  /* ═════════════ القارئ ═════════════ */
  var reader = { open: false, cur: 1, zoom: 1, tx: 0, ty: 0, fit: store.get('fit2', 'width'), token: 0, play: null, path: null };
  var stage = $('stage'), img = $('pimg');
  var cache = {};

  /* طبقة الدقة العالية الاختيارية: ضع صوراً أصلية في المجلد hd/ بالأسماء 001 … 281 (jpg أو png أو webp) */
  var hd = { off: false, miss: 0, ok: {} }, HDX = ['jpg', 'png', 'webp'];
  function bestSrc(p) { return hd.ok[p] || pageSrc(p); }
  function tryHd(p, token) {
    if (hd.ok[p] || hd.off) return;
    var i = 0;
    (function nxt() {
      if (i >= HDX.length) { hd.miss++; if (hd.miss >= 4 && !Object.keys(hd.ok).length) hd.off = true; return; }
      var im = new Image(), src = 'hd/' + pad(p) + '.' + HDX[i++];
      im.onload = function () { hd.ok[p] = src; if (token === reader.token) img.src = src; };
      im.onerror = nxt; im.src = src;
    })();
  }
  function preload(p) {
    if (p < 1 || p > N || cache[p]) return;
    var i = new Image(); i.src = pageSrc(p); cache[p] = i;
    var keys = Object.keys(cache);
    if (keys.length > 10) {
      keys.sort(function (a, b) { return Math.abs(b - reader.cur) - Math.abs(a - reader.cur); });
      delete cache[keys[0]];
    }
  }
  function baseScale() {
    var d = E.dims[reader.cur - 1], sw = stage.clientWidth, sh = stage.clientHeight;
    if (reader.fit === 'width') return Math.min(sw / d[0], 1.7);
    return Math.min((sw - 12) / d[0], (sh - 12) / d[1]);
  }
  function layout() {
    if (!reader.open) return;
    var d = E.dims[reader.cur - 1], sw = stage.clientWidth, sh = stage.clientHeight;
    var s = baseScale() * reader.zoom, w = d[0] * s, h = d[1] * s;
    reader.tx = w <= sw ? (sw - w) / 2 : clamp(reader.tx, sw - w, 0);
    reader.ty = h <= sh ? (sh - h) / 2 : clamp(reader.ty, sh - h, 0);
    img.style.width = w + 'px'; img.style.height = h + 'px';
    img.style.transform = 'translate(' + reader.tx + 'px,' + reader.ty + 'px)';
    $('zoomVal').textContent = Math.round(reader.zoom * 100) + '%';
  }
  function zoomAt(cx, cy, z) {
    z = clamp(z, 1, 4);
    var b = baseScale(), s1 = b * reader.zoom, s2 = b * z;
    var px = (cx - reader.tx) / s1, py = (cy - reader.ty) / s1;
    reader.tx = cx - px * s2; reader.ty = cy - py * s2;
    reader.zoom = z; layout();
  }
  function zoomCenter(f) { zoomAt(stage.clientWidth / 2, stage.clientHeight / 2, reader.zoom * f); }

  /* مسار القراءة داخل القارئ */
  function curPath() { return reader.path ? X.paths.filter(function (x) { return x.id === reader.path; })[0] : null; }
  function updatePathBar() {
    var pt = curPath(), bar = $('pathbar');
    if (!pt) { bar.hidden = true; return; }
    bar.hidden = false;
    var idx = pt.pages.indexOf(reader.cur);
    $('pbTitle').textContent = pt.title;
    $('pbStep').textContent = idx > -1 ? 'الخطوة ' + (idx + 1) + ' من ' + pt.pages.length : 'خارج المسار — اضغط السهم للعودة إليه';
    var pr = pathProgress(pt);
    $('pbFill').style.width = Math.round(pr.done / pr.total * 100) + '%';
    $('pbPrev').disabled = idx === 0; $('pbNext').disabled = idx === pt.pages.length - 1;
  }
  function pathStep(dir) {
    var pt = curPath(); if (!pt) return;
    var idx = pt.pages.indexOf(reader.cur), t;
    if (idx > -1) t = pt.pages[idx + dir];
    else if (dir > 0) t = pt.pages.filter(function (p) { return p > reader.cur; })[0] || pt.pages[0];
    else t = pt.pages.filter(function (p) { return p < reader.cur; }).slice(-1)[0] || pt.pages[0];
    if (t) navigate(t);
  }
  $('pbPrev').onclick = function () { pathStep(-1); };
  $('pbNext').onclick = function () { pathStep(1); };
  $('pbExit').onclick = function () { reader.path = null; navigate(reader.cur); };

  function go(p) {
    p = clamp(p, 1, N);
    flushNote();
    reader.cur = p; reader.zoom = 1;
    var d = E.dims[p - 1];
    reader.tx = 0; reader.ty = 0;
    var token = ++reader.token;
    stage.classList.add('loading');
    img.width = d[0]; img.height = d[1];
    img.alt = INFO[p].t;
    img.src = thumbSrc(p);
    layout();
    var full = cache[p] || new Image();
    var apply = function () { if (token === reader.token) { img.src = bestSrc(p); stage.classList.remove('loading'); tryHd(p, token); } };
    if (full.complete && full.naturalWidth) apply();
    else { full.onload = apply; full.onerror = function () { if (token === reader.token) stage.classList.remove('loading'); }; if (!full.src) full.src = pageSrc(p); cache[p] = full; }
    preload(p + 1); preload(p + 2); preload(p - 1);

    var inf = INFO[p];
    $('rTitle').textContent = inf.t;
    $('rCrumb').textContent = 'ص ' + p + ' · ' + CUR_G(p).short + ' › ' + CUR_S(p).title + (inf.n ? ' · إنفوغرافيك ' + inf.n : '');
    $('gotoInput').value = p; $('slider').value = p;
    $('sidePrev').disabled = p <= 1; $('sideNext').disabled = p >= N;
    $('bPrev').disabled = p <= 1; $('bNext').disabled = p >= N;
    $('bDown').href = bestSrc(p); $('bDown').setAttribute('download', 'صفحة-' + pad(p) + (bestSrc(p).match(/\.\w+$/) || ['.webp'])[0]);
    $('rFav').setAttribute('aria-pressed', isFav(p));
    $('rFav').title = isFav(p) ? 'إزالة من المفضلة (B)' : 'إضافة إلى المفضلة (B)';
    $('rNote').setAttribute('aria-pressed', !!notes[p]);
    document.title = inf.t + ' — موسوعة الإنفوغرافيك المهني';

    store.set('last', p); lastPage = p;
    hist = [p].concat(hist.filter(function (x) { return x !== p; })).slice(0, 12); store.set('hist', hist);
    var pt = curPath();
    if (pt && pt.pages.indexOf(p) > -1) {
      var dn = pathDone[pt.id] || [];
      if (dn.indexOf(p) < 0) { dn.push(p); pathDone[pt.id] = dn; store.set('pathdone', pathDone); }
    }
    updatePathBar();
    layout();
    if (!$('drawer').hidden) refreshDrawer();
  }
  function navigate(p) {
    p = clamp(p, 1, N);
    var h = '#/p/' + p + (reader.path ? '/' + reader.path : '');
    if (location.hash === h) go(p); else location.hash = h;
  }
  function next() { if (reader.cur < N) navigate(reader.cur + 1); else stopPlay(); }
  function prev() { if (reader.cur > 1) navigate(reader.cur - 1); }

  function openReader(p) {
    reader.open = true;
    $('reader').hidden = false; document.body.classList.add('lock');
    $('slider').max = N; $('totalPages').textContent = N;
    setFitIcon();
    go(p);
    stage.focus({ preventScroll: true });
  }
  function closeReader() {
    if (!reader.open) return;
    flushNote();
    reader.open = false; stopPlay(); reader.path = null;
    $('reader').hidden = true; document.body.classList.remove('lock');
    closeDrawer(); $('reader').classList.remove('immersive');
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
    document.title = 'موسوعة ديوان قطاع الشباب والرياضة للإنفوغرافيك المهني';
  }
  function setFitIcon() {
    $('bFit').setAttribute('aria-pressed', reader.fit === 'width');
    $('bFit').title = reader.fit === 'width' ? 'عرض الصفحة كاملة في الشاشة (W)' : 'عرض كبير بعرض الشاشة (W)';
  }
  function toggleFit() {
    reader.fit = reader.fit === 'width' ? 'page' : 'width';
    store.set('fit2', reader.fit); setFitIcon();
    reader.zoom = 1; reader.tx = 0; reader.ty = 0; layout();
    toast(reader.fit === 'width' ? 'عرض كبير — مرّر للأسفل لقراءة الصفحة' : 'الصفحة كاملة في الشاشة');
  }

  function ssGet(k) { try { return sessionStorage.getItem('enc:' + k); } catch (e) { return mem['ss' + k]; } }
  function ssSet(k, v) { try { sessionStorage.setItem('enc:' + k, v); } catch (e) { mem['ss' + k] = v; } }
  function backFromReader() { location.hash = ssGet('from') || '#/toc'; }
  $('rBack').onclick = backFromReader;
  $('bPrev').onclick = $('sidePrev').onclick = prev;
  $('bNext').onclick = $('sideNext').onclick = next;
  $('bZoomIn').onclick = function () { zoomCenter(1.25); };
  $('bZoomOut').onclick = function () { zoomCenter(1 / 1.25); };
  $('zoomVal').onclick = function () { reader.zoom = 1; reader.tx = 0; reader.ty = 0; layout(); };
  $('bFit').onclick = toggleFit;
  $('rFav').onclick = function () { toggleFav(reader.cur); };
  $('slider').addEventListener('input', function () { $('gotoInput').value = this.value; });
  $('slider').addEventListener('change', function () { navigate(+this.value); stage.focus(); });
  $('gotoInput').addEventListener('focus', function () { this.select(); });
  $('gotoInput').addEventListener('keydown', function (e) {
    e.stopPropagation();
    if (e.key === 'Enter') { var v = parseInt(norm(this.value), 10); if (v >= 1 && v <= N) { navigate(v); stage.focus(); } else { toast('أدخل رقماً بين 1 و ' + N); this.value = reader.cur; } }
    if (e.key === 'Escape') { this.value = reader.cur; stage.focus(); }
  });
  $('gotoInput').addEventListener('blur', function () { this.value = reader.cur; });

  $('bFull').onclick = toggleFull;
  function toggleFull() {
    var el = document.documentElement;
    if (!document.fullscreenElement) { (el.requestFullscreen || el.webkitRequestFullscreen || function () { toast('المتصفح لا يدعم ملء الشاشة'); }).call(el); }
    else (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  }
  document.addEventListener('fullscreenchange', function () { setTimeout(layout, 60); });

  $('bPlay').onclick = function () { reader.play ? stopPlay() : startPlay(); };
  function startPlay() {
    if (reader.play) return;
    $('bPlay').classList.add('on'); toast('عرض تلقائي: صفحة كل 8 ثوانٍ');
    reader.play = setInterval(function () { if (reader.cur >= N) stopPlay(); else next(); }, 8000);
  }
  function stopPlay() { if (reader.play) { clearInterval(reader.play); reader.play = null; } $('bPlay').classList.remove('on'); }
  $('bPrint').onclick = function () { openPack(String(reader.cur)); };

  /* ───────── الدرج الجانبي (فهرس / ذات صلة / ملاحظاتي) ───────── */
  var drawerBuilt = false, dTab = 'toc';
  function setTab(t) {
    dTab = t;
    [].forEach.call(document.querySelectorAll('.dtabs button'), function (b) { b.setAttribute('aria-selected', b.dataset.t === t); });
    $('paneToc').hidden = t !== 'toc'; $('paneRel').hidden = t !== 'rel'; $('paneNote').hidden = t !== 'note';
    refreshDrawer();
    if (t === 'note') setTimeout(function () { $('noteText').focus(); }, 60);
  }
  function refreshDrawer() {
    if (dTab === 'toc') {
      if (!drawerBuilt) { buildToc($('dRoot'), reader.cur); drawerBuilt = true; }
      else {
        var g = INFO[reader.cur].g, s = INFO[reader.cur].s;
        var gd = $('dRoot').querySelectorAll('details.grp')[g];
        if (gd) { gd.open = true; var sd = gd.querySelectorAll('details.sec')[s]; if (sd) sd.open = true; }
        markNow($('dRoot'), reader.cur);
      }
      setTimeout(function () { var r = $('dRoot').querySelector('.row.now'); if (r && !$('dRoot').hidden) r.scrollIntoView({ block: 'center' }); }, 30);
    } else if (dTab === 'rel') {
      var rel = related(reader.cur), tg = (PT[reader.cur] || []).map(function (t) { return TAGS[t].label; });
      var guide = SUM[reader.cur] ? '<div class="r-guide"><b>دليل — متى أستعملها؟</b><br>' + esc(SUM[reader.cur]) + '</div>' : '';
      $('relHead').innerHTML = guide + (tg.length ? 'مواضيع هذه الصفحة: ' + esc(tg.join(' · ')) : (guide ? '' : 'لا تتوفر صفحات ذات صلة بهذه الصفحة.'));
      $('relList').innerHTML = rel.map(function (p) { return rowHTML(p, { crumb: true }); }).join('');
    } else loadNote();
  }
  function openDrawer(t) { $('drawer').hidden = false; $('scrim').hidden = false; setTab(t || dTab); }
  function closeDrawer() { flushNote(); $('drawer').hidden = true; $('scrim').hidden = true; }
  $('rToc').onclick = function () { $('drawer').hidden ? openDrawer('toc') : closeDrawer(); };
  $('rNote').onclick = function () { if (!$('drawer').hidden && dTab === 'note') closeDrawer(); else openDrawer('note'); };
  $('drawerClose').onclick = $('scrim').onclick = function () { closeDrawer(); stage.focus(); };
  [].forEach.call(document.querySelectorAll('.dtabs button'), function (b) { b.onclick = function () { setTab(b.dataset.t); }; });
  $('dq').addEventListener('input', function () { doSearch(this.value, $('dResults'), $('dRoot')); });
  $('drawer').addEventListener('click', function (e) { if (e.target.closest && e.target.closest('a.row')) setTimeout(function () { if (dTab !== 'rel') closeDrawer(); }, 0); });

  /* ───────── حزمة الطباعة / PDF ───────── */
  function parseRanges(str) {
    var s = norm(str).replace(/[،؛;\/]/g, ',').replace(/[–—]/g, '-'), out = [], seen = {};
    s.split(/[,\s]+/).forEach(function (tok) {
      if (!tok) return;
      var m = tok.match(/^(\d+)-(\d+)$/), a, b;
      if (m) { a = +m[1]; b = +m[2]; if (a > b) { var t = a; a = b; b = t; } }
      else if (/^\d+$/.test(tok)) { a = b = +tok; } else return;
      for (var p = Math.max(a, 1); p <= Math.min(b, N); p++) if (!seen[p]) { seen[p] = 1; out.push(p); }
    });
    return out.slice(0, 300);
  }
  function packSum() {
    var l = parseRanges($('packInput').value);
    $('packSum').textContent = l.length ? 'سيتم طباعة ' + l.length + ' صفحة' + (l.length >= 300 ? ' (الحد الأقصى 300)' : '') + '.' : 'أدخل رقم صفحة واحدة على الأقل.';
    $('packGo').disabled = !l.length;
  }
  function openPack(val) {
    var q = [];
    if (favs.length) q.push(['المفضلة (' + favs.length + ')', favs.slice().sort(function (a, b) { return a - b; }).join(', ')]);
    if (reader.open) {
      q.push(['الصفحة الحالية', String(reader.cur)]);
      var it = CUR_S(reader.cur).items.filter(function (x) { return x[3] !== 'c'; });
      q.push(['هذا القسم (' + it.length + ')', it[0][0] + '-' + it[it.length - 1][0]]);
    }
    X.paths.forEach(function (pt) { q.push(['مسار: ' + pt.title, pt.pages.join(', ')]); });
    $('packQuick').innerHTML = q.map(function (x, i) { return '<button class="chip" data-i="' + i + '">' + esc(x[0]) + '</button>'; }).join('');
    [].forEach.call($('packQuick').children, function (b) { b.onclick = function () { $('packInput').value = q[+b.dataset.i][1]; packSum(); }; });
    $('packInput').value = val || '';
    packSum(); $('pack').hidden = false;
    setTimeout(function () { $('packInput').focus(); }, 40);
  }
  function closePack() { $('pack').hidden = true; }
  $('btnPack').onclick = function () { openPack(reader.open ? String(reader.cur) : ''); };
  $('packClose').onclick = $('packCancel').onclick = closePack;
  $('pack').addEventListener('click', function (e) { if (e.target === this) closePack(); });
  $('packInput').addEventListener('input', packSum);
  $('packInput').addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter' && !$('packGo').disabled) $('packGo').click(); if (e.key === 'Escape') closePack(); });
  $('packGo').onclick = function () {
    var list = parseRanges($('packInput').value); if (!list.length) return;
    var sheet = $('printSheet'); sheet.innerHTML = '';
    var pending = list.length, fired = false;
    function fire() { if (fired) return; fired = true; closePack(); setTimeout(function () { window.print(); }, 150); }
    $('packGo').textContent = 'جارٍ التحضير…'; $('packGo').disabled = true;
    list.forEach(function (p) {
      var w = document.createElement('div'); w.className = 'pp';
      var im = new Image(); im.alt = INFO[p].t;
      var done = function () { pending--; if (pending <= 0) { $('packGo').textContent = 'طباعة / حفظ PDF'; packSum(); fire(); } };
      im.onload = done; im.onerror = done; im.src = bestSrc(p);
      w.appendChild(im); sheet.appendChild(w);
    });
    setTimeout(function () { $('packGo').textContent = 'طباعة / حفظ PDF'; if (!fired) fire(); }, 20000);
  };
  window.addEventListener('afterprint', function () { $('printSheet').innerHTML = ''; });

  /* ───────── التفاعل باللمس والفأرة ───────── */
  var ptrs = {}, pinch = null, tapT = 0, tapX = 0, tapY = 0, down = null, lastFlip = 0;
  function rectPt(e) { var r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function pCount() { return Object.keys(ptrs).length; }
  stage.addEventListener('pointerdown', function (e) {
    if (e.target.closest && e.target.closest('.side, .p-exit')) return;
    stage.setPointerCapture(e.pointerId);
    ptrs[e.pointerId] = rectPt(e);
    if (pCount() === 2) {
      var k = Object.keys(ptrs), a = ptrs[k[0]], b = ptrs[k[1]];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: reader.zoom };
      down = null;
    } else {
      down = { x: e.clientX, y: e.clientY, t: Date.now(), tx: reader.tx, ty: reader.ty, type: e.pointerType, moved: false };
    }
    stage.classList.add('dragging');
  });
  stage.addEventListener('pointermove', function (e) {
    if (!ptrs[e.pointerId]) return;
    ptrs[e.pointerId] = rectPt(e);
    if (pinch && pCount() === 2) {
      var k = Object.keys(ptrs), a = ptrs[k[0]], b = ptrs[k[1]];
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d);
      return;
    }
    if (down) {
      var dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) down.moved = true;
      reader.tx = down.tx + dx; reader.ty = down.ty + dy; layout();
    }
  });
  function endPtr(e) {
    if (!ptrs[e.pointerId]) return;
    delete ptrs[e.pointerId];
    if (pinch) { if (pCount() < 2) pinch = null; if (pCount() === 0) stage.classList.remove('dragging'); return; }
    stage.classList.remove('dragging');
    if (!down) return;
    var dx = e.clientX - down.x, dy = e.clientY - down.y, dt = Date.now() - down.t;
    var d = E.dims[reader.cur - 1], s = baseScale() * reader.zoom;
    var fitsX = d[0] * s <= stage.clientWidth + 1;
    if (down.moved) {
      if (fitsX && down.type !== 'mouse' && dt < 700 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        reader.tx = down.tx; layout();
        dx > 0 ? next() : prev();   // اتجاه الكتب العربية: السحب نحو اليمين = التالي
      }
    } else if (e.type === 'pointerup') {
      var now = Date.now(), r = rectPt(e);
      if (now - tapT < 320 && Math.hypot(r.x - tapX, r.y - tapY) < 30) {
        tapT = 0;
        if (reader.zoom > 1.05) { reader.zoom = 1; reader.tx = 0; reader.ty = 0; layout(); } else zoomAt(r.x, r.y, 2.4);
      } else {
        tapT = now; tapX = r.x; tapY = r.y;
        if (down.type !== 'mouse') {
          setTimeout(function () { if (tapT === now) { $('reader').classList.toggle('immersive'); setTimeout(layout, 240); } }, 330);
        }
      }
    }
    down = null;
  }
  stage.addEventListener('pointerup', endPtr);
  stage.addEventListener('pointercancel', endPtr);
  stage.addEventListener('wheel', function (e) {
    e.preventDefault();
    var r = rectPt(e);
    if (e.ctrlKey || e.metaKey) { zoomAt(r.x, r.y, reader.zoom * Math.exp(-e.deltaY * 0.0025)); return; }
    var d = E.dims[reader.cur - 1], s = baseScale() * reader.zoom;
    var overY = d[1] * s > stage.clientHeight + 1, overX = d[0] * s > stage.clientWidth + 1;
    if (overY || overX) { reader.ty -= e.deltaY; if (overX) reader.tx -= (e.deltaX || 0); layout(); return; }
    var now = Date.now();
    if (now - lastFlip < 450 || Math.abs(e.deltaY) < 6) return;
    lastFlip = now; e.deltaY > 0 ? next() : prev();
  }, { passive: false });
  window.addEventListener('resize', function () { layout(); });

  /* ───────── لوحة المفاتيح ───────── */
  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase();
    var typing = tag === 'input' || tag === 'textarea';
    if (!$('help').hidden) { if (e.key === 'Escape' || e.key === '?' || e.key === '؟') $('help').hidden = true; return; }
    if (!$('pack').hidden) { if (e.key === 'Escape') closePack(); return; }
    if (!$('onb').hidden) { return; }
    if (!$('quizModal').hidden) { if (e.key === 'Escape') { $('quizModal').hidden = true; qzState = null; } return; }
    if (typing) { if (e.key === 'Escape' && e.target.type !== 'range') e.target.blur(); return; }
    if (e.key === '?' || e.key === '؟') { $('help').hidden = false; return; }
    if (!reader.open) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key, handled = true;
    if (k === 'ArrowLeft' || k === 'PageDown' || (k === ' ' && !e.shiftKey)) {
      var d = E.dims[reader.cur - 1], s = baseScale() * reader.zoom;
      if (k === ' ' && d[1] * s > stage.clientHeight + 1 && reader.ty > stage.clientHeight - d[1] * s + 1) { reader.ty -= stage.clientHeight * .85; layout(); }
      else next();
    }
    else if (k === 'ArrowRight' || k === 'PageUp' || (k === ' ' && e.shiftKey)) prev();
    else if (k === 'ArrowDown') { reader.ty -= 90; layout(); }
    else if (k === 'ArrowUp') { reader.ty += 90; layout(); }
    else if (k === 'Home') navigate(1);
    else if (k === 'End') navigate(N);
    else if (k === '+' || k === '=') zoomCenter(1.25);
    else if (k === '-' || k === '_') zoomCenter(1 / 1.25);
    else if (k === '0') { reader.zoom = 1; reader.tx = 0; reader.ty = 0; layout(); }
    else if (k === 'w' || k === 'W' || k === 'ص') toggleFit();
    else if (k === 'f' || k === 'F' || k === 'ب') toggleFull();
    else if (k === 'b' || k === 'B' || k === 'لا') toggleFav(reader.cur);
    else if (k === 'n' || k === 'N' || k === 'ى') $('rNote').click();
    else if (k === 'c' || k === 'C' || k === 'ؤ') $('rToc').click();
    else if (k === 'p' || k === 'P' || k === 'ح') $('bPlay').click();
    else if (k === 'v' || k === 'V' || k === 'ط') togglePresenter();
    else if (k === 'g' || k === 'G' || k === 'ل') { e.preventDefault(); $('gotoInput').focus(); }
    else if (k === 'Escape') { if ($('reader').classList.contains('presenter')) { $('pExit').click(); } else if (!$('drawer').hidden) closeDrawer(); else backFromReader(); }
    else handled = false;
    if (handled) e.preventDefault();
  });

  /* المساعدة */
  $('btnHelp').onclick = $('rHelp').onclick = function () { $('help').hidden = false; };
  $('helpClose').onclick = function () { $('help').hidden = true; };
  $('help').addEventListener('click', function (e) { if (e.target === this) this.hidden = true; });

  /* حول */
  function showAbout() {
    var totalInf = 0; for (var p = 1; p <= N; p++) if (!INFO[p].k && INFO[p].n) totalInf++;
    var stats = [[N, 'صفحة'], [4, 'سلاسل'], [X.tags.length, 'موضوعاً'], [X.paths.length, 'مسارات للقراءة']];
    $('aboutStats').innerHTML = stats.map(function (s) { return '<div><b>' + s[0] + '</b><span>' + s[1] + '</span></div>'; }).join('');
  }

  var canCache = /^https?:$/.test(location.protocol) && 'caches' in window;
  function cacheAll() {
    var b = $('btnCacheAll'), st = $('cacheState'), i = 0, fail = 0;
    b.disabled = true;
    caches.open('enc-pages').then(function (c) {
      (function step() {
        if (i >= N) { st.textContent = fail ? 'اكتمل مع ' + fail + ' صفحة تعذّر تحميلها' : 'اكتمل الحفظ — يمكنك الآن العمل دون إنترنت'; b.disabled = false; return; }
        var p = ++i; st.textContent = 'جارٍ الحفظ… ' + p + ' / ' + N;
        c.match(pageSrc(p)).then(function (h) { return h || c.add(pageSrc(p)); }).catch(function () { fail++; }).then(function () { return c.match(thumbSrc(p)).then(function (h) { return h || c.add(thumbSrc(p)); }).catch(function () { }); }).then(step);
      })();
    });
  }
  $('btnCacheAll').onclick = cacheAll;
  $('offlineBox').hidden = !canCache;


  /* ═════════════ خريطة الموسوعة الذهنية ═════════════ */
  var mmBuilt = false;
  function buildMindmap() {
    if (mmBuilt) return;
    mmBuilt = true;
    var W = 1040, H = 980, cx = W / 2, cy = H / 2;
    var seriesGroups = E.groups.filter(function (g) { return g.cover; });
    var n = seriesGroups.length;
    var svg = ['<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" xmlns="http://www.w3.org/2000/svg">'];
    var linksHtml = '', nodesHtml = '';
    var R1 = 230;
    seriesGroups.forEach(function (g, i) {
      var ang = (i / n) * 2 * Math.PI - Math.PI / 2;
      var sx = cx + R1 * Math.cos(ang), sy = cy + R1 * Math.sin(ang);
      linksHtml += '<path class="mm-link" d="M' + cx + ',' + cy + ' Q' + ((cx + sx) / 2 + 40 * Math.sin(ang)) + ',' + ((cy + sy) / 2 - 40 * Math.cos(ang)) + ' ' + sx + ',' + sy + '"/>';
      var color = 'var(--s' + (i + 1) + ')';
      var secs = g.sections.filter(function (sec) { return sec.title.indexOf('مدخل') === -1 && sec.title.indexOf('ختام') === -1; });
      var m = secs.length;
      secs.forEach(function (sec, j) {
        var spread = Math.min(Math.PI * 0.9, m * 0.4);
        var a2 = ang + (m > 1 ? (j / (m - 1) - 0.5) * spread : 0);
        var R2 = 145 + (j % 2) * 42;
        var nx = sx + R2 * Math.cos(a2), ny = sy + R2 * Math.sin(a2);
        var first = sec.items[0][0];
        linksHtml += '<path class="mm-link" d="M' + sx + ',' + sy + ' Q' + ((sx + nx) / 2 + 22 * Math.sin(a2)) + ',' + ((sy + ny) / 2 - 22 * Math.cos(a2)) + ' ' + nx + ',' + ny + '" style="stroke:' + color + ';stroke-opacity:.45"/>';
        var lbl = sec.title.replace(/^المحور (\S+): /, '').replace(/^الجزء (\S+): /, '');
        lbl = (j + 1) + '. ' + (lbl.length > 26 ? lbl.slice(0, 25) + '…' : lbl);
        var anchor = nx > cx ? 'start' : (Math.abs(nx - cx) < 4 ? 'middle' : 'end');
        var dx = nx > cx ? 10 : (Math.abs(nx - cx) < 4 ? 0 : -10);
        nodesHtml += '<g class="mm-node" data-href="#/toc/' + (E.groups.indexOf(g)) + '"><circle class="mm-dot" cx="' + nx + '" cy="' + ny + '" r="9" fill="transparent"/><circle class="mm-dot" cx="' + nx + '" cy="' + ny + '" r="5" fill="' + color + '"/>' +
          '<text class="mm-lbl" x="' + (nx + dx) + '" y="' + (ny + 4) + '" text-anchor="' + anchor + '">' + esc(lbl) + '</text></g>';
      });
      var sName = g.short;
      var sAnchor = sx > cx ? 'start' : (Math.abs(sx - cx) < 4 ? 'middle' : 'end');
      var sdx = sx > cx ? 14 : (Math.abs(sx - cx) < 4 ? 0 : -14);
      var first = g.sections[0].items[0][0], last = g.sections[g.sections.length - 1].items.slice(-1)[0][0];
      nodesHtml += '<g class="mm-node" data-href="#/toc/' + (E.groups.indexOf(g)) + '"><circle class="mm-dot" cx="' + sx + '" cy="' + sy + '" r="10" fill="' + color + '"/>' +
        '<text class="mm-lbl s" x="' + (sx + sdx) + '" y="' + (sy - 8) + '" text-anchor="' + sAnchor + '">' + esc(sName) + '</text>' +
        '<text class="mm-range" x="' + (sx + sdx) + '" y="' + (sy + 16) + '" text-anchor="' + sAnchor + '">ص ' + first + '–' + last + '</text></g>';
    });
    svg.push(linksHtml, nodesHtml);
    svg.push('<g class="mm-center"><circle cx="' + cx + '" cy="' + cy + '" r="46"/><text x="' + cx + '" y="' + (cy - 4) + '" text-anchor="middle" font-size="13">الموسوعة</text><text x="' + cx + '" y="' + (cy + 13) + '" text-anchor="middle" font-size="10">281 صفحة</text></g>');
    svg.push('</svg>');
    $('mindmap').innerHTML = svg.join('');
  }
  $('mindmap').addEventListener('click', function (e) {
    var n = e.target.closest && e.target.closest('.mm-node');
    if (n && n.dataset.href) location.hash = n.dataset.href;
  });

  /* ═════════════ الأدوات التفاعلية ═════════════ */
  var toolData = store.get('tools', {});
  function toolStore(id) { return toolData[id] || (toolData[id] = {}); }
  function saveTool(id) { store.set('tools', toolData); var el = $('toolSaved'); if (el) { el.textContent = 'محفوظة تلقائياً — ' + new Date().toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' }); } }

  function showToolsList() {
    $('toolsList').innerHTML = TL.map(function (t) {
      var filled = Object.keys(toolStore(t.id)).length > 0;
      return '<a class="tool-card" href="#/tools/' + t.id + '"><b>' + esc(t.title) + (filled ? ' <span class="r-badge">مسودة محفوظة</span>' : '') + '</b><span>' + esc(t.desc) + '</span><small>مبنية على صفحة ' + t.page + ' — ' + esc(INFO[t.page].t) + '</small></a>';
    }).join('');
  }

  function tfRowHTML(cols, row, idx, secId) {
    return '<tr>' + cols.map(function (c) {
      return '<td><textarea rows="1" data-k="' + c.k + '" data-i="' + idx + '" data-sec="' + secId + '">' + esc(row[c.k] || '') + '</textarea></td>';
    }).join('') + '<td><button class="link danger" data-delrow="' + idx + '" data-sec="' + secId + '" title="حذف الصف">✕</button></td></tr>';
  }
  function ganttRowHTML(row, idx, secId, weeks) {
    var cells = '';
    for (var w = 1; w <= weeks; w++) cells += '<td><div class="gantt-cell' + (row.wk && row.wk[w] ? ' on' : '') + '" data-gwk="' + w + '" data-i="' + idx + '" data-sec="' + secId + '"></div></td>';
    return '<tr><td><textarea rows="1" data-k="act" data-i="' + idx + '" data-sec="' + secId + '">' + esc(row.act || '') + '</textarea></td>' +
      '<td><textarea rows="1" data-k="resp" data-i="' + idx + '" data-sec="' + secId + '">' + esc(row.resp || '') + '</textarea></td>' + cells +
      '<td><button class="link danger" data-delrow="' + idx + '" data-sec="' + secId + '">✕</button></td></tr>';
  }

  function renderTool(tool) {
    var data = toolStore(tool.id);
    var html = tool.sections.map(function (sec) {
      if (sec.type === 'text') {
        return '<div class="tf-sec"><label>' + esc(sec.label) + '</label><textarea rows="' + sec.rows + '" data-sec="' + sec.id + '" placeholder="' + esc(sec.ph || '') + '">' + esc(data[sec.id] || '') + '</textarea></div>';
      }
      if (sec.type === 'table') {
        var rows = data[sec.id] || [];
        while (rows.length < (sec.minRows || 2)) rows.push({});
        data[sec.id] = rows;
        return '<div class="tf-sec"><label>' + esc(sec.label) + '</label><table class="tf-table"><thead><tr>' +
          sec.cols.map(function (c) { return '<th>' + esc(c.h) + '</th>'; }).join('') + '<th></th></tr></thead><tbody data-body="' + sec.id + '">' +
          rows.map(function (r, i) { return tfRowHTML(sec.cols, r, i, sec.id); }).join('') +
          '</tbody></table><button class="tf-addrow" data-addrow="' + sec.id + '">+ إضافة صف</button></div>';
      }
      if (sec.type === 'gantt') {
        var grows = data[sec.id] || [];
        while (grows.length < (sec.minRows || 4)) grows.push({});
        data[sec.id] = grows;
        var head = '<tr><th>النشاط</th><th>المسؤول</th>' + Array.from({ length: sec.weeks }, function (_, i) { return '<th>أ' + (i + 1) + '</th>'; }).join('') + '<th></th></tr>';
        return '<div class="tf-sec"><label>' + esc(sec.label) + '</label><div class="gantt-wrap"><table class="gantt-table"><thead>' + head + '</thead><tbody data-body="' + sec.id + '">' +
          grows.map(function (r, i) { return ganttRowHTML(r, i, sec.id, sec.weeks); }).join('') + '</tbody></table></div><button class="tf-addrow" data-addrow="' + sec.id + '">+ إضافة نشاط</button></div>';
      }
      if (sec.type === 'grid') {
        var g = data[sec.id] || {};
        data[sec.id] = g;
        var cells = '<div class="tf-grid"><div class="gh"></div>' + sec.colsHead.map(function (h) { return '<div class="gh">' + esc(h) + '</div>'; }).join('');
        sec.rowsHead.forEach(function (rh, ri) {
          cells += '<div class="gr">' + esc(rh) + '</div>';
          sec.colsHead.forEach(function (ch, ci) {
            var k = ri + '_' + ci;
            cells += '<textarea data-grid="' + sec.id + '" data-k="' + k + '">' + esc(g[k] || '') + '</textarea>';
          });
        });
        cells += '</div>';
        return '<div class="tf-sec"><label>' + esc(sec.label) + '</label>' + cells + '</div>';
      }
      return '';
    }).join('');
    $('toolForm').innerHTML = html;
    saveTool(tool.id);
  }

  var curTool = null;
  function openTool(id) {
    curTool = TL.filter(function (t) { return t.id === id; })[0];
    if (!curTool) { location.hash = '#/tools'; return; }
    $('toolTitle').textContent = curTool.title;
    $('toolDesc').textContent = curTool.desc;
    $('toolPageLink').href = '#/p/' + curTool.page;
    $('toolPageNum').textContent = 'ص ' + curTool.page;
    renderTool(curTool);
  }
  $('toolForm').addEventListener('input', function (e) {
    var t = e.target, sec = t.dataset.sec;
    if (!curTool) return;
    var data = toolStore(curTool.id);
    if (t.dataset.grid) { data[t.dataset.grid][t.dataset.k] = t.value; }
    else if (t.dataset.i !== undefined) { data[sec][+t.dataset.i][t.dataset.k] = t.value; }
    else if (sec) { data[sec] = t.value; }
    saveTool(curTool.id);
  });
  $('toolForm').addEventListener('click', function (e) {
    var add = e.target.closest && e.target.closest('[data-addrow]');
    var del = e.target.closest && e.target.closest('[data-delrow]');
    var gc = e.target.closest && e.target.closest('.gantt-cell');
    if (!curTool) return;
    var data = toolStore(curTool.id);
    if (add) { data[add.dataset.addrow].push({}); saveTool(curTool.id); renderTool(curTool); }
    else if (del) { data[del.dataset.sec].splice(+del.dataset.i, 1); saveTool(curTool.id); renderTool(curTool); }
    else if (gc) {
      var sec = gc.dataset.sec, i = +gc.dataset.i, wk = gc.dataset.gwk;
      var row = data[sec][i]; row.wk = row.wk || {}; row.wk[wk] = !row.wk[wk];
      gc.classList.toggle('on'); saveTool(curTool.id);
    }
  });
  $('toolClear').onclick = function () {
    if (!curTool) return;
    if (!confirm('سيتم مسح كل ما كتبته في هذه الأداة. متابعة؟')) return;
    toolData[curTool.id] = {}; saveTool(curTool.id); renderTool(curTool);
  };
  function toolAsText(tool) {
    var data = toolStore(tool.id), out = [tool.title, '='.repeat(tool.title.length)];
    tool.sections.forEach(function (sec) {
      out.push('', '## ' + sec.label);
      if (sec.type === 'text') out.push(data[sec.id] || '—');
      else if (sec.type === 'table') (data[sec.id] || []).forEach(function (r, i) { out.push((i + 1) + ') ' + sec.cols.map(function (c) { return c.h + ': ' + (r[c.k] || '—'); }).join(' | ')); });
      else if (sec.type === 'gantt') (data[sec.id] || []).forEach(function (r, i) { var wks = Object.keys(r.wk || {}).filter(function (k) { return r.wk[k]; }); out.push((i + 1) + ') ' + (r.act || '—') + ' — المسؤول: ' + (r.resp || '—') + ' — الأسابيع: ' + (wks.join(', ') || '—')); });
      else if (sec.type === 'grid') sec.rowsHead.forEach(function (rh, ri) { out.push('· ' + rh + ':'); sec.colsHead.forEach(function (ch, ci) { out.push('   - ' + ch + ': ' + ((data[sec.id] || {})[ri + '_' + ci] || '—')); }); });
    });
    return out.join('\n');
  }
  $('toolExport').onclick = function () { if (curTool) download(curTool.title + '.txt', toolAsText(curTool), 'text/plain'); };
  $('toolPrint').onclick = function () {
    if (!curTool) return;
    var w = window.open('', '_blank'); if (!w) { toast('فعّل النوافذ المنبثقة للطباعة'); return; }
    var txt = toolAsText(curTool).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
    w.document.write('<html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>' + curTool.title + '</title><style>body{font-family:Tahoma,sans-serif;padding:30px;line-height:1.8;font-size:14px}h1{font-size:20px}</style></head><body><h1>' + curTool.title + '</h1><p>' + txt + '</p></body></html>');
    w.document.close(); w.focus(); setTimeout(function () { w.print(); }, 300);
  };

  /* ═════════════ القاموس ═════════════ */
  function glossHTML(list) {
    return list.map(function (g) {
      return '<div class="gloss-item"><b>' + esc(g.t) + '</b><p>' + esc(g.d) + '</p><div class="gl-refs">' +
        g.pages.map(function (p) { return '<a href="#/p/' + p + '">ص ' + p + '</a>'; }).join('') + '</div></div>';
    }).join('');
  }
  function showGlossary() {
    $('glossList').innerHTML = glossHTML(GLS);
  }
  $('gq').addEventListener('input', function () {
    var n = norm(this.value);
    var list = !n ? GLS : GLS.filter(function (g) { return norm(g.t + ' ' + g.d).indexOf(n) > -1; });
    $('glossList').innerHTML = list.length ? glossHTML(list) : '<p class="empty">لا يوجد مصطلح مطابق لـ «' + esc(this.value) + '».</p>';
  });

  /* ═════════════ حقيبة التكوين ═════════════ */
  function showTraining(tab) {
    [].forEach.call($('trainTabs').children, function (b) { b.setAttribute('aria-selected', b.dataset.t === tab); });
    $('paneSessions').hidden = tab !== 'sessions'; $('paneQuiz').hidden = tab !== 'quiz'; $('paneLegal').hidden = tab !== 'legal';
    if (tab === 'sessions' && !$('paneSessions').dataset.built) { buildSessions(); $('paneSessions').dataset.built = '1'; }
    if (tab === 'quiz' && !$('paneQuiz').dataset.built) { buildQuizList(); $('paneQuiz').dataset.built = '1'; }
    if (tab === 'legal' && !$('paneLegal').dataset.built) { buildLegal(); $('paneLegal').dataset.built = '1'; }
  }
  [].forEach.call($('trainTabs').children, function (b) { b.onclick = function () { location.hash = '#/training/' + b.dataset.t; }; });

  function buildSessions() {
    $('paneSessions').innerHTML = '<div class="sess-list">' + SESS.map(function (s) {
      return '<article class="sess"><div class="sess-top"><h3>' + esc(s.title) + '</h3><div class="sess-meta"><span>⏱ ' + esc(s.dur) + '</span><span>👥 ' + esc(s.size) + '</span></div></div>' +
        '<p class="sess-goal"><b>الفئة المستهدفة:</b> ' + esc(s.audience) + '<br><b>الهدف:</b> ' + esc(s.goal) + '</p>' +
        '<details><summary>عرض سير الجلسة (' + s.agenda.length + ' محطات)</summary><div class="sess-agenda">' +
        s.agenda.map(function (a) { return '<div class="sa-row"><span class="sa-t">' + esc(a.t) + '</span><span class="sa-a">' + esc(a.a) + (a.p ? '<a href="#/p/' + a.p + '">فتح ص ' + a.p + '</a>' : '') + '</span></div>'; }).join('') +
        '</div></details><div class="sess-acts"><button class="link" data-printsess="' + s.id + '">طباعة خطة الجلسة</button></div></article>';
    }).join('') + '</div>';
  }
  $('paneSessions').addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-printsess]'); if (!b) return;
    var s = SESS.filter(function (x) { return x.id === b.dataset.printsess; })[0]; if (!s) return;
    var w = window.open('', '_blank'); if (!w) { toast('فعّل النوافذ المنبثقة للطباعة'); return; }
    var rows = s.agenda.map(function (a) { return '<tr><td>' + a.t + '</td><td>' + esc(a.a) + (a.p ? ' (ص ' + a.p + ')' : '') + '</td></tr>'; }).join('');
    w.document.write('<html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>' + s.title + '</title><style>body{font-family:Tahoma,sans-serif;padding:28px;font-size:14px;line-height:1.7}table{border-collapse:collapse;width:100%}td{border:1px solid #ccc;padding:6px 10px;vertical-align:top}td:first-child{width:70px;font-weight:700}</style></head><body><h1>' + s.title + '</h1><p><b>المدة:</b> ' + s.dur + ' — <b>الحجم:</b> ' + s.size + '<br><b>الفئة المستهدفة:</b> ' + s.audience + '<br><b>الهدف:</b> ' + s.goal + '</p><table>' + rows + '</table></body></html>');
    w.document.close(); w.focus(); setTimeout(function () { w.print(); }, 300);
  });

  function buildQuizList() {
    $('paneQuiz').innerHTML = '<div class="quiz-list">' + QZ.map(function (qz, i) {
      return '<div class="quiz-card2"><b>' + esc(qz.title) + '</b><span>' + qz.qs.length + ' أسئلة — اختيار من متعدد</span><button class="btn primary" data-startquiz="' + i + '">ابدأ الاختبار</button></div>';
    }).join('') + '</div>';
  }
  var qzState = null;
  $('paneQuiz').addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-startquiz]'); if (b) startQuiz(+b.dataset.startquiz); });
  function startQuiz(i) {
    qzState = { qz: QZ[i], idx: 0, score: 0, answered: false };
    $('quizT').textContent = QZ[i].title;
    $('quizModal').hidden = false;
    renderQuiz();
  }
  function renderQuiz() {
    var st = qzState, q = st.qz.qs[st.idx];
    var html = '<p class="q-prog">سؤال ' + (st.idx + 1) + ' من ' + st.qz.qs.length + '</p><p class="q-prompt">' + esc(q.q) + '</p>';
    q.opts.forEach(function (o, i) { html += '<button class="q-opt" data-opt="' + i + '">' + esc(o) + '</button>'; });
    html += '<div id="qFb"></div><div class="q-nav"><button class="btn primary" id="qNext" hidden>' + (st.idx === st.qz.qs.length - 1 ? 'إنهاء الاختبار' : 'السؤال التالي') + '</button></div>';
    $('quizBody').innerHTML = html;
  }
  $('quizBody').addEventListener('click', function (e) {
    var st = qzState; if (!st) return;
    var opt = e.target.closest && e.target.closest('.q-opt');
    if (opt && !st.answered) {
      st.answered = true;
      var q = st.qz.qs[st.idx], chosen = +opt.dataset.opt;
      [].forEach.call($('quizBody').querySelectorAll('.q-opt'), function (b, i) {
        b.disabled = true;
        if (i === q.a) b.classList.add('correct'); else if (i === chosen) b.classList.add('wrong');
      });
      if (chosen === q.a) st.score++;
      $('qFb').innerHTML = '<div class="q-fb">' + (chosen === q.a ? '✔ إجابة صحيحة.' : '✘ الإجابة الصحيحة: ' + esc(q.opts[q.a]) + '.') + (q.p ? ' <a href="#/p/' + q.p + '">مراجعة الصفحة ' + q.p + '</a>' : '') + '</div>';
      $('qNext').hidden = false;
    }
    if (e.target.id === 'qNext') {
      st.idx++; st.answered = false;
      if (st.idx >= st.qz.qs.length) {
        $('quizBody').innerHTML = '<div class="q-done"><b>' + st.score + ' / ' + st.qz.qs.length + '</b><p>نتيجتك في ' + esc(st.qz.title) + '</p><button class="btn primary" id="qRetry">إعادة الاختبار</button></div>';
      } else renderQuiz();
    }
    if (e.target.id === 'qRetry') startQuiz(QZ.indexOf(st.qz));
  });
  $('quizClose').onclick = function () { $('quizModal').hidden = true; qzState = null; };
  $('quizModal').addEventListener('click', function (e) { if (e.target === this) { this.hidden = true; qzState = null; } });

  function buildLegal() {
    $('paneLegal').innerHTML = '<p class="legal-note">قائمة موسّعة من 5 نصوص قانونية وتنظيمية، مجموعة من 21 صفحة راجعناها فعلياً (أغلبها من السلسلة الأولى). تبقى غير شاملة بالكامل — راجعها مع الديوان قبل اعتمادها مرجعاً رسمياً.</p><div class="legal-list">' +
      LEGAL.map(function (l) {
        return '<div class="legal-item"><h3>' + esc(l.title) + '</h3><p>' + esc(l.desc) + '</p>' +
          (l.articles.length ? '<ul>' + l.articles.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>' : '') +
          '<div class="gl-refs">' + l.pages.map(function (p) { return '<a href="#/p/' + p + '">ص ' + p + '</a>'; }).join('') + '</div></div>';
      }).join('') + '</div>';
  }

  /* ═════════════ وضع العرض للتكوين ═════════════ */
  $('bPresent').onclick = function () { togglePresenter(); };
  function togglePresenter() {
    var on = $('reader').classList.toggle('presenter');
    $('bPresent').setAttribute('aria-pressed', on);
    if (!on) { $('reader').classList.remove('spot'); }
    setTimeout(layout, 60);
  }
  $('pExit').onclick = function () { $('reader').classList.remove('presenter', 'spot'); $('bPresent').setAttribute('aria-pressed', false); setTimeout(layout, 60); };
  stage.addEventListener('dblclick', function (e) {
    if (!$('reader').classList.contains('presenter')) return;
    $('reader').classList.toggle('spot');
  });
  stage.addEventListener('pointermove', function (e) {
    if (!$('reader').classList.contains('spot')) return;
    var r = stage.getBoundingClientRect();
    stage.style.setProperty('--sx', (e.clientX - r.left) + 'px');
    stage.style.setProperty('--sy', (e.clientY - r.top) + 'px');
  });

  /* ═════════════ صفحة اليوم ═════════════ */
  (function pageOfDay() {
    var pool = Object.keys(SUM).map(Number);
    if (!pool.length) { $('potd').hidden = true; return; }
    var day = Math.floor(Date.now() / 86400000);
    var p = pool[day % pool.length];
    $('potdImg').src = thumbSrc(p);
    $('potdTitle').textContent = INFO[p].t;
    $('potdSub').textContent = SUM[p] || (CUR_G(p).short + ' › ' + CUR_S(p).title);
    $('potd').href = '#/p/' + p;
  })();

  /* ═════════════ الشريط السفلي للجوال ═════════════ */
  document.body.classList.add('has-bnav');
  function setBnav(v) {
    var map = { tool: 'tools', about: '' };
    var key = map[v] !== undefined ? map[v] : v;
    [].forEach.call($('bnav').children, function (a) { a.classList.toggle('on', a.dataset.nav === key); });
  }

  /* ═════════════ جولة تعريفية عند أول فتح ═════════════ */
  var ONB = [
    { ic: '📖', h: 'أهلاً بك في الموسوعة', p: 'مرجع بصري لـ281 صفحة إنفوغرافيك، منظّمة في أربع سلاسل، ويعمل البرنامج بالكامل دون إنترنت.' },
    { ic: '🧭', h: 'مسارات جاهزة حسب دورك', p: 'اختر «المسارات» من القائمة ليرتّب لك البرنامج الصفحات الأهم بالترتيب المناسب لعملك، مع تتبّع تقدّمك.' },
    { ic: '🧰', h: 'أدوات تُملأ وتُطبع', p: 'من «الأدوات» يمكنك تعبئة SWOT وشجرة المشكلات وSMART والإطار المنطقي وغيرها مباشرة، ثم طباعتها أو تصديرها.' },
    { ic: '⭐', h: 'مكتبتك الخاصة', p: 'أضف صفحات للمفضلة واكتب ملاحظاتك عليها من داخل القارئ (زر النجمة أو المفكرة)، وكلها محفوظة على جهازك فقط.' },
    { ic: '', h: 'ديوان قطاع الشباب والرياضة', p: 'نبني صرح الفكر، نرتقي بعقولهم', extra: '<img src="assets/signature.jpg" alt="توقيع بن دوحة بوعلام" class="onb-sig"><a class="fb-link" href="https://www.facebook.com/groups/www.diwan.js1236" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg><span>صفحتنا على فيسبوك</span></a>' }
  ];
  var onbIdx = 0;
  function renderOnb() {
    $('onbSlides').innerHTML = ONB.map(function (s, i) {
      return '<div class="onb-slide" ' + (i === onbIdx ? '' : 'hidden') + '><div class="onb-ic">' + s.ic + '</div><h2>' + s.h + '</h2><p>' + s.p + '</p>' + (s.extra || '') + '</div>';
    }).join('');
    $('onbDots').innerHTML = ONB.map(function (_, i) { return '<i class="' + (i === onbIdx ? 'on' : '') + '"></i>'; }).join('');
    $('onbNext').textContent = onbIdx === ONB.length - 1 ? 'ابدأ' : 'التالي';
  }
  $('onbNext').onclick = function () {
    onbIdx++;
    if (onbIdx >= ONB.length) { $('onb').hidden = true; store.set('onb_seen', 1); return; }
    renderOnb();
  };
  $('onbSkip').onclick = function () { $('onb').hidden = true; store.set('onb_seen', 1); };
  $('onb').addEventListener('click', function (e) { if (e.target === this) { this.hidden = true; store.set('onb_seen', 1); } });
  if (!store.get('onb_seen', 0)) { onbIdx = 0; renderOnb(); $('onb').hidden = false; }
  var btnReplayOnb = $('btnReplayOnb');
  if (btnReplayOnb) btnReplayOnb.onclick = function () { onbIdx = 0; renderOnb(); $('onb').hidden = false; };

  /* ═════════════ التوجيه ═════════════ */
  var currentView = 'home';
  var views = { home: $('view-home'), toc: $('view-toc'), paths: $('view-paths'), map: $('view-map'), tools: $('view-tools'), tool: $('view-tool'), glossary: $('view-glossary'), training: $('view-training'), gallery: $('view-gallery'), mine: $('view-mine'), about: $('view-about') };
  function setNav(n) {
    [].forEach.call(document.querySelectorAll('.tabs a'), function (a) { a.classList.toggle('on', a.dataset.nav === n); });
  }
  function route() {
    var h = location.hash || '#/';
    var m = h.match(/^#\/p\/(\d+)(?:\/([a-z0-9-]+))?/);
    if (m) {
      var p = clamp(parseInt(m[1], 10), 1, N), extra = m[2] || '';
      var isPath = X.paths.some(function (x) { return x.id === extra; });
      reader.path = isPath ? extra : null;
      if (!reader.open) { if (!ssGet('from')) ssSet('from', '#/'); openReader(p); } else go(p);
      if (extra === 'note') { openDrawer('note'); }
      return;
    }
    if (reader.open) closeReader();
    var parts = h.replace(/^#\//, '').split('/');
    var v = parts[0] || 'home';
    if (v === 'gallery' && parts[1] === 'fav') { location.replace('#/mine'); return; }
    if (v === 'tools' && parts[1]) { v = 'tool'; }
    if (!views[v]) v = 'home';
    currentView = v;
    Object.keys(views).forEach(function (k) { views[k].hidden = k !== v; });
    setNav(v === 'about' ? '' : (v === 'tool' ? 'tools' : v));
    if (v !== 'about') ssSet('from', '#/' + (v === 'home' ? '' : parts.join('/')));
    if (v === 'home') { refreshHome(); window.scrollTo(0, 0); }
    if (v === 'toc') { showToc(parts[1]); if (parts[1] === undefined) window.scrollTo(0, 0); }
    if (v === 'paths') { showPaths(); window.scrollTo(0, 0); }
    if (v === 'gallery') { showGallery(parts[1] || 'all'); window.scrollTo(0, 0); }
    if (v === 'mine') { showMine(); window.scrollTo(0, 0); }
    if (v === 'about') { showAbout(); window.scrollTo(0, 0); }
    if (v === 'tools') { showToolsList(); window.scrollTo(0, 0); }
    if (v === 'tool') { openTool(parts[1]); window.scrollTo(0, 0); }
    if (v === 'glossary') { showGlossary(); window.scrollTo(0, 0); }
    if (v === 'training') { showTraining(parts[1] || 'sessions'); window.scrollTo(0, 0); }
    if (v === 'map') { buildMindmap(); window.scrollTo(0, 0); }
    setBnav(v);
  }
  window.addEventListener('hashchange', route);

  /* ───────── أزرار التنقّل السريع أعلى/أسفل الصفحة ───────── */
  (function () {
    var nav = $('scrollNav'), btnTop = $('scrollTopBtn'), btnBottom = $('scrollBottomBtn');
    if (!nav || !btnTop || !btnBottom) return;
    function maxScroll() { return Math.max(0, document.documentElement.scrollHeight - window.innerHeight); }
    function update() {
      var y = window.scrollY || document.documentElement.scrollTop, mx = maxScroll();
      if (mx < 120) { nav.classList.remove('show'); return; }
      nav.classList.add('show');
      btnTop.disabled = y <= 40;
      btnBottom.disabled = y >= mx - 40;
    }
    btnTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    btnBottom.addEventListener('click', function () { window.scrollTo({ top: maxScroll(), behavior: 'smooth' }); });
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    window.addEventListener('hashchange', function () { setTimeout(update, 60); });
    setTimeout(update, 200);
  })();

  /* ───────── PWA (عند النشر على موقع فقط) ───────── */
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { }); });
  }

  /* ───────── بدء التشغيل ───────── */
  buildHome();
  refreshFavUI();
  route();
})();
