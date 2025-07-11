/** @format */

'use strict';

let util = require('util');
let zlib = require('zlib');
let net = require('net');
let textPacketStream = require('./textpacket.js');

function logFunc() {}
logFunc.debug = function (msg) {
    //console.log('DEBUG: ' + msg);
};
logFunc.info = function (msg) {
    console.log('INFO: ' + msg);
};
logFunc.crit = function (msg) {
    console.log('CRIT: ' + msg);
};

function textChannelManager() {
    this.serverList = [];
    this.serverPos = 0;
    this.getChannel = this.getChannelFunction();
}

textChannelManager.prototype.create = function (serverInfos, svrName, timeObj, callFunc, onLog) {
    let serverIndex = 0;
    serverInfos.forEach((serverInfo) => {
        if (serverInfo.count <= 0) return;

        let channelCount = serverInfo.count || 1;
        let channelList = [];
        for (let i = 0; i < channelCount; i++) {
            let svrSession = new textChannel(i, serverInfo, svrName + '-' + serverIndex, timeObj, onLog);
            svrSession.setCallback(callFunc);
            svrSession.start();
            channelList.push(svrSession);
        }

        serverIndex++;
        this.serverList.push(channelList);
    });

    this.checkChannel(timeObj.idleTimeOut);
};

textChannelManager.prototype.getChannelFunction = function () {
    let svrPos = 0;
    return function () {
        if (this.serverList.length === 0) {
            return null;
        }
        if (svrPos > 1000000) svrPos = 0;
        let pos = svrPos++ % this.serverList.length;
        if (this.serverList[pos].length === 1) {
            return this.serverList[pos][0].active ? this.serverList[pos][0] : null;
        }

        let channelCount = this.serverList[pos].length;
        do {
            let channel = this.serverList[pos].shift();
            this.serverList[pos].push(channel);
            if (channel.active) {
                return channel;
            }
        } while (--channelCount > 0);
        return null;
    };
};

textChannelManager.prototype.writeData = function (trid, data, cb) {
    if (this.serverList.length === 0) {
        return cb(-1, 'NOT_USE_SERVER');
    }

    let channel = this.getChannel();
    if (channel != null) {
        channel.writeData(trid, data, cb);
    } else {
        cb(-1, 'NOT_FOUND_CHANNEL');
    }
};

textChannelManager.prototype.checkChannel = function (checkTime) {
    if (!checkTime || checkTime === 0) {
        return;
    }
    setInterval(() => {
        for (let i = 0; i < this.serverList.length; i++) {
            this.serverList[i].forEach((channel) => {
                if (channel.active === true) {
                    let diff = new Date() - channel.recvTime;
                    // idle time 50% 이면 channel check (recvtime 갱신)
                    if (diff > checkTime / 2) {
                        channel.writeData(0, 'PONG 0 0\r\n');
                    }
                }
            });
        }
    }, 1000);
};

textChannelManager.prototype.getStatus = function () {
    let msg = '';
    for (let i = 0; i < this.serverList.length; i++) {
        this.serverList[i].forEach((channel) => {
            if (channel.active === true) {
                msg += channel.getName() + ' ' + channel.reqCount + '\r\n';
                channel.reqCount = 0;
            }
        });
    }
    return msg;
};

module.exports = textChannelManager;

function textChannel(index, connectInfo, serverName, timeObj, logger) {
    this.logger = logger || logFunc;

    this.index = index;
    this.connectInfo = connectInfo;
    this.cycleReconnect = timeObj && timeObj.cycleReconnect ? timeObj.cycleReconnect : 1000;
    this.idleTimeOut = timeObj && timeObj.idleTimeOut ? timeObj.idleTimeOut : 30000;
    this.recvTimeOut = timeObj && timeObj.recvTimeOut ? timeObj.recvTimeOut : 3000;
    this.recvTime = new Date();

    this.active = false;
    this.reconnect = false;
    this.retry = 0;

    this.onConnect = null;
    this.onReceive = null;
    this.onDisconnect = null;
    this.onError = null;

    this.textSocket = null;
    this.localInfo = '';
    this.remoteInfo = '';

    this.cbObjects = {};
    this.serverName = serverName + ':' + this.index;

    if (this.recvTimeOut != 0) {
        setInterval(() => {
            this.checkRecvTimeOut();
        }, 1000);
    }

    this.reqCount = 0;
}

