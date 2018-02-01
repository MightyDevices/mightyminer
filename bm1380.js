/* used for serial port */
const Serialport = require('serialport');
/* streams */
const Stream = require('stream');
/* used for promysifying */
const Util = require('util');
/* jobs fifo */
const Fifo = require('./fifo');
/* crc5 algorithm */
const CRC5 = require('./crc5');
/* mutex */
const Mutex = require('./mutex');
/* data structure used to represent jobs */
const MiningJob = require('./mining-job');
/* data structure used to represent jobs */
const MiningResult = require('./mining-result');

const reverse = require('./reverse');


/* bitminer chip chain class: build up as a stream: writing causes 
 * storing new work for processing, reading fetches results */
class BM1380 extends Stream.Duplex
{
    /* serial port */
    constructor(options)
    {
        /* call base constructor: since we are about to use object 
         * streams then objectMode needs to be set to 'true' */
        super({ objectMode: true });
        
        /* jobs fifo: used for storing jobs before they get sent to the 
         * mining contraption :) */
        this._jobs = new Fifo(32);
        /* work id used for binding job results with jobs themselves, 
         * it can also be used for counting jobs that were processed */
        this._workID = 0;
        /* timeout in ms before firing next job after previous has been 
         * stared. this value depends heavily on miner chip string 
         * capabilities: it is basically a time it takes for a chain of 
         * string to perform 2^32 hashes (full nonce search) * 90%. 
         * the percentage (chosen arbitraty) prevents the complete scan 
         * after which the chips may want to go into 'idle' state and 
         * introduce additional delays (a.k.a performace drop). 
         * basically what this means is that we interrupt current job 
         * (just slightlty before it finishes) with the next job to 
         * avoid chips going to sleep */
        this._timeout = options.timeout;
        /* miner chip frequency setting: use default if none given */
        this._frequency = options.frequency || 193;
        /* miner starts stopped, obviously */
        this._minerRunning = false;

        
        /* bind function */
        this.flush = this.flush.bind(this);
        
        /* this mutex controls the access to the mining hardware: we 
         * don't want the commands to interfere with work processing 
         */
        this._mutex = new Mutex();
        /* serial port initialize: chips use 115200 bps by default */
        this._sp = new Serialport(options.portName, { 
            baudRate : 115200 });
        /* bm1380 always responds with 5 byte data chunks - bind 
         * ByteLength parser for reading */
        this._parser = this._sp.pipe(new Serialport.parsers.ByteLength({
            length : 5} ));
        /* listen to  port open */
        this._sp.once('open', this._onOpen.bind(this));
        
        /* port opening may fail, port will emit close if it's 
         * disconnected, which may happen when one is using a usb dongle 
         */
        this._sp.once('error', (err) => { this.emit('error', err); });
        this._sp.once('close', (err) => {
            /* terminate stream */
            this.push(null);
            this._isOpen = false;
            /* abnormal port close? */
            if (err)
                this.emit('error', err);
            /* emit close event */
            this.emit('close');
        });
    }
    
    /* getters */
    get chainLength() { return this._chainLength }
    get hashRate() { return this._hashRate }
    get timeout() { return this._timeout }
    get workCount() { return this._workID }
    
    /* close miner: this basically ends the operation. one should never 
     * push any more jobs after calling this function */
    close(callback)
    {
        /* lock resource and close serial port */
        this._mutex.lock(() => {
            this._sp.close(callback);
        });
    }
    
    /* flush data from the input buffer */
    flush()
    {
        this._jobs.flush();
    }
    
    /* serial port opened */
    async _onOpen(error)
    {
        /* get chip addressing */
        const getLen = Util.promisify(this._getChainAddressing.bind(this));
        /* get hash rate function */
        const getHashRate = Util.promisify(this._getHashRate.bind(this));
        /* configure clock */
        const setFreq = Util.promisify(this._setFrequency.bind(this));
        
        /* try to communicate with miner */
        try {
            /* 1. set frequency */
            await setFreq(this._frequency);
            /* 2. start by reading status, number of status responses 
             * corresponds with the number of chips in chain */
            this._chainLength = (await getLen()).length;
            /* no chips in chain? */
            if (this._chainLength == 0)
                throw new Error("No chips detected");

            /* 3. time to evaluate the hash rate */
            this._hashRate = await getHashRate();
            /* if we dont't have the timeout defined then let's use the 
             * hash rate to estimate */
            if (this._timeout == null)
               this._timeout = (Math.pow(2, 32) * 1000) / 
                    this._hashRate;
                         
            /* yaay! chain initialized, we can now emit the open event 
             * to share the joy of succesfull initialization with all
             * that may find it interesting! */
            /* miner opened? */
            this._isOpen = true; this.emit('open');
        /* catch errors */
        } catch (error) {
            /* close port - there is noting else to do ;-( */
            this._sp.close();
            this.emit('error', error);
        }
    }
    
