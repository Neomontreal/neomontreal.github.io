/* Comportamiento del sitio */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const html = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const desktop = window.matchMedia('(min-width: 900px)');
  const behavior = reduce ? 'auto' : 'smooth';

  let CFG = {};
  try { CFG = JSON.parse($('#site-config')?.textContent || '{}'); } catch { /* sin configuración */ }
  const digits = v => String(v || '').replace(/\D/g, '');
  const T = CFG.ui || {};

  /* ---------- Idioma: recordar la elección manual (cookie de 1 año) ---------- */
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-lang]');
    if (a) document.cookie = `site_lang=${a.dataset.lang}; Max-Age=31536000; Path=/; SameSite=Lax`;
  });


  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

  /* ---------- Texto por palabras (títulos que suben, párrafos que se iluminan) ---------- */
  const scrubBlocks = [];
  function splitWords(root, mode) {
    let k = 0;
    const walk = node => [...node.childNodes].forEach(n => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.append(part); return; }
          const w = document.createElement('span'); w.className = 'w';
          if (mode === 'rise') { const i = document.createElement('i'); i.textContent = part; w.append(i); w.style.setProperty('--k', Math.min(k, 14)); }
          else w.textContent = part;
          k++; frag.append(w);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1) walk(n);
    });
    walk(root);
    return [...root.querySelectorAll('.w')];
  }
  if (!reduce) {
    $$('[data-split]').forEach(el => {
      const mode = el.dataset.split, words = splitWords(el, mode);
      if (mode === 'scrub') scrubBlocks.push({ el, words });
    });
  }
  html.classList.remove('split-pending');

  function updateScrub() {
    const vh = innerHeight;
    scrubBlocks.forEach(({ el, words }) => {
      const r = el.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) return;
      const p = clamp((vh * 0.9 - r.top) / (r.height + vh * 0.3));
      const on = Math.round(p * words.length);
      words.forEach((w, i) => w.classList.toggle('on', i < on));
    });
  }

  /* ---------- Tarjetas apiladas: la anterior se encoge y se oscurece al cubrirse ---------- */
  const cards = $$('[data-card]');
  function updateCards() {
    cards.forEach((c, i) => {
      const next = cards[i + 1];
      if (!next) return;
      const top = parseFloat(getComputedStyle(c).top) || 0;
      const p = clamp(1 - (next.getBoundingClientRect().top - top) / c.offsetHeight);
      c.style.setProperty('--cover', p.toFixed(3));
    });
  }

  /* ---------- Foto que se expande al entrar ---------- */
  const expands = $$('[data-expand]');
  function updateExpand() {
    const vh = innerHeight;
    expands.forEach(m => {
      const r = m.parentElement.getBoundingClientRect();
      const p = clamp((vh - r.top) / (vh * 0.8));
      m.style.setProperty('--ex', (1 - Math.pow(1 - p, 3)).toFixed(3));
    });
  }

  /* ---------- Portada: textos por paso ----------
     El objeto 3D lo dibuja intro3d.js; aquí solo se cambia el texto (data-step 0..4) según el scroll. */
  const intro = $('[data-intro]');
  if (intro && !reduce) {
    const ease = t => 1 - Math.pow(1 - t, 3);
    const measure = () => {
      const r = intro.getBoundingClientRect(), total = r.height - innerHeight;
      const p = total > 0 ? clamp(-r.top / total) : 0;
      const step = p < 0.1 ? 0 : p < 0.36 ? 1 : p < 0.6 ? 2 : p < 0.82 ? 3 : 4;
      if (intro.dataset.step !== String(step)) intro.dataset.step = step;
      intro.style.setProperty('--out', clamp(p / 0.1).toFixed(3));
      intro.style.setProperty('--fin', ease(clamp((p - 0.86) / 0.1)).toFixed(3));
    };
    addEventListener('scroll', measure, { passive: true });
    addEventListener('resize', measure);
    measure();
  }

  /* ---------- Botones magnéticos (solo con puntero fino) ---------- */
  if (!reduce && window.matchMedia('(pointer: fine)').matches) {
    $$('.btn--primary, .pilllink').forEach(b => {
      b.addEventListener('mousemove', e => {
        const r = b.getBoundingClientRect();
        b.style.transform = `translate(${((e.clientX - r.left) / r.width - .5) * 10}px, ${((e.clientY - r.top) / r.height - .5) * 8}px)`;
      });
      b.addEventListener('mouseleave', () => { b.style.transform = ''; });
    });
  }

  /* ---------- Etiquetas con física (Matter.js, se carga solo al llegar a la sección) ---------- */
  const field = $('[data-physics]');
  if (field && !reduce && 'IntersectionObserver' in window) {
    let started = false;
    const load = src => new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.append(s); });
    const startPhysics = async () => {
      try { await load('/js/vendor/matter.min.js'); } catch { return; }
      const { Engine, Bodies, Body, Composite, Constraint } = window.Matter;
      const pills = $$('.pill', field);
      let engine, items = [], running = false, W = 0, H = 0, drag = null;

      const build = () => {
        if (engine) Composite.clear(engine.world, false);
        field.classList.add('physics-on');
        W = field.clientWidth; H = field.clientHeight;
        engine = Engine.create({ gravity: { y: 1.05 } });
        const t = 80;
        Composite.add(engine.world, [
          Bodies.rectangle(W / 2, H + t / 2, W * 3, t, { isStatic: true }),
          Bodies.rectangle(-t / 2, H / 2, t, H * 6, { isStatic: true }),
          Bodies.rectangle(W + t / 2, H / 2, t, H * 6, { isStatic: true })
        ]);
        items = pills.map((el, i) => {
          const w = el.offsetWidth, h = el.offsetHeight;
          const body = Bodies.rectangle(w / 2 + Math.random() * Math.max(1, W - w), -h - i * 90, w, h, {
            chamfer: { radius: h / 2 }, restitution: .3, friction: .25, frictionAir: .012, angle: (Math.random() - .5) * .8
          });
          Composite.add(engine.world, body);
          return { el, body, w, h };
        });
      };

      const tick = () => {
        if (!running) return;
        Engine.update(engine, 1000 / 60);
        items.forEach(({ el, body, w, h }) => {
          el.style.transform = `translate(${(body.position.x - w / 2).toFixed(1)}px, ${(body.position.y - h / 2).toFixed(1)}px) rotate(${body.angle.toFixed(3)}rad)`;
        });
        requestAnimationFrame(tick);
      };

      // Arrastrar una etiqueta sin bloquear el scroll de la página
      const pt = e => { const r = field.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      field.addEventListener('pointerdown', e => {
        const el = e.target.closest('.pill'); if (!el) return;
        const it = items.find(i => i.el === el); if (!it) return;
        el.setPointerCapture(e.pointerId);
        const p = pt(e);
        const c = Constraint.create({ pointA: p, bodyB: it.body, pointB: { x: p.x - it.body.position.x, y: p.y - it.body.position.y }, stiffness: .22, damping: .12, length: 0 });
        Composite.add(engine.world, c); drag = { c, id: e.pointerId };
      });
      field.addEventListener('pointermove', e => { if (drag && e.pointerId === drag.id) drag.c.pointA = pt(e); });
      const end = e => { if (drag && e.pointerId === drag.id) { Composite.remove(engine.world, drag.c); drag = null; } };
      field.addEventListener('pointerup', end); field.addEventListener('pointercancel', end);

      build();
      const vio = new IntersectionObserver(es => es.forEach(en => {
        const on = en.isIntersecting;
        if (on && !running) { running = true; requestAnimationFrame(tick); }
        if (!on) running = false;
      }), { threshold: 0.05 });
      vio.observe(field);

      let rw = innerWidth;
      addEventListener('resize', () => { if (innerWidth !== rw) { rw = innerWidth; build(); } });
    };

    const pio = new IntersectionObserver(es => { if (!started && es.some(e => e.isIntersecting)) { started = true; pio.disconnect(); startPhysics(); } }, { rootMargin: '0px 0px 300px 0px' });
    pio.observe(field);
  }

  /* ---------- Scroll: barra de progreso, encabezado y parallax ---------- */
  const header = $('.site-header');
  const bar = $('.progress i');
  const parallax = new Set();
  let ticking = false;

  const frame = () => {
    ticking = false;
    const y = window.scrollY, max = document.documentElement.scrollHeight - innerHeight;
    if (bar) bar.style.setProperty('--p', max > 0 ? (y / max).toFixed(4) : 0);
    header.classList.toggle('is-scrolled', y > 40);
    if (!reduce) {
      updateCards(); updateExpand(); updateScrub();
      parallax.forEach(mask => {
        const img = mask.firstElementChild, r = mask.getBoundingClientRect();
        const off = (r.top + r.height / 2 - innerHeight / 2) * -0.07;
        img.style.setProperty('--py', `${Math.max(-40, Math.min(40, off)).toFixed(1)}px`);
      });
    }
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  frame();

  if ('IntersectionObserver' in window) {
    const pio = new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? parallax.add(e.target) : parallax.delete(e.target)), { rootMargin: '20% 0px' });
    $$('[data-parallax]').forEach(el => pio.observe(el));
  }

  /* ---------- Sección actual (barra inferior) ---------- */
  const dock = $('.dock'), current = $('[data-current]');
  if ('IntersectionObserver' in window && dock) {
    const sio = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { current.textContent = e.target.dataset.section; dock.dataset.at = e.target.id; }
    }), { rootMargin: '-45% 0px -50% 0px' });
    $$('[data-section]').forEach(el => sio.observe(el));
  }

  /* ---------- Menú desplegable (hoja inferior) ---------- */
  const sheet = $('#sheet'), openBtn = $('.dock__menu');
  if (sheet && openBtn && typeof sheet.showModal === 'function') {
    let closing = false;
    const openSheet = () => {
      sheet.showModal(); html.classList.add('no-scroll'); openBtn.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('is-open')));
    };
    const closeSheet = (after) => {
      if (closing || !sheet.open) return;
      closing = true; sheet.classList.remove('is-open');
      setTimeout(() => { sheet.close(); closing = false; html.classList.remove('no-scroll'); openBtn.setAttribute('aria-expanded', 'false'); after && after(); }, reduce ? 0 : 380);
    };
    openBtn.addEventListener('click', openSheet);
    $('[data-sheet-close]', sheet).addEventListener('click', () => closeSheet());
    sheet.addEventListener('cancel', e => { e.preventDefault(); closeSheet(); });
    sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });
    // Enlaces de la hoja: a otra página → navegar; a un ancla de esta página → cerrar y desplazar
    $$('a[href]', sheet).forEach(a => a.addEventListener('click', e => {
      const u = new URL(a.href, location.href);
      if (a.dataset.lang || u.pathname !== location.pathname || !u.hash) return;
      e.preventDefault();
      const target = document.getElementById(u.hash.slice(1));
      closeSheet(() => { if (target) { target.scrollIntoView({ behavior }); history.replaceState(null, '', u.hash); } });
    }));
    desktop.addEventListener('change', () => { if (sheet.open) { sheet.close(); sheet.classList.remove('is-open'); html.classList.remove('no-scroll'); } });
  }

  /* ---------- Aparición al desplazar ---------- */
  const countUp = dt => {
    const to = parseFloat(dt.dataset.count), pre = dt.dataset.prefix || '', suf = dt.dataset.suffix || '';
    const dec = (dt.dataset.count.split('.')[1] || '').length;
    const fmt = n => pre + n.toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suf;
    if (reduce) { dt.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = 1400;
    const step = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); dt.textContent = fmt(to * e); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };
  if ('IntersectionObserver' in window && !reduce) {
    html.classList.add('reveal-on');
    const io = new IntersectionObserver(entries => entries.forEach(en => {
      if (!en.isIntersecting) return;
      en.target.classList.add('is-in'); io.unobserve(en.target);
      $$('[data-count]', en.target).forEach(countUp);
    }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    $$('.reveal, [data-split="rise"]').forEach(el => io.observe(el));
  }

  /* ---------- Galería: contador del carrusel y lightbox ---------- */
  const rail = $('[data-gallery]'), items = $$('.g-open');
  const now = $('[data-g-now]');
  if (rail && now) {
    let raf;
    rail.addEventListener('scroll', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const mid = rail.scrollLeft + rail.clientWidth * 0.35;
        const figs = $$('.g-item', rail);
        let idx = 0;
        figs.forEach((f, i) => { if (f.offsetLeft <= mid) idx = i; });
        now.textContent = String(idx + 1).padStart(2, '0');
      });
    }, { passive: true });
  }

  const box = $('.lightbox');
  if (box && items.length && typeof box.showModal === 'function') {
    const img = $('img', box), cap = $('figcaption', box);
    let idx = 0;
    const show = i => {
      idx = (i + items.length) % items.length;
      const btn = items[idx];
      img.src = btn.dataset.full; img.alt = $('img', btn).alt;
      cap.textContent = $('figcaption', btn.closest('figure')).textContent;
    };
    items.forEach((btn, i) => btn.addEventListener('click', () => { show(i); box.showModal(); }));
    $('.lb-close', box).addEventListener('click', () => box.close());
    $('.lb-prev', box).addEventListener('click', () => show(idx - 1));
    $('.lb-next', box).addEventListener('click', () => show(idx + 1));
    box.addEventListener('click', e => { if (e.target === box) box.close(); });
    box.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') show(idx - 1); if (e.key === 'ArrowRight') show(idx + 1); });
    let sx = 0;
    box.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', e => { const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1)); }, { passive: true });
  }

  /* ---------- Asistente IA (burbuja) ----------
     La conversación vive solo en este navegador (sessionStorage) y se envía a la función segura de Supabase.
     Las respuestas se pintan como texto (nunca HTML). */
  const AI = CFG.ai, aiBox = $('#ai');
  if (AI && aiBox && typeof aiBox.showModal === 'function') {
    const log = $('[data-ai-log]', aiBox), formAi = $('[data-ai-form]', aiBox), input = $('#ai-input'), sendBtn = $('.ai__send', aiBox), chips = $('[data-ai-chips]', aiBox);
    const KEY = 'mt_ai_' + (CFG.lang || 'fr');
    let history = [];
    try { history = JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch { history = []; }
    const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(history.slice(-20))); } catch { /* sin almacenamiento */ } };

    const bubble = (role, text, cls = '') => {
      const el = document.createElement('p');
      el.className = `ai__msg ai__msg--${role === 'user' ? 'me' : 'bot'} ${cls}`.trim();
      el.textContent = text; log.append(el); log.scrollTop = log.scrollHeight; return el;
    };
    const ctaLink = () => {
      const a = document.createElement('a'); a.className = 'btn btn--primary ai__cta'; a.href = AI.contact; a.textContent = AI.cta + ' →';
      log.append(a); log.scrollTop = log.scrollHeight;
    };
    const paint = () => {
      log.replaceChildren(); bubble('assistant', AI.intro);
      history.forEach(m => { bubble(m.role, m.content); if (m.cta) ctaLink(); });
      chips.hidden = history.length > 0;
    };

    let busy = false;
    const ask = async (text) => {
      text = text.trim().slice(0, 800);
      if (!text || busy) return;
      busy = true; sendBtn.disabled = true; chips.hidden = true;
      history.push({ role: 'user', content: text }); bubble('user', text); save();
      const wait = bubble('assistant', AI.thinking, 'ai__msg--wait');
      try {
        const res = await fetch(AI.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ lang: CFG.lang, messages: history.slice(-12).map(({ role, content }) => ({ role, content })) }) });
        const data = await res.json().catch(() => ({}));
        wait.remove();
        if (!res.ok || !data.ok) { bubble('assistant', res.status === 429 ? AI.limit : AI.error); if (res.status === 429 || res.status >= 500) ctaLink(); return; }
        history.push({ role: 'assistant', content: data.reply, cta: !!data.cta }); save();
        bubble('assistant', data.reply); if (data.cta) ctaLink();
      } catch {
        wait.remove(); bubble('assistant', AI.error); ctaLink();
      } finally { busy = false; sendBtn.disabled = false; input.focus(); }
    };

    const openAi = () => { paint(); aiBox.showModal(); html.classList.add('no-scroll'); setTimeout(() => input.focus(), 50); };
    const closeAi = () => { aiBox.close(); html.classList.remove('no-scroll'); };
    $('[data-ai-open]').addEventListener('click', openAi);
    $('[data-ai-close]', aiBox).addEventListener('click', closeAi);
    aiBox.addEventListener('cancel', e => { e.preventDefault(); closeAi(); });
    aiBox.addEventListener('click', e => { if (e.target === aiBox) closeAi(); });
    $$('.ai__chip', aiBox).forEach(c => c.addEventListener('click', () => ask(c.textContent)));
    formAi.addEventListener('submit', e => { e.preventDefault(); const v = input.value; input.value = ''; input.style.height = ''; ask(v); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); formAi.requestSubmit(); } });
    input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; });
  }

  /* ---------- Llegar desde un submenú (/fr/secteurs/#secteur-…): ir a la sección cuando la página ya se armó ---------- */
  if (location.hash.length > 1) {
    const go = () => { const t = document.getElementById(decodeURIComponent(location.hash.slice(1))); if (t) window.scrollTo({ top: t.getBoundingClientRect().top + scrollY - (parseFloat(getComputedStyle(t).scrollMarginTop) || 0), behavior: 'instant' }); };
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    addEventListener('load', () => { setTimeout(go, 60); setTimeout(go, 450); }, { once: true });
  }

  /* ---------- Formulario ---------- */
  const form = $('#form-evento');
  if (!form) return;
  const alertBox = $('[data-form-alert]'), statusEl = $('[data-form-status]'), submitBtn = $('[data-submit]'), successBox = $('[data-form-success]');
  const f = name => form.elements[name];

  const validators = {
    nombre: v => v.trim().length >= 2 || T.name,
    contacto: v => {
      v = v.trim();
      if (!v) return T.contactEmpty;
      if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return true;
      const d = digits(v);
      if (/^[+\d\s().-]+$/.test(v) && d.length >= 8 && d.length <= 15) return true;
      return T.contactBad;
    },
    tipo: v => v !== '' || T.type,
    mensaje: v => v.trim().length >= 10 || T.message,
    consentement: () => f('consentement').checked || T.consent
  };

  const showError = (name, msg) => {
    const input = f(name), err = $(`#err-${name}`);
    if (!err) return;
    const base = (input.getAttribute('aria-describedby') || '').split(' ').filter(id => id && id !== err.id);
    if (msg) {
      err.textContent = msg; err.hidden = false;
      input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', [...base, err.id].join(' '));
    } else {
      err.hidden = true; err.textContent = ''; input.removeAttribute('aria-invalid');
      base.length ? input.setAttribute('aria-describedby', base.join(' ')) : input.removeAttribute('aria-describedby');
    }
  };
  const check = name => { const r = validators[name](f(name).value); showError(name, r === true ? '' : r); return r === true; };
  const checkAll = () => Object.keys(validators).map(check).every(Boolean);

  let attempted = false;
  Object.keys(validators).forEach(name => {
    const el = f(name);
    el.addEventListener('blur', () => { if (attempted || el.value !== '') check(name); });
    el.addEventListener('input', () => { if (el.getAttribute('aria-invalid') === 'true') check(name); });
    el.addEventListener('change', () => { if (attempted) check(name); });
  });

  const setStatus = (msg, state = '') => { statusEl.textContent = msg; statusEl.dataset.state = state; };
  // ?s=<servicio> (desde las tarjetas de Services) preselecciona el interés
  const pre = new URLSearchParams(location.search).get('s');
  if (pre && [...f('servicio').options].some(o => o.value === pre)) f('servicio').value = pre;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (f('_gotcha').value) return;
    attempted = true; setStatus(''); alertBox.hidden = true;

    if (!checkAll()) {
      const bad = Object.keys(validators).filter(n => f(n).getAttribute('aria-invalid') === 'true');
      alertBox.textContent = bad.length === 1 ? T.alertOne : (T.alertMany || '').replace('{n}', bad.length);
      alertBox.hidden = false; f(bad[0]).focus(); return;
    }

    const endpoint = CFG.form?.endpoint;
    if (!endpoint) {
      console.warn('[site] Formulario sin destino: define el destino del formulario en el panel (Ajustes).');
      setStatus(T.noEndpoint + (CFG.hasDirect ? T.noEndpointDirect : ''), 'error');
      return;
    }

    const data = Object.fromEntries(new FormData(form).entries());
    delete data._gotcha; data.consentement = f('consentement').checked; data.politique = CFG.policy || ''; data.origen = location.href; data.lang = CFG.lang || 'fr';

    submitBtn.disabled = true;
    const label = submitBtn.textContent; submitBtn.textContent = T.sending;
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      form.hidden = true; successBox.hidden = false; $('[data-success-title]').focus();
      successBox.scrollIntoView({ block: 'center', behavior });
    } catch (err) {
      console.error('[site] Error al enviar el formulario:', err);
      setStatus(T.sendError, 'error');
    } finally { submitBtn.disabled = false; submitBtn.textContent = label; }
  });

  $('[data-reset]').addEventListener('click', () => {
    form.reset(); attempted = false;
    Object.keys(validators).forEach(n => showError(n, ''));
    successBox.hidden = true; form.hidden = false; setStatus(''); f('nombre').focus();
  });
})();
