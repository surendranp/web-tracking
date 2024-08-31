(function() {
    const trackingUrl = 'https://web-tracking-mongodburi.up.railway.app/api/pageviews';
    let pageStartTime = new Date().getTime();
    let pageFlow = [];

    // Function to send tracking data to the server
    function sendTrackingData(data) {
        fetch(trackingUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        }).catch(error => console.error('Error sending tracking data:', error));
    }

    // Track page view with initial data
    function trackPageView() {
        sendTrackingData({
            type: 'pageview',
            url: window.location.href,
            timestamp: new Date().toISOString(),
            timeSpent: 0, // Will update later
            pageFlow: pageFlow.join(' > ')
        });
    }

    // Track the time spent on the page
    function trackTimeSpent() {
        const timeSpent = new Date().getTime() - pageStartTime;
        sendTrackingData({
            type: 'timeSpent',
            url: window.location.href,
            timestamp: new Date().toISOString(),
            timeSpent: timeSpent
        });
    }

    // Track user navigation
    function trackPageFlow() {
        pageFlow.push(window.location.href);
        sendTrackingData({
            type: 'pageFlow',
            pageFlow: pageFlow.join(' > '),
            timestamp: new Date().toISOString()
        });
    }

    // Track page view when the script loads
    trackPageView();

    // Track time spent when the user leaves the page
    window.addEventListener('beforeunload', trackTimeSpent);

    // Track page flow on navigation
    window.addEventListener('popstate', trackPageFlow);
    window.addEventListener('pushstate', trackPageFlow);

    // Override the default pushState to track navigation
    const originalPushState = history.pushState;
    history.pushState = function(...args) {
        originalPushState.apply(this, args);
        window.dispatchEvent(new Event('pushstate'));
    };

    // Override the default replaceState to track navigation
    const originalReplaceState = history.replaceState;
    history.replaceState = function(...args) {
        originalReplaceState.apply(this, args);
        window.dispatchEvent(new Event('pushstate'));
    };
})();
