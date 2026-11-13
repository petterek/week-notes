'use strict';

const errorBox = document.getElementById('api-explorer-error');
if (typeof SwaggerUIBundle !== 'function') {
    errorBox.textContent = 'API-utforskeren kunne ikke lastes. Last siden på nytt.';
    errorBox.hidden = false;
} else {
    SwaggerUIBundle({
        url: '/openapi.json',
        dom_id: '#swagger-ui',
        validatorUrl: null,
        queryConfigEnabled: false,
        withCredentials: true,
        docExpansion: 'none',
        filter: true,
        displayRequestDuration: true,
        supportedSubmitMethods: ['get', 'post', 'put', 'delete'],
        plugins: [() => ({
            wrapComponents: {
                execute: Original => class extends Original {
                    constructor(props, context) {
                        super(props, context);
                        const execute = this.onClick;
                        this.onClick = () => {
                            const method = this.props.method.toUpperCase();
                            if (!['GET', 'HEAD'].includes(method)
                                && !confirm(`${method} ${this.props.path}\nDette kan endre data på serveren. Send forespørselen?`)) {
                                errorBox.textContent = 'Forespørselen ble avbrutt.';
                                errorBox.hidden = false;
                                return;
                            }
                            errorBox.hidden = true;
                            execute();
                        };
                    }
                },
            },
        })],
        requestInterceptor(request) {
            const target = new URL(request.url, location.href);
            if (target.origin !== location.origin) {
                throw new Error('API-utforskeren sender bare forespørsler til denne serveren.');
            }
            return request;
        },
    });
}
