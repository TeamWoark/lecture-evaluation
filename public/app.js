/* الصفحة الرئيسية: تحميل الإعدادات + مشغّل الفيديوهات */
(function () {
  const $ = (sel) => document.querySelector(sel);
  let videos = [];
  let current = 0;

  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );

  document.getElementById('year').textContent = new Date().getFullYear();

  // كود QR لرابط التقييم (يُولَّد محليًا بدون إنترنت)
  function renderQr() {
    const host = document.getElementById('qrHome');
    if (!host || typeof qrcode !== 'function') return;
    try {
      const url = window.location.origin + '/evaluation';
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      host.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 8, scalable: true });
    } catch (e) {
      host.innerHTML = '<span style="font-size:11px;color:#64748b">QR</span>';
    }
  }
  renderQr();

  fetch('/api/config')
    .then((r) => r.json())
    .then((data) => {
      const site = data.site || {};
      document.title = `${site.title || 'اللقاء التدريبي'} — فيديوهات المحاضرة وتقييم اللقاء`;
      if (site.title) $('#heroTitle').textContent = site.title;
      if (site.subtitle) $('#heroSub').textContent = site.subtitle;
      if (site.heroBadge) $('#heroBadge').textContent = site.heroBadge;
      if (site.shortTitle) $('#brandTitle').textContent = site.shortTitle;
      if (site.logoMark) $('#brandMark').textContent = site.logoMark;
      if (site.shortTitle) $('#footTitle').textContent = site.shortTitle;
      if (site.organizer) $('#brandSub').textContent = site.organizer;

      const trainers = (data.trainers || []).map((t) =>
        typeof t === 'string' ? { name: t } : t
      );
      if (trainers.length) {
        const sec = document.getElementById('trainers');
        sec.hidden = false;
        document.getElementById('trainersStrip').innerHTML = trainers
          .map((t) => {
            const initials = String(t.name || '')
              .replace(/^(م|أ|د)\.\s*/, '')
              .trim()
              .split(/\s+/)
              .slice(0, 2)
              .map((w) => w[0])
              .join('');
            const avatar = t.photo
              ? `<span class="avatar"><img src="${esc(t.photo)}" alt="${esc(t.name || '')}" loading="lazy" /></span>`
              : `<span class="avatar">${esc(initials)}</span>`;
            return `<div class="trainer-card">
              ${avatar}
              <span class="trainer-info">
                <b>${esc(t.name || '')}</b>
                ${t.nameEn ? `<span class="en">${esc(t.nameEn)}</span>` : ''}
                <span>${esc(t.role || 'مدرب اللقاء')}</span>
              </span>
            </div>`;
          })
          .join('');
      }

      // سطر موعد اللقاء
      const meta = document.getElementById('heroMeta');
      if (meta && site.lectureDate) {
        meta.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 11h18"/></svg> ${esc(site.lectureDate)}`;
        meta.hidden = false;
      }
      const credit = document.getElementById('footCredit');
      if (credit && data.credit) {
        credit.innerHTML = `${esc(data.credit.label || '')} <b>${esc(data.credit.name || '')}</b>`;
      }

      const tools = data.tools || [];
      if (tools.length) {
        const toolSec = document.getElementById('tools');
        toolSec.hidden = false;
        document.getElementById('toolsGrid').innerHTML = tools
          .map(
            (t) => `<a class="tool-card" href="${esc(t.url)}" target="_blank" rel="noopener" style="--tc:${esc(
              t.color || '#4f46e5'
            )}">
              <div class="tool-head">
                <span class="tool-logo">${esc(t.letter || t.name[0])}</span>
                <span>
                  <span class="tool-name">${esc(t.name)}</span>
                  <span class="tool-tag">${esc(t.tag || 'أداة ذكاء اصطناعي')}</span>
                </span>
              </div>
              <p class="tool-desc">${esc(t.desc || '')}</p>
              <span class="tool-link">فتح الأداة
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>
              </span>
            </a>`
          )
          .join('');
      }

      videos = (data.videos || []).map((v) => ({ ...v }));
      $('#statVideos').textContent = videos.length || '0';
      renderPlaylist();
      if (videos.length) select(0);
      else renderEmptyPlayer();
    })
    .catch(() => {
      $('#playerFrame').innerHTML =
        '<div class="empty"><strong>تعذّر تحميل المحتوى</strong>يرجى تحديث الصفحة والمحاولة مرة أخرى.</div>';
    });

  fetch('/api/stats/public')
    .then((r) => r.json())
    .then((d) => { $('#statResponses').textContent = d.count ?? 0; })
    .catch(() => { $('#statResponses').textContent = '0'; });

  function isPlayable(v) {
    if (!v || v.placeholder) return false;
    if (!v.source) return false;
    if (v.source.type === 'drive') return Boolean(v.source.fileId);
    if (v.source.type === 'mp4') return Boolean(v.source.url);
    if (v.source.type === 'youtube') return Boolean(v.source.videoId);
    return false;
  }

  function renderPlaylist() {
    const box = $('#playlist');
    box.innerHTML = '<div class="playlist-head">قائمة التشغيل</div>';
    if (!videos.length) {
      box.insertAdjacentHTML('beforeend', `<div class="empty-state"><div class="ico"><svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M10 9.5l5 2.5-5 2.5z"/></svg></div>لم تُضَف فيديوهات بعد.</div>`);
      return;
    }
    videos.forEach((v, i) => {
      const btn = document.createElement('button');
      btn.className = 'play-item' + (i === current ? ' active' : '');
      btn.type = 'button';
      btn.innerHTML = `
        <span class="num">${i + 1}</span>
        <span class="info">
          <b>${esc(v.title || 'فيديو ' + (i + 1))}</b>
          <span>${esc(v.duration || (isPlayable(v) ? 'اضغط للتشغيل' : 'جديد — ستتم إضافته قريبًا'))}</span>
        </span>
        <span class="play-ico">▶</span>`;
      btn.addEventListener('click', () => select(i));
      box.appendChild(btn);
    });
  }

  function renderEmptyPlayer() {
    $('#playerFrame').innerHTML =
      '<div class="empty"><strong>الفيديوهات قيد الرفع</strong>ستظهر هنا تلقائيًا بمجرد إضافة ملفات المحاضرة.</div>';
    $('#nowTitle').textContent = 'لا توجد فيديوهات بعد';
    $('#nowDesc').textContent = '';
    $('#nowRow').innerHTML = '';
  }

  function select(i) {
    current = i;
    const v = videos[i];
    document.querySelectorAll('.play-item').forEach((el, idx) => el.classList.toggle('active', idx === i));
    const frame = $('#playerFrame');

    if (isPlayable(v)) {
      if (v.source.type === 'drive') {
        const src = `https://drive.google.com/file/d/${encodeURIComponent(
          v.source.fileId
        )}/preview`;
        frame.innerHTML = `<div class="stage-wrap"><div class="stage"><iframe src="${src}" allow="autoplay; fullscreen; encrypted-media" allowfullscreen title="${esc(
          v.title
        )}"></iframe></div></div>`;
        fitStage(frame);
      } else if (v.source.type === 'mp4') {
        frame.innerHTML = `<video controls playsinline preload="metadata" poster="${esc(v.poster || '')}">
            <source src="${esc(v.source.url)}" type="video/mp4" /></video>`;
      } else if (v.source.type === 'youtube') {
        frame.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(
          v.source.videoId
        )}" allow="autoplay; fullscreen; encrypted-media" allowfullscreen title="${esc(v.title)}"></iframe>`;
      }
    } else {
      frame.innerHTML =
        '<div class="empty"><strong>هذا الفيديو لم يُرفع بعد</strong>سيتم تفعيل المشاهدة بمجرد إضافة ملف الفيديو إلى مجلد المحاضرة.</div>';
    }

    $('#nowTitle').textContent = v.title || 'فيديو ' + (i + 1);
    $('#nowDesc').textContent = v.description || '';
    const chips = [];
    chips.push(`<span class="chip">الفيديو ${i + 1} من ${videos.length}</span>`);
    if (v.duration)
      chips.push(
        `<span class="chip gray" style="gap:.3rem"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg> ${esc(v.duration)}</span>`
      );
    if (!isPlayable(v)) chips.push('<span class="chip gray">قيد الرفع</span>');
    if (isPlayable(v) && v.source.type === 'drive') {
      chips.push(
        `<a class="chip ok" href="https://drive.google.com/file/d/${encodeURIComponent(
          v.source.fileId
        )}/view" target="_blank" rel="noopener">فتح في نافذة جديدة ↗</a>`
      );
    }
    chips.push('<a class="chip ok" href="/evaluation">تقييم اللقاء بعد المشاهدة ←</a>');
    $('#nowRow').innerHTML = chips.join('');

    if (isPlayable(v)) {
      frame.querySelectorAll('.fs-overlay').forEach((n) => n.remove());
      const fsBtn = document.createElement('button');
      fsBtn.type = 'button';
      fsBtn.className = 'fs-overlay';
      fsBtn.setAttribute('aria-label', 'ملء الشاشة');
      fsBtn.innerHTML =
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
      fsBtn.addEventListener('click', () => {
        const el = $('#playerFrame');
        (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el);
      });
      frame.appendChild(fsBtn);
    }
  }

  /* -------- ضبط مقاس مشغّل درايف حتى لا يُقصّ الفيديو على الشاشات الصغيرة -------- */
  const STAGE_W = 960;
  const STAGE_H = 540;
  let resizeObs = null;

  function fitStage(frame) {
    const stage = frame.querySelector('.stage');
    if (!stage) return;
    const apply = () => {
      const w = frame.clientWidth;
      const h = frame.clientHeight || 0;
      if (!w) return;
      const s = Math.min(w / STAGE_W, (h || STAGE_H) / STAGE_H);
      stage.style.transform = `scale(${s})`;
      stage.style.top = `${Math.max(0, (h - STAGE_H * s) / 2)}px`;
      stage.style.right = `${Math.max(0, (w - STAGE_W * s) / 2)}px`;
    };
    apply();
    if (resizeObs) resizeObs.disconnect();
    if (typeof ResizeObserver !== 'undefined') {
      resizeObs = new ResizeObserver(apply);
      resizeObs.observe(frame);
    }
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', () => setTimeout(apply, 250));
    document.addEventListener('fullscreenchange', () => setTimeout(apply, 250));
  }
})();
