(function() {
  const trackingUrl = 'https://web-tracking-mongodburi-08d5.up.railway.app/api/pageviews'; // Replace with your actual API URL
  let sessionTimeout = null;
  let sessionDuration = 0;
  let sessionStartTime = new Date(); // Start session time
  let lastActiveTime = new Date(); // Track the last time the user was active
  const sessionInactivityLimit = 120000; // 120 seconds of inactivity before ending the session

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
      body: JSON.stringify({ ...data, ip, domain, ...geolocation, adBlockerActive })  // Include geolocation data
    }).catch(error => console.error('Error sending tracking data:', error.message));
  }

  // Retrieve or generate a session ID
  let sessionId = localStorage.getItem('sessionId') || generateSessionId();
  localStorage.setItem('sessionId', sessionId);

  // Handle pageviews
  function trackPageView() {
    sendTrackingData({
      url: window.location.href,
      type: 'pageview',
      sessionId: sessionId,
    });
  }

  // Handle button clicks
  function trackButtonClick(event) {
    const buttonName = event.target.name || event.target.innerText || 'Unnamed Button';
    sendTrackingData({
      url: window.location.href,
      type: 'button_click',
      sessionId: sessionId,
      buttonName: buttonName
    });
  }

  // Handle link clicks
  function trackLinkClick(event) {
    const linkName = event.target.href || 'Unnamed Link';
    sendTrackingData({
      url: window.location.href,
      type: 'link_click',
      sessionId: sessionId,
      linkName: linkName
    });
  }

  // Track user inactivity and session timeout
  function resetSessionTimeout() {
    clearTimeout(sessionTimeout);
    lastActiveTime = new Date();
    sessionTimeout = setTimeout(() => {
      sessionDuration = new Date() - sessionStartTime;
      sendTrackingData({
        url: window.location.href,
        type: 'session_end',
        sessionId: sessionId,
        sessionDuration: Math.floor(sessionDuration / 1000)
      });
      localStorage.removeItem('sessionId');
    }, sessionInactivityLimit);
  }

  // Attach event listeners for user interactions
  document.addEventListener('DOMContentLoaded', trackPageView);
  document.addEventListener('click', (event) => {
    if (event.target.tagName === 'BUTTON') {
      trackButtonClick(event);
    } else if (event.target.tagName === 'A') {
      trackLinkClick(event);
    }
    resetSessionTimeout();
  });

  // Track mouse movement and activity for session timeout
  document.addEventListener('mousemove', resetSessionTimeout);
  document.addEventListener('keydown', resetSessionTimeout);
})();
