var stream = require('stream');


class MyReadable extends stream.Readable {
  constructor(options) {
    super(options);
  }
  _read(size) {
    this.push({a: 1});
  }
}

var x = new MyReadable({objectMode: false});
x.pipe(process.stdout);
