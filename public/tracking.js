(function() {
  const trackingUrl = 'https://web-tracking-mongodburi.up.railway.app/api/pageviews'; // Replace with your actual API URL

  async function getUserIP() {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch (error) {
      console.error('Error getting user IP:', error);
      return '';
    }
  }

  async function sendTrackingData(type, buttonName, linkName) {
    const url = window.location.href;
    const ip = await getUserIP();
    const sessionId = sessionStorage.getItem('sessionId') || Math.random().toString(36).substring(2);
    sessionStorage.setItem('sessionId', sessionId);

    const trackingData = {
      type,
      buttonName,
      linkName,
      url,
      ip,
      sessionId,
      domain: window.location.hostname
    };

    try {
      await fetch(trackingUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(trackingData)
      });
    } catch (error) {
      console.error('Error sending tracking data:', error);
    }
  }

  // Event listeners for tracking
  document.addEventListener('click', event => {
    if (event.target.tagName === 'BUTTON') {
      sendTrackingData('button_click', event.target.name || '');
    }
    if (event.target.tagName === 'A') {
      sendTrackingData('link_click', event.target.href || '');
    }
  });

  // Track page views
  sendTrackingData('pageview');
})();
