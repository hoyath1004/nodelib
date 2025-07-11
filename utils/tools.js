global.util = require('util');
global.uuidv1 = require('uuid/v1');
const uuidv4 = require('uuid/v4');

module.exports.isEmpty = function (value) {
    if (typeof value == 'number') {
        return false;
    }
  
    if ( value == undefined || value == "" || value == null || (value != null && typeof value == "object" && !Object.keys(value).length)) {
        return true;
    } else {
        return false;
    }
}

module.exports.getDataObj = function(valObj, key, def) {
    return valObj.hasOwnProperty(key) ? valObj[key] : ( def == undefined ? '' : def);
}

module.exports.getDataByDepth = function(dataObj, keys, def) {
    let splitKeys = keys.split('.');
    let res = splitKeys.some((key) => {
        console.log('key: ' + key + ' obj: ' + JSON.stringify(dataObj));
        if ( !dataObj.hasOwnProperty(key) ) {
            return true;
        }
        dataObj = dataObj[key];
    });
    return res ?  ( def == undefined ? '' : def) : dataObj;
}


module.exports.num_crypt = function (num) {
    var lkey = 789456987; 
    return (num ^ lkey) ^ 0x96
}

module.exports.str_shift = function (str) {
    if (this.isEmpty(str)) return;

    var regexp = /[a-zA-Z]/;
    var shift_key = 18; // 시프트 변환 수치 지정
    let len = str.length;
    var result = '';
    for (let i = 0; i < len ; i++)
    {
        if (str[i].match(regexp)) {
            let charSet = str[i].charCodeAt();
            let aSet =  String('a').charCodeAt();
            if (charSet >= aSet) {
                result += String.fromCharCode(code + ( str[i].charCodeAt() - aSet + shift_key ) % 26);
            }
            else {
                let code = String('A').charCodeAt();
                result += String.fromCharCode(code + ( str[i].charCodeAt() - code + shift_key ) % 26);
            }
        }
    } 

    return result;
}

module.exports.uuid = function () {
    return uuidv4();
};


module.exports.mekaRequestKey = function(authkey, split) {
    let en_request_time = tools.num_crypt(Date.now() / 1000);
    authkey = tools.str_shift(authkey);
    return uuidv4() + split + en_request_time + split + authkey;;
}

module.exports.getRandomNumber = function(max) {
    return Math.floor(Math.random() * Math.floor(max));
}

module.exports.toNumber = function(input) {
    if (isNaN(input))
        return 0;

    return Number(input);
}

module.exports.getLocalAddress = function() {
    var interfaces = require('os').networkInterfaces();
    for (var devName in interfaces) {
      var iface = interfaces[devName];
  
      for (var i = 0; i < iface.length; i++) {
        var alias = iface[i];
        if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal)
          return alias.address;
      }
    }  
    return '0.0.0.0';
}

module.exports.getTime = function() {
    let now = new Date();
    return tools.getTimetoStr(now)
}


module.exports.getTimetoStr = function(now) {
    function __pad(num) {
        return (num > 9 ? "" : "0") + num;
    }
    return __pad(now.getFullYear()) + __pad(now.getMonth() + 1) +
        __pad(now.getDate()) + __pad(now.getHours()) +
        __pad(now.getMinutes()) + __pad(now.getSeconds());
}

