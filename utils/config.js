'use strict'

const nconf = require( 'nconf');

module.exports.init = function() {
    nconf.argv().env();
    nconf.file({ file: __conf_path });
}

module.exports.get = function (key) {
    var match;
    var regex = /(##(\w*)##)/g;

    var ret = {};
    while (match = regex.exec(key)) {
        if (__mode.length > 0)
            ret[match[1]] = __mode;
        else
            ret[match[1]] = nconf.get(__app_name + ':' + match[2]);
    }

    for (var i in ret) {
        key = key.split(i).join(ret[i]);
    }
    return nconf.get(__app_name + ':' + key);
}
module.exports.set = function (key, val) {
    return nconf.set(__app_name + ':' + key, val);
}