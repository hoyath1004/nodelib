'use strict';

const mysql = require('mysql2/promise');

class DatabaseManager {
    _config;
    _pool;
    isolationType = {
        READ_UNCOMMITTED: 'READ UNCOMMITTED',
        READ_COMMIITED: 'READ COMMIITED',
        REPEATABLE_READ: 'REPEATABLE READ',
        SERIALIZABLE: 'SERIALIZABLE',
    };

    constructor(config) {
        this._config = config;
        this.PROPERTY_KEY_ISOLATION = 'session_isolation';
        this.DEFAULT_ISOLATION = this.isolationType.REPEATABLE_READ;

        Object.defineProperty(this, 'isolationType', {
            value: Object.freeze(this.isolationType),
            writable: false,
            enumerable: false,
            configurable: false,
        });
    }

    init() {
        return new Promise((resolve, reject) => {
            try {
                this._pool = mysql.createPool({
                    connectionLimit: this._config.connection_limit,
                    host: this._config.host,
                    port: this._config.port,
                    user: this._config.user,
                    password: this._config.password,
                    database: this._config.database,
                    multipleStatements: this._config.multipleStatements,
                    timezone: 'UTC',
                });

                this._pool
                    .getConnection()
                    .then((conn) => {
                        resolve(this._pool);
                    })
                    .catch((e) => {
                        reject(e.message);
                    });
            } catch (e) {
                reject(e.message);
            }
        });
    }

    // statement
    async query(query, conn) {
        try {
            if (!conn) {
                conn = await this._pool.getConnection();
            }

            const [rows, fields] = await conn.query(query);

            return rows;
        } catch (e) {
            if (conn) {
                await this.rollbackTransaction(conn);
            }
            throw new Error(e.message);
        } finally {
            if (conn) {
                conn.release();
            }
        }
    }

    // prepared statement
    async execute(query, param, conn) {
        try {
            if (!conn) {
                conn = await this._pool.getConnection();
            }

            const [rows, fields] = await conn.execute(query, param);

            return rows;
        } catch (e) {
            if (conn) {
                await this.rollbackTransaction(conn);
            }
            throw new Error(e.message);
        } finally {
            if (conn) {
                conn.release();
            }
        }
    }

    async beginTransaction(isolation) {
        let conn = null;
        try {
            conn = await this._pool.getConnection();

            if (isolation) {
                let query = `SET SESSION TRANSACTION ISOLATION LEVEL ${isolation}`;

                await conn.query(query);

                conn[this.PROPERTY_KEY_ISOLATION] = isolation;
            }

            await conn.beginTransaction();

            conn['inTransaction'] = true;

            return conn;
        } catch (e) {
            if (conn) {
                await this.rollbackTransaction(conn);
            }
            throw new Error(e.message);
        } finally {
            if (conn) {
                conn.release();
            }
        }
    }

    async rollbackTransaction(conn) {
        try {
            if (conn['inTransaction']) {
                await conn.rollback();

                delete conn['inTransaction'];
            }

            await this._restoreIsolation(conn);
        } catch (e) {
            throw new Error(e);
        } finally {
            conn.release();
        }
    }

    async commitTransaction(conn) {
        try {
            if (conn['inTransaction']) {
                await conn.commit();

                delete conn['inTransaction'];
            }

            await this._restoreIsolation(conn);
        } catch (e) {
            await this.rollbackTransaction(conn);

            throw new Error(e.message);
        } finally {
            conn.release();
        }
    }

    async _restoreIsolation(conn) {
        try {
            if (
                conn.hasOwnProperty(this.PROPERTY_KEY_ISOLATION) &&
                conn[this.PROPERTY_KEY_ISOLATION] !== this.DEFAULT_ISOLATION
            ) {
                let query = `SET SESSION TRANSACTION ISOLATION LEVEL ${this.DEFAULT_ISOLATION}`;

                await conn.query(query);

                delete conn[this.PROPERTY_KEY_ISOLATION];
            }
        } catch (e) {
            throw new Error(e);
        }
    }

    escape(param) {
        return this._pool.escape(param);
    }
}

module.exports = DatabaseManager;