    /* get chain information: returns array of chip addresses */
    _getChainAddressing(callback)
    {
        /* wait for mining hardware to become available */
        this._mutex.lock(() => {
            /* send job data to the hashing chips chain */
            this._readReg(0x00, (error, res) => {
                /* release the hardware */
                this._mutex.release();
                /* array for addresses */
                var addresses = new Array(res.length);
                /* extract chip addresses: these are hidden in 3rd byte 
                 * of every response */
                for (var i = 0; i < res.length; i++)
                    addresses[i] = res[i][3];
                  
                /* return chain information */
                callback(null, addresses);
            });
        });
    }
    
    /* get hash rate of chip chain */
    _getHashRate(callback)
    {
        /* let's use a test block to test our hash rate. this 
         * block has two one valid nonce values (meaining >= 32 leading 
         * zeros in hash) and thanks to that we should expect every chip 
         * to respond twice. we can use the time difference between two 
         * responses to solve the single chip chain situation */
        var work = Buffer.from("4679ba4ec99876bf4bfe086082b40025" +
            "4df6c356451471139a3afa71e48f544a" +
            "00000000000000004000000000000000" +
            "0000000087320b1a1426674f2fa722ce", 'hex');
        /* nonce value for given work */
        var expectedNonce = 0x000187a2;
        /* used work id:, we use negated job id to avoid messing with 
         * normal jobs, timestamps array */
        var workID = ~this._workID | 0, Ts = [];
        
        /* end operation */
        var end = () => {            
            /* look for minimal time between two timestamps */
            for (var i = 0; i < Ts.length - 1; i++) {
                /* get delta */
                let delta = Ts[i+1] - Ts[i];
                /* update min value */
                var timeDiff = !timeDiff ? delta : 
                    Math.min(timeDiff, delta);
            }
            /* unsubscribe */
            this._parser.removeListener('data', resultReader);
            /* release the hardware */
            this._mutex.release();
            
            /* no error? */
            if (timeDiff) {
                callback(null, Math.pow(2, 32) * 1000 / timeDiff);
            /* report error! */
            } else {
                callback(new Error("Hashrate Measurement error"));
            }
        }
        
        /* proces results here */
        var resultReader = (result) => {
            /* extract id and nonce from the result */
            var nonce = result.readUInt32BE(0), id = result[4] & 0x1f;
            /* oops! id mismatch, invalid nonce */
            if (id != (workID & 0x1f) || nonce != expectedNonce) {
                return;
            }
            /* push timestamp */
            Ts.push(Date.now());
        };
        
        /* wait for mining hardware to become available */
        var start = () => {
            /* start reading the responses */
            this._parser.on('data', resultReader);
            /* send job data to the hashing chips chain */
            this._sendJob(work, ~this._workID | 0, () => {
                setTimeout(end, 4000);
            });
        };
        
        /* wait for mining hardware to become available */
        this._mutex.lock(start);
    }
    
    /* mining process function: fetches jobs, parses responses and 
     * produces response events. ends execution when there are no more 
     * jobs to process, callback is called when mining process starts */
    _miningStart(callback)
    {
        /* current job and previous job associated with results */
        var currJob, prevJob;
        
        /* mining end function */
        var miningEnd = (pause) => {
            /* remove results listener */
            this._parser.removeListener('data', resultReader);
            /* after all work has been done we still may have last 
             * job stored as previousJob. it would be a shame if we
             * would just simply discard it */
            if (prevJob && prevJob.MiningResult.nonces.length != 0)
                this.push(prevJob);
            /* release the lock */
            this._mutex.release();
            /* miner is no longer running */
            this._minerRunning = false;
            /* we can now annouce that the miner has stopped */
            this.emit('stop');
        }
        
        /* single iteration of job writer: fetch job, schedule next 
         * execution after timeout OR if there are no more jobs then
         * do the cleanup and leave the mining process */
        var jobWriter = () => {
            /* push previous job to the stream if it contains at least 
             * one result */
            if (prevJob && prevJob.miningResult.nonces.length != 0) {
                /* get rid of id */
                delete prevJob.miningJob.id;
                var nonceArray = prevJob.miningResult.nonces;
                /* re-format nonces to strings */
                for (var i = 0; i < nonceArray.length; i++)
                    nonceArray[i] = nonceArray[i].toString(16).
                        padStart(8, '0');
                /* store output */
                this.push(prevJob);
            }
                
            /* shift jobs */
            prevJob = currJob;
            /* nothing left to do: no further work */
            if (!(currJob = this._jobs.tryDequeue()))
                return miningEnd();
                
            /* set job id: this is used for assigning jobs to 
             * responses */
            currJob.miningResult = new MiningResult();
            /* append work id to mining job */
            currJob.miningJob.id = this._workID;             
            /* send job data to the hashing chips chain */
            this._sendJob(currJob.miningJob, currJob.miningJob.id);
            
            /* set next job id (32 bit) */
            this._workID = (this._workID + 1) | 0;
            /* start timeout for the next job writing */
            setTimeout(jobWriter, this._timeout);
        }
        
        /* result reading function */
        var resultReader = (result) => {
            /* job that is related to this response */
            var relatedJob = null;
            /* extract id and nonce from the result */
            var nonce = result.readUInt32LE(0), id = result[4] & 0x1f;
            /* previous job match? */
            if (prevJob && (prevJob.miningJob.id & 0x1f) == id) {
                relatedJob = prevJob;
            /* current job match? */
            } else if (currJob && (currJob.miningJob.id & 0x1f) == id) {
                relatedJob = currJob;
            /* orphaned result? */
            } else {
                return;
            }
            /* append unique results */
            if (relatedJob.miningResult.nonces.indexOf(nonce) == -1)
                relatedJob.miningResult.nonces.push(nonce);
        };
        
        /* start mining function */
        var miningStart = () => {
            /* miner is now running */
            this._minerRunning = true;
            /* notify others that the miner is now running, we do this
             * on the next tick to allow for full execution of 
             * _miningStart before executing any of the callbacks */
            process.nextTick(() => { callback(); this.emit('start'); });
            /* start reading the responses */
            this._parser.on('data', resultReader);
            /* this will start the job writer */
            jobWriter();
        };

        /* wait for the mining hardware to become available and start 
         * mining process */
        this._mutex.lock(miningStart);
    }
    
