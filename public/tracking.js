(function() {
  const trackingUrl = 'https://web-tracking-mongodburi-08d5.up.railway.app/api/pageviews'; // Replace with your actual API URL
  let sessionTimeout = null;
  let sessionDuration = 0;
  let sessionStartTime = new Date(); // Start session time
  let lastActiveTime = new Date(); // Track the last time the user was active
  let isUserActive = true; // User is active on the page initially
  const sessionInactivityLimit = 120000; // 120 seconds of inactivity before ending the session (adjust as needed)

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
    sessionStartTime = new Date(); // Start session
    lastActiveTime = new Date(); // Reset last active time
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

    // Reset inactivity timer on user interaction
    resetInactivityTimer();
  });

  // Track page navigation (i.e., navigation path)
  window.addEventListener('popstate', trackPageView);
  window.addEventListener('hashchange', trackPageView); // For hash-based routing

  // End session on tab close or inactivity
  function endSession() {
    const sessionEndTime = new Date();
    const sessionDurationInSeconds = (sessionEndTime - sessionStartTime) / 1000; // Calculate duration in seconds

    sendTrackingData({
      type: 'session_end',
      sessionId,
      url: window.location.href,
      sessionDuration: sessionDurationInSeconds,
      timestamp: sessionEndTime.toISOString()
    });

    localStorage.removeItem('sessionId'); // Remove sessionId to start a new session on next page view
  }

  // Detect inactivity (mouse/keyboard)
  function resetInactivityTimer() {
    lastActiveTime = new Date(); // Update the last time user was active
    if (sessionTimeout) clearTimeout(sessionTimeout);
    sessionTimeout = setTimeout(checkInactivity, sessionInactivityLimit);  // Check inactivity after defined limit
  }

  // Function to check for inactivity and end the session if necessary
  function checkInactivity() {
    const now = new Date();
    const timeSinceLastActivity = now - lastActiveTime;

    if (timeSinceLastActivity >= sessionInactivityLimit || !isUserActive) {
      endSession();
    }
  }

  // Track visibility change (switching tabs)
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      isUserActive = false; // User is not on the page
      endSession(); // End session when user switches tabs
    } else {
      isUserActive = true; // User returns to the page
      sessionStartTime = new Date(); // Restart session
      resetInactivityTimer(); // Reset inactivity timer
    }
  });

  // Track focus out of the window (e.g., user switches to another app or tab)
  window.addEventListener('blur', function() {
    isUserActive = false; // User is no longer active on this page
    endSession(); // End session when user leaves the page
  });

  // Listen for user activity (mouse, keyboard)
  document.addEventListener('mousemove', resetInactivityTimer);
  document.addEventListener('keydown', resetInactivityTimer);

  // End session when user closes tab or window
  window.addEventListener('beforeunload', function() {
    endSession();
  });

})();
