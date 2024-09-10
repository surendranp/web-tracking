(function() {
  const trackingUrl = 'https://web-tracking-mongodburi.up.railway.app/api/pageviews';

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

  // Track page views and user navigation flow
  function trackPageView() {
    sendTrackingData({
      type: 'pageview',
      url: window.location.href,
      timestamp: new Date().toISOString(),
      sessionId
    });
  }

  trackPageView(); // Initial page view tracking

  // Function to check if a clicked element is within a navigation menu (including <nav> or menus)
  function isMenuClick(element) {
    return element.closest('nav') || element.classList.contains('menu') || element.classList.contains('navbar');
  }

  // Track click events for buttons, links, and menu items
  document.addEventListener('click', function(event) {
    let elementName = 'Unnamed Element';

    // Track button clicks
    if (event.target.tagName === 'BUTTON') {
      elementName = event.target.innerText || event.target.id || 'Unnamed Button';
      sendTrackingData({
        type: 'button_click',
        buttonName: elementName,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        sessionId
      });
      // Also store in menu if it's navigating
      sendTrackingData({
        type: 'menu_click',
        menuName: elementName,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        sessionId
      });
    }
    // Track link clicks and menu/navigation clicks
    else if (event.target.tagName === 'A') {
      elementName = event.target.innerText || event.target.id || 'Unnamed Link';
      
      if (isMenuClick(event.target)) {
        // Store in menu object if the link is part of navigation
        sendTrackingData({
          type: 'menu_click',
          menuName: elementName,
          url: window.location.href,
          timestamp: new Date().toISOString(),
          sessionId
        });
      } else {
        // Store in links object for other body links
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

  // Monitor page navigation (i.e., navigation path)
  window.addEventListener('popstate', trackPageView);
})();
