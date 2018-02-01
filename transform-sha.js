/* is string function s*/
const isString = require('./is-string');

/* process single data block (64 bytes), use state vector if given or 
 * standard inital values */
function transformSHA(data, Hinput, outputEncoding)
{
    /* round constats */
    var K = new Uint32Array([
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 
        0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 
        0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 
        0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 
        0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 
        0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 
        0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 
        0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ]);

    /* initial state was given? explicitly */
    if (Hinput) {
        /* allocate mem for state vector */
        H = new Uint32Array(8);
        /* convert input data to buffer for further work */
        var src = isString(Hinput) ? Buffer.from(Hinput, 'hex') : Hinput;
        /* copy values */
        for (var i = 0; i < H.length; i++)
            H[i] = src.readUInt32BE(i*4);
    /* no initial state - use default value */
    } else {
        /* standard initial values as defined in SHA256 specification */
        H = new Uint32Array([
            0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 
            0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
        ]);
    }
    
    /* data input */
    var W = new Uint32Array(64);
    /* data words */
    var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], 
        g = H[6], h = H[7];
    /* temp variables */
    var e0, e1, ch, ma, s0, s1, t1, t2, wt;
    
    /* rotate right function */
    function ror (x, num) {
        return (x >>> num) | (x << (32 - num));
    };
    
    /* extend data input */
    for (var i = 0; i < 16; i++)
        W[i] = data.readUInt32BE(i * 4);
    /* rest of extended data is computed from first 16 words */    
    for (var i = 16; i < 64; i++) {
        s0 = ror(W[i-15], 7) ^ ror(W[i-15], 18) ^ (W[i-15] >>> 3);
        s1 = ror(W[i-2], 17) ^ ror(W[i-2], 19) ^ (W[i-2] >>> 10);
        W[i] = W[i-16] + s0 + W[i-7] + s1;
    }
    
    /* 64 rounds */
    for (var i = 0; i < 64; i++) {   
        /* state related functions */
        s1 = ror(e, 6) ^ ror(e, 11) ^ ror(e, 25);
        ch = (e & f) ^ ((~e) & g);
        t1 = h + s1 + ch + K[i] + W[i];
        s0 = ror(a, 2) ^ ror(a, 13) ^ ror(a, 22);
        ma = (a & b) ^ (a & c) ^ (b & c); 
        t2 = s0 + ma;
        
        /* shift words */
        h = g; g = f; f = e; e = (d  + t1) | 0;
        d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    
    /* final summation */
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; 
    H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0;
    H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;

    /* allocate result array, we may use the unsafe version because the
     * buffer is getting completely filled with data anyway */
    var result = Buffer.allocUnsafe(32);
    /* build up the buffer around UInt32Array, we use BE notation to 
     * stay compatible with standars hashing functions */
    for (var i = 0; i < 8; i++)
        result.writeUInt32BE(H[i], i * 4);
    
    /* return as byte buffer */
    return outputEncoding === 'hex' ? result.toString('hex') : result;
}

/* export function */
module.exports = transformSHA;