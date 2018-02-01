/* used for target && extranonce2 computation */
const BigInt = require('big-integer');
/* used for midstate calculation */
const transformSHA = require('./transform-sha');
/* double sha256 function */
const doubleSHA = require('./double-sha');
/* streams */
const Stream = require('stream');
/* data structure used to represent jobs */
const MiningJob = require('./mining-job');
/* data structure that represents stratum notifications */
const StratumNotification = require('./stratum-notification');
/* buffer reverse */
const reverse = require('./reverse');

/* builds up the work blocks from the information provided by stratum 
 * protocol, implemented as stream: accepts StratumNotification instances
 * provides MiningJob instances */
class StratumMiningJob extends Stream.Duplex
{
    /* class constructor */
    constructor()
    {
        /* call event emitter class constructor */
        super({objectMode: true});
    }
    
    /* stream.duplex write function */
    _write(chunk, encoding, callback)
    {
        /* validate type */
        if (!(chunk.stratumNotification instanceof StratumNotification))
            return callback(new TypeError("input must be of " +
                "StratumNotification type"));
                
        /* store new stratum chunk, clear extraNonce */        
        this._Stratum = chunk.stratumNotification;
        /* re-compute target according to difficulty */
        this._updateTarget();
        /* reset nonce2 */
        this._extraNonce2 = null;
        
        /* network requested that we flush our fifos? */
        if (this._Stratum.cleanJobs)
            this.emit('flush');

        /* pushing a single job shall start the mining jobs generation 
         * on every read */
        this._pushMiningJob();
        /* all done */
        callback();
    }
    
    /* stream that was pushing stratum notifications has been closed? */
    _final()
    {   
        /* terminate our string */
        this.push(null);
    }
    
    /* stream.duplex read function */
    _read(size)
    {
        if (this._Stratum)
            this._pushMiningJob();
    }
    
    /* push mining job into readable part of the stream */
    _pushMiningJob()
    {
        /* push glued object */
        var x = this.push({
            stratumNotification : this._Stratum,
            miningJob : this._getMiningJob()
        });
    }
    
    /* returns single getWork data set based on GetWork class 
     * parametres */
    _getMiningJob()
    {
        /* 1. increase extranonce2 */
        this._incrementExtraNonce2();
        /* get the serialized version */
        const extraNonce2 = this._serializeExtraNonce2();
        /* 2. build final extranonce */
        const extranonce = this._Stratum.extraNonce1 + extraNonce2;
        /* 3. build coinbase transaction */
        const cb = this._Stratum.coinb1 + extranonce + 
            this._Stratum.coinb2;
        /* 4. hash coinbase */
        const cbHash = doubleSHA(cb, 'hex');
        /* 5. calculate merkle root */
        const mr = this._buildMerkleRoot(cbHash);
        /* 6. serialize header */
        const blockHeader = this._serializeHeader(mr); 
        /* 7. calculate midstate */
        const midstate = transformSHA(Buffer.from(blockHeader, 'hex').
            swap32()).swap32().toString('hex');
        
        /* constant used by older miners */
        const hash1 = 
            '000000000000000000000000000000000000000000000000' + 
            '000000000000000000000080000000000000000000000000' +
            '00000000000000000000000000010000';
            
        /* build up new mining job */
        return new MiningJob({
            data : blockHeader,
            hash1 : hash1,
            midstate : midstate,
            target : this._target,
            extraNonce2 : extraNonce2,
        });
    }
    
    /* update target according to difficulty provided by stratum 
     * protocol */
    _updateTarget()
    {
        /* base target for sha256 algorithm */
        var base = 
            '00000000ffff000000000000000000000000000000000000' +
            '0000000000000000';
        /* divide by difficulty */
        var result = BigInt(base, 16).divide(this._Stratum.difficulty);
        /* report formatted result */
        this._target = result.toString(16).padStart(64, '0');
    }
    
    /* build up the header */
    _serializeHeader(mr)
    {
        var r = "";
        /* build up complete block header */
        r += this._Stratum.version;
        r += this._Stratum.prevHash;
        r += mr;
        r += this._Stratum.nTime;
        r += this._Stratum.nBits;
        r += '00000000';
        r += '000000800000000000000000000000000000000000000000';
        r += '000000000000000000000000000000000000000080020000';
        /* return header */
        return r;
    }
    
    /* increments extraNonce2 */
    _incrementExtraNonce2()
    {
        /* extra nonce not present? */
        if (!this._extraNonce2) {
            this._extraNonce2 = BigInt(0);
        /* increment */
        } else {
            //this._extraNonce2 = BigInt(0x12000000);
           this._extraNonce2 = this._extraNonce2.add(1);
        }
    }
    
    /* add padding to extranonce2 */
    _serializeExtraNonce2()
    {
        /* ensure padding */
        var s = this._extraNonce2.toString(16).padStart(
            this._Stratum.extraNonce2Size * 2, '0');
        /* check for nonce size */
        if (s.length > this._Stratum.extraNonce2Size * 2)
            throw new Error("extraNonce2 overflow!");
        /* return formatted string */
        return s;
    }
    
    /* build merkle root using coinbase Hash */
    _buildMerkleRoot(cbHash)
    {
        /* start with setting merkle root  to coinbase hash */
        var mr = cbHash;
        /* crank all the enries from merkleBranch array */
        for (var i = 0; i < this._Stratum.merkleBranch.length; i++)
            mr = doubleSHA(mr + this._Stratum.merkleBranch[i], 'hex');
        /* word-wise byte reverse is needed */
        return Buffer.from(mr, 'hex').swap32().toString('hex');
    }
}

/* export class */
module.exports = StratumMiningJob;