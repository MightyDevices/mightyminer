/* data structure used to represent the output from stratum client 
 * module */
class StratumNotification
{
    constructor (values)
    {
        /* values that come from notifications */
        this.jobID = values.jobID;
        this.prevHash = values.prevHash;
        this.coinb1 = values.coinb1;
        this.coinb2 = values.coinb2;
        this.merkleBranch = values.merkleBranch;
        this.version = values.version;
        this.nBits = values.nBits;
        this.nTime = values.nTime;
        this.cleanJobs = values.cleanJobs;
        
        /* values from difficulty notifications */
        this.difficulty = values.difficulty;
        
        /* values from subscription */
        this.extraNonce1 = values.extraNonce1;
        this.extraNonce2Size = values.extraNonce2Size;
    }
}

/* export class */
module.exports = StratumNotification