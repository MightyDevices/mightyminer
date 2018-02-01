/* streams */
const Stream = require('stream');
/* require stratum submission */
const StratumSubmission = require('./stratum-submission');
/* mining job */
const MiningJob = require('./mining-job');
/* mining result */
const MiningResult = require('./mining-result');
/* double sha used for hashing */
const doubleSHA = require('./double-sha');
/* used for comparison */
const BigInt = require('big-integer');
/* reverse byte array */
const reverse = require('./reverse');

/* stream class that takes MiningResult and passes it further if it 
 * matches the network requiremenst */
class MiningResultStratum extends Stream.Duplex
{
    constructor()
    {
        /* call event emitter class constructor */
        super({objectMode: true});
    }
    
    /* stream.duplex write function */
    _write(chunk, encoding, callback)
    {
        /* array of valid nonces */
        var validNonces = [];
        
        /* validate type */
        if (!(chunk.miningJob instanceof MiningJob))
            return callback(new TypeError("input must contain " +
                "MiningJob type"));
        
        /* validate type */
        if (!(chunk.miningResult instanceof MiningResult))
            return callback(new TypeError("input must contain " +
                "MiningResult type"));

        /* test for proper hashes */
        for (var i = 0; i < chunk.miningResult.nonces.length; i++) {
            /* invalid result? */
            if (!this._validResult(chunk.miningJob.data, 
                chunk.miningResult.nonces[i],
                chunk.miningJob.target)) 
                continue;
            
            /* push valid nonce */
            validNonces.push(chunk.miningResult.nonces[i]);
        }
        
        /* found anything? */
        if (validNonces.length != 0) {
            /* store valid nonces */
            chunk.stratumSubmission = new StratumSubmission({
                nonces : validNonces
            });
            /* push into readable part */
            this.push(chunk);
        }
        
        /* we are done processing */
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
    }

    /* returns true if given block (with nonce) results in a hahses to 
     * value less than 'target' */
    _validResult(blockHeader, nonce, target)
    {
        /* convert to byte array */
        var bh = blockHeader.slice(0, 76 * 2);
        /* append nonce value */
        bh += nonce;
        /* change endiannes */
        bh = Buffer.from(bh, 'hex').swap32();
        
        /* do the hashing */
        var hash = doubleSHA(bh);
        /* reverse bytes */
        hash = reverse(hash).toString('hex');
        var h = hash;
        /* build the big nums */
        hash = BigInt(hash, 16);
        target = BigInt(target, 16);
        
        /* check hash against current target */
        var validFound = target.compare(hash) > 0;        
        /* compare */
        return validFound;
    }
}

/* export class */
module.exports = MiningResultStratum;