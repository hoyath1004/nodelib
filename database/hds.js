const async = require('async');
const presto = require('presto-client');

function _execute(client, query, cb_data, cb) {
    let _id = '';
    let _res = [], _col = [];
    client.execute({
        query: query,
        catalog: 'hive',
        schema:  'default',
        source:  'nodejs-client',
        state:   function(error, query_id, stats) { 
            // 20140214_083451_00012_9w6p5
            _id = query_id;
            // QUEUED, PLANNING, STARTING, RUNNING, FINISHED, or CANCELED, FAILED
            //console.log('STATE ===========> ' + _id);
            //console.log('STATE CHANGED: ' + query_id + ' ' + stats.state);
        },
        columns: function(error, data) { 
            //console.log('COL ===========> ' + _id);
            //console.log({resultColumns: data}); 
            data.forEach(_obj => {_col.push(_obj.name || '');})
        },
        data: function(error, data, columns, stats) { 
            // Success Query
            // [[14964873]]
            // data.forEach(elm => {console.log(elm.join(','))});
            // console.log('DATA ===========> ' + _id);
            if (cb_data != null && cb_data) cb_data(_col, data)
            else _res = _res.concat(data);
        },
        success: function(error, stats){
            //console.log('SUCC ===========> ' + _id + ' LEN: ' + _res.length );
            cb(null, cb_data ? {state: 'succ', data:{}} : {state: 'succ', col: _col, data: _res});
        },
        error: function(error) {
            //console.log('ERROR ===========> ' + _id);
            let _err =  '[' + error.errorName + '] ' + error.message;
            cb(null,  {state: 'fail', data: _err});
        }
    });
}

function _exeObj(client, queryObj, cb) {
    let jobs = [], keys = [];
    for (const [k, v] of Object.entries(queryObj)) {
        keys.push(k);
        jobs.push(async.apply(_execute, client, v, null));
    }

    if(jobs.length === 0) return cb('fail'); 
    async.parallel(jobs, function(err, results) {       
        // results: [{state:succ, A:job1},{state:succ, B:job2},{state:succ, C:job1}]
        let res = {};
        keys.forEach(function(k, i) {res[k] = results[i]});
        return cb('succ', res)
    });
}

function _exeList(client, queryList, cb) {
    let jobs = [];
    queryList.forEach(_query => jobs.push(async.apply(_execute, client, _query, null)));

    if(jobs.length === 0) return cb('fail'); 
    async.parallel(jobs, function(err, results) {       
        // results: [[job1],[job2],[job3]]
        return cb('succ', results)
    });
}

function hds() {
    if (!(this instanceof hds)) {
        return new hds();
    }
    this.session = null;
    this.conf = {};    
}

hds.prototype.init = function(conf, callback) {
    if (conf) {
        Object.assign(this.conf , conf);
    }

    // Default: 800ms
    this.conf['checkInterval'] = 300;
    console.log('[hds] Initializing hda session. host: ' + conf.host + '  port: ' + conf.port + ' user: ' + conf.user);
    this.session = new presto.Client(conf);
    if(callback) return callback('succ')
}

// input: [ {key: query}, {key: query}, {key: query}, ... ]
hds.prototype.get = function(query, callback, callback_data) {
    if (this.session == null) {
        if (this.conf === {}) return callback('fail', 'NOT_FOUND_CONIFG')
        this.init();
    }
    // input: query
    if (typeof query === 'string') {
        _execute(this.session, query, callback_data, function(res, data) {
            if(callback) callback('succ', data);
        }) 
    }
    // input: [ query1, query2, query3, ... ]
    else if (Array.isArray(query)) {
        _exeList(this.session, query, callback);
    }
    // input: [ {key: query}, {key: query}, {key: query}, ... ]
    else if (typeof query === 'object') {
        _exeObj(this.session, query, callback);
    }
    else callback('fail', 'NOT_QUERY_TYPE')
}

hds.prototype.sget = function(conf, query, callback, callback_data) {
    conf['checkInterval'] = 300;
    
    let client = new presto.Client(conf);
    // input: query
    if (typeof query === 'string') {
        _execute(client, query, callback_data, function(res, data) {
            client = null;
            callback('succ', data);
        });
    }
    // input: [ query1, query2, query3, ... ]
    else if (Array.isArray(query)) {
        _exeList(client, query, function(res, results) {
            client = null;
            callback(res, results);
        });
    }
    // input: [ {key: query}, {key: query}, {key: query}, ... ]
    else if (typeof query === 'object') {
        _exeObj(client, query, function(res, results) {
            client = null;
            callback(res, results);
        });
    }
    else callback('fail', 'NOT_QUERY_TYPE')
}

module.exports = hds;

