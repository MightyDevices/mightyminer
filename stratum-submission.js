/* data structure used to represent data to be submitted to stratum 
 * server */
class StratumSubmission
{
    constructor (values)
    {
        /* computed nonce values */
        this.nonces = values.nonces;
    }
}

/* export class */
module.exports = StratumSubmission;