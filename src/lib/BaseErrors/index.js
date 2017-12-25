import ExtendableError from 'es6-error';

export class JSSAPIError extends ExtendableError {
    static domain = 'JSSAPIError';

    constructor(message = '') {
        super(message);

        const domains = [];
        let prototype = this.__proto__;

        do {
            domains.unshift(prototype.constructor.domain);
            prototype = prototype.__proto__;
        } while (prototype.constructor !== ExtendableError);

        this.message = domains.join('.') + (message ? `: ${message}` : '');
    }

    get domain() {
        return this.constructor.domain;
    }
}
