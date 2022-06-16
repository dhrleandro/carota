/// utility functions. 'event' is a simple event dispatcher (good candidate for class).
/// 'derive' just implements an inheritance scheme. can go away with class composition

exports.event = function() {
    var handlers = [];

    var subscribe = function(handler) {
        handlers.push(handler);
    };

    subscribe.fire = function() {
        var args = Array.prototype.slice.call(arguments, 0);
        handlers.forEach(function(handler) {
            handler.apply(null, args);
        });
    };

    return subscribe;
};

exports.derive = function(prototype, methods) {
    var properties = {};
    Object.keys(methods).forEach(function(name) {
        properties[name] = { value: methods[name] };
    });
    return Object.create(prototype, properties);
};