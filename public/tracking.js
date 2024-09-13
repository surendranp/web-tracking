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
    return Math.random().toString(36).substr(2, 9);
  }

  async function sendTrackingData(data) {
    const ip = await getUserIP();
    const domain = window.location.hostname;  // Capture the domain name
    fetch(trackingUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ...data, ip, domain })  // Send the domain name to the server
    }).catch(error => console.error('Error sending tracking data:', error.message));
  }

  let sessionId = generateSessionId();

  function trackPageView() {
    sendTrackingData({
      type: 'pageview',
      url: window.location.href,
      sessionId
    });
  }

  function trackButtonClick(buttonName) {
    sendTrackingData({
      type: 'button_click',
      buttonName,
      url: window.location.href,
      sessionId
    });
  }

  function trackLinkClick(linkName) {
    sendTrackingData({
      type: 'link_click',
      linkName,
      url: window.location.href,
      sessionId
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    trackPageView();
    
    document.querySelectorAll('button').forEach(button => {
      button.addEventListener('click', () => trackButtonClick(button.innerText));
    });
    
    document.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => trackLinkClick(link.href));
    });
  });
})();
