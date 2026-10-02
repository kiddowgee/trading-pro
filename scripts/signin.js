const signinForm = document.getElementById('signinForm');
const signinError = document.getElementById('signinError');

signinForm.addEventListener('submit', (event) => {
    event.preventDefault();
    signinError.textContent = '';

    try {
        sessionStorage.setItem('tradeProDemoSignedIn', 'true');
        window.location.assign('index.html');
    } catch {
        signinError.textContent = 'Browser session storage is unavailable. Enable it to continue.';
    }
});
