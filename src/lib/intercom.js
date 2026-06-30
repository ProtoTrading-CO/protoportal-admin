/** Intercom Messenger — app ID qk0xorsx (Proto Admin). */

export const INTERCOM_APP_ID = 'qk0xorsx';

let scriptPromise = null;
let hasBooted = false;

function loadIntercomScript() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve) => {
    const w = window;
    const ic = w.Intercom;

    if (typeof ic === 'function') {
      ic('reattach_activator');
      resolve();
      return;
    }

    const d = document;
    const i = function intercomStub(...args) {
      i.c(args);
    };
    i.q = [];
    i.c = function intercomCall(args) {
      i.q.push(args);
    };
    w.Intercom = i;

    const inject = () => {
      const s = d.createElement('script');
      s.type = 'text/javascript';
      s.async = true;
      s.src = `https://widget.intercom.io/widget/${INTERCOM_APP_ID}`;
      s.onload = () => resolve();
      const x = d.getElementsByTagName('script')[0];
      x.parentNode.insertBefore(s, x);
    };

    if (document.readyState === 'complete') {
      inject();
    } else {
      window.addEventListener('load', inject, { once: true });
    }
  });

  return scriptPromise;
}

function callIntercom(method, payload) {
  if (typeof window === 'undefined' || typeof window.Intercom !== 'function') return;
  window.Intercom(method, payload);
}

/** Boot or update Intercom with the given settings (always includes app_id). */
export async function bootIntercom(settings = {}) {
  const payload = { app_id: INTERCOM_APP_ID, ...settings };
  window.intercomSettings = payload;
  await loadIntercomScript();

  if (hasBooted) {
    callIntercom('update', payload);
    return;
  }

  callIntercom('boot', payload);
  hasBooted = true;
}

/** Push identified admin user after Supabase session is available. */
export async function updateIntercomUser(user) {
  if (!user?.email) {
    await bootIntercom();
    return;
  }

  await bootIntercom({
    user_id: String(user.id || user.user_id || user.email),
    email: String(user.email),
    name: String(user.name || user.email.split('@')[0] || 'Admin'),
    role: user.role || 'admin',
  });
}

/** Clear user identity on sign-out; keep anonymous messenger for support. */
export async function resetIntercomVisitor() {
  if (typeof window !== 'undefined' && typeof window.Intercom === 'function' && hasBooted) {
    window.Intercom('shutdown');
    hasBooted = false;
  }
  window.intercomSettings = { app_id: INTERCOM_APP_ID };
  await bootIntercom();
}
