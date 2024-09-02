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
  document.addEventListener('click', function(event) {
    sendTrackingData({
      type: 'click',
      element: event.target.tagName,
      url: window.location.href,
      timestamp: new Date().toISOString()
    });
  });
})();
