
/* ===== verbatim legacy: guestbook + admin ===== */

      var gbFont  = 'VT323';
      var gbColor = '#ffd700';
      var gbRating = 5;

      // Font buttons
      document.querySelectorAll('.gb-font-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          document.querySelectorAll('.gb-font-btn').forEach(function(b){ b.classList.remove('active'); });
          btn.classList.add('active');
          gbFont = btn.dataset.font;
        });
      });

      // Color buttons
      document.querySelectorAll('.gb-color-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          document.querySelectorAll('.gb-color-btn').forEach(function(b){ b.classList.remove('active'); });
          btn.classList.add('active');
          gbColor = btn.dataset.color;
        });
      });

      // Star rating
      var stars = document.querySelectorAll('.gb-star');
      stars.forEach(function(star) {
        star.addEventListener('click', function() {
          gbRating = parseInt(star.dataset.val);
          stars.forEach(function(s) {
            s.classList.toggle('active', parseInt(s.dataset.val) <= gbRating);
          });
        });
      });

      // Char counter
      document.getElementById('gb-msg').addEventListener('input', function() {
        document.getElementById('gb-charcount').textContent = this.value.length + ' / 400';
      });

      function relTime(ts) {
        var diff = Math.floor((Date.now() - ts) / 1000);
        if (diff < 60)  return 'just now';
        if (diff < 3600) return Math.floor(diff/60) + 'm ago';
        if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
        return Math.floor(diff/86400) + 'd ago';
      }

      function renderEntry(e) {
        var stars = '';
        for (var i = 0; i < 5; i++) stars += i < e.rating ? '★' : '☆';
        var fontStack = e.font === 'VT323' ? "'VT323',monospace"
          : e.font === 'Cinzel' ? "'Cinzel',serif"
          : e.font === 'UnifrakturMaguntia' ? "'UnifrakturMaguntia',cursive"
          : e.font === 'Orbitron' ? "'Orbitron',sans-serif"
          : "'Press Start 2P',monospace";
        var div = document.createElement('div');
        div.className = 'gb-entry';
        div.innerHTML =
          '<div class="gb-entry-stars">' + stars + '</div>' +
          '<div class="gb-entry-msg" style="font-family:' + fontStack + ';color:' + e.color + '">' +
            e.message.replace(/</g,'&lt;').replace(/>/g,'&gt;') +
          '</div>' +
          '<div class="gb-entry-meta">' + e.name.replace(/</g,'&lt;') + ' &nbsp;&middot;&nbsp; ' + relTime(e.ts) + '</div>';
        return div;
      }

      function gbLoad() {
        var profileP = fetch('/api/admin?action=profile')
          .then(function(r){ return r.ok ? r.json() : null; })
          .catch(function(){ return null; });
        var entriesP = fetch('/api/guestbook')
          .then(function(r){ return r.json(); })
          .catch(function(){ return []; });

        Promise.all([profileP, entriesP]).then(function(res) {
          var profile = res[0];
          var entries = res[1];
          var el = document.getElementById('gb-entries');
          var countEl = document.getElementById('gb-count');
          el.innerHTML = '';

          // Host card if profile has content
          if (profile && (profile.pinned || profile.bio || profile.name)) {
            var hostCard = document.createElement('div');
            hostCard.className = 'gb-host-card';
            var h = '<div class="gb-host-badge">HOST</div>';
            if (profile.name) h += '<div class="gb-host-name">' + profile.name.replace(/</g,'&lt;') + '</div>';
            if (profile.bio)  h += '<div class="gb-host-bio">'  + profile.bio.replace(/</g,'&lt;').replace(/\n/g,'<br>') + '</div>';
            if (profile.pinned) h += '<div class="gb-host-pinned">&ldquo;' + profile.pinned.replace(/</g,'&lt;').replace(/\n/g,'<br>') + '&rdquo;</div>';
            hostCard.innerHTML = h;
            el.appendChild(hostCard);
          }

          if (countEl) countEl.textContent = entries.length ? entries.length + ' comment' + (entries.length !== 1 ? 's' : '') : '';

          if (!entries.length) {
            var empty = document.createElement('p');
            empty.style.cssText = 'color:rgba(255,255,255,.3);text-align:center;letter-spacing:.15em;padding:20px 0';
            empty.textContent = 'BE THE FIRST TO SIGN.';
            el.appendChild(empty);
            return;
          }
          entries.forEach(function(e){ el.appendChild(renderEntry(e)); });
        });
      }

      function gbSubmit() {
        var name = document.getElementById('gb-name').value.trim();
        var msg  = document.getElementById('gb-msg').value.trim();
        if (!name || !msg) { alert('Name and message required.'); return; }
        var btn = document.getElementById('gb-submit');
        btn.textContent = 'SIGNING...';
        btn.disabled = true;
        fetch('/api/guestbook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name, message: msg, font: gbFont, color: gbColor, rating: gbRating })
        })
        .then(function(r){ return r.json(); })
        .then(function(d) {
          if (d.ok) {
            document.getElementById('gb-name').value = '';
            document.getElementById('gb-msg').value  = '';
            document.getElementById('gb-charcount').textContent = '0 / 400';
            document.getElementById('gb-msg-status').style.display = 'block';
            setTimeout(function(){ document.getElementById('gb-msg-status').style.display = 'none'; }, 3000);
            gbLoad();
          } else {
            alert(d.error || 'Something went wrong.');
          }
        })
        .catch(function(){ alert('Failed to submit. Try again.'); })
        .finally(function(){ btn.textContent = 'SIGN IT →'; btn.disabled = false; });
      }

      // Load on page ready
      document.addEventListener('DOMContentLoaded', gbLoad);

      // ── ADMIN PANEL ──────────────────────────────────
      var ADMIN_SESS_KEY = 'stsola_admin_tok';

      function adminToggle() {
        var overlay = document.getElementById('admin-overlay');
        if (overlay.classList.contains('open')) {
          overlay.classList.remove('open');
          document.getElementById('tip-bar').style.display = 'flex';
        } else {
          overlay.classList.add('open');
          document.getElementById('tip-bar').style.display = 'none';
          var tok = sessionStorage.getItem(ADMIN_SESS_KEY);
          if (tok) {
            document.getElementById('admin-login').style.display = 'none';
            document.getElementById('admin-dashboard').style.display = 'flex';
            adminLoadProfile();
            adminLoadTips();
            adminLoadComments();
          } else {
            document.getElementById('admin-login').style.display = 'flex';
            document.getElementById('admin-dashboard').style.display = 'none';
          }
        }
      }

      function adminClose() {
        document.getElementById('admin-overlay').classList.remove('open');
        document.getElementById('tip-bar').style.display = 'flex';
      }

      function adminLogin() {
        var code = document.getElementById('admin-code-input').value.trim();
        if (!code) return;
        // Validate by calling a protected endpoint
        fetch('/api/admin', { headers: { 'Authorization': 'Bearer ' + code } })
          .then(function(r) {
            if (r.status === 401) {
              document.getElementById('admin-login-err').style.display = 'block';
              return null;
            }
            return r.json();
          })
          .then(function(data) {
            if (!data) return;
            document.getElementById('admin-login-err').style.display = 'none';
            sessionStorage.setItem(ADMIN_SESS_KEY, code);
            document.getElementById('admin-login').style.display = 'none';
            document.getElementById('admin-dashboard').style.display = 'flex';
            adminRenderComments(data);
            adminLoadProfile();
          })
          .catch(function() {
            document.getElementById('admin-login-err').style.display = 'block';
          });
      }

      function adminLogout() {
        sessionStorage.removeItem(ADMIN_SESS_KEY);
        document.getElementById('admin-dashboard').style.display = 'none';
        document.getElementById('admin-login').style.display = 'flex';
        document.getElementById('admin-code-input').value = '';
      }

      function adminLoadProfile() {
        var tok = sessionStorage.getItem(ADMIN_SESS_KEY);
        fetch('/api/admin?action=profile', { headers: { 'Authorization': 'Bearer ' + tok } })
          .then(function(r){ return r.json(); })
          .then(function(p) {
            document.getElementById('admin-profile-name').value   = p.name   || '';
            document.getElementById('admin-profile-bio').value    = p.bio    || '';
            document.getElementById('admin-profile-pinned').value = p.pinned || '';
          })
          .catch(function(){});
      }

      function adminLoadComments() {
        var tok = sessionStorage.getItem(ADMIN_SESS_KEY);
        fetch('/api/admin', { headers: { 'Authorization': 'Bearer ' + tok } })
          .then(function(r){ return r.json(); })
          .then(adminRenderComments)
          .catch(function(){
            document.getElementById('admin-comments-list').innerHTML =
              '<p style="color:#ff3a00;font-size:.9rem">Failed to load comments.</p>';
          });
      }

      function adminRenderComments(entries) {
        var list = document.getElementById('admin-comments-list');
        document.getElementById('admin-comment-count').textContent = entries.length;
        list.innerHTML = '';
        if (!entries.length) {
          list.innerHTML = '<p style="color:rgba(255,255,255,.3);letter-spacing:.1em;font-size:.9rem">No comments yet.</p>';
          return;
        }
        entries.forEach(function(e) {
          var stars = '';
          for (var i = 0; i < 5; i++) stars += i < e.rating ? '★' : '☆';
          var date = new Date(e.ts).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
          var row = document.createElement('div');
          row.className = 'admin-comment-row';
          row.dataset.key = e._key;
          row.innerHTML =
            '<div class="admin-comment-body">' +
              '<div class="admin-comment-name">' + e.name.replace(/</g,'&lt;') +
                ' &nbsp;<span style="color:#ffd700;font-size:.8rem">' + stars + '</span></div>' +
              '<div class="admin-comment-msg">' + e.message.replace(/</g,'&lt;').replace(/\n/g,'<br>') + '</div>' +
              '<div class="admin-comment-meta">' + date + '</div>' +
            '</div>' +
            '<button class="admin-delete-btn" onclick="adminDelete(this)">DEL</button>';
          list.appendChild(row);
        });
      }

      function adminDelete(btn) {
        var row = btn.closest('.admin-comment-row');
        var key = row.dataset.key;
        if (!confirm('Delete this comment?')) return;
        var tok = sessionStorage.getItem(ADMIN_SESS_KEY);
        fetch('/api/admin?key=' + encodeURIComponent(key), {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + tok }
        }).then(function(r){ return r.json(); })
          .then(function(d) {
            if (d.ok) {
              row.remove();
              var cnt = parseInt(document.getElementById('admin-comment-count').textContent) - 1;
              document.getElementById('admin-comment-count').textContent = cnt;
              gbLoad(); // refresh public view
            }
          })
          .catch(function(){});
      }

      function adminLoadTips() {
        var tok = sessionStorage.getItem(ADMIN_SESS_KEY);
        fetch('/api/admin?action=tips', { headers: { 'Authorization': 'Bearer ' + tok } })
          .then(function(r){ return r.json(); })
          .then(function(d) {
            document.getElementById('admin-tip-sol').value = d.sol || '';
            document.getElementById('admin-tip-eth').value = d.eth || '';
          })
          .catch(function(){});
      }

      function adminSaveTips() {
        var tok = sessionStorage.getItem(ADMIN_SESS_KEY);
        var tips = {
          sol: document.getElementById('admin-tip-sol').value.trim(),
          eth: document.getElementById('admin-tip-eth').value.trim(),
        };
        fetch('/api/admin?action=tips', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' },
          body: JSON.stringify(tips)
        }).then(function(r){ return r.json(); })
          .then(function(d) {
            if (d.ok) {
              // Update live tip modal addresses without reload
              if (tips.sol) TIP_ADDRS.sol.addr = tips.sol;
              if (tips.eth) TIP_ADDRS.eth.addr = tips.eth;
              var s = document.getElementById('admin-tips-status');
              s.style.display = 'block';
              setTimeout(function(){ s.style.display = 'none'; }, 2500);
            }
          })
          .catch(function(){});
      }

      function adminSaveProfile() {
        var tok = sessionStorage.getItem(ADMIN_SESS_KEY);
        var profile = {
          name:   document.getElementById('admin-profile-name').value.trim(),
          bio:    document.getElementById('admin-profile-bio').value.trim(),
          pinned: document.getElementById('admin-profile-pinned').value.trim(),
        };
        fetch('/api/admin?action=profile', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' },
          body: JSON.stringify(profile)
        }).then(function(r){ return r.json(); })
          .then(function(d) {
            if (d.ok) {
              var s = document.getElementById('admin-profile-status');
              s.style.display = 'block';
              setTimeout(function(){ s.style.display = 'none'; }, 2500);
              gbLoad(); // refresh public guestbook with new profile
            }
          })
          .catch(function(){});
      }

      // Enter key on login input
      document.getElementById('admin-code-input').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') adminLogin();
      });
    
