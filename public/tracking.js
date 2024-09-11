(function() {
  const trackingUrl = 'https://web-tracking-production.up.railway.app/api/pageviews';  // Replace with your actual API URL

  async function getUserIP() {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch (error) {
      console.error('Error fetching IP address:', error.message);
      return 'unknown';
    }
  }

  function generateSessionId() {
    return Math.random().toString(36).substr(2, 9);
  }

  async function sendTrackingData(data) {
    const ip = await getUserIP();
    fetch(trackingUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ...data, ip })
    }).catch(error => console.error('Error sending tracking data:', error.message));
  }

  let sessionId = localStorage.getItem('sessionId') || generateSessionId();
  localStorage.setItem('sessionId', sessionId);

  // Extract domain or identifier
  const siteIdentifier = window.location.hostname;

  // Track page view
  function trackPageView() {
    sendTrackingData({
      type: 'pageview',
      url: window.location.href,
      timestamp: new Date().toISOString(),
      sessionId,
      siteIdentifier
    });
  }

  trackPageView(); // Initial page view tracking

  // Track click events
  document.addEventListener('click', function(event) {
    let elementName = 'Unnamed Element';
    let elementType = '';

    if (event.target.tagName === 'BUTTON') {
      elementName = event.target.innerText || event.target.id || 'Unnamed Button';
      elementType = 'button_click';
    } else if (event.target.tagName === 'A') {
      elementName = event.target.innerText || event.target.id || 'Unnamed Link';
      elementType = 'link_click';
    }

    if (elementType) {
      sendTrackingData({
        type: elementType,
        [elementType === 'button_click' ? 'buttonName' : 'linkName']: elementName,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        sessionId,
        siteIdentifier
      });
    }
  });

  // Track page navigation (i.e., navigation path)
  window.addEventListener('popstate', trackPageView);
  window.addEventListener('hashchange', trackPageView); // For hash-based routing
})();
