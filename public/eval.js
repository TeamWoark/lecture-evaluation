/* صفحة التقييم: بناء الاستبيان + التحقق + الإرسال */
(function () {
  const $ = (s) => document.querySelector(s);
  const startedAt = Date.now();
  document.getElementById('year').textContent = new Date().getFullYear();

  let QUESTIONS = [];
  let DIMENSIONS = {};
  let SCALE = { 1: 'ضعيف جدًا', 2: 'ضعيف', 3: 'جيد', 4: 'ممتاز' };
  let TOTAL = 10;

  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );

  fetch('/api/config')
    .then((r) => r.json())
    .then((data) => {
      QUESTIONS = data.questions || [];
      DIMENSIONS = data.dimensions || {};
      SCALE = data.scale || SCALE;
      TOTAL = QUESTIONS.length || 10;
      if (data.site && data.site.title) {
        document.title = `تقييم اللقاء — ${data.site.title}`;
        if (data.site.shortTitle) $('#brandTitle').textContent = data.site.shortTitle;
        if (data.site.logoMark) $('#brandMark').textContent = data.site.logoMark;
      }
      const trainers = data.trainers || [];
      if (trainers.length) {
        const box = $('#trainerChips');
        box.hidden = false;
        box.innerHTML =
          '<span class="lbl">المدربون:</span> ' + trainers.map((t) => `<span class="chip">${esc(t)}</span>`).join('');
      }

      if (data.evaluationOpen === false) {
        $('#evalForm').style.display = 'none';
        $('#formMsg').textContent = '';
        $('#intro').insertAdjacentHTML(
          'afterend',
          '<div class="notice" style="background:#fef2f2;border-color:#fecaca;color:#b91c1c"><span>⏳</span><div><b>التقييم مغلق حاليًا.</b> شكرًا لاهتمامك.</div></div>'
        );
      }
      build();
      updateProgress();
    })
    .catch(() => {
      $('#questions').innerHTML =
        `<div class="empty-state"><div class="ico"><svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/></svg></div>تعذّر تحميل الاستبيان. يرجى تحديث الصفحة.</div>`;
    });

  function build() {
    const host = $('#questions');
    let lastDim = null;

    QUESTIONS.forEach((q, i) => {
      if (q.dim !== lastDim) {
        lastDim = q.dim;
        const head = document.createElement('div');
        head.style.cssText =
          'display:flex;align-items:center;gap:.6rem;margin:2rem 0 .9rem;font-weight:800;font-size:14px;color:var(--ink-2)';
        head.innerHTML = `<span style="width:22px;height:22px;border-radius:7px;background:linear-gradient(135deg,var(--brand),var(--accent));display:grid;place-items:center;color:#fff;font-size:11px">◆</span>
          ${esc(DIMENSIONS[q.dim] || '')}`;
        host.appendChild(head);
      }

      const fs = document.createElement('div');
      fs.className = 'question';
      fs.id = 'fs-' + q.id;
      fs.innerHTML = `
        <div class="q-head">
          <span class="q-num">${i + 1}</span>
          <div class="q-title">${esc(q.text)}<br><span class="q-dim">${esc(DIMENSIONS[q.dim] || '')}</span></div>
        </div>
        <div class="scale">
          ${[4, 3, 2, 1]
            .map(
              (v) => `
            <label>
              <input type="radio" name="${q.id}" value="${v}" />
              <span class="val">${v}</span>
              <span class="lbl">${esc(SCALE[v] || '')}</span>
            </label>`
            )
            .join('')}
        </div>`;
      host.appendChild(fs);
    });

    host.addEventListener('change', (e) => {
      if (e.target.type !== 'radio') return;
      const fs = e.target.closest('.question');
      if (fs) {
        fs.classList.add('answered');
        fs.classList.remove('missing');
      }
      updateProgress();
    });
  }

  function answeredCount() {
    const names = new Set();
    document.querySelectorAll('#questions input[type="radio"]:checked').forEach((el) => names.add(el.name));
    return names.size;
  }

  function updateProgress() {
    const n = answeredCount();
    const pct = TOTAL ? Math.round((n / TOTAL) * 100) : 0;
    $('#progressBar').style.width = pct + '%';
    $('#progressLabel').textContent = `${n} / ${TOTAL}`;
    $('#progressHint').textContent = n === TOTAL ? 'جاهز للإرسال ✓' : `بقي ${TOTAL - n} سؤالًا`;
  }

  const notes = $('#notes');
  notes.addEventListener('input', () => {
    $('#notesCount').textContent = `${notes.value.length} / 2000`;
  });

  $('#evalForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const answers = {};
    let missing = null;
    document.querySelectorAll('#questions .question').forEach((fs) => fs.classList.remove('missing'));

    QUESTIONS.forEach((q) => {
      const el = document.querySelector(`input[name="${q.id}"]:checked`);
      if (el) answers[q.id] = Number(el.value);
      else if (!missing) missing = q;
    });

    if (missing) {
      const fs = document.getElementById('fs-' + missing.id);
      fs.classList.add('missing');
      fs.scrollIntoView({ behavior: 'smooth', block: 'center' });
      $('#formMsg').textContent = 'الرجاء الإجابة على جميع الأسئلة قبل الإرسال.';
      $('#formMsg').style.color = '#b91c1c';
      return;
    }

    const btn = $('#submitBtn');
    btn.disabled = true;
    btn.textContent = 'جارٍ الإرسال…';

    try {
      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers,
          notes: notes.value.trim(),
          durationSeconds: Math.round((Date.now() - startedAt) / 1000),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'تعذّر إرسال التقييم');

      $('#evalForm').style.display = 'none';
      $('#intro').style.display = 'none';
      document.querySelector('.eval-progress').style.display = 'none';
      const thanks = $('#thanks');
      thanks.style.display = 'block';
      thanks.classList.add('fade-in');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'إرسال التقييم';
      $('#formMsg').textContent = err.message || 'حدث خطأ، يرجى المحاولة مرة أخرى.';
      $('#formMsg').style.color = '#b91c1c';
    }
  });
})();