/* ===== verbatim legacy: tips ===== */

    var TIP_ADDRS = {
      sol: { addr: '3Cj7KhrmVg1tRBHyLhwGAW8Cr4xyosFzxPDhVDk98XVL', label: 'SOL ADDRESS', color: '#14f195' },
      eth: { addr: '0x90677f29D8026E60E03A1597FE228F15fCc79D69',    label: 'ETH ADDRESS', color: '#a8b4f8' }
    };

    // Load tip addresses from KV (overrides hardcoded defaults if set)
    fetch('/api/admin?action=tips')
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.sol) TIP_ADDRS.sol.addr = d.sol;
        if (d.eth) TIP_ADDRS.eth.addr = d.eth;
      })
      .catch(function() {});

    function tipCopy(chain) {
      var t = TIP_ADDRS[chain];
      document.getElementById('tip-modal-title').textContent = 'TIP WITH ' + chain.toUpperCase();
      document.getElementById('tip-modal-title').style.color = t.color;
      document.getElementById('tip-modal-addr').textContent  = t.addr;
      var btn = document.getElementById('tip-modal-copy');
      btn.style.background = t.color;
      btn.style.color = '#000';
      btn.textContent = 'COPY ADDRESS';
      btn.dataset.chain = chain;
      document.getElementById('tip-modal').classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    function tipModalCopy() {
      var btn   = document.getElementById('tip-modal-copy');
      var chain = btn.dataset.chain;
      var addr  = TIP_ADDRS[chain].addr;
      // Try clipboard API first, fallback to select+copy
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(addr).catch(function() { tipFallbackCopy(addr); });
      } else {
        tipFallbackCopy(addr);
      }
      btn.textContent = 'COPIED ✓';
      setTimeout(function() { btn.textContent = 'COPY ADDRESS'; }, 2000);
    }

    function tipFallbackCopy(text) {
      var el = document.getElementById('tip-modal-addr');
      var range = document.createRange();
      range.selectNodeContents(el);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      try { document.execCommand('copy'); } catch(e) {}
      sel.removeAllRanges();
    }

    function tipModalClose() {
      document.getElementById('tip-modal').classList.remove('open');
      document.body.style.overflow = '';
    }

    // Close on Escape
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') tipModalClose();
    });
  
