/* data structure used to represent single mining job */
class MiningJob
{
    constructor (values)
    {
        /* values that come from notifications */
        this.data = values.data;
        this.hash1 = values.hash1;
        this.midstate = values.midstate;
        this.target = values.target;
        this.extraNonce2 = values.extraNonce2;
    }
}

/* export class */
module.exports = MiningJob