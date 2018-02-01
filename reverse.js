/* reverse array */
function reverse(buf, start, end)
{
    /* take a slice */
    b = buf.slice(start || 0, end);
    
    /* string version */
    if (typeof buf === 'string' || buf instanceof String) {
        b = b.split("").reverse().join("");
    /* array/buffer vesion */
    } else {
        for (var t, i = 0, j = b.length - 1; i < j; i++, j--)
            t = b[i], b[i] = b[j], b[j] = t;
    }
    
    /* return result */
    return b;
}

/* export function */
module.exports = reverse;