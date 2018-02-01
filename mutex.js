/* used for event generation */
const Events = require('events');

/* mutex class */
class Mutex
{
    /* class constructor */
    constructor(locked)
    {
        /* mutex is not locked by default */
        this._locked = locked || false;
        /* used for private events generation */
        this._ee = new Events.EventEmitter();
        
        /* bind methods */
        this.lock = this.lock.bind(this);
        this.release = this.release.bind(this);
    }
    
    /* lock semaphore for given number of accesses (or one if no 
     * 'count' is given) */
    lock(callback)
    {
        /* aquire lock */
        var onRelease = () => {
            /* still locked? */
            if (this._locked)
                return;
                
            /* drop the number of credits */
            this._locked = true;
            /* remove listener */
            this._ee.removeListener('release', onRelease);
            /* call callback */
            process.nextTick(() => callback());
        };
        
        /* mutex is locked: wait for release */
        if (this._locked) {
            this._ee.on('release', onRelease);
        /* not locked */
        } else {
            /* drop the number of credits */
            this._locked = true;
            /* call callback */
            process.nextTick(() => callback());
        }
    }
    
    /* release lock */
    release()
    {
        /* simply flip the flag */
        this._locked = false;
        /* emit event */
        process.nextTick(() => this._ee.emit('release'));
    }
}

/* export class */
module.exports = Mutex;