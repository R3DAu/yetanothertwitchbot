async function registerPasskey() {
    try {
        const response = await fetch('/webauthn/register/options', { method: 'GET' });
        const options = await response.json();
        const publicKey = transformCredentialCreationOptions(options);
        const credential = await navigator.credentials.create({ publicKey });

        const verificationResponse = await fetch('/webauthn/register/verify', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(credential)
        });
        return await verificationResponse.json();
    } catch (error) {
        console.error('Error during registration:', error);
    }
}

async function loginWithPasskey() {
    try {
        const response = await fetch('/webauthn/login/options', { method: 'GET' });
        const options = await response.json();
        const publicKey = transformCredentialRequestOptions(options);
        const assertion = await navigator.credentials.get({ publicKey });

        const verificationResponse = await fetch('/webauthn/login/verify', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(assertion)
        });
        return await verificationResponse.json();
    } catch (error) {
        console.error('Error during login:', error);
    }
}

function transformCredentialCreationOptions(options) {
    options.challenge = bufferDecode(options.challenge);
    options.user.id = bufferDecode(options.user.id);
    if (options.excludeCredentials) {
        options.excludeCredentials = options.excludeCredentials.map(c => {
            c.id = bufferDecode(c.id);
            return c;
        });
    }
    return options;
}

function transformCredentialRequestOptions(options) {
    options.challenge = bufferDecode(options.challenge);
    options.allowCredentials.forEach(cred => {
        cred.id = bufferDecode(cred.id);
    });
    return options;
}

function bufferDecode(value) {
    return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}