/* ===== verbatim legacy: glitch + visits ===== */
// ────────────────────────────────────────────────
    // 2. GLITCH TEXT HOVER
    // ────────────────────────────────────────────────
    var GLITCH_CHARS = '!<>-_\/[]{}=+*^?#░▒▓|@$%&~';

    function glitchElement(el) {
      if (el._glitching) return;
      el._glitching = true;
      var orig = el.dataset.origText || el.textContent;
      el.dataset.origText = orig;
      var chars = orig.split('');
      var iters = 0;
      var maxIter = orig.length * 1.5;

      var interval = setInterval(function() {
        var scrambled = chars.map(function(ch, idx) {
          if (ch === ' ') return ' ';
          if (idx < Math.floor(iters * 0.7)) return orig[idx];
          return GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
        }).join('');
        el.textContent = scrambled;
        iters++;
        if (iters >= maxIter) {
          clearInterval(interval);
          el.textContent = orig;
          el._glitching = false;
        }
      }, 28);
    }

    document.querySelectorAll('.section-title, .card-name, .homie-name, .amb-name').forEach(function(el) {
      el.addEventListener('mouseenter', function() { glitchElement(el); });
    });


    // ────────────────────────────────────────────────
    // 3. VISITOR COUNTER (part of guestbook)
    // ────────────────────────────────────────────────
    function formatCount(n) {
      return n.toLocaleString('en-US');
    }

    // Animated count-up
    function countUp(el, target) {
      var start = Math.max(0, target - Math.min(target, 60));
      var current = start;
      var step = Math.max(1, Math.ceil((target - start) / 40));
      var interval = setInterval(function() {
        current = Math.min(current + step, target);
        el.textContent = formatCount(current) + ' SAINTS CAME THROUGH';
        if (current >= target) clearInterval(interval);
      }, 28);
    }

    fetch('/api/visits', { method: 'POST' })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        var el = document.getElementById('visit-counter');
        if (el && d.count) countUp(el, d.count);
      })
      .catch(function() {
        // silently fail — counter is a nice-to-have
      });
  
