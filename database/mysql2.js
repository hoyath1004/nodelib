'use strict';

const node_mysql2 = require('mysql');
const PROPERTY_KEY_ISOLATION = 'session_isolation';
const DEFAULT_ISOLATION = 'REPEATABLE READ';


function mysql2() {
    if (!(this instanceof mysql2)) {
        return new mysql2();
    }
}

mysql2.prototype.init = function (conf, callback) {
    if (this.session) {
        if (callback) callback('err', 'Already initialized. session object is not null.');
        return;
    }

    logger.debug(
        util.format(
            '[mysql2] Initializing mysql session. host: %s, port: %s, user: %s pass: %s',
            conf.host,
            conf.port,
            conf.user,
            conf.password
        )
    );

    //this.session = node_mysql.createConnection(conf);
    this.session = node_mysql2.createPool({
        connectionLimit: conf.connection_limit,
        host: conf.host,
        post: conf.port,
        user: conf.user,
        password: conf.password,
        database: conf.database,
        multipleStatements: conf.multipleStatements,
        timezone: 'UTC',
    });

    this.session.on('connection', function () {
        if (callback) {
            callback('succ', 'Session has been initialized.');
        }
    });

    this.session.on('enqueue', function () {
        if (callback) {
            callback('succ', 'waiting for available connection slot');
        }
    });
};

mysql2.prototype.queryForOne = function (query, callback) {
    this.session.getConnection(function (err, connection) {
        connection.query(query, function (error, results, fields) {
            //조회
            connection.release();

            if (callback) {
                if (error) {
                    callback(error, null);
                } else {
                    callback(error, results[0]);
                }
            }
        });
    });
};

mysql2.prototype.queryForList = function (query, callback) {
    this.session.getConnection(function (err, connection) {
        connection.query(query, function (error, results, fields) {
            //조회
            connection.release();

            if (callback) {
                if (error) {
                    callback(error, null);
                } else {
                    callback(error, results);
                }
            }
        });
    });
};

mysql2.prototype.queryForExecute = function (query, callback, connection) {
    if (connection) {
        connection.query(query, function (error, results, fields) {
            if (callback) {
                callback(error, results);
            }
        });
    } else {
        this.session.getConnection(function (err, connection) {
            connection.query(query, function (error, results, fields) {
                //조회
                connection.release();

                if (callback) {
                    callback(error, results);
                }
            });
        });
    }
};

mysql2.prototype.beginTransaction = function (callback, isolation) {
    this.session.getConnection(function (err, connection) {
        if (err) {
            if (callback) {
                callback(err, null);
            }
        } else {
            if (isolation != null) {
                connection.query(`SET SESSION TRANSACTION ISOLATION LEVEL ${isolation}`, function (error) {
                    if (error) {
                        connection.release();

                        if (callback) {
                            callback(error, null);
                        }
                    } else {
                        connection[PROPERTY_KEY_ISOLATION] = isolation;
                        beginTransaction(connection, callback);
                    }
                });
            } else {
                beginTransaction(connection, callback);
            }
        }
    });

    /**
     * @param connection
     * @param cb
     */
    function beginTransaction (connection, cb) {
        connection.beginTransaction(function (err) {
            if (err) {
                connection.rollback(function () {
                    tx_release(connection, callback);
                });
            } else {
                if (cb) {
                    cb(err, connection);
                }
            }
        });
    }
};

mysql2.prototype.commit = function (callback, connection) {
    connection.commit(function (err) {
        if (err) {
            connection.rollback(function () {
                tx_release(connection, callback);
            });
        } else {
            tx_release(connection, callback);
        }
    });
};

mysql2.prototype.rollback = function (callback, connection) {
    connection.rollback(function () {
        tx_release(connection, callback);
    });
};

mysql2.prototype.escape = function (param) {
    return this.session.escape(param);
};

/**
 * transaction connection release
 * @param connection
 * @param callback
 */
function tx_release (connection, callback) {
    let session_isolation = connection != null && connection.hasOwnProperty(PROPERTY_KEY_ISOLATION) ? connection[PROPERTY_KEY_ISOLATION] : null;

    if (session_isolation != null && session_isolation != DEFAULT_ISOLATION) {
        connection.query(`SET SESSION TRANSACTION ISOLATION LEVEL ${DEFAULT_ISOLATION}`, function (error) {
            if (error) {
                if (callback) {
                    callback(error, null);
                }
            } else {
                delete connection[PROPERTY_KEY_ISOLATION];
                connection.release();

                if (callback) {
                    callback(null, connection);
                }
            }
        });
    } else {
        connection.release();

        if (callback) {
            callback(null, connection);
        }
    }
}

module.exports = mysql2();
