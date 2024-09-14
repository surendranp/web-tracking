(function() {
  const trackingUrl = 'https://web-tracking-mongodburi.up.railway.app/api/pageviews'; // Replace with your actual API URL

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
    const domain = window.location.hostname;

    const payload = {
      ...data,
      ip,
      sessionId: generateSessionId(),
      domain
    }; 

    try {
      await fetch(trackingUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      console.error('Error sending tracking data:', error.message);
    }
  }

  // Track page views
  sendTrackingData({ type: 'pageview', url: window.location.href });

  // Track button clicks
  document.addEventListener('click', function(event) {
    if (event.target.tagName === 'BUTTON') {
      sendTrackingData({
        type: 'button_click',
        buttonName: event.target.name || event.target.id || 'Unnamed Button',
        url: window.location.href
      });
    }
  });

  // Track link clicks
  document.addEventListener('click', function(event) {
    if (event.target.tagName === 'A') {
      sendTrackingData({
        type: 'link_click',
        linkName: event.target.href,
        url: window.location.href
      });
    }
  });

})();
