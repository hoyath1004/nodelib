'use strict';

const node_mysql = require('mysql');
const node_mysql_mybatis = require('mybatis-mapper');

function mysql_mybatis() {
    if (!(this instanceof mysql_mybatis)) {
        return new mysql_mybatis();
    }
}

mysql_mybatis.prototype.init = function (conf, mapper, callback) {
    if (this.session) {
        if (callback) callback('err', 'Already initialized. session object is not null.');
        return;
    }

    logger.debug(
        util.format(
            '[mysql_mybatis] Initializing mysql session. host: %s, port: %s, user: %s pass: %s',
            conf.host,
            conf.port,
            conf.user,
            conf.password
        )
    );

    //this.session = node_mysql.createConnection(conf);
    this.session = node_mysql.createPool({
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

    node_mysql_mybatis.createMapper(mapper);
};

mysql_mybatis.prototype.queryForOne = function (mapper, id, param, callback) {
    var format = { language: 'sql', indent: '  ' };

    var query = node_mysql_mybatis.getStatement(mapper, id, param, format);

    this.session.getConnection(function (err, connection) {
        connection.query(query, function (error, results, fields) {
            //조회
            connection.release();

            if (callback) {
                if (error) {
                    callback(error, null, query);
                } else {
                    callback(error, results[0], query);
                }
            }
        });
    });
};

mysql_mybatis.prototype.queryForList = function (mapper, id, param, callback) {
    var format = { language: 'sql', indent: '  ' };

    var query = node_mysql_mybatis.getStatement(mapper, id, param, format);

    this.session.getConnection(function (err, connection) {
        connection.query(query, function (error, results, fields) {
            //조회
            connection.release();

            if (callback) {
                if (error) {
                    callback(error, null, query);
                } else {
                    callback(error, results, query);
                }
            }
        });
    });
};

mysql_mybatis.prototype.queryForExecute = function (mapper, id, param, callback, connection) {
    var format = { language: 'sql', indent: '  ' };
    var query = node_mysql_mybatis.getStatement(mapper, id, param, format);

    if (connection) {
        connection.query(query, function (error, results, fields) {
            if (callback) {
                callback(error, results, query);
            }
        });
    } else {
        this.session.getConnection(function (err, connection) {
            connection.query(query, function (error, results, fields) {
                //조회
                connection.release();

                if (callback) {
                    callback(error, results, query);
                }
            });
        });
    }
};

mysql_mybatis.prototype.beginTransaction = function (callback) {
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

mysql_mybatis.prototype.commit = function (callback, connection) {
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

mysql_mybatis.prototype.rollback = function (callback, connection) {
    console.log('rollback');
    connection.rollback(function () {
        connection.release();

        if (callback) {
            callback();
        }
    });
};

module.exports = mysql_mybatis();
