const network = require(__common + 'network.js');
const { DBSQLClient } = require('@databricks/sql');

const client = new DBSQLClient();

function dbx() {
    if (!(this instanceof dbx)) {
        return new dbx();
    }
    this.session = null;
    this.conf = {};
}

dbx.prototype.init = function (conf, callback) {
    if (conf) {
        Object.assign(this.conf, conf);
    }

    if (!this.conf.token || !this.conf.host || !this.conf.path) {
        throw new Error("Cannot find Server Hostname, HTTP Path, or personal access token. " +
            "Check the environment variables DATABRICKS_TOKEN, " +
            "DATABRICKS_SERVER_HOSTNAME, and DATABRICKS_HTTP_PATH.");
    } else {
        // Start Cluster
        let header = {};
        let query = {};
        header.Authorization = "Bearer " + this.conf.token;
        let start_url = '';

        if (this.conf.type === 'warehouse') {
            start_url = '/sql/warehouses/' + this.conf.warehouse + '/start';
        } else {
            query.cluster_id = this.conf.cluster;
            start_url = '/clusters/start';
        }

        let url = "https://" + this.conf.host + this.conf.url + start_url;


        network.apiCall(url, 'POST', header, query, null,function (err, result) {
            if (err != '200') {
                // err = '400' 은 이미 RUNNING 인 경우
                logger.error('[DBX] init() error : ' + err);
                callback(err);
            } else {
                logger.debug('[DBX] Initializing databricks cluster. url: ' + url);
                callback('succ', null);
            }
        });
    }
}

dbx.prototype.status = function (conf, callback) {
    if (conf) {
        Object.assign(this.conf, conf);
    }

    // Get Status Cluster
    let header = {};
    let query = {};
    header.Authorization = "Bearer " + this.conf.token;

    let status_url = '';
    if (this.conf.type === 'warehouse') {
        status_url = '/sql/warehouses/' + this.conf.warehouse;
    } else {
        query.cluster_id = this.conf.cluster;
        status_url = '/clusters/get';
    }

    let url = "https://" + this.conf.host + this.conf.url + status_url;

    let json = {};

    network.apiCall(url, 'GET', header, query, null, function (err, result) {
        logger.info('[DBX] Initializing databricks cluster. STATUS : '+ result.state);
        if (err == 200) {
            if (result.state === 'RUNNING' || result.state === 'STARTING') {
                callback('succ', null);
            } else if (result.state === 'TERMINATED' ||result.state === 'PENDING') {
                callback('pause', null);
            } else if (result.state === 'STOPPED') {
                callback('stopped', null);
            } else {
                callback('fail', null);
            }
        } else {
            callback(err);
        }
    });
}

dbx.prototype.get = function (conf, query, callback) {
    if (conf) {
        Object.assign(this.conf, conf);
    }

    let conn_path = '';

    if (this.conf.type === "warehouse") {
        conn_path = this.conf.path + this.conf.warehouse;
    } else {
        conn_path = this.conf.path + this.conf.cluster;
    }

    client.connect(
        options = {
            token : this.conf.token,
            host : this.conf.host,
            path : conn_path
        }).then(
        async client => {
            const session = await client.openSession();
            const queryOperation = await session.executeStatement(
                statement = query,
                options   = {
                    runAsync: true
                }
            );

            const result = await queryOperation.fetchAll({
                progress: false,
                callback: () => {},
            });

            await queryOperation.close();

            let json = {};
            let data = [];

            if (result.length > 0) {
                json.state = "succ";
                json.col = Object.keys(result[0]);

                for (let i = 0; i < result.length; i++){
                    data.push(Object.values(result[i]));
                }
            } else {
                json.state = "fail";
            }
            json.data = data;

            await session.close();
            await client.close();

            callback('succ', json);

        }).catch((error) => {
            logger.error('[DBX] get() throws exception : ' + error);
            callback(error);
    });
}

dbx.prototype.clear = function (conf, callback) {
    if (conf) {
        Object.assign(this.conf, conf);
    }

    if (!this.conf.token || !this.conf.host || !this.conf.path) {
        throw new Error("Cannot find Server Hostname, HTTP Path, or personal access token. " +
            "Check the environment variables DATABRICKS_TOKEN, " +
            "DATABRICKS_SERVER_HOSTNAME, and DATABRICKS_HTTP_PATH.");
    } else {
        // Pause Cluster
        let header = {};
        let query = {};
        header.Authorization = "Bearer " + this.conf.token;

        let pause_url = '';
        if (this.conf.type === 'warehouse') {
            pause_url = '/sql/warehouses/' + this.conf.warehouse + '/stop';
        } else {
            query.cluster_id = this.conf.cluster;
            pause_url = '/clusters/delete';
        }

        let url = "https://" + this.conf.host + this.conf.url + pause_url;

        network.apiCall(url, 'POST', header, query, null,function (err, result) {
            if (err != '200') {
                logger.error('[DBX] clear() err : ' + err);
                callback(err);
            } else {
                logger.debug('[DBX] Cluster have been cleared.');
                callback('succ', null);
            }
        });

        this.session = null;
    }
}

module.exports = dbx;