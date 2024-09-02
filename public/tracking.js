(function() {
  // Replace with your server's endpoint URL
  const trackingUrl = 'https://web-tracking-mongodburi.up.railway.app/api/pageviews';

  // Function to get user's IP address
  async function getUserIP() {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch (error) {
      console.error('Error fetching IP address:', error);
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
    }).catch(error => console.error('Error sending tracking data:', error));
  }

  // Track page view
  sendTrackingData({
    type: 'pageview',
    url: window.location.href,
    timestamp: new Date().toISOString()
  });

  // Track click events
  const buttonClicks = {};

  document.addEventListener('click', function(event) {
    if (event.target.tagName === 'BUTTON') {
      const buttonName = event.target.innerText || event.target.id || 'Unnamed Button';

      if (!buttonClicks[buttonName]) {
        buttonClicks[buttonName] = 0;
      }
      buttonClicks[buttonName] += 1;

      sendTrackingData({
        type: 'button_click',
        buttonName: buttonName,
        count: buttonClicks[buttonName],
        url: window.location.href,
        timestamp: new Date().toISOString()
      });
    }
  });
})();
