'use strict'

const mysql = require('mysql');

function mysql_cluster() {
    if (!(this instanceof mysql_cluster)) {
        return new mysql_cluster();
    }
}

/**
 *
 * @param config
 * @param callback
 * // canRetry, removeNodeErrorCount, restoreNodeTimeout
 */
mysql_cluster.prototype.init = function (config) {
    if (this.cluster == null) {
        this.cluster = mysql.createPoolCluster();

        if (config != null) {
            for (let key in config) {
                let server_name = key;
                let server_info = config[key];

                logger.info(server_name + ", " + JSON.stringify(server_info));

                this.add(server_name, server_info);
            }
        }
    }
}

/**
 *
 * @param cluster_name
 * @param config
 */
mysql_cluster.prototype.add = function (cluster_name, config) {
    try {
        this.cluster.add(cluster_name, config);
    } catch (e) {
        logger.error('mysql_cluster.prototype.addPool() throw exception - ' + cluster_name + ' : ' + e);
    }
};

/**
 *
 * @param cluster_name
 * @param query
 * @param callback
 */
mysql_cluster.prototype.executeQuery = function (cluster_name, query, callback) {
    this.cluster.getConnection(cluster_name, function (err, connection) {
        if (err) {
            logger.error('mysql_cluster.prototype.executeQuery() - ' + cluster_name + ' : ' + err);

            if (callback) {
                callback(err);
            }
        } else {
            connection.query(query, function (error, results, fields) {
                connection.release();

                if (error) {
                    logger.error('mysql_cluster connection.query() - ' + cluster_name + ' : ' + error);
                }

                if (callback) {
                    callback(error, results);
                }
            });
        }
    });
};

/**
 * Only one DB Server is allowed
 * @param cluster_name
 */
mysql_cluster.prototype.transaction = function (cluster_name) {
    let _connection;
    let _cluster = this.cluster;
    let _cluster_name = cluster_name;

    return {
        query(query, callback) {
            _connection.query(query, function (err, results) {
                if (err) {
                    logger.error('mysql_cluster.prototype.transaction() - execute() failed [' + cluster_name + '] :' + err);
                }

                if (callback) {
                    callback(err, results);
                }
            });
        },
        close(err, callback) {
            if (err) {
                _connection.rollback(function () {
                    logger.debug('rollback');
                    _connection.release();
                });

                if (callback) callback(err);
            } else {
                _connection.commit(null, function(err) {
                    if (err) {
                        logger.error('mysql_cluster.prototype.transaction() - commit() failed [' + cluster_name + '] :' + err);

                        _connection.rollback(function () {
                            logger.debug('rollback');
                            _connection.release();
                        });

                        if (callback) callback(err);
                    } else {
                        logger.debug('commit');

                        _connection.release();

                        if (callback) callback(null);
                    }
                });
            }
        },
        execute (fn, callback) {
            if (fn != null) {
                _cluster.getConnection(_cluster_name, function (err, conn) {
                    if (err) {
                        logger.error('mysql_cluster.prototype.transaction() - getConnection() failed [' + cluster_name + '] :' + err);

                        if (callback) callback(err);
                    } else {
                        _connection = conn;

                        _connection.beginTransaction(null, function (err) {
                            if (err) {
                                logger.error('mysql_cluster.prototype.transaction() - beginTransaction() failed [' + cluster_name + '] :' + err);
                                _connection.release();

                                if (callback) callback(err);
                            } else {
                                fn.call();
                            }
                        });
                    }
                });
            }
        }
    }
};

module.exports = mysql_cluster();
