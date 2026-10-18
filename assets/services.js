/* St Sola services: Stripe link, crypto pay modal, request form. */
(function () {
  'use strict';
  /* ── CONFIG: St Sola's Stripe Payment Link. This constant is the source of truth: every [data-stripe] button gets this href.
     Set it to '' to turn card payments off (buttons become a disabled "Card payments coming soon"). ── */
  var STRIPE_LINK = 'https://buy.stripe.com/9B628k85aaaBcQ725Y2cg03';

  /* Same addresses as the site's tip buttons; the admin panel's KV override (/api/admin?action=tips) still wins. */
  var ADDR = {
    sol: (window.TIP_ADDRS && TIP_ADDRS.sol && TIP_ADDRS.sol.addr) || '3Cj7KhrmVg1tRBHyLhwGAW8Cr4xyosFzxPDhVDk98XVL',
    eth: (window.TIP_ADDRS && TIP_ADDRS.eth && TIP_ADDRS.eth.addr) || '0x90677f29D8026E60E03A1597FE228F15fCc79D69'
  };
  var CASHAPP = 'https://cash.app/$StSola';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ── Stripe ── */
  function initStripe() {
    $$('[data-stripe]').forEach(function (el) {
      if (STRIPE_LINK) {
        el.setAttribute('href', STRIPE_LINK); el.target = '_blank'; el.rel = 'noopener';
        return;
      }
      var b = document.createElement('button');
      b.type = 'button'; b.className = el.className; b.disabled = true;
      b.setAttribute('aria-disabled', 'true'); b.setAttribute('data-stripe', ''); b.textContent = 'Card payments coming soon';
      el.replaceWith(b);
    });
  }

  /* ── Crypto modal ── */
  var modal, lastFocus;
  function row(key, label, addr, cls) {
    return '<div class="pay-row ' + cls + '"><div class="pay-row-head"><span class="pay-chain">' + label + '</span>' +
      '<button type="button" class="card-link pay-copy" data-copy="' + key + '">COPY</button></div>' +
      '<code class="pay-addr" id="pay-addr-' + key + '">' + addr + '</code></div>';
  }
  function build() {
    modal = document.createElement('div');
    modal.id = 'payModal'; modal.className = 'pay-modal'; modal.hidden = true;
    modal.innerHTML = '<div class="pay-box card" role="dialog" aria-modal="true" aria-labelledby="payTitle">' +
      '<button type="button" class="pay-x" data-pay-close aria-label="Close">✕</button>' +
      '<h3 class="card-name pay-title" id="payTitle">Pay with crypto</h3>' +
      '<p class="card-desc pay-note">Send to one of these addresses. <strong>Put your project name or email in the memo/message</strong> (or DM me the tx link) so I can match the payment to your project.</p>' +
      row('sol', 'SOL · Solana', ADDR.sol, 'pay-sol') + row('eth', 'ETH · Ethereum', ADDR.eth, 'pay-eth') +
      '<div class="pay-row pay-cash"><div class="pay-row-head"><span class="pay-chain">Cash App</span>' +
      '<a class="card-link" href="' + CASHAPP + '" target="_blank" rel="noopener">$StSola →</a></div>' +
      '<span class="pay-hint">Add your project name or email in the note.</span></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal || e.target.closest('[data-pay-close]')) close();
      var c = e.target.closest('[data-copy]'); if (c) copy(c);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modal && !modal.hidden) close(); });
  }
  function open() {
    if (!modal) build();
    lastFocus = document.activeElement; modal.hidden = false;
    requestAnimationFrame(function () { modal.classList.add('open'); });
    var f = $('.pay-copy', modal); if (f) f.focus();
  }
  function close() {
    modal.classList.remove('open'); modal.hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function copy(btn) {
    var addr = $('#pay-addr-' + btn.getAttribute('data-copy')).textContent;
    var done = function () { btn.textContent = 'COPIED ✓'; setTimeout(function () { btn.textContent = 'COPY'; }, 1600); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(addr).then(done, function () { legacy(addr); done(); });
    else { legacy(addr); done(); }
  }
  function legacy(t) { var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); }
  function refreshAddrs() {
    fetch('/api/admin?action=tips').then(function (r) { return r.ok ? r.json() : {}; }).then(function (d) {
      if (d && d.sol) ADDR.sol = d.sol; if (d && d.eth) ADDR.eth = d.eth;
      if (modal) { $('#pay-addr-sol', modal).textContent = ADDR.sol; $('#pay-addr-eth', modal).textContent = ADDR.eth; }
    }).catch(function () {});
  }

  /* ── Request form ── */
  function initForm() {
    var f = $('#svcForm'); if (!f) return;
    var started = Date.now(), status = $('#svcStatus'), btn = $('.svc-submit', f);
    function say(msg, ok) { status.textContent = msg; status.className = 'svc-status ' + (ok ? 'ok' : 'err'); }
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = {
        name: f.name.value.trim(), email: f.email.value.trim(), handle: f.handle.value.trim(),
        services: $$('input[name="services"]:checked', f).map(function (c) { return c.value; }),
        budget: f.budget.value, timeline: f.timeline.value, details: f.details.value.trim(),
        link: f.link.value.trim(), website: f.website.value, t: Date.now() - started
      };
      if (!data.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return say('Drop your name and a real email so I can hit you back.');
      if (!data.services.length) return say('Pick at least one service.');
      if (!data.timeline) return say('Pick a timeline.');
      if (data.details.length < 20) return say('Give me a little more detail (20+ characters).');
      if (data.link && !/^https?:\/\//i.test(data.link)) return say('Links need to start with http:// or https://');
      btn.disabled = true; say('Sending…', true);
      fetch('/api/services', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { s: r.status, j: j }; }); })
        .then(function (res) {
          if (res.s >= 200 && res.s < 300 && res.j.ok) { f.reset(); say("Got it. Your request is in. I'll hit you back at the email you gave.", true); btn.textContent = 'SENT ✓'; return; }
          btn.disabled = false;
          say(res.s === 429 ? 'Slow down, homie. Too many requests. Try again in an hour or email info@stsola.us.' : (res.j.error || 'Something broke. Email info@stsola.us instead.'));
        })
        .catch(function () { btn.disabled = false; say('Network hiccup. Try again or email info@stsola.us.'); });
    });
  }

  function init() {
    initStripe(); initForm();
    $$('[data-pay-crypto]').forEach(function (b) { b.addEventListener('click', open); });
    refreshAddrs();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.stsolaPay = { open: open, STRIPE_LINK: STRIPE_LINK };
})();
