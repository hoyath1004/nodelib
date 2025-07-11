const Crypto = require("crypto");
const fs = require("fs");

module.exports.AES_encrypt = function (key, iv, input) {
    var cipher = Crypto.createCipheriv("aes-256-cbc", key, iv);
    var enc = cipher.update(input, "utf8", "base64");
    enc += cipher.final("base64");

    return enc;
};

module.exports.AES_decrypt = function (key, iv, input) {
    var decipher = Crypto.createDecipheriv("aes-256-cbc", key, iv);

    var dec = decipher.update(input, "base64", "utf8");
    dec += decipher.final("utf8");
    return dec;
};

module.exports.HMAC_encypt_appsflyer = function (message, secret_key) {
    // 암호화 객체 생성, sha256 알고리즘 선택
    let hmac = Crypto.createHmac("sha256", secret_key);
    hmac.write(new Buffer(message));
    hmac.end();
    return hmac.read();
    // return (typeof message == 'undeifined' || message == null) ? null : Crypto.createHmac('sha256', secret_key).update(message).digest('hex');
};

// MySQL Encrypt aes-128-ecb
const AES = require("mysql-aes");
module.exports.MYSQL_AES_encrypt = function (key, input) {
    return AES.encrypt(input, key);
};

module.exports.MYSQL_AES_decrypt = function (key, input) {
    return AES.decrypt(input, key);
};

module.exports.GetMD5Data = function (data) {
    return Crypto.createHash("md5").update(data).digest("hex");
};

module.exports.GetMD5File = function (filename, cb) {
    try {
        let _checksum = Crypto.createHash("md5");
        if (typeof cb == "undefined") {
            let data = fs.readFileSync(filename);
            return _checksum.update(data).digest("hex");
        } else {
            let _file = fs.ReadStream(filename);
            _file.on("data", function (data) {
                _checksum.update(data);
            });

            _file.on("end", function () {
                cb(_checksum.digest("hex"));
            });

            _file.on("error", function (msg) {
                console.log("err2=", msg);
                return typeof cb == "undefined" ? null : cb(null);
            });
        }
    } catch (err) {
        console.log("err1=", err);
        return typeof cb == "undefined" ? null : cb(null);
    }
};
