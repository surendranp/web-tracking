(function() {
  const trackingUrl = '/api/pageviews'; // Ensure this is correct for your deployment

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
    try {
      const response = await fetch(trackingUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ...data, ip })
      });
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
    } catch (error) {
      console.error('Error sending tracking data:', error.message);
    }
  }

  let sessionId = localStorage.getItem('sessionId') || generateSessionId();
  localStorage.setItem('sessionId', sessionId);

  // Track page view
  sendTrackingData({
    type: 'pageview',
    url: window.location.href,
    timestamp: new Date().toISOString(),
    sessionId
  });

  // Track click events
  document.addEventListener('click', function(event) {
    let elementName = 'Unnamed Element';

    if (event.target.tagName === 'A' && event.target.closest('nav')) {
      // Navbar link
      elementName = event.target.innerText || event.target.id || 'Unnamed NavLink';
      sendTrackingData({
        type: 'navlink_click',
        navLinkName: elementName,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        sessionId
      });
    } else if (event.target.tagName === 'A') {
      // Other links
      elementName = event.target.innerText || event.target.id || 'Unnamed Link';
      sendTrackingData({
        type: 'link_click',
        linkName: elementName,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        sessionId
      });
    } else if (event.target.tagName === 'BUTTON') {
      // Button clicks
      elementName = event.target.innerText || event.target.id || 'Unnamed Button';
      sendTrackingData({
        type: 'button_click',
        buttonName: elementName,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        sessionId
      });
    }
  });
})();
