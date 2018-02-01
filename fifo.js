/* used for event generation */
var Events = require('events');

/* async fifo class */
class Fifo extends Events.EventEmitter
{
    /* constructor */
    constructor(size)
    {
        /* call event emitter class constructor */
        super();
        
        /* initalize values */
        this._q = [];
        this._size = size;
        
        /* bindings */
        this.enqueue = this.enqueue.bind(this);
        this.dequeue = this.dequeue.bind(this);
        this.tryDequeue = this.tryDequeue.bind(this);
    }
    
    /* enqueue element */
    enqueue(element, callback)
    {
        /* wait for dequeue event to be emited */
        var dequeued = () => {
            /* no space in queue? */
            if (this._size && this._q.length == this._size)
                return;
            
            /* store value */
            this._q.push(element);
            /* listener is no longer needed */ 
            this.removeListener('dequeue', dequeued);
            /* notify others on the next event loop iteration */
            process.nextTick(() => this.emit('enqueue'));
            
            /* execute callback */
            callback(null);
        };
        
        /* subscripe to dequeue event */
        this.on('dequeue', dequeued);
        /* force execution to check if we have free space in queue */
        dequeued();
    }
    
    /* dequeue element */
    dequeue(callback)
    {
        /* wait for enqueue event to be emited */
        var enqueued = () => {
            /* no elements in queue? */
            if (this._q.length == 0)
                return;
                
            /* get element from queue */
            var element = this._q.shift();
            /* remove listener */
            this.removeListener('enqueue', enqueued);
            /* notify others on the next event loop iteration */
            process.nextTick(() => this.emit('dequeue'));
            
            /* return value from fifo */
            callback(null, element);
        };
        
        /* subscripe to enqueue event */
        this.on('enqueue', enqueued);
        /* force execution to check if we have elements in queue */
        enqueued();
    }
    
    /* synchronous dequeue operation: returns element or null if there 
     * is nothing on the queue */
    tryDequeue()
    {
        /* no element on queue */
        if (this._q.length == 0)
            return null;
        
        /* notify others on the next event loop iteration */
        process.nextTick(() => this.emit('dequeue'));
        /* return element value */
        return this._q.shift();
    }
    
    /* flush all data */
    flush()
    {
        this._q.length = 0;
        /* emit dequeue event */
        this.emit('dequeue');
    }
}

/* export class */
module.exports = Fifo;