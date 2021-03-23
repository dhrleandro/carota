var doc = require('./doc');

exports = module.exports = function( data, width, styles, roundByOffset = 0.005, roundTo = 2 ) {
    var canvas = document.createElement( 'canvas' );
    var carota = doc( styles );
    carota.load( data );
    carota.width( width );
    carota.draw( canvas.getContext( '2d' ));
    var width = carota.frame.actualWidth();
    var height = carota.frame.actualHeight();
    var roundedWidth = +(( width + roundByOffset ).toFixed( roundTo ));
    var roundedHeight = +(( height + roundByOffset ).toFixed( roundTo )); 
    return { width: roundedWidth, height: roundedHeight, minWidth: carota.frame.minWidth() };
};
