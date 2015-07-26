if (Meteor.isServer) {
    var fs = Npm.require('fs');
    var mkdirp = Npm.require('mkdirp');
}

/**
 * File system store
 * @param options
 * @constructor
 */
UploadFS.store.Local = function (options) {
    // Set default options
    options = _.extend({
        path: 'ufs/uploads'
    }, options);

    // Check options
    if (typeof options.path !== 'string') {
        throw new TypeError('path is not a string');
    }

    // Private attributes
    var path = options.path;

    // Create the upload dir
    if (Meteor.isServer) {
        mkdirp(path, function (err) {
            if (err) {
                console.error('ufs: error creating store ' + path);
            } else {
                console.info('ufs: created store ' + path);
            }
        });
    }

    // Create the store
    var store = new UploadFS.Store(options);

    /**
     * Returns the file path
     * @param fileId
     * @return {string}
     */
    store.getFilePath = function (fileId) {
        var file = store.getCollection().findOne(fileId, {
            fields: {extension: 1}
        });
        return file && store.getPath() + '/' + fileId + '.' + file.extension;
    };

    /**
     * Returns the file URL
     * @param fileId
     * @return {string}
     */
    store.getFileURL = function (fileId) {
        var file = store.getCollection().findOne(fileId, {
            fields: {extension: 1}
        });
        return file && Meteor.absoluteUrl('ufs/' + store.getName() + '/' + fileId + '.' + file.extension);
    };

    /**
     * Returns the path where files are saved
     * @return {string}
     */
    store.getPath = function () {
        return path;
    };


    if (Meteor.isServer) {
        /**
         * Removes the file
         * @param fileId
         * @param callback
         */
        store.delete = function (fileId, callback) {
            if (typeof callback !== 'function') {
                callback = function (err) {
                    if (err) {
                        console.error(err);
                    }
                }
            }
            fs.unlink(this.getFilePath(fileId), callback);
        };

        /**
         * Returns the file read stream
         * @param fileId
         * @return {*}
         */
        store.getReadStream = function (fileId) {
            return fs.createReadStream(this.getFilePath(fileId), {
                flags: 'r',
                encoding: null,
                autoClose: true
            });
        };

        /**
         * Returns the file write stream
         * @param fileId
         * @return {*}
         */
        store.getWriteStream = function (fileId) {
            return fs.createWriteStream(this.getFilePath(fileId), {
                flags: 'a',
                encoding: null
            });
        };
    }

    return store;
};


if (Meteor.isServer) {
    var zlib = Npm.require('zlib');

    // Listen HTTP requests to serve files
    WebApp.connectHandlers.use(function (req, res, next) {
        // Check if request matches /ufs/store/file.ext
        var match = /^\/ufs\/([^\/]+)\/([^\/]+)$/.exec(req.url);

        if (match !== null) {
            // Get store
            var storeName = match[1];
            var store = UploadFS.getStore(storeName);
            if (!store) {
                res.writeHead(404, {});
                res.end();
                return;
            }

            // Get file from database
            var fileId = match[2].replace(/\.[^.]+$/, '');
            var file = store.getCollection().findOne(fileId);
            if (!file) {
                res.writeHead(404, {});
                res.end();
                return;
            }

            // todo add security check if file is private

            try {
                // Get file stream
                var rs = store.getReadStream(fileId);
                var accept = req.headers['accept-encoding'] || '';

                // Compress data if supported by the client
                if (accept.match(/\bdeflate\b/)) {
                    res.writeHead(200, {
                        'Content-Encoding': 'deflate',
                        'Content-Type': file.type
                    });
                    rs.pipe(zlib.createDeflate()).pipe(res);

                } else if (accept.match(/\bgzip\b/)) {
                    res.writeHead(200, {
                        'Content-Encoding': 'gzip',
                        'Content-Type': file.type
                    });
                    rs.pipe(zlib.createGzip()).pipe(res);

                } else {
                    res.writeHead(200, {});
                    rs.pipe(res);
                }
            } catch (err) {
                console.error('Cannot read file ' + fileId);
                throw err;
            }

        } else {
            next();
        }
    });
}