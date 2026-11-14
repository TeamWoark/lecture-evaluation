/* لوحة تحكم الأدمن */
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );

  let DATA = { rows: [], questions: [], dimensions: {}, scale: {} };
  let RANGE = 'all';
  let NOTES_QUERY = '';

  const ICO = {
    doc: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 17h4"/></svg>',
    star: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z"/></svg>',
    thumb: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M7 10.5V20H4.5a.5.5 0 0 1-.5-.5v-8.5a.5.5 0 0 1 .5-.5z"/><path d="M7 10.5l3.6-6.3a2.6 2.6 0 0 1 2.9 2.8l-.4 2.5h5a2 2 0 0 1 2 2.3l-1 6.4a2 2 0 0 1-2 1.8H7"/></svg>',
    chat: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M20.5 11.5a7.5 7.5 0 0 1-7.5 7.5H9l-4.5 2.5 1-3.7a7.5 7.5 0 1 1 15-6.3z"/></svg>',
  };
  const BIG = {
    chart: '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M4 20V9M10 20V4M16 20v-7M22 20H2"/></svg>',
    note: '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8a2 2 0 0 1 2 2v14l-6-3-6 3V6a2 2 0 0 1 2-2z"/></svg>',
  };


  /* ------------------------------ الجلسة ------------------------------ */
  fetch('/api/admin/session')
    .then((r) => r.json())
    .then((d) => {
      if (d.authenticated) showDashboard();
      else showLogin();
    })
    .catch(showLogin);

  function showLogin() {
    $('#loginScreen').style.display = 'grid';
    $('#dashboard').style.display = 'none';
    $('#password').focus();
  }
  function showDashboard() {
    $('#loginScreen').style.display = 'none';
    $('#dashboard').style.display = 'block';
    load();
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#loginBtn');
    const errBox = $('#loginError');
    errBox.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'جارٍ التحقق…';
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: $('#password').value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'تعذّر تسجيل الدخول');
      showDashboard();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'دخول';
    }
  });

  $('#logoutBtn').addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    location.reload();
  });

  $('#refreshBtn').addEventListener('click', load);
  $('#toggleRaw').addEventListener('click', () => {
    const w = $('#rawWrap');
    w.style.display = w.style.display === 'none' ? 'block' : 'none';
  });
  $('#notesSearch').addEventListener('input', (e) => {
    NOTES_QUERY = e.target.value.trim();
    renderNotes(filterRows());
  });
  document.querySelectorAll('#rangeTabs button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#rangeTabs button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      RANGE = btn.dataset.range;
      render();
    });
  });

  /* ------------------------------ التحميل ----------------------------- */
  async function load() {
    $('#loading').style.display = 'block';
    $('#loading').textContent = 'جارٍ تحميل البيانات…';
    $('#content').style.display = 'none';
    try {
      const res = await fetch('/api/admin/data');
      if (res.status === 401) return showLogin();
      const data = await res.json();
      DATA = data;
      if (DATA.rows.length === 0) {
        $('#loading').innerHTML =
          `<div class="empty-state"><div class="ico">${BIG.chart}</div>لا توجد ردود بعد — ستظهر التحليلات هنا بمجرد وصول أول تقييم.</div>`;
        return;
      }
      $('#loading').style.display = 'none';
      $('#content').style.display = 'block';
      const demoCount = DATA.rows.filter((r) => r.demo).length;
      const host = $('#content');
      let banner = document.getElementById('demoBanner');
      if (demoCount > 0) {
        if (!banner) {
          banner = document.createElement('div');
          banner.id = 'demoBanner';
          banner.className = 'demo-banner';
          host.insertBefore(banner, host.firstChild);
        }
        banner.innerHTML = `<span>⚠️</span><span>يوجد <b>${demoCount}</b> ردًا تجريبيًا لعرض شكل الداشبورد فقط — تُمسح بأمر <code>npm run clear-data</code> قبل التشغيل الفعلي.</span>`;
        banner.style.display = 'flex';
      } else if (banner) {
        banner.style.display = 'none';
      }
      render();
    } catch (err) {
      $('#loading').textContent = 'تعذّر تحميل البيانات: ' + err.message;
    }
  }

  /* ------------------------------ الفلترة ----------------------------- */
  function filterRows() {
    const rows = DATA.rows || [];
    if (RANGE === 'all') return rows;
    const days = Number(RANGE);
    const cutoff = Date.now() - days * 86400000;
    return rows.filter((r) => new Date(r.created_at).getTime() >= cutoff);
  }

  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const dayKey = (iso) =>
    new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' }); // YYYY-MM-DD
  const fmtDate = (iso) =>
    new Date(iso).toLocaleString('ar-SA-u-nu-latn', {
      timeZone: 'Asia/Riyadh',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

  function scoreColor(v) {
    if (v >= 3.5) return 'var(--ok)';
    if (v >= 3) return '#38bdf8';
    if (v >= 2.4) return 'var(--warn)';
    return 'var(--bad)';
  }

  /* --------------------------- الحساب والعرض -------------------------- */
  function computeStats(rows) {
    const questions = DATA.questions || [];
    const perQ = {};
    questions.forEach((q) => {
      perQ[q.id] = { counts: { 1: 0, 2: 0, 3: 0, 4: 0 }, values: [] };
    });
    const allValues = [];
    const dimValues = {};
    let notesCount = 0;
    let durationSum = 0;
    let durationN = 0;
    const trend = {};

    rows.forEach((r) => {
      const a = r.answers || {};
      const key = dayKey(r.created_at);
      trend[key] = (trend[key] || 0) + 1;
      const rowVals = [];
      questions.forEach((q) => {
        const v = Number(a[q.id]);
        if (v >= 1 && v <= 4) {
          perQ[q.id].counts[v] += 1;
          perQ[q.id].values.push(v);
          allValues.push(v);
          rowVals.push(v);
          dimValues[q.dim] = dimValues[q.dim] || [];
          dimValues[q.dim].push(v);
        }
      });
      r._avg = rowVals.length ? avg(rowVals) : 0;
      if (r.notes && String(r.notes).trim()) notesCount += 1;
      if (r.duration_seconds > 0) {
        durationSum += Number(r.duration_seconds);
        durationN += 1;
      }
    });

    return {
      responses: rows.length,
      overall: avg(allValues),
      positivePct: allValues.length ? (allValues.filter((v) => v >= 3).length / allValues.length) * 100 : 0,
      excellentPct: allValues.length ? (allValues.filter((v) => v === 4).length / allValues.length) * 100 : 0,
      notesCount,
      avgDuration: durationN ? Math.round(durationSum / durationN) : 0,
      perQ,
      dimValues,
      trend,
    };
  }

  function render() {
    const rows = filterRows();
    const s = computeStats(rows);
    renderKpis(s);
    renderDims(s);
    renderTrend(s);
    renderQuestions(s);
    renderNotes(rows);
    renderRaw(rows);
  }

  function renderKpis(s) {
    const cards = [
      {
        cls: '',
        label: 'عدد الردود',
        value: s.responses,
        sub: RANGE === 'all' ? 'إجمالي التقييمات المستلمة' : `خلال ${RANGE} يومًا`,
        icon: ICO.doc,
      },
      {
        cls: 'green',
        label: 'متوسط التقييم العام',
        value: s.overall.toFixed(2),
        unit: '/ 4',
        sub: 'متوسط جميع الإجابات',
        icon: ICO.star,
      },
      {
        cls: 'cyan',
        label: 'نسبة التقييمات الإيجابية (3 و4)',
        value: s.positivePct.toFixed(0),
        unit: '%',
        sub: `منها ${s.excellentPct.toFixed(0)}% «ممتاز»`,
        icon: ICO.thumb,
      },
      {
        cls: 'amber',
        label: 'ملاحظات مكتوبة',
        value: s.notesCount,
        sub: s.avgDuration ? `متوسط زمن التقييم ${s.avgDuration} ثانية` : 'ملاحظات اختيارية',
        icon: ICO.chat,
      },
    ];
    $('#kpis').innerHTML = cards
      .map(
        (c) => `
      <div class="kpi ${c.cls}">
        <div class="label" style="display:flex;align-items:center;gap:.4rem">${c.icon} ${c.label}</div>
        <div class="value">${c.value}${c.unit ? ` <small>${c.unit}</small>` : ''}</div>
        <div class="sub">${esc(c.sub)}</div>
      </div>`
      )
      .join('');
  }

  function renderDims(s) {
    const dims = DATA.dimensions || {};
    const keys = Object.keys(dims);
    $('#dims').innerHTML = keys
      .map((k) => {
        const vals = s.dimValues[k] || [];
        const v = vals.length ? avg(vals) : 0;
        const pct = (v / 4) * 100;
        const circ = 2 * Math.PI * 22;
        const dash = (pct / 100) * circ;
        return `
        <div class="dim-row">
          <div class="dim-ring">
            <svg viewBox="0 0 52 52" width="54" height="54">
              <circle cx="26" cy="26" r="22" fill="none" stroke="#eef1f8" stroke-width="6" />
              <circle cx="26" cy="26" r="22" fill="none" stroke="${scoreColor(v)}" stroke-width="6"
                stroke-linecap="round" stroke-dasharray="${dash} ${circ}" transform="rotate(-90 26 26)" />
              <text x="26" y="30" text-anchor="middle" font-size="12" font-weight="800" fill="#0f172a">${v.toFixed(1)}</text>
            </svg>
          </div>
          <div class="dim-info">
            <b>${esc(dims[k])}</b>
            <span>${vals.length} إجابة · ${((v / 4) * 100).toFixed(0)}% من الدرجة الكاملة</span>
            <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:linear-gradient(90deg,${scoreColor(v)},var(--accent))"></div></div>
          </div>
          <div class="dim-score" style="color:${scoreColor(v)}">${v.toFixed(2)}</div>
        </div>`;
      })
      .join('');
  }

  function renderTrend(s) {
    // آخر 14 يومًا حتى اليوم (أو مدى البيانات إن كان أطول)
    const days = [];
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      const key = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
      days.push({ key, label: d.toLocaleDateString('ar-SA-u-nu-latn', { weekday: 'short', day: 'numeric' }) });
    }
    const counts = days.map((d) => s.trend[d.key] || 0);
    const max = Math.max(1, ...counts);
    $('#trendSub').textContent = `عدد الردود المستلمة لكل يوم — آخر رد: ${
      DATA.rows.length ? fmtDate(DATA.rows[DATA.rows.length - 1].created_at) : '—'
    }`;

    $('#trend').innerHTML = `
      <div style="display:flex;align-items:flex-end;gap:.4rem;height:190px;padding-top:1rem">
        ${days
          .map((d, i) => {
            const h = counts[i] === 0 ? 3 : Math.max(8, (counts[i] / max) * 150);
            return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:.35rem" title="${d.key}: ${counts[i]} رد">
              <span style="font-size:11px;font-weight:800;color:${counts[i] ? 'var(--ink-2)' : '#cbd5e1'}">${counts[i] || ''}</span>
              <div style="width:100%;max-width:34px;height:${h}px;border-radius:8px 8px 4px 4px;
                background:${counts[i] ? 'linear-gradient(180deg,var(--brand),var(--accent))' : '#e8ecf5'}"></div>
            </div>`;
          })
          .join('')}
      </div>
      <div style="display:flex;gap:.4rem;margin-top:.4rem">
        ${days
          .map(
            (d, i) =>
              `<div style="flex:1;text-align:center;font-size:10.5px;color:var(--muted);${
                i % 2 ? 'opacity:.55' : ''
              }">${d.label.split(' ')[0]}</div>`
          )
          .join('')}
      </div>`;
  }

  function renderQuestions(s) {
    const questions = DATA.questions || [];
    const rows = questions
      .map((q, i) => {
        const st = s.perQ[q.id];
        const total = Object.values(st.counts).reduce((a, b) => a + b, 0);
        const v = st.values.length ? avg(st.values) : 0;
        const segs = [1, 2, 3, 4]
          .map((k) => {
            const w = total ? (st.counts[k] / total) * 100 : 0;
            return w > 0 ? `<div class="seg seg-${k}" style="width:${w}%" title="${k}: ${st.counts[k]}"></div>` : '';
          })
          .join('');
        return `<tr>
          <td style="color:var(--muted);font-weight:700">${i + 1}</td>
          <td class="q-text">${esc(q.text)}</td>
          <td class="hide-sm"><span class="chip gray">${esc((DATA.dimensions || {})[q.dim] || '')}</span></td>
          <td style="font-weight:800;color:${scoreColor(v)};white-space:nowrap">${v.toFixed(2)} / 4</td>
          <td style="width:170px"><div class="dist">${segs || '<span style="color:#cbd5e1;font-size:12px">لا إجابات</span>'}</div></td>
          <td style="color:var(--muted);font-size:12.5px;white-space:nowrap">${total} إجابة</td>
        </tr>`;
      })
      .join('');

    $('#qDetail').innerHTML = `
      <table class="q-table">
        <thead><tr>
          <th>#</th><th>السؤال</th><th class="hide-sm">المحور</th><th>المتوسط</th><th>التوزيع</th><th>العدد</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function renderNotes(rows) {
    const withNotes = rows
      .filter((r) => r.notes && String(r.notes).trim())
      .filter((r) => !NOTES_QUERY || String(r.notes).includes(NOTES_QUERY))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (!withNotes.length) {
      $('#notesList').innerHTML =
        `<div class="empty-state"><div class="ico">${BIG.note}</div>لا توجد ملاحظات مكتوبة بعد.</div>`;
      return;
    }
    $('#notesList').innerHTML = withNotes
      .map(
        (r) => `
      <div class="note-item">
        <div>${esc(r.notes)}</div>
        <div class="meta">
          <span class="chip gray">${fmtDate(r.created_at)}</span>
          <span class="chip" style="background:${scoreColor(r._avg || 0)}18;color:${scoreColor(
          r._avg || 0
        )}">متوسط التقييم ${(r._avg || 0).toFixed(2)}</span>
        </div>
      </div>`
      )
      .join('');
  }

  function renderRaw(rows) {
    const questions = DATA.questions || [];
    const head = questions.map((q, i) => `<th title="${esc(q.text)}">س${i + 1}</th>`).join('');
    const body = rows
      .slice()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map(
        (r) => `<tr>
        <td style="white-space:nowrap;font-size:12px;color:var(--muted)">${fmtDate(r.created_at)}</td>
        ${questions
          .map((q) => `<td style="text-align:center;font-weight:700;color:${scoreColor(r.answers?.[q.id] || 0)}">${
            r.answers?.[q.id] ?? '—'
          }</td>`)
          .join('')}
        <td style="font-weight:800">${(r._avg || 0).toFixed(2)}</td>
        <td style="max-width:240px;font-size:12.5px;color:var(--ink-2)">${esc(r.notes || '—')}</td>
        <td><button class="btn btn-danger btn-sm" data-del="${esc(r.id)}">حذف</button></td>
      </tr>`
      )
      .join('');

    $('#rawWrap').innerHTML = `
      <table class="q-table">
        <thead><tr><th>التاريخ</th>${head}<th>المتوسط</th><th>ملاحظات</th><th></th></tr></thead>
        <tbody>${body}</tbody>
      </table>`;

    $('#rawWrap').querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('هل تريد حذف هذا الرد نهائيًا؟')) return;
        const res = await fetch('/api/admin/responses/' + encodeURIComponent(btn.dataset.del), {
          method: 'DELETE',
        });
        if (res.ok) load();
        else alert('تعذّر حذف الرد');
      });
    });
  }
})();
