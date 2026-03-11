// Content script: grabs the auth token from ChatGPT's session API
// No inline script injection — fetches directly using page cookies
(function () {
  function grabToken() {
    fetch('/api/auth/session', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.accessToken) {
          chrome.storage.local.set({ accessToken: 'Bearer ' + data.accessToken });
        }
      })
      .catch(() => {});
  }

  // Grab on load
  grabToken();

  // Re-grab periodically (token expires)
  setInterval(grabToken, 5 * 60 * 1000);
})();
