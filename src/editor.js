/// this is responsible for creating canvas, rendering data to canvas, handling events;
/// good candidate for a class

var carotaDoc = require('./doc');
var dom = require('./dom');
var rect = require('./rect');


/// shared timer for cursor blinks, bounds size changes, focus changes
setInterval(function() {
    var editors = document.querySelectorAll('.carotaEditorCanvas');

    var ev = document.createEvent('Event');
    ev.initEvent('carotaEditorSharedTimer', true, true);

    [...editors].forEach(e => e.dispatchEvent(ev));
}, 200);


/// entry-point
exports.create = function(element) {

    // We need the host element to be a container:
    if (dom.effectiveStyle(element, 'position') !== 'absolute') {
        element.style.position = 'relative';
    }

    /// create canvas and hidden <textarea>; probably could be cleaned up
    element.innerHTML =
        '<div class="carotaSpacer">' +
            '<canvas width="100" height="100" class="carotaEditorCanvas" style="position: absolute;"></canvas>' +
        '</div>' +
        '<div class="carotaTextArea" style="overflow: hidden; position: absolute; height: 0;">' +
            '<textarea autocorrect="off" autocapitalize="off" spellcheck="false" tabindex="0" ' +
            'style="position: absolute; padding: 0px; width: 1000px; height: 1em; ' +
            'outline: none; font-size: 4px;"></textarea>'
        '</div>';

    /// 'doc' and down is the good stuff
    var canvas = element.querySelector('canvas'),
        spacer = element.querySelector('.carotaSpacer'),
        textAreaDiv = element.querySelector('.carotaTextArea'),
        textArea = element.querySelector('textarea'),
        doc = carotaDoc(),
        keyboardSelect = 0,
        keyboardX = null, /// i think this is the last x-position of cursor from key-related events
        nextKeyboardX = null, /// if the above is true, this is the next (current) one
        selectDragStart = null,
        focusChar = null,
        textAreaContent = '',
        richClipboard = null,
        plainClipboard = null;
    
    var toggles = {
        66: 'bold',      /// 'b'
        73: 'italic',    /// 'i'
        85: 'underline', /// 'u'
        83: 'strikeout'  /// 's'
    };

    /// direction will be 1 if going down, -1 if going up
    /// ordinal is character position from beginning of file
    /// returns a boolean:
    ///   true if: ordinal <= 0 OR ordinal >= doc.frame.
    var exhausted = function(ordinal, direction) {
        return direction < 0 ? ordinal <= 0 : ordinal >= doc.frame.length - 1;
    };

    /// determines whether or not carets are on separate lines
    var differentLine = function(caret1, caret2) {
        return (caret1.b <= caret2.t) ||
               (caret2.b <= caret1.t);
    };

    /// puts caret on a different line? params are int's; ordinal is 'index' position, direction is 1 or -1
    var changeLine = function(ordinal, direction) {

        /// saves current caret position
        var originalCaret = doc.getCaretCoords(ordinal),
            newCaret;
        
        /// update nextKeyboardX
        nextKeyboardX = (keyboardX !== null) ? keyboardX : originalCaret.l;

        /// this seems to just move the caret one character at a time to the next line
        while (!exhausted(ordinal, direction)) {
            ordinal += direction;
            newCaret = doc.getCaretCoords(ordinal);
            if (differentLine(newCaret, originalCaret)) {
                break;
            }
        }

        originalCaret = newCaret;
        /// this puts the caret in the right place
        while (!exhausted(ordinal, direction)) {
            /// break if caret is in equivalent place to previous x-pos
            if ((direction > 0 && newCaret.l >= nextKeyboardX) ||
                (direction < 0 && newCaret.l <= nextKeyboardX)) {
                break;
            }

            ordinal += direction;
            newCaret = doc.getCaretCoords(ordinal);
            /// this seems to be to correct for the case where we've gone too far onto the next line
            if (differentLine(newCaret, originalCaret)) {
                ordinal -= direction;
                break;
            }
        }

        /// TODO: there's gotta be a better way of doing this. This seems very inefficient

        return ordinal;
    };

    /// moves caret to end of line ('end' key was pressed)
    var endOfline = function(ordinal, direction) {
        var originalCaret = doc.getCaretCoords(ordinal), newCaret;
        while (!exhausted(ordinal, direction)) {
            ordinal += direction;
            newCaret = doc.getCaretCoords(ordinal);

            /// correction for if we've gone too far
            if (differentLine(newCaret, originalCaret)) {
                ordinal -= direction;
                break;
            }
        }
        return ordinal;
    };


    /// biiiig key handler here...this is attached with a 'dom' utility function
    /// TODO: big problem here with CTRL vs. CMD on mac that needs fixing
    var handleKey = function(key, selecting, ctrlKey) {
        /// doc is storing the relevant state information for selections
        var start = doc.selection.start,
            end = doc.selection.end,
            length = doc.frame.length - 1, /// total length of doc frame (size? content?)
            handled = false;
        
        console.log(`handleKey: ${key}, ${selecting}, ${ctrlKey}, ${start}, ${end}`);

        /// this resets this...kinda strange
        nextKeyboardX = null;

        /// if we're not in a selection 'mode' then set keyboardSelect to 0
        if (!selecting) {
            keyboardSelect = 0;
        } else if (!keyboardSelect) {
            switch (key) {
                case 37: // left arrow
                case 38: // up - find character above
                case 36: // start of line
                case 33: // page up
                    keyboardSelect = -1;
                    break;
                case 39: // right arrow
                case 40: // down arrow - find character below
                case 35: // end of line
                case 34: // page down
                    keyboardSelect = 1;
                    break;
            }
        }

        /// sets the ordinal to the end if selecting forward, or to the start if selecting backward (always start when not selecting)
        var ordinal = keyboardSelect === 1 ? end : start;

        /// keep track of whether this key press changes caret position
        var changingCaret = false;

        switch (key) {
            case 37: // left arrow
                if (!selecting && start != end) {
                    /// set ordinal to start (of selection) here
                    ordinal = start;
                } else { /// selecting here
                    if (ordinal > 0) {
                        if (ctrlKey) { /// selection that moves to start of word...very nice feature
                            /// this will be of shape: { word: String, ordinal: Number, index: Number, offset: Number }
                            var wordInfo = doc.wordContainingOrdinal(ordinal);
                            if (wordInfo.ordinal === ordinal) {
                                ordinal = wordInfo.index > 0 ? doc.wordOrdinal(wordInfo.index - 1) : 0;
                            } else {
                                ordinal = wordInfo.ordinal;
                            }
                        } else {
                            /// simply move ordinal down if not ctrl key
                            ordinal--;
                        }
                    }
                    /// don't modify ordinal if we're already at beginning of doc
                }
                changingCaret = true;
                break;
            case 39: // right arrow
                if (!selecting && start != end) {
                    ordinal = end;
                } else {
                    if (ordinal < length) {
                        if (ctrlKey) {
                            var wordInfo = doc.wordContainingOrdinal(ordinal);
                            ordinal = wordInfo.ordinal + wordInfo.word.length;
                        } else {
                            ordinal++;
                        }
                    }
                }
                changingCaret = true;
                break;
            case 40: // down arrow - find character below
                ordinal = changeLine(ordinal, 1);
                changingCaret = true;
                break;
            case 38: // up - find character above
                ordinal = changeLine(ordinal, -1);
                changingCaret = true;
                break;
            case 36: // home - start of line
                ordinal = endOfline(ordinal, -1);
                changingCaret = true;
                break;
            case 35: // end - end of line
                ordinal = endOfline(ordinal, 1);
                changingCaret = true;
                break;
            case 33: // page up
                ordinal = 0;
                changingCaret = true;
                break;
            case 34: // page down
                ordinal = length;
                changingCaret = true;
                break;
            case 8: // backspace
                if (start === end && start > 0) {
                    doc.range(start - 1, start).clear();
                    focusChar = start - 1;
                    doc.select(focusChar, focusChar);
                    handled = true;
                }
                break;
            case 46: // del
                if (start === end && start < length) {
                    doc.range(start, start + 1).clear();
                    handled = true;
                }
                break;
            case 90: // Z undo
                if (ctrlKey) {
                    handled = true;
                    doc.performUndo();
                }
                break;
            case 89: // Y undo
                if (ctrlKey) {
                    handled = true;
                    doc.performUndo(true);
                }
                break;
            case 65: // A select all
                if (ctrlKey) {
                    handled = true;
                    doc.select(0, length);
                }
                break;
            case 67: // C - copy to clipboard
            case 88: // X - cut to clipboard
                if (ctrlKey) {
                    // Allow standard handling to take place as well
                    richClipboard = doc.selectedRange().save();
                    plainClipboard = doc.selectedRange().plainText();
                }
                break;
        }

        var toggle = toggles[key];
        if (ctrlKey && toggle) {
            var selRange = doc.selectedRange();
            selRange.setFormatting(toggle, selRange.getFormatting()[toggle] !== true);
            paint();
            handled = true;
        }

        if (changingCaret) {
            switch (keyboardSelect) {
                case 0:
                    start = end = ordinal;
                    break;
                case -1:
                    start = ordinal;
                    break;
                case 1:
                    end = ordinal;
                    break;
            }

            if (start === end) {
                keyboardSelect = 0;
            } else {
                if (start > end) {
                    keyboardSelect = -keyboardSelect;
                    var t = end;
                    end = start;
                    start = t;
                }
            }
            focusChar = ordinal;
            doc.select(start, end);
            handled = true;
        }

        keyboardX = nextKeyboardX;
        return handled;
    };

    /// attaches our giant key handler to the invisible textArea
    dom.handleEvent(textArea, 'keydown', function(ev) {
        if (handleKey(ev.keyCode, ev.shiftKey, ev.ctrlKey)) {
            return false;
        }
        // console.log(ev.which);
    });

    var verticalAlignment = 'top';
    
    /// sets the function in doc
    doc.setVerticalAlignment = function(va) {
        verticalAlignment = va;
        paint();
    }

    /// calculates vertical offset for 'middle' and 'bottom' alignment (verticalAlignment value)
    function getVerticalOffset() {
        var docHeight = doc.frame.bounds().h;
        if (docHeight < element.clientHeight) { 
            switch (verticalAlignment) {
                case 'middle':
                    return (element.clientHeight - docHeight) / 2;
                case 'bottom':
                    return element.clientHeight - docHeight;
            }
        }
        return 0;
    }

    /// main painting function 
    var paint = function() {

        /// i think the comment here is a debug note? -->
        var availableWidth = element.clientWidth * 1; // adjust to 0.5 to see if we draw in the wrong places!

        /// resize the doc width according to the actual available element width
        if (doc.width() !== availableWidth) {
            doc.width(availableWidth);
        }

        /// gets the height of the frame
        var docHeight = doc.frame.bounds().h;

        /// save the device pixel ratio
        var dpr = Math.max(1, window.devicePixelRatio || 1);
        
        /// actual width/height of lines in frame
        var logicalWidth = Math.max(doc.frame.actualWidth(), element.clientWidth),
            logicalHeight = element.clientHeight;
        
        /// sizes the canvas
        canvas.width = dpr * logicalWidth;
        canvas.height = dpr * logicalHeight;
        canvas.style.width = logicalWidth + 'px';
        canvas.style.height = logicalHeight + 'px';
        
        canvas.style.top = element.scrollTop + 'px';
        spacer.style.width = logicalWidth + 'px';
        spacer.style.height = Math.max(docHeight, element.clientHeight) + 'px';

        /// scrollbar stuff
        if (docHeight < (element.clientHeight - 50) &&
            doc.frame.actualWidth() <= availableWidth) {
            element.style.overflow = 'hidden';
        } else {
            element.style.overflow = 'auto';
        }

        var ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        ctx.clearRect(0, 0, logicalWidth, logicalHeight);
        ctx.translate(0, getVerticalOffset() - element.scrollTop);
        
        /// heavy lifting is here
        doc.draw(ctx, rect(0, element.scrollTop, logicalWidth, logicalHeight));

        /// draw's the selection 'layer'
        doc.drawSelection(ctx, selectDragStart || (document.activeElement === textArea));
    };

    /// gotta repaint on scroll
    dom.handleEvent(element, 'scroll', paint);

    /// i think this is for handling cut/paste
    dom.handleEvent(textArea, 'input', function() {
        var newText = textArea.value;
        if (textAreaContent != newText) {
            textAreaContent = '';
            textArea.value = '';
            if (newText === plainClipboard) {
                newText = richClipboard;
            }
            doc.insert(newText);
        }
    });

    /// REVISIT: not sure what this is used for. looks like maybe updating scroll location?
    var updateTextArea = function() {
        console.log('updateTextArea');
        focusChar = focusChar === null ? doc.selection.end : focusChar;
        var endChar = doc.byOrdinal(focusChar);
        focusChar = null;
        if (endChar) {
            var bounds = endChar.bounds();
            textAreaDiv.style.left = bounds.l + 'px';
            textAreaDiv.style.top = bounds.t + 'px';
            textArea.focus();
            var scrollDownBy = Math.max(0, bounds.t + bounds.h -
                    (element.scrollTop + element.clientHeight));
            if (scrollDownBy) {
                element.scrollTop += scrollDownBy;
            }
            var scrollUpBy = Math.max(0, element.scrollTop - bounds.t);
            if (scrollUpBy) {
                element.scrollTop -= scrollUpBy;
            }
            var scrollRightBy = Math.max(0, bounds.l -
                (element.scrollLeft + element.clientWidth));
            if (scrollRightBy) {
                element.scrollLeft += scrollRightBy;
            }
            var scrollLeftBy = Math.max(0, element.scrollLeft - bounds.l);
            if (scrollLeftBy) {
                element.scrollLeft -= scrollLeftBy;
            }
        }
        textAreaContent = doc.selectedRange().plainText();
        textArea.value = textAreaContent;
        textArea.select();

        /// kind of weird that you have to do this?
        setTimeout(function() {
            textArea.focus();
        }, 10);
    };

    /// register selection changed handler, need to repaint and update textarea (i guess)
    doc.selectionChanged(function(getformatting, takeFocus) {
        paint();
        if (!selectDragStart) {
            if (takeFocus !== false) {
                updateTextArea();
            }
        }
    });

    /// simple wrapper for adding mouse events to the spacer (div wrapper around canvas)
    function registerMouseEvent(name, handler) {
        dom.handleMouseEvent(spacer, name, function(ev, x, y) {
            handler(doc.byCoordinate(x, y - getVerticalOffset()));
        });
    }

    /// registers mouse down handler (used for selection)
    registerMouseEvent('mousedown', function(node) {
        selectDragStart = node.ordinal;
        doc.select(node.ordinal, node.ordinal);
        keyboardX = null;
    });

    /// registers double click handler (for word selection...really nice)
    registerMouseEvent('dblclick', function(node) {
        node = node.parent();
        if (node) {
            doc.select(node.ordinal, node.ordinal +
                (node.word ? node.word.text.length : node.length));
        }
    });

    /// attaches mouse move handler (used for selection)
    registerMouseEvent('mousemove', function(node) {
        if (selectDragStart !== null) {
            if (node) {
                focusChar = node.ordinal;
                if (selectDragStart > node.ordinal) {
                    doc.select(node.ordinal, selectDragStart);
                } else {
                    doc.select(selectDragStart, node.ordinal);
                }
            }
        }
    });

    /// attaches mouse up handler (used for end of selection)
    registerMouseEvent('mouseup', function(node) {
        selectDragStart = null;
        keyboardX = null;
        updateTextArea();
        textArea.focus();
    });

    /// guessing this is for blinking cursor
    var nextCaretToggle = new Date().getTime();

    /// not sure what is assumed to be 'focused' here? canvas?
    var focused = false;

    /// save height/width of our 'root' element
    var cachedWidth = element.clientWidth;
    var cachedHeight = element.clientHeight;

    /// handler for shared timer
    var update = function() {
        var requirePaint = false;
        var newFocused = document.activeElement === textArea;
        if (focused !== newFocused) {
            focused = newFocused;
            requirePaint = true;
        }

        var now = new Date().getTime();
        if (now > nextCaretToggle) {
            nextCaretToggle = now + 500;
            if (doc.toggleCaret()) {
                requirePaint = true;
            }
        }

        if (element.clientWidth !== cachedWidth ||
            element.clientHeight !== cachedHeight) {
            requirePaint = true;
            cachedWidth =element.clientWidth;
            cachedHeight = element.clientHeight;
        }

        if (requirePaint) {
            paint();
        }
    };

    /// aha! here's the shared timer...looks like it's used for determining whether repaint is needed
    /// for caret blinks, focus change, height/width change
    dom.handleEvent(canvas, 'carotaEditorSharedTimer', update);
    update();

    /// REVISIT: find out why we set 'sendKey' to the giant key handler
    doc.sendKey = handleKey;
    return doc;
};