    /* stream write function */
    _write(chunk, encoding, callback)
    {
        /* validate type */
        if (!(chunk.miningJob instanceof MiningJob))
            return callback(new TypeError("input must be of " +
                "MiningJob type"));
        
        /* miner is */
        if (!this._isOpen)
            return callback(new Error("Writing while miner is closed"));
            
        /* enqueue next job element */
        this._jobs.enqueue(chunk, () => {
            /* miner was disabled? */
            if (!this._minerRunning) {
                this._miningStart(callback);
            /* miner up and running: we can exit immediately */
            } else {
                callback();
            }
        });
    }
    
    _final(callback)
    {
        this.close(callback);
    }
    
    /* stream read function */
    _read(size)
    {
    }

    /* send work, mark it with given id: chips return this value as the
     * last byte of their response part. only 5 bytes are available */
    _sendJob(job, id, callback)
    {
        /* work buffer */
        var buf;
        
        /* perform conversion of mining job */
        if (job instanceof MiningJob) {
            /* allocate memory */
            buf = Buffer.alloc(64);
            /* store midstate and data */
            var ms = Buffer.from(job.midstate, 'hex');
            var jd = Buffer.from(job.data, 'hex').slice(64, 76);
            /* bit fiddle & copy */
            ms.reverse().copy(buf, 0);
            jd.reverse().copy(buf, 52);
            /* get id */
            buf[51] = (id == null ? job.id : id) & 0x1f;
        /* simply use the buffer */
        } else {
            buf = job, buf[51] = id & 0x1f;
        }

        /* write data */
        this._sp.write(buf, callback);
    }
    
    /* set pll frequency of the chips in chain */
    _setFrequency(frequency, callback)
    {
        /* use associative array for lut */
        const freqLUT = {
            "100" : 0x0381, "125" : 0x0481, "150" : 0x0581, 
            "175" : 0x0681, "193" : 0x4F02, "200" : 0x0781, 
            "225" : 0x0885, "250" : 0x0981, "275" : 0x0A81, 
            "300" : 0x0B81, "325" : 0x0C81, "350" : 0x0D81, 
            "375" : 0x0E81, "400" : 0x0F81
        };
        
        /* get frequency coding word */
        const code = freqLUT[frequency.toString()];
        /* unsupported frequency? */
        if (!code)
            return callback(new Error("Unknown frequency setting, " +
                "please use these: " + Object.keys(freqLUT)));
        
        /* request */
        var req = Buffer.from([0x82, (code >> 8) & 0xff, 
            code & 0xff, 0x00]);
        

        /* send request */
        this._xmitCmd(req, () => {
            /* schedule timeout for pll stabilization & read status 
             * register (this helps for stability) */
            setTimeout(() => this._readReg(4, callback), 500);
        });
    }
    
    /* deactivate chain */
    _chainInactive(callback)
    {
        /* request */
        var req = Buffer.from([0x85, 0x00, 0x00, 0x00]);
        /* send request */
        this._xmitCmd(req, callback);  
    }
    
    /* read register command addressed to all chips */
    _readReg(regAddr, callback)
    {
        /* request */
        var req = Buffer.from([0x84, 0x00, regAddr, 0x00]);
        /* send request */
        this._xmitCmd(req, callback);   
    }
    
    /* xmit command */
    _xmitCmd(cmd, callback)
    {
        /* buffer for results */
        var res = [];
                
        /* got data? */
        var onData = (data) => { 
            /* check data consistency */
            if (CRC5(data, 40) == 0)
                res.push(data); 
        };
       
        /* prepare timeout logic */
        setTimeout(() => {
            /* get rid of listener */
            this._parser.removeListener('data', onData);
            /* report result */
            callback(null, res);
        }, 100);
        
        /* set checksum */
        cmd[3] = CRC5(cmd, 27);
        /* subscribe to data events */
        this._parser.on('data', onData);
        /* send command */
        this._sp.write(cmd);
    }
}

/* export class */
module.exports = BM1380;