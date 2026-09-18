/* ==========================================================================
   THE ROYALS — auth.js
   Guest accounts, backed by Supabase.

   ------------------------------------------------------------------------
   THE CONNECTION
   Project: atzkuodhsooszjavlqgw (ap-northeast-2)
   Dashboard -> Project Settings -> API is where both values below come from.

   The publishable key is meant to be public and is safe in client-side code
   and safe in this repository. It is not a secret, and it grants only what
   Row Level Security allows. The secret key (sb_secret_...) is the dangerous
   one: it must never appear in a file the browser can read.

   There is no build step on this site, so nothing would substitute an
   environment variable at deploy time. The values live here, in the file the
   browser loads, which is where a publishable key belongs.

   ------------------------------------------------------------------------
   EMAIL CONFIRMATION
   The project has confirmation switched ON, so a new guest gets a link by
   email before the account works. Supabase's built-in mail service only
   delivers to your own team's addresses and is capped at a few an hour, so a
   real SMTP provider is needed before guests can sign up for real.

   This file does not care which way that setting goes. If a sign-up comes
   back with a session the guest is signed straight in; if it comes back
   without one, they are told to check their inbox. Flipping the setting in
   the dashboard changes the behaviour here with no edit.
   ========================================================================== */
(function () {
  'use strict';

  var SUPABASE = {
    url: 'https://atzkuodhsooszjavlqgw.supabase.co',
    anonKey: 'sb_publishable_D5Dxssbqx-1c_BVEWWSGLA_zFYEGtrD'
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

  function clearNotes() {
    $$('.form-note', root).forEach(function (n) { n.classList.remove('is-shown'); });
  }

  /* The submit buttons carry an arrow <svg> beside their label, so the busy
     state swaps the whole of the button's markup and puts the original back
     afterwards. Writing to textContent would delete the icon for good. */
  function busy(form, state) {
    var btn = $('[type="submit"]', form);
    if (!btn) return;
    if (state) {
      if (btn.getAttribute('data-label') === null) btn.setAttribute('data-label', btn.innerHTML);
      btn.innerHTML = btn.getAttribute('data-busy') || 'Working…';
    } else if (btn.getAttribute('data-label') !== null) {
      btn.innerHTML = btn.getAttribute('data-label');
    }
    btn.disabled = state;
    btn.classList.toggle('is-busy', state);
  }

  function showPanel(name) {
    $$('[data-auth-panel]', root).forEach(function (p) {
      p.hidden = p.getAttribute('data-auth-panel') !== name;
    });
  }

  /* Supabase phrases a few failures for developers rather than for guests. */
  function humanise(message) {
    var m = String(message || '');
    if (/invalid login credentials/i.test(m)) return 'That email and password do not match an account.';
    if (/email not confirmed/i.test(m)) return 'Please confirm your email address first — check your inbox for the link.';
    if (/user already registered|already been registered/i.test(m)) return 'There is already an account with that email. Try signing in instead.';
    if (/rate limit|too many requests/i.test(m)) return 'Too many attempts just now. Please wait a minute and try again.';
    if (/failed to fetch|network/i.test(m)) return 'We could not reach the server. Check your connection and try again.';
    /* When the mail server refuses, the account is not created and the guest
       can do nothing about it. Give them the door that always works. */
    if (/error sending|sending .*email|smtp/i.test(m)) {
      return 'We could not send your confirmation email just now. Please try again shortly — ' +
             'or message us on <a href="/whatsapp" style="color:var(--gold)">WhatsApp</a> ' +
             'and we will arrange your table directly.';
    }
    return m;
  }

  /* ---------- sign in / create account tabs ---------- */
  /* Wired before anything asynchronous, so the tabs work while the SDK loads. */
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
      clearNotes();
    });
  });

  /* ---------- not connected yet ---------- */
  if (!configured) {
    $$('input, button', root).forEach(function (el) {
      if (!el.hasAttribute('data-auth-tab')) el.disabled = true;
    });
    note('err',
      '<strong>Accounts are not connected yet.</strong><br>' +
      'The sign-in and sign-up forms are in place and will work as soon as the ' +
      'Supabase project URL and publishable key are added to <code>assets/js/auth.js</code>.');
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

    var meta = user.user_metadata || {};
    var name = $('[data-auth-name]', root);
    if (name) name.textContent = meta.full_name || 'Welcome back';

    $$('[data-auth-email]', root).forEach(function (el) {
      el.textContent = user.email || '';
    });

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

    /* A guest coming back from a confirmation link arrives carrying
       credentials in the URL: tokens in the fragment on the implicit flow, or
       a ?code= on PKCE. Either way the SDK reads them while it initialises,
       and that is asynchronous — so the address bar is tidied only once a
       session exists. Stripping it any sooner would take the credentials away
       before the SDK had read them, and the guest would land signed out. */
    var arrivedWithCredentials =
      /(access_token|refresh_token)=/.test(window.location.hash) ||
      /[?&]code=/.test(window.location.search);

    function tidyUrl() {
      var search = window.location.search
        .replace(/([?&])code=[^&]*/, '$1')
        .replace(/[?&]$/, '');
      history.replaceState(null, '', window.location.pathname + search);
    }

    /* An expired or already-used link comes back as an error instead, in the
       fragment or the query depending on the flow. */
    function reportLinkError() {
      var src = window.location.hash + '&' + window.location.search;
      var m = /error_description=([^&]+)/.exec(src);
      if (!m) return;
      note('err', humanise(decodeURIComponent(m[1].replace(/\+/g, ' '))));
      tidyUrl();
    }

    client.auth.getSession().then(function (res) {
      var session = res && res.data && res.data.session;
      if (session && session.user) {
        renderSignedIn(session.user);
        if (arrivedWithCredentials) tidyUrl();
      } else {
        renderSignedOut();
        reportLinkError();
      }
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

      if (!email || !password) return note('err', 'Please enter your email address and password.');

      clearNotes();
      busy(form, true);

      client.auth.signInWithPassword({ email: email, password: password })
        .then(function (res) {
          busy(form, false);
          if (res.error) return note('err', humanise(res.error.message));
          /* onAuthStateChange swaps in the signed-in panel; clearing the form
             keeps the password out of the DOM behind it. */
          form.reset();
          clearNotes();
        })
        .catch(function (err) { busy(form, false); note('err', humanise(err.message)); });
    });

    /* ---------- create account ---------- */
    on($('#signup-form', root), 'submit', function (e) {
      e.preventDefault();
      var form = e.target;
      var name = $('#su-name', form).value.trim();
      var email = $('#su-email', form).value.trim();
      var password = $('#su-password', form).value;

      if (!name) return note('err', 'Please tell us your name.');
      if (!email) return note('err', 'Please enter your email address.');
      if (password.length < 8) return note('err', 'Please choose a password of at least 8 characters.');

      clearNotes();
      busy(form, true);

      client.auth.signUp({
        email: email,
        password: password,
        options: {
          data: { full_name: name },
          emailRedirectTo: window.location.origin + '/account'
        }
      })
        .then(function (res) {
          busy(form, false);
          if (res.error) return note('err', humanise(res.error.message));

          form.reset();

          /* Supabase returns a session when confirmation is switched off, and
             none when a guest still has to click a link. Both are a success;
             they just need different words. */
          if (res.data && res.data.session) return clearNotes();

          note('ok',
            '<strong>Account created.</strong><br>' +
            'Check your inbox for a confirmation link, then sign in.');
        })
        .catch(function (err) { busy(form, false); note('err', humanise(err.message)); });
    });

    /* ---------- sign out ---------- */
    on($('[data-auth-signout]', root), 'click', function (e) {
      var btn = e.currentTarget;
      btn.disabled = true;
      client.auth.signOut().then(function () {
        btn.disabled = false;
        clearNotes();
        renderSignedOut();
      });
    });
  }).catch(function (err) {
    note('err', 'Accounts are unavailable right now. ' + humanise(err.message));
  });
})();
