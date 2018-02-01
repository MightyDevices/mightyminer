/* used for hashing */
const Crypto = require('crypto');
/* is string function */
const isString = require('./is-string');

/* hash input twice: input/output as hex string */
function doubleSHA(input, encoding)
{
    /* create hashers */
    const h1 = new Crypto.createHash('sha256');
    const h2 = new Crypto.createHash('sha256');
    /* convert to buffer if input was given as a string */
    var inp = isString(input) ? Buffer.from(input, 'hex') : input;
    /* return doube hashed value */
    return h1.update(h2.update(inp).digest()).
        digest(encoding);
}

/* export function */
module.exports = doubleSHA;