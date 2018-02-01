/* need some sockets */
const Net = require('net');
/* streams */
const Stream = require('stream');
/* used for promysifying */
const Util = require('util');
/* used to read and write whole lines from socket */
const Readline = require('readline');
/* stratum notification data object */
const StratumNotification = require('./stratum-notification');
/* stratum submission */
const StratumSubmission = require('./stratum-submission');

/* stratum client class: produces notifications that can be used to 
 * generate mining jobs, accepts mining result submissions */
class Stratum extends Stream.Duplex
{
    /* class constructor */
    constructor(options)
    {
        /* call event emitter class constructor */
        super({objectMode: true});
        
        /* copy connection options */
        this._host = options.host || '127.0.0.1';
        this._port = options.port || 3333;
        this._user = options.user;
        this._pass = options.pass;
        this._timeout = options.timeout || 5000;
        
        /* this is request id used for combining requests with 
         * responses */
        this._reqID = 1;
        
        /* create a socket */
        this._socket = new Net.Socket();
        /* this is a readline interface which is used to fetch full 
         * lines of data. very useful  since every stratum frame ends 
         * with new line delimiter */
        this._rl = Readline.createInterface(this._socket, this._socket);
        
        /* handle errors, emit these as stream errors */
        this._socket.once('error', (e) => { this.emit('error', e) });
        /* connection closed event */
        this._socket.once('close', () => {
            /* cleanup */
            this._rl.removeAllListeners('line');
            this.emit('close');
            /* end stream */
            this.push(null);
        });
        
        /* send keepalives for connection monitoring */
        this._socket.setKeepAlive(true, 3000);
        /* establish connection to stratum server */
        this._socket.connect(this._port, this._host, 
            this._onConnect.bind(this));
    }
    
    /* close stratum connection */
    close(callback)
    {
        /* got the callback? */
        if (callback)
            this.once('close', callback);
        /* destroy socket */
        this._socket.end();
    }
    
    /* socket connected */
    async _onConnect()
    {
        /* promisified versions of functions */
        const subscribe = Util.promisify(this._subscribe.bind(this));
        const authorize = Util.promisify(this._authorize.bind(this));
        
        /* communication may fail on soooo many different levels */
        try {
            /* attach onLine listener */
            this._rl.on('line', this._onLine.bind(this));
            

            /* subscribe for notifications and store initial 
             * information - it will be necessary for submission 
             * generation */
            this._subscribeInfo = await subscribe();
            /* authorize miner */
            await authorize();
            
            /* we are now authorized */
            this._authorized = true;
            /* stratum is now opened */
            this.emit('open');
            /* push all notifications that came during connection 
             * establishment */
            this._onLine("{}");
            
            /* this is a fix for the situation */
        /* catch errors and terminate connection if any */
        } catch (error) {
            this._socket.destroy(error);
        }
    }
    
    /* line of text was received on socket */
    _onLine(line)
    {
        try {
            /* try to parse json line */
            var json = JSON.parse(line);
            /* emit event */
            process.nextTick(() => this.emit('json', json));
            /* difficulty was announced? */
            if (json.method == 'mining.set_difficulty') {
                /* difficulty will be applied to the next notification */
                this._difficulty = { difficulty : json.params[0] };
            /* notification was received */
            } else if (json.method == 'mining.notify') {
                /* extract all the information */
                this._notification = {
                    jobID : json.params[0],
                    prevHash : json.params[1],
                    coinb1 : json.params[2],
                    coinb2 : json.params[3],
                    merkleBranch : json.params[4],
                    version : json.params[5],
                    nBits : json.params[6],
                    nTime : json.params[7],
                    cleanJobs : json.params[8]
                };
            }
            /* got all required information? */
            if (this._subscribeInfo && this._difficulty && 
                this._notification && this._authorized) {
                /* glue things together */
                var glue = Object.assign({}, this._subscribeInfo, 
                    this._difficulty, this._notification);
                /* push object */
                this.push({ stratumNotification : 
                    new StratumNotification(glue) });
                /* this will prevent duplicate notifications */
                this._notification = null;
            }
        /* catch parsing errors */
        } catch (error) {
            /* this shall cause socket error */
            this._socket.destroy(error);
        }
    }
    
    /* stream write method */
    _write(chunk, encoding, callback)
    {
        /* validate type */
        if (!(chunk.stratumSubmission instanceof StratumSubmission))
            return callback(new TypeError("input must contain " +
                "StratumSubmission type"));
        
        /* valid nonce array */
        var nonces = chunk.stratumSubmission.nonces;
        var notification = chunk.stratumNotification;
        var miningJob = chunk.miningJob;
        
        var i = 0;
        var submit = () => {
            /* end of processing? */
            if (i == nonces.length)
                return callback();
            /* submit result */
            this._submit(notification.jobID, miningJob.extraNonce2,
                notification.nTime, nonces[i++], submit);
        }
        
        submit();
    }
    
    /* stream read method */
    _read(size)
    {
    }
    
    /* subscribe for notifications */
    _subscribe(callback)
    {
        /* message */
        var req = { method : 'mining.subscribe', params : [] };
        /* perform the transaction */
        this._xmit(req, (error, res) => {
            /* command error? */
            if (error)
                return callback(error);
            /* return information from response */
            callback(null, { extraNonce1 : res.result[1],
                extraNonce2Size : res.result[2]});
        });
    }
    
    /* authorize miner */
    _authorize(callback)
    {
        /* message */
        var req = { method : 'mining.authorize', 
            params : [this._user, this._pass] 
        };
        /* perform the transaction */
        this._xmit(req, (error, res) => {
            /* check the result */
            if (error || res.result != true)
                return callback(error || new Error('Authorization failed'));
            /* all ok */
            callback();
        });
    }
    
    /* submit mining result */
    _submit(jobID, extraNonce2, nTime, nonce, callback)
    {
        /* message */
        var req = { method : 'mining.submit',
            params : [this._user, jobID, extraNonce2, nTime, nonce]
        };
        /* perform the transaction */
        this._xmit(req, (error, res) => {
            /* check the result */
            if (error || res.result != true)
                return callback(error || new Error('Submission failed'));
            /* all ok */
            callback();
        });
    }
    
    /* send command, wait for response */
    _xmit(req, callback)
    {
        var done = false;
        
        /* end processing */
        var end = (error, res) => {
            /* prevent multiple executions: timeout is racing with 
             * onJson function */
            if (done)
                return;   
            /* cleanup */
            done = true, clearTimeout(tout);
            /* remove data listener */
            this.removeListener('json', onJson);
            /* end processing */
            callback(error, res);
        };
        
        /* received a json message? */
        var onJson = (res) => {
            /* compare ids */
            if (req.id == res.id)
                end(null, res);
        }
        
        /* timeout logic */
        var tout = setTimeout(() => {
            end(new Error("Timeout"));
        }, this._timeout);

        /* fill id field */
        req.id = this._reqID++;
        /* start reception */
        this.on('json', onJson);
        /* send data */
        this._socket.write(JSON.stringify(req) + '\n');
    }
}

/* export class */
module.exports = Stratum;
