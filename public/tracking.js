(function() {
  const trackingUrl = 'https://web-tracking-production.up.railway.app/api/pageviews';

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

  // Track page view
  function trackPageView() {
    sendTrackingData({
      type: 'pageview',
      url: window.location.href,
      timestamp: new Date().toISOString(),
      sessionId
    });
  }

  trackPageView(); // Initial page view tracking

  // Function to check if an element is a navigation menu link or item
  function isMenuClick(element) {
    return element.closest('nav') || element.classList.contains('nav-link') || element.classList.contains('navbar');
  }

  // Track click events
  document.addEventListener('click', function(event) {
    let elementName = 'Unnamed Element';

    if (event.target.tagName === 'BUTTON') {
      elementName = event.target.innerText || event.target.id || 'Unnamed Button';
      sendTrackingData({
        type: 'button_click',
        buttonName: elementName,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        sessionId
      });
    } else if (event.target.tagName === 'A') {
      elementName = event.target.innerText || event.target.id || 'Unnamed Link';

      if (isMenuClick(event.target)) {
        // Capture menu (nav-link, nav-tab) clicks
        sendTrackingData({
          type: 'menu_click',
          menuName: elementName,
          url: window.location.href,
          timestamp: new Date().toISOString(),
          sessionId
        });
      } else {
        // Capture non-menu link clicks
        sendTrackingData({
          type: 'link_click',
          linkName: elementName,
          url: window.location.href,
          timestamp: new Date().toISOString(),
          sessionId
        });
      }
    }
  });

  // Track page navigation (i.e., navigation path)
  window.addEventListener('popstate', trackPageView);
})();
