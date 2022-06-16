const webmake = require('webmake');
const compressor = require('node-minify');

const minify = () => compressor.minify({
    compressor: 'uglifyjs',
    input: 'carota-debug.js',
    output: 'carota-min.js',
    callback: function(err, min){
        if (err) {
            console.log(err);
        }
    }
});

webmake('src/carota.js', { output: 'carota-debug.js' }, function(result) {
    if (!result) {
        console.log('Compiled successfully');
        // minify();
    } else {
        console.log(result);
    }
});
