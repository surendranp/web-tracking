(function() {
  const trackingUrl = 'https://web-tracking-mongodburi.up.railway.app/api/pageviews';

  function sendTrackingData(data) {
    fetch(trackingUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    }).catch(error => console.error('Error sending tracking data:', error));
  }

  // Unique session ID
  let sessionId = localStorage.getItem('sessionId');
  if (!sessionId) {
    sessionId = 'session-' + Date.now();
    localStorage.setItem('sessionId', sessionId);
  }

  // Track page view
  sendTrackingData({
    type: 'pageview',
    sessionId: sessionId,
    url: window.location.href,
    timestamp: new Date().toISOString()
  });

  // Track click events
  const buttonClicks = {};

  document.addEventListener('click', function(event) {
    const target = event.target;

    // Track button clicks
    if (target.tagName === 'BUTTON') {
      const buttonName = target.innerText || target.id || 'Unnamed Button';

      if (!buttonClicks[buttonName]) {
        buttonClicks[buttonName] = 0;
      }
      buttonClicks[buttonName] += 1;

      sendTrackingData({
        type: 'button_click',
        sessionId: sessionId,
        buttonName: buttonName,
        count: buttonClicks[buttonName],
        url: window.location.href,
        timestamp: new Date().toISOString()
      });
    }

    // Track navbar link clicks
    if (target.tagName === 'A' && target.closest('nav')) {
      const linkName = target.innerText || target.href || 'Unnamed Link';

      sendTrackingData({
        type: 'navbar_link_click',
        sessionId: sessionId,
        linkName: linkName,
        url: window.location.href,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Track session end
  window.addEventListener('beforeunload', function() {
    sendTrackingData({
      type: 'session_end',
      sessionId: sessionId,
      url: window.location.href,
      timestamp: new Date().toISOString()
    });
    localStorage.removeItem('sessionId');
  });
})();
