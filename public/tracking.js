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
    return Math.random().toString(36).substring(2, 15);
  }

  async function sendTrackingData(type, buttonName = '', linkName = '') {
    try {
      const ip = await getUserIP();
      const sessionId = generateSessionId();
      const domain = window.location.hostname;

      await fetch(trackingUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          buttonName,
          linkName,
          url: window.location.href,
          ip,
          sessionId,
          domain
        })
      });
    } catch (error) {
      console.error('Error sending tracking data:', error.message);
    }
  }

  // Track page view
  sendTrackingData('pageview');

  // Track button clicks
  document.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', () => sendTrackingData('button_click', button.innerText));
  });

  // Track link clicks
  document.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => sendTrackingData('link_click', link.href));
  });
})();
