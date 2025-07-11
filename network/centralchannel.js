/** @format */

///////////////////////////////////////////////////////
// server listen channel
let util = require('util');
let zlib = require('zlib');
let net = require('net');
var text_packet_stream = require('./textpacket.js');

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

const CLIENT_SESSION_INIT = 0x0001;
const CLIENT_SESSION_CONNECTED = 0x0002;

function Client(socket, logger, idleTimeout, onReceive, onDisconnect) {
    let self = this;
    this.logger = logger;
    this.address = socket.remoteAddress;
    this.port = socket.remotePort;
    this.name = `${this.address}:${this.port}`;
    this.text_socket = socket;

    this.idleTimeout = idleTimeout;
    this.onReceive = onReceive;
    this.onDisconnect = onDisconnect;
    this.status = CLIENT_SESSION_CONNECTED;
    this.text_Stream = null;

    this.start = function () {
        self.text_Stream = new text_packet_stream();
        self.text_Stream.on('error', function (err) {
            self.logger.log('textchannel_error: Invalid text channel stream; %s', err);
            self.doClose();
        });

        self.text_Stream.on('data', function (data) {
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

            setImmediate(
                function () {
                    if (this.cbReceive) {
                        this.cbReceive(this.header, this.body, self);
                    }
                }.bind({ cbReceive: self.onReceive, header: header, body: body })
            );
        });

        self.text_socket.on('end', function () {
            self.logger.log('info: End from %s', self.name);
        });

        self.text_socket.on('close', function () {
            self.logger.log('info: Closed from %s', self.name);

            if (self.onDisconnect) {
                self.onDisconnect(self);
            }

            self.doClose();
        });

        self.text_socket.on('timeout', function () {
            if (self.status & CLIENT_SESSION_CONNECTED) {
                self.push('PING 0\r\n');
            } else {
                self.doClose();
            }
        });

        self.text_socket.setTimeout(self.idleTimeout);
        self.text_socket.pipe(self.text_Stream);
    };

    this.getName = function () {
        return self.name;
    };

    this.push = function (message) {
        let self = this;
        let socket = self.text_socket;

        try {
            let success = socket.write(message);

            if (!success) {
                (function (socket, message) {
                    socket.once('drain', function () {
                        self.push(message);
                    });
                })(socket, message);
            }

            self.logger.log('net << %d bytes.', message.toString().length);
        } catch (e) {
            self.logger.log('crit: Error occured. %s', e);
        }
    };

    this.doClose = function () {
        if (self.status & CLIENT_SESSION_CONNECTED) {
            self.text_socket.unpipe(self.text_Stream);
            self.text_socket.destroy();
            self.status &= ~CLIENT_SESSION_CONNECTED;
        }
    };
}
/*
config;
{
"internal_server": {
    "host": "localhost",
    "port": 4000,
    "timeout": 3000 
}

RUN
let listenInfo = nconf.get('internal_server');
let central_channel = require('./centralchannel.js');
internalSession = new central_channel(listenInfo, conf_name, nconf.get('internal_server:timeout'), OnLog);
internalSession.setCallback(onInternalSessionConnect, onInternalSessionReceive, onInternalSessionDisconnect, onInternalSessionError);
internalSession.start(onListen);

 */
function central_channel(listenInfo, serverName, idleTimeout, logger) {
    let self = this;

    this.logger = logger;
    this.listenInfo = listenInfo;
    this.serverName = serverName;
    this.idleTimeout = idleTimeout;

    this.onConnect = null;
    this.onReceive = null;
    this.onDisconnect = null;
    this.onError = null;

    this.service_socket = null;
    this.client_pos = 0;
    this.clients = [];

    //function onClientConnected(socket) {
    this.onClientConnected = function (socket) {
        let client = new Client(socket, self.logger, self.idleTimeout, self.onClientReceived, self.onClientDisconnected);

        // Storing client for later usage
        self.clients.push(client);

        self.logger.log('%s onClientConnected. clients: %d', client.getName(), self.clients.length);

        client.start();

        if (self.onConnect) self.onConnect(client.getName());
    };

    this.onClientReceived = function (header, body, client) {
        let cmd = header.substr(0, 4);

        if (cmd === 'HELO') {
            client.push('HELO 0 OK ' + self.serverName + ' 4.0.0.0\r\n');
        }

        if (self.onReceive) self.onReceive(header, body, client);
    };

    this.onClientDisconnected = function (client) {
        self.clients.splice(self.clients.indexOf(client), 1);

        self.logger.log('%s onClientDisconnected. clients: %d', client.getName(), self.clients.length);

        if (self.onDisconnect) self.onDisconnect(client);
    };
}
module.exports = central_channel;

central_channel.prototype.setCallback = function (onConnect, onReceive, onDisconnect, onError) {
    this.onConnect = onConnect;
    this.onReceive = onReceive;
    this.onDisconnect = onDisconnect;
    this.onError = onError;
};

central_channel.prototype.start = function (callback) {
    let self = this;
    try {
        self.service_socket = net.createServer(self.onClientConnected);
        self.service_socket.listen(self.listenInfo.port, self.listenInfo.host);

        self.service_socket.on('listening', callback);
        self.service_socket.on('error', self.onError);
    } catch (e) {
        self.logger.log('net: Error occured. %s', e);
        return false;
    }
};

central_channel.prototype.push = function (data, client_name) {
    let self = this;
    if (client_name == null) {
        let client = this.getChannel();
        client.push(data);
        return;
    }

    // except client_name
    this.clients.forEach(function (client) {
        if (client.getName() == client_name) {
            client.push(data);
        }
    });
};

central_channel.prototype.broadcast = function (message, sender) {
    this.clients.forEach(function (client) {
        if (sender != null && client != sender) {
            client.push(message);
        }
    });
};

central_channel.prototype.getChannel = function () {
    if (this.clients.length == 0) return null;

    let cur_client_pos = this.client_pos++ % this.clients.length;
    return this.clients[cur_client_pos];
};
