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
    return new Promise((resolve) => {
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
      body: JSON.stringify({ 
        ...data, 
        ip, 
        domain, 
        ...geolocation, 
        adBlockerActive 
      })
    }).catch(error => console.error('Error sending tracking data:', error.message));
  }

  // Retrieve or generate a session ID and persist it in localStorage
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

  // Immediately record the first pageview
  trackPageView();

  // ---- Inactivity Timeout Logic ----
  // Set an inactivity limit (e.g., 2 minutes)
  let inactivityTimeout;
  const INACTIVITY_LIMIT = 2 * 60 * 1000; // 2 minutes

  function resetInactivityTimeout() {
    if (inactivityTimeout) clearTimeout(inactivityTimeout);
    inactivityTimeout = setTimeout(() => {
      // When inactivity is detected, send a session_end event.
      sendSessionEnd();
    }, INACTIVITY_LIMIT);
  }

  // Function to send session end data
  function sendSessionEnd() {
    // Send the session end event with sendBeacon for reliability during unload.
    const payload = JSON.stringify({
      type: 'session_end',
      url: window.location.href,
      timestamp: new Date().toISOString(),
      sessionId
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(trackingUrl, payload);
    } else {
      // Fallback if sendBeacon is not available.
      fetch(trackingUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: payload
      });
    }
  }

  // Reset the inactivity timer on user interactions
  ['click', 'mousemove', 'keydown'].forEach(event => {
    document.addEventListener(event, resetInactivityTimeout);
  });
  // Start the inactivity timer initially
  resetInactivityTimeout();

  // ---- Click and Element Tracking ----
  document.addEventListener('click', function(event) {
    // Identify the element clicked.
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

    // For any element clicked, capture additional details.
    let element = event.target;
    let fullElementName = element.innerText.trim() || element.id || element.className || element.tagName;
    if (fullElementName.length > 100) {
      fullElementName = fullElementName.substring(0, 100) + '...'; // Limit text length
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

  // ---- Mutation Observer for Dynamic Elements ----
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
  observer.observe(document.body, { childList: true, subtree: true });

  // Track navigation events (e.g., back/forward buttons or hash changes)
  window.addEventListener('popstate', trackPageView);
  window.addEventListener('hashchange', trackPageView);

  // ---- Final Session End on Page Unload ----
  window.addEventListener('beforeunload', function() {
    sendSessionEnd();
  });

})();
