async function getUserIP() {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch (error) {
    console.error('Error fetching IP address:', error.message);
    return 'unknown'; // Fallback if IP cannot be retrieved
  }
}

async function sendTrackingData(data) {
  const ip = await getUserIP();
  const domain = window.location.hostname;
  const trackingUrl = 'https://web-tracking-production.up.railway.app/api/pageviews';

  try {
    const response = await fetch(trackingUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, ip, domain }),
    });

    if (response.ok) {
      console.log('Tracking data sent successfully');
    } else {
      console.error('Error sending tracking data:', response.statusText);
    }
  } catch (error) {
    console.error('Error sending tracking data:', error.message);
  }
}

window.addEventListener('load', () => {
  const sessionId = localStorage.getItem('sessionId') || generateSessionId();
  localStorage.setItem('sessionId', sessionId);

  sendTrackingData({
    type: 'pageview',
    url: window.location.href,
    sessionId,
    buttons: {}, // Add button data as needed
    links: {},   // Add link data as needed
    pageviews: [window.location.href],
    duration: 0, // Calculate and send session duration as needed
  });
});

function generateSessionId() {
  return Math.random().toString(36).substring(2, 15);
}
