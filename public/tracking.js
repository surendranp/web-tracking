(function() {
  const trackingUrl = 'https://edatic-web-tracker-007.up.railway.app/api/pageviews'; // Replace with your actual API URL
  
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

  // Function to get geolocation data
  function getGeolocation() {
    return new Promise((resolve, reject) => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude
            });
          },
          (error) => {
            console.error('Error getting geolocation:', error.message);
            resolve({ latitude: null, longitude: null });
          }
        );
      } else {
        console.log('Geolocation is not supported by this browser.');
        resolve({ latitude: null, longitude: null });
      }
    });
  }

  // Function to generate a unique session ID
  function generateSessionId() {
    return Math.random().toString(36).substr(2, 9);
  }

  // Function to check for ad blockers
  function isAdBlockerActive() {
    return new Promise((resolve) => {
      const adTest = document.createElement('div');
      adTest.innerHTML = '&nbsp;';
      adTest.className = 'adsbox';
      document.body.appendChild(adTest);
      window.setTimeout(() => {
        const isBlocked = (adTest.offsetHeight === 0);
        adTest.remove();
        resolve(isBlocked);
      }, 100);
    });
  }

  // Function to send tracking data to the server
  async function sendTrackingData(data) {
    const ip = await getUserIP();
    const domain = window.location.hostname;  // Capture the domain name
    const geolocation = await getGeolocation();
    const adBlockerActive = await isAdBlockerActive(); // Check for ad blocker

    fetch(trackingUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ...data, ip, domain, ...geolocation, adBlockerActive })  // Include geolocation data
    }).catch(error => console.error('Error sending tracking data:', error.message));
  }

  // Retrieve or generate a session ID
  let sessionId = localStorage.getItem('sessionId') || generateSessionId();
  localStorage.setItem('sessionId', sessionId);

  // Track page view
  function trackPageView() {
    sendTrackingData({
      type: 'pageview',
      url: window.location.href,
      timestamp: new Date().toISOString(),
      sessionId
    });
  }

  trackPageView(); // Initial page view tracking

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
        sessionId
      });
    } else if (event.target.tagName === 'A') {
      elementName = event.target.innerText || event.target.id || 'Unnamed Link';
      sendTrackingData({
        type: 'link_click',
        linkName: elementName,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        sessionId
      });
    }

    // 🔴 NEW: Track clicks on any element and capture its name, ID, or class 🔴
    let element = event.target;
    let fullElementName = element.innerText.trim() || element.id || element.className || element.tagName;
    
    if (fullElementName.length > 100) {
      fullElementName = fullElementName.substring(0, 100) + '...'; // Prevent long text overflow
    }

    sendTrackingData({
      type: 'element_click',
      elementTag: element.tagName.toLowerCase(),
      elementName: fullElementName,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      sessionId
    });
  });

  // 🔴 NEW: Track when a <div class="track"> appears dynamically 🔴
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1 && node.classList.contains('track')) {
          sendTrackingData({
            type: 'div_appearance',
            divClass: 'track',
            url: window.location.href,
            timestamp: new Date().toISOString(),
            sessionId
          });
        }
      });
    });
  });

  // Start observing the document for added elements
  observer.observe(document.body, { childList: true, subtree: true });

  // Track page navigation (i.e., navigation path)
  window.addEventListener('popstate', trackPageView);
  window.addEventListener('hashchange', trackPageView); // For hash-based routing
})();
