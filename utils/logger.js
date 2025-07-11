'use strict';

const path = require('path');
const {createLogger, format, transports} = require('winston');
const {combine, timestamp, label, printf} = format;
const winstonDaily = require('winston-daily-rotate-file');
const tools = require('./tools');
const config = require('./config');

const max_log_level_length = 5;
var cluster = require('cluster');

if (tools.isEmpty(__app_name)) {
  console.log("You must set app name.");
  process.exit(1);
}

var log_path = !tools.isEmpty(config.get('log_path:##mode##')) ? config.get('log_path:##mode##') :
  (tools.isEmpty(config.get('log_path')) ? './' : config.get('log_path') + '/');

if (cluster.isWorker) {
  let _index = process.pid;
  // pm2 cluster mode
  if (process.env.hasOwnProperty('NODE_APP_INSTANCE')) {
    _index = util.format("%d", process.env.NODE_APP_INSTANCE).padStart(2, '0');
  }

  var filename = path.join(log_path, _index + "_" + __app_name + "_%DATE%.log");
} else {
  var filename = path.join(log_path, __app_name + "_%DATE%.log");
}

if (tools.isEmpty(__log_level_console)) {
  global.__log_level_console = 'debug';
}

if (tools.isEmpty(__log_level_file)) {
  global.__log_level_file = 'debug';
}

// add config...
let _level_console = config.get('level_console:##mode##');
if (!tools.isEmpty(_level_console)) {
  global.__log_level_console = _level_console;
}

let _level_file = config.get('level_file:##mode##');
if (!tools.isEmpty(_level_file)) {
  global.__log_level_file = _level_file;
}
console.log(global.__log_level_console + ' ' + global.__log_level_file);
const custom_format_for_file = printf(info => {
  var str = String(info.level).padEnd(5);
  return info.timestamp + ' [' + info.level.padEnd(max_log_level_length) + '] ' + info.message;
})

const custom_format_for_console = printf(info => {
  var str = String(info.level).padEnd(5, '.');

  // 10 is for ANSI code like this : \u001b[31m.....\u001b[39m
  return info.timestamp + ' [' + info.level.padEnd(max_log_level_length + 10) + '] ' + info.message;
})

const logger = createLogger({
  levels: {
    emerg: 0,
    alert: 1,
    crit: 2,
    error: 3,
    warn: 4,
    info: 5,
    debug: 6
  },
  transports: [
    new (transports.Console)({
      level: __log_level_console,
      name: __app_name + '_log_console',
      timestamp: true,
      format: combine(
        format.colorize(),
        timestamp({
          format: "YYYY-MM-DD HH:mm:ss",
          localTime: true
        }),
        custom_format_for_console
      )
    }),
    new (winstonDaily)({
      level: __log_level_file,
      name: __app_name + '_log_file',
      timestamp: true,
      filename: filename,
      dirname: log_path,
      datePattern: 'YYYY-MM-DD',
      maxsize: 50000000,
      maxFiles: 1000,
      zippedArchive: false,
      format: combine(
        timestamp({
          format: "YYYY-MM-DD HH:mm:ss",
          localTime: true
        }),
        custom_format_for_file
      )
    })
  ]
});

module.exports = logger;

////////////////////////////////////////////////////////////
// rotate custom logger
if (!tools.isEmpty(config.get('rotate_log:##mode##'))) {
  var cluster = require('cluster');
  var rfs = require("rotating-file-stream");
  var rotate_log_config = config.get('rotate_log:##mode##');
  var rotate_log = {};


  rotate_log_config.forEach(function (_confVal) {
    var _generator_log_name = function (time, index) {
      var _time = time;
      // 20190412: 시스템 시간 보정이 필요.....같은 시간의 파일을 생성하는 경우가 생김...ooooooooops
      if (this._val.interval == '1h') {
        if (typeof this._val._cur_time != 'undefined' && (this._val._cur_time >= _time.getHours() || (this._val._cur_time == 0 && _time.getHours() == 23))) {
          // 10 min after
          _time = new Date(Date.parse(time) + 1000 * 600);
          logger.crit(process.pid + ' rotate file error 1 hour interval: ' + time.toString() + ' -> ' + _time.toString());
        }
        this._val._cur_time = _time.getHours();
      } else if (this._val.interval == '1d') {
        if (this._val._cur_time != 0 && this._val._cur_time == _time.getDate()) {
          // 10 min after
          _time = new Date(Date.parse(time) + 1000 * 600);
          logger.crit(process.pid + ' rotate file error 1 day interval: ' + time.toString() + ' -> ' + _time.toString());
        }
        this._val._cur_time = _time.getDate();
      }

      let _filename = tools.isEmpty(this._val.name) ? 'default_log' : this._val.name;

      var year = _time.getFullYear();
      var month = String(_time.getMonth() + 1).padStart(2, '0');
      var day = String(_time.getDate()).padStart(2, '0');
      var hour = String(_time.getHours()).padStart(2, '0');
      var mm = String(_time.getMinutes()).padStart(2, '0');
      var ret = util.format('%s/%s/%s/%s_%s', year, month, day, _filename, hour);

      if (cluster.isWorker) {
        let _index = String(process.pid);
        // pm2 cluster mode
        if (process.env.hasOwnProperty('NODE_APP_INSTANCE')) {
          _index = util.format("%d", process.env.NODE_APP_INSTANCE).padStart(2, '0');
        }
        ret = util.format('%s/%s/%s/%s_%s_%s', year, month, day, _index, _filename, hour);
      }


      // Min rotate...
      if (this._val.interval.indexOf('m') >= 0) {
        ret += '_' + mm;
      }

      logger.crit(process.pid + ' ' + this._val.type + ' rotate file: ' + ret + ' hour: ' + this._val._cur_time + ' | ' + _time.toString())

      return ret;
    }.bind({_val: _confVal})

    var _stream = rfs(_generator_log_name, {
      interval: _confVal.interval,
      immutable: true,
      path: _confVal.path
    });

    // type: _stream Object
    rotate_log[_confVal.type] = _stream;
  });

  module.exports.write_stream = function (type, str) {
    if (rotate_log.hasOwnProperty(type)) {
      rotate_log[type].write(str);
    }
  }

  module.exports.get_logger = function (type) {
    if (rotate_log.hasOwnProperty(type)) {
      return rotate_log[type]
    } else {
      throw new Error("not found custom logger")
    }
  }
}
