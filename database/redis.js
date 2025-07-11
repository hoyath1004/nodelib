/** @format */

'use strict';

var ioredis = require('ioredis');
const async = require('async');

module.exports = class redis {
    constructor() {
        this.cluster = null;
    }

    init(conf, callback) {
        if (this.cluster) {
            if (callback) callback('err', 'Already initialized. Cluster object is not null.');
            return;
        }

        logger.debug(util.format('[redis] Initializing redis session. config: %s', JSON.stringify(conf)));

        // redis default conf
        let redis_conf = {
            enableReadyCheck: true,
            scaleReads: 'all',
            maxRetriesPerRequest: 10, // 20240222: 요청 재시도 회수 10회 초과시 오류 로그
            clusterRetryStrategy: function (times) {
                // 20240222:  최대 재시도 횟수 제한 => 접속 에러시 process out
                const maxRetryTimes = 10;
                if (times >= maxRetryTimes) {
                    logger.crit('Could not connect to Redis - Check Reids or Address. Info: ' + JSON.stringify(conf));
                    return new Error('Exceeded retry limit');
                }

                // 200ms 씩 증가하면서 재접속 시도
                let delay = Math.min(100 + times * 100 * 2, 2000);
                logger.crit('Retry connecting to cluster counts: ' + times + ', delay:' + delay);
                return delay;
            },
        };

        let redis_infos = [];
        console.log('------------------ redis ------------------')
        console.log(conf);
        console.log('------------------ redis ------------------')

        // 202012: 기존처럼 address만 오는 경우는 그대로 진행함.
        let isMode = 0; // 0:normal, 1: sentinels, 2: clusters
        if (Array.isArray(conf)) {
            redis_infos = conf;
            this.cluster = new ioredis.Cluster(redis_infos, redis_conf);
        } else {
            if (conf.hasOwnProperty('redis_conf')) Object.assign(redis_conf, conf.redis_conf);

            // redis에 대한 추가 config를 사용할 경우는 Object로 config를 받고,
            // clusters: redis address, redis_conf: add redis confiig 필드로 세팅함
            if (conf.hasOwnProperty('clusters')) {
                isMode = 2;
                logger.crit('[redis] redis cluster config: ' + JSON.stringify(conf));

                redis_infos = conf.clusters;
                this.cluster = new ioredis.Cluster(redis_infos, redis_conf);
            } else if (conf.hasOwnProperty('sentinels')) {
                isMode = 1;

                redis_infos = { sentinels: conf.sentinels };
                Object.assign(redis_conf, redis_infos);
                this.cluster = new ioredis(redis_conf);
            } else {
                // normal mode: M/S
                // address: {{host:localhost, port:6379}} or address: [{host:localhost, port:6379},{host:localhost, port:6379}..]
                if (Array.isArray(conf.address)) {
                    // 랜덤
                    redis_infos = conf.address.sort(() => 0.5 - Math.random())[0];
                } else {
                    redis_infos = conf.address;
                }

                Object.assign(redis_conf, redis_infos);
                this.cluster = new ioredis(redis_conf);
            }
        }
        // this.cluster = new ioredis.Cluster(redis_infos, redis_conf);

        this.cluster.on('ready', function () {
            logger.debug('[ready] All redis clusters are ready.');

            if (callback) callback('succ', 'All redis clusters are ready.');
        });
        this.cluster.on('error', (err) => {
            if (err.code === 'ECONNREFUSED') {
                logger.crit('Could not connect to Redis: ' + err.message);
            } else if (err.name === 'MaxRetriesPerRequestError') {
                logger.crit('Critical Redis error - MaxRetriesPerRequestError: ' + err.message + ' Shutting down');
                // process.exit(1);
            } else {
                logger.crit('Redis encountered an error: ' + err.message);
            }
        });
    }

    clear() {
        if (!this.cluster) return;

        this.cluster.disconnect();
        this.cluster = null;

        logger.debug('[redis] All redis clusters have been cleared.');
    }

    // key, value
    insertData(key, value, callback) {
        if (value && typeof value != 'object') {
            this.cluster.set(key, value, function (err, result) {
                if (err != null && callback) {
                    logger.error('Error occured while inserting data. : ' + err + ' ,' + result);
                    callback('err', err);
                } else if (callback) {
                    callback('succ', { key: key, data: value });
                }
            });
        } else {
            logger.error('Value is null or value is not a string type.');
            if (callback) callback('err', 'invalid value data.');
        }
    }

    // key, value, expire
    insertDataEX(key, value, expire, callback) {
        if (value && typeof value != 'object') {
            this.cluster.set(key, value, 'EX', expire, function (err, result) {
                if (err != null && callback) {
                    logger.error('Error occured while inserting data. : ' + err + ' ,' + result);
                    callback('err', err);
                } else if (callback) {
                    callback('succ', { key: key, data: value });
                }
            });
        } else {
            logger.error('Value is null or value is not a string type.');
            if (callback) callback('err', 'invalid value data.');
        }
    }

    // key, [value1 value2]
    insertList(key, values, callback) {
        if (values && Array.isArray(values)) {
            this.cluster.sadd(key, values, function (err, result) {
                if (err != null && callback) {
                    logger.error('Error occured while inserting data list: ' + err + ' ,' + result);
                    callback('err', err);
                } else if (callback) {
                    callback('succ', { key: key, data: values });
                }
            });
        } else {
            logger.error('Value is null or value is not a array type.');
            if (callback) callback('err', 'invalid value data.');
        }
    }

    // key, [value1 value2]
    insertListEX(key, values, expire, callback) {
        let _self = this;
        if (values && Array.isArray(values)) {
            this.cluster.sadd(key, values, function (err, result) {
                if (err != null && callback) {
                    logger.error('Error occured while inserting data list: ' + err + ' ,' + result);
                    callback('err', err);
                } else if (expire && expire > 0) {
                    _self.cluster.expire(key, parseInt(expire), function (_err, _res) {
                        if (callback) callback('succ', { key: key, data: values });
                    });
                } else if (callback) {
                    callback('succ', { key: key, data: values });
                }
            });
        } else {
            logger.error('Value is null or value is not a array type.');
            if (callback) callback('err', 'invalid value data.');
        }
    }

    // key, [sub_key1:value1, sub_key2:value2]
    insertMap(key, obj, callback) {
        if (obj && typeof obj == 'object') {
            this.cluster.hmset(key, obj, function (err, result) {
                if (err != null && callback) {
                    logger.error('Error occured while inserting map data: ' + err + ' ,' + result);
                    callback('err', err);
                } else if (callback) {
                    callback('succ', { key: key, data: obj });
                }
            });
        } else {
            logger.error('Value is null or value is not a object type.');
            if (callback) callback('err', 'invalid value data.');
        }
    }

    // key, [sub_key1:value1, sub_key2:value2]
    insertMapEX(key, obj, expire, callback) {
        let _self = this;
        if (obj && typeof obj == 'object') {
            this.cluster.hmset(key, obj, function (err, result) {
                if (err != null && callback) {
                    logger.error('Error occured while inserting map data: ' + err + ' ,' + result);
                    callback('err', err);
                } else if (expire && expire > 0) {
                    _self.cluster.expire(key, parseInt(expire), function (_err, _res) {
                        if (callback) callback('succ', { key: key, data: obj });
                    });
                } else if (callback) {
                    callback('succ', { key: key, data: obj });
                }
            });
        } else {
            logger.error('Value is null or value is not a object type.');
            if (callback) callback('err', 'invalid value data.');
        }
    }

    // sendcommand & expire
    sendcommand(cmd, key, value, expire, callback) {
        function _callback(err, result) {
            // console.log('### redis sendcommand: ' + cmd + ', result ## err: ' + err + ' result: ' + JSON.stringify(result));
            if (err != null && callback) {
                logger.crit('Error occured while send command => ' + cmd + ' key: ' + key + ' err: ' + err);
                callback('err', err);
            } else if (err == null) {
                // 데이타가 없는 경우...
                // hgetall: {}, get: null, smebers: [],
                let _value = value == null || value == '' ? result : value;
                let _res = tools.isEmpty(result) ? 'no_data' : { key: key, value: _value, result: result };
                // sadd 는 없으면 추가하고 result = 1, 있으면 = 0
                // incr 는 없으면 1, 있으면 숫자 증가
                // set, hmset 는 있어도 없어도 OK응담
                let _isValue = false;
                if ((cmd == 'sadd' && result != 1) || (cmd == 'incr' && result != 1) || (cmd == 'hsetnx' && result != 1) || (cmd == 'hset' && result != 1)) {
                    _isValue = true;
                    // 데이타가 있는 경우: return 1
                    //if (callback) callback('succ', _res, 1)
                    //return;
                }

                // 없었으면 새로 expire 세팅함....
                if (_res != 'no_data' && expire && expire != 0) {
                    _self.cluster.expire(key, parseInt(expire), function () {
                        if (callback) callback('succ', _res, _isValue);
                    });
                } else {
                    if (callback) callback('succ', _res, _isValue);
                }
            }
        }

        let _self = this;
        if (cmd == 'incr' || value == null) {
            //this.cluster.send_command(cmd, key, _callback);
            this.cluster[cmd](key, _callback);
        } else if ((cmd == 'hincrby' || cmd == 'hsetnx' || cmd == 'hset') && typeof value == 'object') {
            for (let _subkey in value) {
                this.cluster[cmd](key, _subkey, value[_subkey], _callback);
            }
        } else {
            //this.cluster.send_command(cmd, key, value, _callback);
            this.cluster[cmd](key, value, _callback);
        }
    }

    // [key1, value1] [key2, value2]
    insertDataByObject(obj, callback, expire) {
        function response(res, msg) {
            if (callback) callback(res, msg);
        }

        var _self = this;
        var succ_count = 0;
        var insert_count = 0;
        var resArray = [];

        for (let key in obj) {
            function res_callback(res, msg) {
                resArray.push(msg);

                if (res == 'succ') succ_count++;

                if (--insert_count == 0 && callback) {
                    response(res, { count: succ_count, data: resArray });
                }
            }

            let value = obj[key];

            if (value && typeof value != 'object') {
                insert_count++;
                if (expire && expire > 0) _self.insertDataEX(key, value, expire, res_callback);
                else _self.insertData(key, value, res_callback);
            }
        }

        if (insert_count == 0) {
            logger.error('Invalid input object. Element value must NOT be object type.');
            response('err', 'invalid input object.');
        }
    }

    // [{key:key1, value:[value1, value2], expire:1},....]
    insertListByObject(obj, callback, expire) {
        function response(res, msg) {
            if (callback) callback(res, msg);
        }

        var _self = this;
        var succ_count = 0;
        var insert_count = 0;
        var resArray = [];

        for (let key in obj) {
            function res_callback(res, msg) {
                resArray.push(msg);
                if (res == 'succ') succ_count++;

                if (--insert_count == 0 && callback) {
                    response(res, { count: succ_count, data: resArray });
                }
            }

            let arr = obj[key];

            if (arr && Array.isArray(arr)) {
                insert_count++;

                if (expire && expire > 0) _self.insertListEX(key, arr, expire, res_callback);
                else _self.insertList(key, arr, res_callback);
            }
        }

        if (insert_count == 0) {
            logger.error('Invalid input object. Element value must be array type.');
            response('err', 'invalid input object.');
        }
    }

    // key [sub_key1:value1, sub_key2:value2]
    insertMapByObject(obj, callback, expire) {
        function response(res, msg) {
            if (callback) callback(res, msg);
        }

        var _self = this;
        var succ_count = 0;
        var insert_count = 0;
        var resArray = [];

        for (let key in obj) {
            function res_callback(res, msg) {
                resArray.push(msg);

                if (res == 'succ') succ_count++;

                if (--insert_count == 0 && callback) {
                    response('succ', { count: succ_count, data: resArray });
                }
            }

            let objValue = obj[key];

            if (objValue && typeof objValue == 'object') {
                insert_count++;
                if (expire && expire > 0) _self.insertMapEX(key, objValue, expire, res_callback);
                else _self.insertMap(key, objValue, res_callback);
            }
        }

        if (insert_count == 0) {
            logger.error('Invalid input object. Element value must be object type.');
            response('err', 'invalid input object.');
        }
    }

    ///////////////////////////////////////////////////////////////////////////////////////
    // 20191023: expired 처리 때문에 Query 추가함..
    // key, [value1, value2]
    insertListByObject2(obj, bLog, callback) {
        function response(res, msg) {
            if (callback) callback(res, msg);
        }

        var _self = this;
        var succ_count = 0;
        var insert_count = 0;
        var resArray = [];

        for (let key in obj) {
            function res_callback(res, msg) {
                if (bLog) resArray.push(msg);

                if (res == 'succ') succ_count++;

                if (--insert_count == 0 && callback) {
                    response(res, { count: succ_count, data: resArray });
                }
            }

            //let key = i;
            let arr = obj[key];
            let expire = 0;
            if (typeof arr == 'object' && arr.hasOwnProperty('__value__')) {
                arr = obj[key].__value__;
                expire = obj[key].expire ? Number(obj[key].expire) : 0;
            }

            if (arr && Array.isArray(arr)) {
                insert_count++;
                _self.insertList(key, arr, function (_err, _res) {
                    if (_err == 'succ' && expire && expire > 0) {
                        _self.cluster.expire(key, parseInt(expire), function (_err, _res) {
                            res_callback(_err == null ? 'succ' : 'fail', _res);
                        });
                    } else {
                        res_callback(_err, _res);
                    }
                });
            }
        }

        if (insert_count == 0) {
            logger.error('Invalid input object. Element value must be array type.');
            response('err', 'invalid input object.');
        }
    }

    // [ {key: key1, value:[sub_key1:value1], expire: 1}, {key: key2, value:[sub_key2:value2], expire: 1}]
    insertMapByObject2(obj, bLog, callback) {
        function response(res, msg) {
            if (callback) callback(res, msg);
        }

        var _self = this;
        var succ_count = 0;
        var insert_count = 0;
        var resArray = [];

        for (let key in obj) {
            function res_callback(res, msg) {
                if (bLog) resArray.push(msg);

                if (res == 'succ') succ_count++;

                if (--insert_count == 0 && callback) {
                    response('succ', { count: succ_count, data: resArray });
                }
            }

            let objValue = obj[key];
            let expire = 0;
            if (typeof objValue == 'object' && objValue.hasOwnProperty('__value__')) {
                objValue = obj[key].__value__;
                expire = obj[key].expire ? Number(obj[key].expire) : 0;
            }

            if (objValue && typeof objValue == 'object') {
                insert_count++;
                _self.insertMap(key, objValue, function (_err, _res) {
                    if (_err == 'succ' && expire && expire > 0) {
                        _self.cluster.expire(key, parseInt(expire), function () {
                            res_callback(_err == null ? 'succ' : 'fail', _res);
                        });
                    } else {
                        res_callback(_err, _res);
                    }
                });
            }
        }

        if (insert_count == 0) {
            logger.error('Invalid input object. Element value must be object type.');
            response('err', 'invalid input object.');
        }
    }

    // [ {key1, value1}, {key2, value2, expired}]
    insertDataByObject2(obj, bLog, callback) {
        function response(res, msg) {
            if (callback) callback(res, msg);
        }

        var _self = this;
        var succ_count = 0;
        var insert_count = 0;
        var resArray = [];

        for (let key in obj) {
            function res_callback(res, msg) {
                if (bLog) resArray.push(msg);

                if (res == 'succ') succ_count++;

                if (--insert_count == 0 && callback) {
                    response(res, { count: succ_count, data: resArray });
                }
            }

            let value = obj[key];
            let expire = 0;
            if (typeof value == 'object' && value.hasOwnProperty('__value__')) {
                value = obj[key].__value__;
                expire = obj[key].expire ? Number(obj[key].expire) : 0;
            }

            if (value && typeof value != 'object') {
                insert_count++;
                _self.insertData(key, value, function (_err, _res) {
                    if (_err == 'succ' && expire && expire > 0) {
                        _self.cluster.expire(key, parseInt(expire), function () {
                            res_callback(_err == null ? 'succ' : 'fail', _res);
                        });
                    } else {
                        res_callback(_err, _res);
                    }
                });
            }
        }

        if (insert_count == 0) {
            logger.error('Invalid input object. Element value must NOT be object type.');
            response('err', 'invalid input object.');
        }
    }

    // [ {key1, value1}, {key2, value2, expired}]
    insertDataByObjectEX(obj, expire, callback) {
        function response(res, msg) {
            if (callback) callback(res, msg);
        }

        let _self = this;
        let succ_count = 0;
        let insert_count = 0;
        let resArray = [];

        for (let key in obj) {
            function _cb(res, msg) {
                resArray.push(msg);
                if (res == 'succ') succ_count++;
                if (--insert_count == 0 && callback) {
                    response(res, { count: succ_count, data: resArray });
                }
            }

            let value = obj[key];
            let _expire = expire;
            // {__value__: xxxx, expire: 10}
            if (typeof value == 'object' && value.hasOwnProperty('__value__')) {
                value = obj[key].__value__;
                _expire = obj[key].expire ? Number(obj[key].expire) : 0;
            }

            if (value && typeof value != 'object') {
                insert_count++;
                if (expire != 0) {
                    _self.insertDataEX(key, value, expire, _cb);
                } else {
                    _self.insertData(key, value, _cb);
                }
            }
        }

        if (insert_count == 0) {
            logger.error('Invalid input object. Element value must NOT be object type.');
            response('err', 'invalid input object.');
        }
    }
    ///////////////////////////////////////////////////////////////////////////////////////

    // get function
    getData(cmd, key, callback) {
        this.cluster[cmd](
            key,
            function (err, data) {
                //this.cluster.send_command(cmd, key, function (err, data) {
                if (err == null) {
                    if (callback) callback('succ', data == null ? 'no_data' : { key: this.key, value: data });
                } else {
                    logger.crit('Error occured while send command => ' + cmd + ' key: ' + key + ' err: ' + err);
                    if (callback) callback('err', data);
                }
            }.bind({ key: key })
        );
    }

    getDatasAsync(cmd, keys, callback) {
        function _getData(cmd, key, cb) {
            _self.cluster[cmd](key, function (err, data) {
                //self.cluster.send_command(cmd, key, function (err, data) {
                if (err == null) {
                    resArray.push(data == null ? 'no_data' : { key: key, value: data });
                } else {
                    logger.crit('Error occured while send command => ' + cmd + ' key: ' + key + ' err: ' + err);
                    resArray.push('no_data');
                }
                cb(null);
            });
        }

        function response(res, code) {
            if (callback) callback(res, code);
        }

        let _self = this;
        let resArray = [];

        if (keys.length == 0) {
            return response('succ', 'no_data');
        }

        if (cmd == null) cmd = 'hgetall';

        let __job = [];
        keys.forEach((cur_key) => {
            __job.push(async.apply(_getData, cmd, cur_key));
        });

        async.parallel(__job, function (err, results) {
            response('succ', resArray);
        });
    }

    getDatas(cmd, keys, callback) {
        function response(res, code) {
            if (callback) callback(res, code);
        }

        var _self = this;
        var resArray = [];
        var resIndex = keys.length;

        if (resIndex == 0) {
            return response('succ', 'no_data');
        }

        if (cmd == null) cmd = 'hgetall';

        keys.forEach((cur_key) =>
            _self.getData(cmd, cur_key, function (err, data) {
                if (err == 'succ') resArray.push(data);

                if (--resIndex == 0) {
                    response(err, resArray);
                }
            })
        );
    }

    getSearch(cmd, key, callback) {
        function response(res, code) {
            if (callback) callback(res, code);
        }

        var _self = this;
        _self.getKeys(
            key,
            function (res, dataList) {
                function res_callback(rcode, msg) {
                    resArray.push(msg);

                    if (--resIndex == 0) {
                        response(rcode, resArray);
                    }
                }

                if (res == 'err') {
                    return response('err', dataList);
                }

                var resArray = [];
                dataList = dataList.reduce((a, b) => a.concat(b), []);

                var resIndex = dataList.length;
                if (resIndex == 0) {
                    return response('succ', 'no_data');
                }

                if (cmd == null) cmd = 'hgetall';

                dataList.forEach((cur_key) => _self.getData(cmd, cur_key, res_callback));
            }.bind({ cmd: cmd })
        );
    }

    delKey(key, callback) {
        this.cluster.del(
            key,
            function (res) {
                if (res == null) {
                    if (callback) callback('succ', { key: this.key });
                } else {
                    if (callback) callback('err', res.toString());
                }
            }.bind({ key: key })
        );
    }

    delKeys(keys, callback) {
        function response(res, code) {
            if (callback) callback(res, code);
        }

        var _self = this;

        _self.getKeys(keys, function (res, dataList) {
            function res_callback(rcode, msg) {
                subArray.push(msg);

                if (--resIndex == 0) {
                    response(rcode, subArray);
                }
            }

            if (res == 'err') {
                return response('err', dataList);
            }

            var subArray = [];

            dataList = dataList.reduce((a, b) => a.concat(b), []);

            var resIndex = dataList.length;
            if (resIndex == 0) {
                return response('succ', 'no_data');
            }

            dataList.forEach((cur_key) => _self.delKey(cur_key, res_callback));
        });
    }

    getCount(keys, callback) {
        function response(res, code) {
            if (callback) callback(res, code);
        }

        var _self = this;
        _self.getKeys(keys, function (res, dataList) {
            if (res == 'err') {
                return response('err', dataList);
            }

            dataList = dataList.reduce((a, b) => a.concat(b), []);
            let _res = {};
            _res.key = keys;
            _res.length = dataList.length;
            response('succ', _res);
        });
    }

    getKeys(prefix, callback) {
        // Get keys of all the masters:
        var masters = this.Cluster.nodes('master');

        Promise.all(
            masters.map(function (node) {
                return node.keys(prefix);
            })
        )
            .then(function (keys) {
                // keys: [['key1', 'key2'], ['key3', 'key4']]
                if (callback) callback('succ', keys);
            })
            .catch((error) => {
                logger.error(error);
                if (callback) callback('err', error);
            });
    }

    redis_getdata(redis_conf, cmd, keys) {
        var _self = this;
        return new Promise(function (resolve, reject) {
            function callback(res, msg) {
                if (res == 'succ') {
                    resolve(msg);
                } else {
                    reject(msg);
                }
                _self.clear();
            }

            // var redis_session = redis();
            _self.init(redis_conf, function (res) {
                if (res != 'succ') callback(res);

                // search key -> get datas
                if (keys.indexOf('*') !== -1) {
                    _self.getSearch(cmd, keys, callback);
                }
                // get data
                else {
                    _self.getData(cmd, keys, callback);
                }
            });
        });
    }
};

/*
- config sample
"redis": {
      "domains": [
        {
          "host": "210.221.235.198",
          "port": 7000
        },
        {
          "host": "210.221.235.198",
          "port": 7001
        },
        {
          "host": "210.221.235.198",
          "port": 7002
        }
      ]
    } 

- sample code
var redis_session = require(__lib_base + 'database/redis');
redis_session.redis_getdata(config.get('redis:domains'), 'hgetall', 'test_*').then(res) => {
    console.log(res);
}).catch((error) => {
    console.log(error);
});
*/
