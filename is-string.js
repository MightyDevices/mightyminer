/* is string */
function isString(o) 
{
    return Object.prototype.toString.call(o) === '[object String]';
}

module.exports = isString;