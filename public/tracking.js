(function() {
  function getTrackingData() {
    return {
      type: document.querySelector('meta[name="tracking-type"]').getAttribute('content'),
      buttonName: document.querySelector('meta[name="button-name"]')?.getAttribute('content') || '',
      linkName: document.querySelector('meta[name="link-name"]')?.getAttribute('content') || '',
      url: window.location.href,
      ip: '', // Need to set up a method to get user's IP if required
      sessionId: getSessionId(),
      domain: window.location.hostname
    };
  }

  function getSessionId() {
    let sessionId = sessionStorage.getItem('sessionId');
    if (!sessionId) {
      sessionId = Date.now().toString(); // Generate a new session ID if not present
      sessionStorage.setItem('sessionId', sessionId);
    }
    return sessionId;
  }

  function sendTrackingData(data) {
    fetch('https://web-tracking-mongodburi.up.railway.app/api/pageviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    }).catch(err => console.error('Error sending tracking data:', err));
  }

  function trackButtonClicks() {
    document.addEventListener('click', function(event) {
      if (event.target.tagName === 'BUTTON') {
        const data = getTrackingData();
        data.type = 'button_click';
        data.buttonName = event.target.innerText || 'Unnamed Button';
        sendTrackingData(data);
      }
    });
  }

  function trackLinkClicks() {
    document.addEventListener('click', function(event) {
      if (event.target.tagName === 'A') {
        const data = getTrackingData();
        data.type = 'link_click';
        data.linkName = event.target.href || 'Unnamed Link';
        sendTrackingData(data);
      }
    });
  }

  function initTracking() {
    trackButtonClicks();
    trackLinkClicks();
  }

  document.addEventListener('DOMContentLoaded', initTracking);
})();