textChannel.prototype.getName = function () {
    return this.serverName;
};

textChannel.prototype.setCallback = function (callFunc) {
    this.onConnect = callFunc && callFunc.onConnect ? callFunc.onConnect : null;
    this.onReceive = callFunc && callFunc.onReceive ? callFunc.onReceive : null;
    this.onDisconnect = callFunc && callFunc.onDisconnect ? callFunc.onDisconnect : null;
    this.onError = callFunc && callFunc.onError ? callFunc.onError : null;
};

textChannel.prototype.setReconnectTimer = function (socket) {
    let self = this;

    if (self.reconnect == false) {
        socket.destroy();
        this.reconnect = true;

        this.packetRefresh();
        setTimeout(function () {
            self.start();
        }, this.cycleReconnect);
    }
};

textChannel.prototype.checkRecvTimeOut = function () {
    let curTime = new Date();
    for (let key in this.cbObjects) {
        let cbObject = this.cbObjects[key];
        if (curTime - cbObject.time > this.recvTimeOut) {
            this.logger.debug('textchannel_ERR >>TRID: ' + key + ' recvTimeOut_DIFF: ' + (curTime - cbObject.time));
            if (cbObject.cb) {
                cbObject.cb(-1, 'RECV_TIMEOUT');
            }
            delete this.cbObjects[key];
        }
    }
};

textChannel.prototype.packetRefresh = function () {
    let count = 0;
    for (let key in this.cbObjects) {
        let chObject = this.cbObjects[key];
        count++;
        if (chObject.cb) {
            chObject.cb(-1, 'PK_REFRESH_CHANNEL');
        }
    }
    if (count != 0) {
        this.logger.crit('textchannel_ERR >> Refresh Channel ' + this.serverName + ' PK: ' + count);
    }
    this.cbObjects = {};
};

