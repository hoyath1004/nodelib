/** @format */

'use strict';

var stream = require('stream');
var util = require('util');

const MAX_HPARAM_SIZE = 4096 * 2;
const DEFAULT_BUFFER_SIZE = 2048;

// convinience API
module.exports = function (readStream, options) {
    return module.exports.createStream(readStream, options);
};

// basic API
module.exports.createStream = function (readStream, options) {
    if (readStream) {
        return createPacketStream(readStream, options);
    } else {
        return new text_packet_stream(options);
    }
};

function createPacketStream(readStream, options) {
    if (!readStream) {
        throw new Error('expected readStream.');
    }
    if (!readStream.readable) {
        throw new Error('readStream must be readable.');
    }
    var ls = new text_packet_stream(options);

    readStream.pipe(ls);
    return ls;
}

module.exports.packet_stream = text_packet_stream;

function text_packet_stream(options) {
    stream.Transform.call(this, options);
    options = options || {};

    // use objectMode to stop the output from being buffered
    // which re-concatanates the lines, just without newlines.
    this._readableState.objectMode = true;

    // receive data / size
    this._receivedData = Buffer.alloc(DEFAULT_BUFFER_SIZE);
    this._receivedSize = 0;

    this._packetBuffer = [];

    // header = 0, body = 1
    this._packetMode = 0;
    this._remainBody = 0;

    // All packet completed : 0, Packet transfering : 1
    this._keep = 0;

    // take the source's encoding if we don't have one
    this.on('pipe', function (src) {
        if (!this.encoding) {
            // but we can't do this for old-style streams
            if (src instanceof stream.Readable) {
                this.encoding = src._readableState.encoding;
            }
        }
    });
}

function isBodyPacket(cmd) {
    if (cmd === 'PRGR' || cmd === 'PING' || cmd === 'HELO' || cmd === 'STAT' || cmd == 'PONG') return false;
    // Almost commands have a body.
    else return true;
}

function getBytes(str) {
    return Buffer.byteLength(str, 'utf8');
}

util.inherits(text_packet_stream, stream.Transform);

text_packet_stream.prototype._process_remain = function () {
    var check = this._remainBody - this._receivedSize;

    if (check < 0) {
        // <-- Previous packet's body --><--   New packet   -->
        // xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxGETD 0 xxxxxx ....\r\n

        var chunkBody = this._receivedData.slice(0, this._remainBody);
        this._packetBuffer[this._packetBuffer.length - 1] += chunkBody.toString('utf-8');

        this._receivedSize -= this._remainBody;

        // buffer initialize / saving next packet
        var _tmp = Buffer.alloc(this._receivedSize > DEFAULT_BUFFER_SIZE ? this._receivedSize : DEFAULT_BUFFER_SIZE);
        this._receivedData.copy(_tmp, 0, this._remainBody, this._remainBody + this._receivedSize);
        this._receivedData = _tmp;

        this._remainBody = 0;
        this._packetMode = 0;

        this._keep = 1; // last one is not ready
    } else if (check == 0) {
        var chunkBody = this._receivedData.slice(0, this._receivedSize);
        this._packetBuffer[this._packetBuffer.length - 1] += chunkBody.toString('utf-8');

        // buffer initialize
        if (this._receivedData.length > DEFAULT_BUFFER_SIZE) {
            this._receivedData = Buffer.alloc(DEFAULT_BUFFER_SIZE);
        }

        this._receivedSize = 0;
        this._remainBody = 0;
        this._packetMode = 0;
        this._keep = 0; // everything ready.
    } else {
        // not remain body packet.....
        this._packetMode = 1;
        this._keep = 1; // last one is not ready
    }
};

