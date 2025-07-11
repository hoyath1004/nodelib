'use strict'

const node_mysql = require('mysql');

module.exports = class mysql {
    constructor() {
        this.session = null;
    }

    init(conf, callback) {
        if (this.session) {
            if (callback) callback('err', 'Already initialized. session object is not null.');
            return;
        }

		let _self = this;
        logger.debug(util.format('[mysql] Initializing mysql session. host: %s, port: %s, user: %s pass: %s', conf.host, conf.port, conf.user, conf.password));

        this.session = node_mysql.createConnection(conf);

        this.session.connect(function(err) {
            if (err) {
                logger.error('[mysql] error occured : ' + err);
                if (callback) 
                    callback('err', err)
                return; // throw err;
            }

            logger.debug('[mysql] Session has been initialized.');
            if (callback) 
                callback('succ', 'Session has been initialized.');
        });

		this.session.on('error', function(err) {
                logger.debug('[mysql] ERROR : ' + JSON.stringify(err)); // reconnect;
                if(err.code === 'PROTOCOL_CONNECTION_LOST') {
                        _self.session = null;
                        _self.init(conf);
                }

        });

    }

    clear() {
        if(!this.session) {
            return;
        }
        this.session.end();
        this.session = null;

        logger.debug('[mysql] Session have been cleared.');
    }

    execQuery(database, query, callback) {
        if(!this.session) {
            if(callback) 
                callback('err', 'not_connected')
            return;
        }

        var _this = this;
        this.session.changeUser({database: database}, function(err) {
            if(err) {
                if(callback) callback('err', 'not_connected [' + err + ']')
                return;
            }

            _this.session.query(query, function(err, results) {
                if(err) {
                    if(callback) 
                        callback('err', 'query_error [' + err + ']')
                    return;
                }
                
                if(callback)
                    callback('succ', results);	 
            });
        }.bind({query: query}));
    }
}
