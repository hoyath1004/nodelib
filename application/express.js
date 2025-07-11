'use strict';

const expresslib = require('express');
const app = require('express')();
const router = require('express').Router();
const cookieParser = require('cookie-parser'); 
const body_parser = require('body-parser');
const tools = require('../utils/tools');
const config = require('../utils/config');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
var cluster = require('cluster');
var compress = require('compression');

function express() {
    if (!(this instanceof express)) {
        return new express();
    }
}

/*
    _routing example

    {
        "/first": "./js/first.js",
        "/second": "./js/second.js"
    }
*/
express.prototype.init = function (conf, _routing) {
    var _check_hour = {};
    morgan.token('ip', function (req) {
        let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        ip = ip.split(',')[0];
        // remove IPV6 prefix
        var n = ip.lastIndexOf(':');
        if (n > 0)
            return ip.substr(n + 1);
        else 
            return ip;
    });

    morgan.token('custom', function (req) {
        if (req.hasOwnProperty('custom'))
            return req.custom;
        else
            return '';
    });

    morgan.token('custom2', function (req) {
        if (req.hasOwnProperty('custom2'))
            return req.custom2;
        else
            return '';
    });

    // setup the logger
    function __pad(num) {
        return (num > 9 ? "" : "0") + num;
    }

    function __get_log_filename(time, index, filename) {
        // 20190412: 시간 보정, 서버시간이 늦어질 경우 같은 hour의 로그파일 생성할 경우가 생김..... 
        try {       
            var _time = time;
            if (_check_hour.hasOwnProperty(filename)) {
                if ( _check_hour[filename] >= time.getHours() || ( _check_hour[filename] == 0 && time.getHours() == 23)) {
                    _time = new Date(Date.parse(time) + 1000 * 600); 
                }
                _check_hour[filename] = _time.getHours();
            }
            else {
                _check_hour[filename] = _time.getHours();
            }      
            logger.crit('rotate logfile name:  ' + filename + ' check time: ' + time.toString() + ' -> ' +  _time.toString() )     

            var year = _time.getFullYear();
            var month =  __pad(_time.getMonth() + 1);
            var day = __pad(_time.getDate());
            var hour = __pad(_time.getHours());
                
            if (cluster.isWorker) {
                let _index = process.pid;
                // pm2 cluster mode
                if (process.env.hasOwnProperty('NODE_APP_INSTANCE')) {
                    _index = util.format("%d", process.env.NODE_APP_INSTANCE).padStart(2, '0');
                }

                var ret = year + "/" + month + "/" + day + "/" + _index + "_" + filename + "_" + hour;
            }
            else {
                var ret = year + "/" + month + "/" + day + "/" + filename + "_" + hour;
            }
        }
        catch (err){
            logger.crit(err.stack);
        }         

        if (index > 1)
            return  ret + "_" + index;
        else
            return ret;
    }
     
    function _generator_access_log_name(time, index) {
        if (!time) return "access_log";

        return __get_log_filename(time, index, 'access_log'); 
    }

    function _generator_error_log_name(time, index) {
        if (!time) return "error_log";

        return __get_log_filename(time, index, 'error_log');
    }

    function _generator_custom_log_name(time, index) {
        if (!time) return "custom_log";

        let _filename = 'custom_log';
        for (var i in conf.log) {
            if (conf.log[i].type == "custom") {
                if (!tools.isEmpty(conf.log[i].name)) {
                    _filename = conf.log[i].name ;
                }
            }
        }
        return __get_log_filename(time, index, _filename);
    }

    function _generator_custom2_log_name(time, index) {
        if (!time) return "custom2_log";

        let _filename = 'custom2_log';
        for (var i in conf.log) {
            if (conf.log[i].type == "custom2") {
                if (!tools.isEmpty(conf.log[i].name)) {
                    _filename = conf.log[i].name ;
                }
            }
        }
        return __get_log_filename(time, index, _filename);
    }
     
    var rfs = require('rotating-file-stream');
    const moment = require('moment-timezone');
    morgan.token('date', (req, res, format) => {
        return moment().tz('Asia/Seoul').format();
    })

    for (var i in conf.log) {
        if (conf.log[i].type == "access") {
            var _stream = rfs(_generator_access_log_name, {
                interval: "1h",
                immutable: true,
                path: conf.log[i].path
            });

            app.use(morgan('combined', { 
                stream: _stream 
            }));
        }
        else if (conf.log[i].type == "error") {
            var _stream = rfs(_generator_error_log_name, {
                interval: "1h",
                immutable: true,
                path: conf.log[i].path                
            });

            app.use(morgan('combined', { 
                stream: _stream,
                skip: function (req, res) { return res.statusCode < 400 }
            }));
        }
        else if (conf.log[i].type == "custom") {
            if (!tools.isEmpty(conf.log[i].format)) {
                var _stream = rfs(_generator_custom_log_name, {
                    interval: "1h",
                    immutable: true,
                    path: conf.log[i].path
                });
    
                app.use(morgan(conf.log[i].format, { 
                    stream: _stream,
                    skip: function (req, res) { return tools.isEmpty(req.custom) }
                }));
            }
        }
        else if (conf.log[i].type == "custom2") {
            if (!tools.isEmpty(conf.log[i].format)) {
                var _stream = rfs(_generator_custom2_log_name, {
                    interval: "1h",
                    immutable: true,
                    path: conf.log[i].path
                });
    
                app.use(morgan(conf.log[i].format, { 
                    stream: _stream,
                    skip: function (req, res) { return tools.isEmpty(req.custom2) }
                }));
            }
        }
    }
   
	app.use(compress());
    app.use(body_parser.json({limit: 10mb5mb'}));
    app.use(cookieParser()); 
    app.use(body_parser.urlencoded({
		limit: '10mb',
        extended: true
    }));
    // 202105: Deprecate body-parse
    app.use(expresslib.json({limit: '10mb'}));
    app.use(expresslib.text());
    app.use(expresslib.urlencoded({
		limit: '10mb',
        extended: true
    }));

    app.use((req, res, next) => {
        var origin = req.headers.origin;
        if(!tools.isEmpty(origin) && origin != 'undefined'){
            res.header('Access-Control-Allow-Origin', origin);
        }else{
            res.header('Access-Control-Allow-Origin', '*');
        }
        res.header('Access-Control-Allow-Credentials', true);
        res.header('Access-Control-Allow-Headers', 'content-type');
        res.header('Access-Control-Allow-Headers', 'cache-control');
        res.header('Access-Control-Allow-Headers', 'charsets');
        res.header('Access-Control-Allow-Headers', 'Expect');
        next();
    });

    app.use((err, req, res, next) => {
		if (!err) {
			logger.error(err);
		}
        res.status(500).send('Error occured. : ' + err);
    });

    // Registered module.
    Object.keys(_routing).forEach(function (key, index) {
        if (typeof _routing[key] != 'object') {
            logger.info('Routing path has been registered. path : ' + key + ', module2 : ' + _routing[key]);
            router.get(key, require(__base + _routing[key]));
        }
        else {
            let _obj = _routing[key];
            logger.info('Routing path has been registered. path : ' + key + ', module : ' + JSON.stringify(_obj));
            Object.keys(_obj).forEach(function (key, index) {
                logger.info('Routing path has been registered. path : ' + key + ', module : ' + JSON.stringify(_obj[key]));
                if (_obj[key].method == "GET") {
                    if (_obj[key].func !== undefined) {
                        router.get(key, _obj[key].func);
                    }
                    else {
                        router.get(key, require(__base + _obj[key].path));
                    }                
                }
                else {
                    if (_obj[key].func !== undefined) {
                        router.post(key, _obj[key].func);
                    }
                    else {
                        router.post(key, require(__base + _obj[key].path));
                    }
                }
            });
        }
    });

    app.use('/', router);

    app.use((req, res, next) => {
        res.status(404).send('Invalid request.');
    });
    
    var server = app.listen(conf.port, "0.0.0.0", function () {
        logger.info('Server has been initialized. port : ' + conf.port);
    });

	if(conf.hasOwnProperty('keepalive_timeout') && conf.keepalive_timeout != 0) {
		//default: 5000 (5s)
		server.keepAliveTimeout = conf.keepalive_timeout * 1000;	
	}
}

express.prototype.customRouting = function(path) {
    app.use(path);
}

express.prototype.cors = function() {
    const cors = require('cors');
    app.use(cors());
}

module.exports = express();