/* ===== verbatim legacy: FCKOFF radio, $COLORS, Flux ===== */

    // ── FCKOFF RADIO ─────────────────────────────────────────
    const STREAMS = [
      'https://streams.90s90s.de/hiphop/mp3-128/',         // 90s90s HipHop — verified 90s rap, no ads
      'https://streams.bigfm.de/bigfm-oldschool-128-mp3',  // bigFM Oldschool — verified 90s rap
      'https://streams.90s90s.de/hiphop/mp3-128/',         // fallback
    ];
    let radioPlaying = false;
    const radioAudio  = document.getElementById('radioAudio');
    const radioStatus = document.getElementById('radioStatus');
    const radioBars   = document.getElementById('radioBars');
    const iconPlay    = document.getElementById('iconPlay');
    const iconStop    = document.getElementById('iconStop');

    let streamIdx = 0;

    function setPlaying(playing) {
      radioPlaying = playing;
      radioStatus.textContent = playing ? 'LIVE' : '90s HIP HOP';
      radioStatus.classList.toggle('live', playing);
      radioBars.classList.toggle('active', playing);
      iconPlay.style.display = playing ? 'none' : 'block';
      iconStop.style.display = playing ? 'block' : 'none';
      // Audio reactive hero — bg character breathes with the music
      const bgChar = document.querySelector('.bg-char');
      if (bgChar) bgChar.classList.toggle('radio-alive', playing);
    }

    function tryStream(idx) {
      if (idx >= STREAMS.length) {
        radioStatus.textContent = 'SIGNAL LOST';
        radioStatus.classList.remove('live');
        radioBars.classList.remove('active');
        iconPlay.style.display = 'block';
        iconStop.style.display = 'none';
        return;
      }
      radioAudio.src = STREAMS[idx];
      radioAudio.play()
        .then(() => { streamIdx = idx; setPlaying(true); })
        .catch(() => tryStream(idx + 1));
    }

    function toggleRadio() {
      if (radioPlaying) {
        radioAudio.pause();
        radioAudio.src = '';
        setPlaying(false);
      } else {
        radioStatus.textContent = 'LOADING...';
        tryStream(0);
      }
    }

    radioAudio.addEventListener('error', () => {
      if (radioPlaying) {
        setPlaying(false);
        tryStream(streamIdx + 1);
      }
    });

    // ── VOLUME SLIDER ──
    const radioVol  = document.getElementById('radioVol');
    const volIcon   = document.getElementById('volIcon');

    // Sync track fill CSS var
    function syncVolTrack(val) {
      radioVol.style.setProperty('--vol-pct', val + '%');
    }
    syncVolTrack(80);
    radioAudio.volume = 0.8;

    radioVol.addEventListener('input', function() {
      const v = parseInt(this.value);
      radioAudio.volume = v / 100;
      syncVolTrack(v);
      // Swap icon: muted vs normal
      volIcon.innerHTML = v === 0
        ? '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>'
        : v < 50
        ? '<path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>'
        : '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
    });

    // ── $COLORS COPY CA ───────────────────────
    var COLORS_CA = 'DCmeU6DAdNqMNamxw4Uw4Zp6rdVwwRcJDDpbPVJCULT';
    function copyColorsCa() {
      navigator.clipboard.writeText(COLORS_CA).then(function() {
        var btn = document.getElementById('colors-copy-btn');
        if (btn) { btn.textContent = 'COPIED!'; setTimeout(function(){ btn.textContent = 'COPY CA'; }, 2000); }
      }).catch(function(){
        var btn = document.getElementById('colors-copy-btn');
        if (btn) btn.textContent = 'COPY CA';
      });
    }

    // ── $COLORS LIVE PRICE ─────────────────────
    (function fetchColorsPrice() {
      var PAIR = '6f8fu4mvvz3js5qnkv1tdnicgscfjcgvlkwqxeuchoty';
      var priceEl  = document.getElementById('colors-price');
      var changeEl = document.getElementById('colors-change');
      var metaEl   = document.getElementById('colors-meta');
      function update() {
        fetch('https://api.dexscreener.com/latest/dex/pairs/solana/' + PAIR)
          .then(function(r){ return r.json(); })
          .then(function(d) {
            var pair = d.pair || (d.pairs && d.pairs[0]);
            if (!pair) return;
            var price = parseFloat(pair.priceUsd);
            var ch24  = parseFloat(pair.priceChange && pair.priceChange.h24);
            var mcap  = pair.marketCap ? '$' + (pair.marketCap/1e6).toFixed(2) + 'M MCAP' : '';
            var vol   = pair.volume && pair.volume.h24 ? 'VOL $' + Math.round(pair.volume.h24).toLocaleString() : '';
            if (priceEl) priceEl.textContent = price < 0.01
              ? '$' + price.toFixed(8)
              : '$' + price.toFixed(6);
            if (changeEl) {
              var sign = ch24 >= 0 ? '+' : '';
              changeEl.textContent = sign + ch24.toFixed(2) + '%';
              changeEl.className = 'colors-change ' + (ch24 >= 0 ? 'up' : 'down');
            }
            if (metaEl) metaEl.textContent = 'SOL · LIVE' + (mcap ? ' · ' + mcap : '') + (vol ? ' · ' + vol : '');
          })
          .catch(function(){})
      }
      update();
      setInterval(update, 30000); // refresh every 30s
    })();

    // ── FLUX REVEAL ───────────────────────────
    function toggleFlux() {
      const detail = document.getElementById('fluxDetail');
      const teaser = document.getElementById('fluxTeaser');
      const btn    = document.getElementById('fluxBtn');
      const open   = detail.style.display === 'none';
      detail.style.display = open ? 'block' : 'none';
      teaser.style.display = open ? 'none'  : 'block';
      btn.textContent      = open ? 'CLOSE ✕' : 'WHAT IS IT? →';
    }

    