text_packet_stream.prototype._transform = function (chunk, encoding, done) {
    // decode binary chunks as UTF-8
    encoding = encoding || 'utf8';

    if (Buffer.isBuffer(chunk)) {
        if (encoding == 'buffer') {
            // chunk = chunk.toString(); // utf8
            encoding = 'utf8';
        } else {
            chunk = chunk.toString(encoding);
        }
    }
    this._chunkEncoding = encoding;

    if (chunk.length <= 0) {
        // console.log('Empty chunk data.'.red);
        return;
    }

    if (this._receivedSize + chunk.length > this._receivedData.length) {
        //console.log('1. write buffer: ' + this._receivedSize + ' chunk: ' + chunk.length + ' body: ' + this._remainBody);
        var _tmp = Buffer.alloc(this._receivedSize + chunk.length);
        this._receivedData.copy(_tmp, 0, 0, this._receivedSize);
        chunk.copy(_tmp, this._receivedSize, 0, chunk.length);

        this._receivedData = _tmp;
        this._receivedSize += chunk.length;
    } else {
        //console.log('2. write buffer: ' + this._receivedSize + ' chunk: ' + chunk.length + ' body: ' + this._remainBody);
        chunk.copy(this._receivedData, this._receivedSize, 0, chunk.length);
        this._receivedSize += chunk.length;
    }

    var delimiter_len = 2;

    while (this._receivedSize > 0) {
        if (this._packetMode == 0) {
            var idx = this._receivedData.indexOf('\r\n', 0, 'utf8');

            if (idx == -1) {
                idx = this._receivedData.indexOf('\n', 0, 'utf8');
                if (idx == -1) {
                    if (this._receivedSize > MAX_HPARAM_SIZE) {
                        done('Received invaild packet. this Packet is not found CRLF: %d', this.chunk.length);
                    } else break;
                } else {
                    delimiter_len = 1;
                }
            } else {
                delimiter_len = 2;
            }

            var currentHeader = this._receivedData.toString('utf-8', 0, idx);
            idx += delimiter_len;

            var items = currentHeader.split(/ /g);
            if (items.length == 0) {
                done('Received invaild packet. length is zero');
                return;
            }

            if (isBodyPacket(items[0])) {
                if (items.length < 3) {
                    // Invalid packet
                    // console.log('Received invaild packet: %d %d [%s]', this._receivedSize, idx, currentHeader);
                    done('Received invaild packet. length less then 3');
                    return;
                }

                this._packetBuffer.push(currentHeader + '\r\n');

                this._packetMode = 1;
                this._remainBody = Number(items[items.length - 1]);

                // copy receive buffer
                this._receivedSize -= idx;

                if (this._receivedData.length < this._remainBody) {
                    var bufSize = this._remainBody > this._receivedSize ? this._remainBody : this._receivedSize;
                    var _tmp = Buffer.alloc(bufSize);

                    if (this._receivedSize > 0) {
                        this._receivedData.copy(_tmp, 0, idx, idx + this._receivedSize);
                    }

                    this._receivedData = _tmp;
                } else {
                    if (this._receivedSize > 0) {
                        this._receivedData.copy(this._receivedData, 0, idx, idx + this._receivedSize);
                    }

                    this._receivedData.fill(0, this._receivedSize);
                }

                this._process_remain();
            } else {
                this._packetBuffer.push(currentHeader);

                this._receivedSize -= idx;
                if (this._receivedSize > 0) {
                    this._receivedData.copy(this._receivedData, 0, idx, idx + this._receivedSize);
                }

                if (this._receivedSize > 0) this._receivedData.fill(0, this._receivedSize);

                this._packetMode = 0;
                this._remainBody = 0;
                this._keep = 0;
            }
        } else if (this._packetMode == 1 && this._remainBody <= this._receivedSize) {
            this._process_remain();
        } else {
            break;
        }
    }
    this._pushBuffer(encoding, this._keep, done);
};

text_packet_stream.prototype._pushBuffer = function (encoding, keep, done) {
    while (this._packetBuffer.length > keep) {
        var packet = this._packetBuffer.shift();

        if (packet.length > 0) {
            if (!this.push(this._reencode(packet, encoding))) {
                var self = this;

                setImmediate(function () {
                    self._pushBuffer(encoding, keep, done);
                });
                return;
            }
        }
    }
    done();
};

text_packet_stream.prototype._flush = function (done) {
    this._pushBuffer(this._chunkEncoding, 0, done);
};

// see Readable::push
text_packet_stream.prototype._reencode = function (data, chunkEncoding) {
    if (this.encoding && this.encoding != chunkEncoding) {
        return Buffer.from(data, chunkEncoding).toString(this.encoding);
    } else if (this.encoding) {
        // this should be the most common case, i.e. we're using an encoded source stream
        return data;
    } else {
        return Buffer.from(data, chunkEncoding);
    }
};
