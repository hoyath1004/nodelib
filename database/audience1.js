'use strict';

const node_audience1 = require('mysql');

function audience1() {
    if (!(this instanceof audience1)) {
        return new audience1();
    }
}

audience1.prototype.init = function (conf, callback) {
    if (this.session) {
        if (callback) callback('err', 'Already initialized. session object is not null.');
        return;
    }

    logger.debug(
        util.format(
            '[audience1] Initializing mysql session. host: %s, port: %s, user: %s pass: %s',
            conf.host,
            conf.port,
            conf.user,
            conf.password
        )
    );

    //this.session = node_mysql.createConnection(conf);
    this.session = node_audience1.createPool({
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

audience1.prototype.queryForOne = function (query, callback) {
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

audience1.prototype.queryForList = function (query, callback) {
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

audience1.prototype.queryForExecute = function (query, callback, connection) {
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

audience1.prototype.beginTransaction = function (callback) {
    console.log('beginTransaction');
    this.session.getConnection(function (err, connection) {
        if (err) {
            if (callback) {
                callback(err, null);
            }
        } else {
            connection.beginTransaction(function (err) {
                if (err) {
                    connection.rollback(function () {
                        connection.release();

                        if (callback) {
                            callback(err, null);
                        }
                    });
                } else {
                    if (callback) {
                        callback(err, connection);
                    }
                }
            });
        }
    });
};

audience1.prototype.commit = function (callback, connection) {
    console.log('commit');
    connection.commit(function (err) {
        if (err) {
            connection.rollback(function () {
                connection.release();
            });
        } else {
            connection.release();
        }

        if (callback) {
            callback(err);
        }
    });
};

audience1.prototype.rollback = function (callback, connection) {
    console.log('rollback');
    connection.rollback(function () {
        connection.release();

        if (callback) {
            callback();
        }
    });
};

audience1.prototype.escape = function (param) {
    return this.session.escape(param);
};

module.exports = audience1();
