const webmake = require('webmake');
const minify = require('@node-minify/core');
const uglifyjs = require('@node-minify/uglify-js');

function runMinify() {
    minify({
        compressor: uglifyjs,
        input: ['carota-debug.js'],
        output: 'carota-min.js',
        callback: function (err, min) {
            if (err) {
                console.log(err);
            }
        }
    });
}

webmake('src/carota.js', { output: 'carota-debug.js' }, function(result) {
    if (!result) {
        runMinify();
        console.log('All good');
    } else {
        console.log(result);
    }
});