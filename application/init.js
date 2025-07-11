const ip = require('ip');

module.exports = function (_default_conf_path, _app_name, isUseLogger = true) {
    global.__conf_path = _default_conf_path; // Optional. You can specify this value with an argument.
    global.__app_name = _app_name;
    global.__mode = '';
    global.__ip = ip.address()
    global.__log_level_console = 'debug';
    global.__log_level_file = 'info';

    ///////////////////////////////////////////
    // Dependency
    global.config = require('../utils/config');

    /*
        [Usage]
        node app.js ../../conf/xxxx.json app_name mode

        - mode : live, dev, local, this value will be matched with ##mode## in config literal.
    */
    process.argv.forEach(function (val, index, array) {
        if (val.indexOf('=') >= 0) {
            let _tmp = val.split('=');
            let _key = _tmp[0];
            let _value = _tmp[1];

            if (_tmp[0].indexOf('--') >= 0) {
                _key = _tmp[0].split('--')[1];
            }

            console.log('@@ ' + index + ' ARG KEY: ' + _key + ' VALUE: ' + _value);
            switch (_key.toLowerCase()) {
                case 'path':
                    __conf_path = _value;
                    break;
                case 'name':
                    __app_name = _value;
                    break;
                case 'mode':
                    __mode = _value;
                    break;
                case 'ip':
                    __ip = _value;
                    break;
                default:
                    console.log('!!!!!!!!!! WARNING !!!!!!! NOT FOUND KET : ' + val);
                    break;
            }
        } else {
            if (index == 2) __conf_path = val;

            if (index == 3) __app_name = val;

            if (index == 4) __mode = val;
        }
    });

    config.init();

    global.logger = isUseLogger ? require('../utils/logger') : null;
};
