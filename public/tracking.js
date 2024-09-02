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

  // Track page view
  sendTrackingData({
    type: 'pageview',
    url: window.location.href,
    timestamp: new Date().toISOString()
  });

  // Track click events
  document.addEventListener('click', function(event) {
    if (event.target.tagName === 'BUTTON') {
      const buttonName = event.target.innerText || event.target.id || 'Unnamed Button';
      sendTrackingData({
        type: 'button_click',
        buttonName: buttonName,
        url: window.location.href,
        timestamp: new Date().toISOString()
      });
    } else if (event.target.tagName === 'A' && event.target.closest('.navbar')) {
      const navLinkName = event.target.innerText || event.target.id || 'Unnamed NavLink';
      sendTrackingData({
        type: 'navlink_click',
        navLinkName: navLinkName,
        url: window.location.href,
        timestamp: new Date().toISOString()
      });
    }
  });
})();
