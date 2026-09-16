/* ==========================================================================
   THE ROYALS — auth.js
   Guest accounts, backed by Supabase.

   ------------------------------------------------------------------------
   TO SWITCH THIS ON
   Paste the two values from your Supabase project into SUPABASE below:
     Dashboard -> Project Settings -> API
       url      = "Project URL"
       anonKey  = "anon public" key
   That is the whole configuration. Nothing else needs editing.

   The anon key is meant to be public and is safe in client-side code. It is
   not a secret, and it grants only what your Row Level Security policies
   allow — so set those up before going live. The service_role key is the
   secret one: it must never appear in a file the browser can read.

   While the values are blank the forms stay visible but disabled, with a
   notice saying the account system is not connected yet, rather than
   pretending to work and failing silently.
   ========================================================================== */
(function () {
  'use strict';

  var SUPABASE = {
    url: '',       // e.g. https://xxxxxxxxxxxx.supabase.co
    anonKey: ''    // e.g. eyJhbGciOi...
  };

  var SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';

  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var on = function (el, ev, fn) { if (el) el.addEventListener(ev, fn); };

  var root = $('[data-auth]');
  if (!root) return;

  var configured = !!(SUPABASE.url && SUPABASE.anonKey);
  var client = null;

  /* ---------- small helpers ---------- */
  function note(kind, html) {
    $$('.form-note', root).forEach(function (n) { n.classList.remove('is-shown'); });
    var el = $('.form-note--' + kind, root);
    if (!el) return;
    var body = $('[data-note-body]', el);
    if (body && html) body.innerHTML = html;
    el.classList.add('is-shown');
  }

  function busy(form, state, label) {
    var btn = $('[type="submit"]', form);
    if (!btn) return;
    btn.disabled = state;
    btn.classList.toggle('is-busy', state);
    if (label) btn.textContent = label;
  }

  function showPanel(name) {
    $$('[data-auth-panel]', root).forEach(function (p) {
      p.hidden = p.getAttribute('data-auth-panel') !== name;
    });
  }

  /* ---------- not connected yet ---------- */
  if (!configured) {
    $$('input, button', root).forEach(function (el) {
      if (!el.hasAttribute('data-auth-tab')) el.disabled = true;
    });
    note('err',
      '<strong>Accounts are not connected yet.</strong><br>' +
      'The sign-in and sign-up forms are in place and will work as soon as the ' +
      'Supabase project URL and anon key are added to <code>assets/js/auth.js</code>.');
    return;
  }

  /* ---------- load the SDK, then wire everything ---------- */
  function loadSdk() {
    return new Promise(function (resolve, reject) {
      if (window.supabase && window.supabase.createClient) return resolve();
      var s = document.createElement('script');
      s.src = SDK;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Could not load the Supabase library')); };
      document.head.appendChild(s);
    });
  }

  function renderSignedIn(user) {
    showPanel('account');
    var email = $('[data-auth-email]', root);
    if (email) email.textContent = user.email || '';
    var since = $('[data-auth-since]', root);
    if (since && user.created_at) {
      since.textContent = new Date(user.created_at).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric'
      });
    }
  }

  function renderSignedOut() {
    showPanel('forms');
  }

  loadSdk().then(function () {
    client = window.supabase.createClient(SUPABASE.url, SUPABASE.anonKey);

    client.auth.getSession().then(function (res) {
      var session = res && res.data && res.data.session;
      session && session.user ? renderSignedIn(session.user) : renderSignedOut();
    });

    client.auth.onAuthStateChange(function (_event, session) {
      session && session.user ? renderSignedIn(session.user) : renderSignedOut();
    });

    /* ---------- sign in ---------- */
    on($('#signin-form', root), 'submit', function (e) {
      e.preventDefault();
      var form = e.target;
      var email = $('#si-email', form).value.trim();
      var password = $('#si-password', form).value;
      busy(form, true, 'Signing in…');

      client.auth.signInWithPassword({ email: email, password: password })
        .then(function (res) {
          busy(form, false, 'Sign in');
          if (res.error) return note('err', res.error.message);
          note('ok', '<strong>Welcome back.</strong>');
        })
        .catch(function (err) { busy(form, false, 'Sign in'); note('err', err.message); });
    });

    /* ---------- create account ---------- */
    on($('#signup-form', root), 'submit', function (e) {
      e.preventDefault();
      var form = e.target;
      var name = $('#su-name', form).value.trim();
      var email = $('#su-email', form).value.trim();
      var password = $('#su-password', form).value;

      if (password.length < 8) return note('err', 'Please choose a password of at least 8 characters.');
      busy(form, true, 'Creating…');

      client.auth.signUp({
        email: email,
        password: password,
        options: { data: { full_name: name } }
      })
        .then(function (res) {
          busy(form, false, 'Create account');
          if (res.error) return note('err', res.error.message);
          note('ok',
            '<strong>Account created.</strong><br>' +
            'Check your inbox for a confirmation link, then sign in.');
        })
        .catch(function (err) { busy(form, false, 'Create account'); note('err', err.message); });
    });

    /* ---------- sign out ---------- */
    on($('[data-auth-signout]', root), 'click', function () {
      client.auth.signOut().then(renderSignedOut);
    });
  }).catch(function (err) {
    note('err', 'Accounts are unavailable right now. ' + err.message);
  });

  /* ---------- sign in / create account tabs ---------- */
  $$('[data-auth-tab]', root).forEach(function (btn) {
    on(btn, 'click', function () {
      var key = btn.getAttribute('data-auth-tab');
      $$('[data-auth-tab]', root).forEach(function (b) {
        var active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      $$('[data-auth-form]', root).forEach(function (f) {
        f.hidden = f.getAttribute('data-auth-form') !== key;
      });
    });
  });
})();