textChannel.prototype.start = function () {
    try {
        this.logger.info('textchannel INFO: Channel Start => ' + JSON.stringify(this.connectInfo));

        let self = this;
        self.reconnect = false;
        let textStream = new textPacketStream();
        textStream.on('error', function () {
            self.logger.debug('textchannel_ERR: Invalid text channel stream. ' + this.serverName);

            self.textSocket.unpipe(textStream);
            self.textSocket.destroy();
        });

        textStream.on('data', function (data) {
            let str_data = data.toString();
            let delimiter_len = 2;
            let header = '';
            let body = '';
            let idx = str_data.indexOf('\r\n');

            if (idx < 0) {
                idx = str_data.indexOf('\n');

                if (idx < 0) {
                    // no body.
                    header = str_data;
                } else {
                    delimiter_len = 1;
                    header = str_data.substr(0, idx);
                    if (str_data.length > idx + delimiter_len) body = str_data.substr(idx + delimiter_len);
                }
            } else {
                header = str_data.substr(0, idx);
                if (str_data.length > idx + delimiter_len) body = str_data.substr(idx + delimiter_len);
            }

            if (body.length == 0) {
                self.logger.debug('textchannel_RECV: >> ' + header);
            } else if (body.length > 0) {
                self.logger.debug(util.format('textchannel_RECV: >> [Header] : %s [Body Len] : %d', header, body.length));
            }

            setImmediate(
                function () {
                    this.self.recvTime = new Date();

                    let param = header.split(' ');
                    if (param.length < 2) {
                        this.self.logger.crit('textchannel_ERR: >> INVALID PACKET: ' + param);
                        return;
                    }

                    if (param[0] == 'STAT') {
                        return;
                    } else if (param[0] == 'PING') {
                        this.self.writeData(0, 'PONG 0\r\n');
                        return;
                    }
                    // PLAN/GZIP
                    if (param[param.length - 2] && param[param.length - 2] === 'GZIP') {
                        // BASE64 & GZIP
                        try {
                            this.body = zlib.gunzipSync(Buffer.from(this.body, 'base64')).toString('utf8');
                        } catch (e) {
                            this.self.logger.crit('textchannel_ERR: >> DECODING ERROR: ' + e.message);
                        }
                    }

                    // 1Step: Call Back Function
                    if (this.self.cbObjects[param[1]]) {
                        this.self.cbObjects[param[1]].cb(0, param, this.body, this.self);
                        delete this.self.cbObjects[param[1]];
                    }
                    // 2 Step: Recevie Function
                    else if (self.onReceive) {
                        this.self.onReceive(param, this.body, this.self);
                    }
                }.bind({ self: self, header: header, body: body })
            );
        });

        this.textSocket = new net.Socket();
        this.textSocket.setEncoding('utf8');

        this.textSocket.connect(self.connectInfo, function () {
            self.localInfo = this.localAddress + ':' + this.localPort;
            self.remoteInfo = this.remoteAddress + ':' + this.remotePort;
            //self.logger.debug(util.format('textchannel: connect to %s : local=%s, remote=%s', self.serverName, self.localInfo, self.remoteInfo));
            self.writeData(0, 'HELO 0 ' + self.serverName + ' PLAN 0\r\n');
            self.active = true;
            if (self.onConnect) {
                self.onConnect(self.localInfo, self.remoteInfo, self);
            }
        });

        this.textSocket.on('timeout', function () {
            self.logger.debug('textchannel_debug: Idle time out at ' + self.serverName);
            // force close
            this.destroy();
        });

        this.textSocket.on('connection', function (data) {
            self.localInfo = this.localAddress + ':' + this.localPort;
            self.remoteInfo = this.remoteAddress + ':' + this.remotePort;
            // self.logger.debug(util.format('textchannel: connection to %s : local=%s, remote=%s', self.serverName, self.localInfo, self.remoteInfo));
            self.active = true;
            self.writeData(0, 'HELO 0 ' + self.serverName + ' PLAN 0\r\n');
            if (self.onConnect) {
                self.onConnect(self.localInfo, self.remoteInfo, self);
            }
        });
        /*
        this.textSocket.on('data', function (data) {});
        */

        this.textSocket.on('error', function (err) {
            self.logger.debug('textchannel_ERR: Error occured at ' + self.serverName);
            self.logger.debug('textchannel_ERR: ------------------------------------------------------');
            self.logger.debug('textchannel_ERR: ' + err);
            self.logger.debug('textchannel_ERR: ------------------------------------------------------');

            self.active = false;
            self.textSocket.unpipe(textStream);
            self.setReconnectTimer(this);

            if (self.onError) {
                self.onError(err, self);
            }
        });

        this.textSocket.on('end', function () {
            self.logger.crit('textchannel_INFO: End !!!!! ' + self.serverName);
        });

        this.textSocket.on('close', function () {
            self.logger.crit('textchannel_INFO: Closed !!!!! ' + self.serverName);

            self.active = false;
            self.textSocket.unpipe(textStream);
            self.setReconnectTimer(this);

            if (self.onDisconnect) {
                self.onDisconnect(self);
            }
        });

        this.textSocket.setTimeout(self.idleTimeOut);
        this.textSocket.pipe(textStream);

        return true;
    } catch (e) {
        this.logger.debug('textchannel_ERR: Error occured. ' + e);
        return false;
    }
};

textChannel.prototype.writeData = function (trid, data, cbFunc) {
    let self = this;
    let success = false;

    try {
        success = this.textSocket.write(data);
        if (!success) {
            (function (data) {
                self.textSocket.once('drain', function () {
                    self.writeData(data);
                });
            })(data);
        }

        self.logger.debug('textchannel_SEND << TRID: ' + trid + ' SIZE: ' + data.toString().length + ' bytes.');
        if (cbFunc && trid != 0) {
            this.reqCount++;
            this.cbObjects[trid] = { time: new Date(), cb: cbFunc };
        }
    } catch (e) {
        self.logger.debug('textchannel_ERR: Error Write occured. ' + e);
    }
};
