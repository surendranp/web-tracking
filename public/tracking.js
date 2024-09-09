(function() {
  const trackingUrl = 'https://your-domain.com/api/pageviews';

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

  // Generate or retrieve session ID
  let sessionId = localStorage.getItem('sessionId') || generateSessionId();
  localStorage.setItem('sessionId', sessionId);

  // Track page view
  async function trackPageView() {
    await sendTrackingData({
      type: 'pageview',
      url: window.location.href,
      timestamp: new Date().toISOString(),
      sessionId
    });
  }

  // Track nav link clicks
  function trackNavLinkClick(event) {
    if (event.target.tagName === 'A') {
      const navLinkName = event.target.innerText || event.target.id || 'Unnamed NavLink';
      sendTrackingData({
        type: 'navlink_click',
        navLinkName: navLinkName,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        sessionId
      });
    }
  }

  // Track button clicks
  function trackButtonClick(event) {
    if (event.target.tagName === 'BUTTON') {
      const buttonName = event.target.innerText || event.target.id || 'Unnamed Button';
      sendTrackingData({
        type: 'button_click',
        buttonName: buttonName,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        sessionId
      });
    }
  }

  // Initialize tracking
  document.addEventListener('DOMContentLoaded', trackPageView);
  document.addEventListener('click', trackButtonClick);
  document.addEventListener('click', trackNavLinkClick);

  // Track navigation away from the page
  window.addEventListener('beforeunload', async () => {
    await sendTrackingData({
      type: 'pageview',
      url: window.location.href,
      timestamp: new Date().toISOString(),
      sessionId
    });
  });
})();
