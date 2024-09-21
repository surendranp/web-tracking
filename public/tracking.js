(function() {
  const trackingUrl = 'https://web-tracking-mongodburi.up.railway.app/api/pageviews'; // Replace with your actual API URL
  const adBlockerUrl = 'https://web-tracking-mongodburi.up.railway.app/api/adblocker'; // Add this line

  // Function to get user IP
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

  // Function to detect ad blocker
  function detectAdBlocker() {
    const ad = document.createElement('div');
    ad.innerHTML = '&nbsp;';
    ad.className = 'adsbox';
    document.body.appendChild(ad);
    
    return new Promise(resolve => {
      window.setTimeout(() => {
        const isBlocked = ad.offsetHeight === 0;
        ad.remove();
        resolve(isBlocked);
      }, 100);
    });
  }

  // Function to send ad blocker status to the server
  async function sendAdBlockerStatus(isBlocked) {
    const ip = await getUserIP();
    const domain = window.location.hostname;
    const sessionId = localStorage.getItem('sessionId') || generateSessionId();
    localStorage.setItem('sessionId', sessionId);

    fetch(adBlockerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        domain,
        adBlocker: isBlocked,
        sessionId
      })
    }).catch(error => console.error('Error sending ad blocker status:', error.message));
  }

  // Main tracking function
  async function track() {
    const isBlocked = await detectAdBlocker();
    await sendAdBlockerStatus(isBlocked);
    // Track page view
    trackPageView();
  }

  // Initialize tracking
  track();

  // Function to generate a unique session ID
  function generateSessionId() {
    return Math.random().toString(36).substr(2, 9);
  }

  // Function to send tracking data to the server
  async function sendTrackingData(data) {
    const ip = await getUserIP();
    const domain = window.location.hostname;
    const sessionId = localStorage.getItem('sessionId') || generateSessionId();
    localStorage.setItem('sessionId', sessionId);

    fetch(trackingUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ...data, ip, domain, sessionId })
    }).catch(error => console.error('Error sending tracking data:', error.message));
  }

  // Track page view
  function trackPageView() {
    sendTrackingData({
      type: 'pageview',
      url: window.location.href,
      timestamp: new Date().toISOString(),
    });
  }

  // Track click events
  document.addEventListener('click', function(event) {
    let elementName = 'Unnamed Element';

    if (event.target.tagName === 'BUTTON') {
      elementName = event.target.innerText || event.target.id || 'Unnamed Button';
      sendTrackingData({
        type: 'button_click',
        buttonName: elementName,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      });
    } else if (event.target.tagName === 'A') {
      elementName = event.target.innerText || event.target.id || 'Unnamed Link';
      sendTrackingData({
        type: 'link_click',
        linkName: elementName,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Track page navigation
  window.addEventListener('popstate', trackPageView);
  window.addEventListener('hashchange', trackPageView); // For hash-based routing
})();
