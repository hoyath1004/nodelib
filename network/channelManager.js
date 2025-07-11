/** @format */

'use strict';
const textchannel = require('./textchannel.js');
const os = require('os');
const zlib = require('zlib');

function channelManager(serverName) {
    if (!(this instanceof channelManager)) {
        return new channelManager(serverName);
    }

    this.serverName = serverName;
    this.clientChannel = null;
    this.isEnable = false;
    this.trid = 1;
    this.compress = false;
    this.clients = [];
    let _self = this;

    this.onConnectFunc = function (local, remote, session) {
        if (_self.clients.indexOf(local) === -1) {
            _self.clients.push(local);
            _self.isEnable = _self.clients.length === 0 ? false : true;
            logger.alert(_self.serverName + '_CHMANAGER ==> SUCC_CONNECT L: ' + local + ' R: ' + remote + ' CLIENTS: ' + _self.clients.length);
        }
    };

    this.onReceiveFunc = function (param, body, session) {};
    this.onDisconnetFunc = function (session) {
        let i = _self.clients.indexOf(session.localInfo);
        if (i > -1) {
            _self.clients.splice(i, 1);
            _self.isEnable = _self.clients.length === 0 ? false : true;
            logger.alert(_self.serverName + '_CHMANAGER: ==> DIS_CONNECT L: ' + session.localInfo + ' CLIENTS: ' + _self.clients.length);
        }
    };
    this.onErrorFunc = function (err, session) {};
}
/*
config
{
    "use_native_wgw": false,
        "wgw_name": ["WGW"],
        "servers": {
            "local": {
                "retry_cycle": 3000,
                "idle_timeout": 30000,
                "recv_timeout": 5000,
                "WGW": {
                    "compress": false,
                    "info": [
                        {
                            "host": "dev-03",
                            "port": 3901,
                            "count": 1
                        },
                        {
                            "host": "dev-01",
                            "port": 3901,
                            "count": 0
                        }
                    ]
                }
            },
            "dev": {
            },
            "live": {
            }
}
*/
channelManager.prototype.init = function () {
    let svrInfos = config.get('servers:##mode##');
    logger.info(this.serverName + '_CHMANAGER ==> INIT_CHANNEL: ' + JSON.stringify(svrInfos));

    if (tools.isEmpty(svrInfos) || !svrInfos[this.serverName]) {
        logger.alert(this.serverName + '_CHMANAGER ==> NOT FOUND SVRINFO !!!!!!!!');
        return false;
    }
    this.compress = svrInfos[this.serverName].compress || false;
    let timeObj = { cycleReconnect: svrInfos.retry_cycle, idleTimeOut: svrInfos.idle_timeout, recvTimeOut: svrInfos.recv_timeout };
    let callFunction = { onConnect: this.onConnectFunc, onReceive: this.onReceiveFunc, onDisconnect: this.onDisconnetFunc, onError: this.onErrorFunc };
    this.clientChannel = new textchannel();
    this.clientChannel.create(svrInfos[this.serverName].info, os.hostname() + '_' + process.pid, timeObj, callFunction, logger);

    logger.info(this.serverName + '_CHMANAGER ==> MAKE SUCCESS CHANNEL: ' + this.serverName);
    return true;
};

channelManager.prototype.writeREQS = function (packet, callback) {
    let param = 'REQS ' + this.trid + ' mzADX GZIP ';
    if (this.compress === true) {
        try {
            let compressPK = zlib.gzipSync(Buffer.from(packet)).toString('base64');
            param += compressPK.length + '\r\n' + compressPK;
        } catch (e) {
            logger.alert(this.serverName + '_CHMANAGER ==> BODY ENCODING ERROR: ' + e.message);
            // Send Plain TEXT
            param += packet.length + '\r\n' + packet;
        }
    } else {
        param += packet.length + '\r\n' + packet;
    }

    this.clientChannel.writeData(this.trid++, param, function (result, header, body, session) {
        if (enable_trace) {
            console.log('************************* RESPONSE *************************');
            console.log(result);
            console.log(header);
            console.log(body);
            console.log('************************* RESPONSE *************************');
        }
        return result == 0 ? callback(null, { _res: 200, _pk: body }) : callback(null, { _res: 0, msg: header });
    });
};

module.exports = channelManager;
