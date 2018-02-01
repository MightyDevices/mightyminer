/* compute crc5 over given number of bits */
function CRC5 (data, len)
{
    var i, j, k, index = 0;
    var crc = 0x1f;
    /* registers */
    var crcin = [1, 1, 1, 1, 1];
    var crcout = [1, 1, 1, 1, 1];
    var din = 0;
    
    /* push data bits */
    for (j = 0x80, k = 0, i = 0; i < len; i++) {
        /* input bit */
        din = (data[index] & j) != 0;
        /* shift register */
        crcout[0] = crcin[4] ^ din;
        crcout[1] = crcin[0];
        crcout[2] = crcin[1] ^ crcin[4] ^ din;
        crcout[3] = crcin[2];
        crcout[4] = crcin[3];
        /* next bit */
        j >>= 1, k++;
        /* next byte */
        if (k == 8)
            j = 0x80, k = 0, index++;
        /* apply new shift register value */
        crcin = crcout.slice(0);
    }
    
    crc = 0;
    /* extract bitmask from register */
    if (crcin[4]) crc |= 0x10;
    if (crcin[3]) crc |= 0x08;
    if (crcin[2]) crc |= 0x04;
    if (crcin[1]) crc |= 0x02;
    if (crcin[0]) crc |= 0x01;
    
    return crc;
}

/* export function */
module.exports = CRC5;