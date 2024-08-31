(function() {
  // Replace with your server's endpoint URL
  const trackingUrl = 'https://web-tracking-mongodburi.up.railway.app/api/pageviews';

  // Function to generate a unique session ID
  function generateSessionId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Get or create a session ID
  let sessionId = localStorage.getItem('sessionId');
  if (!sessionId) {
    sessionId = generateSessionId();
    localStorage.setItem('sessionId', sessionId);
  }

  // Track page view
  function sendTrackingData(data) {
    fetch(trackingUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    }).catch(error => console.error('Error sending tracking data:', error));
  }

  // Track page view
  sendTrackingData({
    type: 'pageview',
    url: window.location.href,
    referrer: document.referrer,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    cookies: document.cookie,
    sessionId: sessionId
  });

  // Track click events
  document.addEventListener('click', function(event) {
    sendTrackingData({
      type: 'click',
      element: event.target.tagName,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      cookies: document.cookie,
      sessionId: sessionId
    });
  });
})();
