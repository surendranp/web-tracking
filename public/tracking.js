(function() {
  // Replace with your server's endpoint URL
  const trackingUrl = 'https://web-tracking-mongodburi.up.railway.app/api/pageviews';

  function sendTrackingData(data) {
    fetch(trackingUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
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
