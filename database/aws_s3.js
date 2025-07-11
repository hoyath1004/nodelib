/** @format */

const AWS = require('aws-sdk');
const config = require('../utils/config');

function aws() {
    if (!(this instanceof aws)) {
        return new aws();
    }
    this.session = null;
    this.conf = {};
}

aws.prototype.init = function (conf, callback) {
    if (conf) {
        Object.assign(this.conf, conf);
    }

    if (!this.conf.key || !this.conf.secret_key) {
        throw new Error('Cannot find S3 AccessKeyId, SecretAccessKey');
    } else {
        AWS.config.update({
            accessKeyId: this.conf.key,
            secretAccessKey: this.conf.secret_key,
        });

        logger.info('[AWS] Initializing S3 Conf');

        if (callback) {
            return callback('succ');
        }
    }
};

aws.prototype.getJob = function (conf, job, callback) {
    if (conf) {
        Object.assign(this.conf, conf);
    }

    const s3 = new AWS.S3();
    const params = {
        Bucket: this.conf.url,
        Key: job.path + '/' + job.file,
    };

    s3.getObject(params, (err, datas) => {
        if (err) {
            logger.error(err);
            callback('fail', err.code);
        } else {
            let contents = datas.Body.toString().split('\n');
            let json = {};
            let data = [];

            if (contents.length > 0) {
                json.state = 'succ';
                json.col = contents[0].split(',');

                for (let i = 1; i < contents.length - 1; i++) {
                    data.push(Object.values(contents[i].split(',')));
                }
            } else {
                json.state = 'fail';
            }
            json.data = data;

            callback('succ', json);
        }
    });
};

aws.prototype.getJobDir = function (conf, job, callback) {
    if (conf) {
        Object.assign(this.conf, conf);
    }

    const s3 = new AWS.S3();

    const listParams = {
        Bucket: this.conf.url,
        Prefix: job.path + '/' + job.file + '/',
    };

    s3.listObjectsV2(listParams, (err, data) => {
        if (err) {
            callback('fail', `${err.code} ${err.message}`);
            return;
        }

        const params = {
            Bucket: this.conf.url,
            Key: job.path + '/' + job.file,
        };

        // 파일명의 디렉토리를 찾고 없으면 파일명으로 분석
        if (!data.Contents || data.Contents.length === 0) {
            logger.error(`dir file not found ${listParams.Prefix}`);
            logger.info(`[AWS] S3 file : ${params.Key}`);

            getObject(s3, params, function (result, data) {
                callback(result, data);
            });
        }
        // 디렉토리 안에 파일이 있음
        else {
            logger.info(`[AWS] S3 file Size: ${data.Contents.length}`);

            let csvData = {
                col: '',
                data: []
            }
            let tasks = [];

            for (let i = 0; i < data.Contents.length; i++) {
                const fileKey = data.Contents[i].Key;

                if (!fileKey.endsWith('.csv')) {
                    logger.info(`[AWS] S3 file not csv : ${fileKey}`);
                    continue;
                }

                params.Key = fileKey;

                logger.info(`[AWS] S3 file : ${params.Key}`);

                tasks.push(
                    new Promise((resolve, reject) => {
                        getObject(s3, params, function (result, data) {
                            csvData.col = data.col;
                            csvData.data = csvData.data.concat(data.data);

                            if (result === 'succ' && data.state === 'succ') {
                                resolve();
                            } else {
                                reject(data);
                            }
                        });
                    })
                );
            }

            Promise.all(tasks)
                .then(() => {
                    let json = {
                        state: '',
                        col: '',
                        data: []
                    }

                    json.state = 'succ';
                    json.col = csvData.col;
                    json.data = csvData.data;

                    callback('succ', json);
                })
                .catch((err) => {
                    callback('fail', err);
                });
        }
    })
};

function getObject(s3, param, callback) {
    s3.getObject(param, (err, datas) => {
        if (err) {
            logger.error(err);
            callback('fail', err.code);
        } else {
            let contents = datas.Body.toString().split('\n');
            let json = {};
            let data = [];

            if (contents.length > 0 && contents[0] != '') {
                json.state = 'succ';
                json.col = contents[0].split(',');

                if (json.col == '') {
                    json.state = 'fail';
                } else {
                    for (let i = 1; i < contents.length - 1; i++) {
                        data.push(Object.values(contents[i].split(',')));
                    }
                }
            } else {
                json.state = 'fail';
            }
            json.data = data;

            callback('succ', json);
        }
    });
}

module.exports = aws;
