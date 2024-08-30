// public/track.js
(function() {
    const data = {
      url: window.location.href,
      referrer: document.referrer,
      userAgent: navigator.userAgent,
      ipAddress: null  // Optionally, you could handle IP address on the server side.
    };
  
    fetch('http://localhost:5000/api/pageviews/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    }).then(response => response.json())
      .then(data => console.log('Pageview tracked:', data))
      .catch(error => console.error('Error tracking pageview:', error));
  })();
  