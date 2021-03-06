const TEXT_UTILS = {
    diffMatchPatch: new diff_match_patch(),
    getDiffHtml: function (source, target) {
        let dmp = new diff_match_patch();
        /*
        There are problems when you delete or add a tag next to another, the algorithm that makes the diff fails to recognize the tags,
        they come out of the function broken.
        Before passing them to the function that makes the diff we replace all the tags with placeholders and we keep a map of the tags
        indexed with the id of the tags.
         */
        var phTagsObject = {};
        var diff;
        source = source.replace(/&lt;(\/)*(g|x|bx|ex|bpt|ept|ph|it|mrk).*?&gt;/gi, function (match, group1, group2) {
            if (_.isUndefined(phTagsObject[match])) {
                phTagsObject[match] = match;
            }
            return '<' + Base64.encode(match) + '>';
        });

        target = target.replace(/&lt;(\/)*(g|x|bx|ex|bpt|ept|ph|it|mrk).*?&gt;/gi, function (match, gruop1, group2) {
            if (_.isUndefined(phTagsObject[match])) {
                phTagsObject[match] = match;
            }
            return '<' + Base64.encode(match) + '>';
        });

        diff = dmp.diff_main(
            this.replacePlaceholder(source.replace(/&nbsp; /g, '  ').replace(/&nbsp;/g, '')),
            this.replacePlaceholder(target.replace(/&nbsp; /g, '  ').replace(/&nbsp;/g, ''))
        );

        dmp.diff_cleanupSemantic(diff);

        /*
        Before adding spans to identify added or subtracted portions we need to check and fix broken tags
         */
        diff = this.setUnclosedTagsInDiff(diff);
        var diffTxt = '';
        var self = this;
        $.each(diff, function (index, text) {
            text[1] = text[1].replace(/<(.*?)>/gi, function (match, text) {
                try {
                    var decodedText = Base64.decode(text);
                    if (!_.isUndefined(phTagsObject[decodedText])) {
                        return phTagsObject[decodedText];
                    }
                    return match;
                } catch (e) {
                    return match;
                }
            });
            var rootElem;
            var newElem;
            if (self.htmlDecode(text[1]) === ' ') {
                text[1] = '&nbsp;';
            }

            if (text[0] === -1) {
                rootElem = $(document.createElement('div'));
                newElem = $.parseHTML('<span class="deleted"/>');
                $(newElem).text(self.htmlDecode(text[1]));
                rootElem.append(newElem);
                diffTxt += $(rootElem).html();
            } else if (text[0] === 1) {
                rootElem = $(document.createElement('div'));
                newElem = $.parseHTML('<span class="added"/>');
                $(newElem).text(self.htmlDecode(text[1]));
                rootElem.append(newElem);
                diffTxt += $(rootElem).html();
            } else {
                diffTxt += text[1];
            }
        });

        return this.restorePlaceholders(diffTxt);
    },
    /**
     *This function takes in the array that exits the TextUtils.diffMatchPatch.diff_main function and parses the array elements to see if they contain broken tags.
     * The array is of the type:
     *
     * [0, "text"],
     * [-1, "deletedText"]
     * [1, "addedText"]
     *
     * For each element of the array in the first position there is 0, 1, -1 which indicate if the text is equal, added, removed
     */
    setUnclosedTagsInDiff: function (array) {
        /*
        Function to understand if an element contains broken tags
         */
        var thereAreIncompletedTagsInDiff = function (text) {
            return (
                (text.indexOf('<') > -1 || text.indexOf('>') > -1) &&
                (text.split('<').length - 1 !== text.split('>').length - 1 || text.indexOf('<') >= text.indexOf('>'))
            );
        };
        /*
        Function to understand if an element contains broken tags where the opening part is missing
         */
        var thereAreCloseTags = function (text) {
            return (
                thereAreIncompletedTagsInDiff(text) &&
                (item[1].split('<').length - 1 < item[1].split('>').length - 1 ||
                    (item[1].indexOf('>') > -1 && item[1].indexOf('>') < item[1].indexOf('<')))
            );
        };
        /*
        Function to understand if an element contains broken tags where the closing part is missing
         */
        var thereAreOpenTags = function (text) {
            return (
                thereAreIncompletedTagsInDiff(text) &&
                (item[1].split('<').length - 1 < item[1].split('>').length - 1 ||
                    (item[1].indexOf('<') > -1 && item[1].indexOf('>') > item[1].indexOf('<')))
            );
        };
        var i;
        var indexTemp;
        var adding = false;
        var tagToMoveOpen = '';
        var tagToMoveClose = '';
        for (i = 0; i < array.length; i++) {
            var item = array[i];
            var thereAreUnclosedTags = thereAreIncompletedTagsInDiff(item[1]);
            if (!adding && item[0] === 0) {
                if (thereAreUnclosedTags) {
                    tagToMoveOpen = item[1].substr(item[1].lastIndexOf('<'), item[1].length + 1);
                    array[i][1] = item[1].substr(0, item[1].lastIndexOf('<'));
                    indexTemp = i;
                    adding = true;
                }
            } else if (adding && item[0] === 0) {
                if (thereAreUnclosedTags && thereAreCloseTags(item[1])) {
                    tagToMoveClose = item[1].substr(0, item[1].indexOf('>') + 1);
                    tagToMoveOpen = '';
                    array[i][1] = item[1].substr(item[1].indexOf('>') + 1, item[1].length + 1);
                    i = indexTemp;
                } else {
                    if (thereAreUnclosedTags && thereAreOpenTags(item[1])) {
                        i = i - 1; //There are more unclosed tags, restart from here
                    }
                    indexTemp = 0;
                    adding = false;
                    tagToMoveOpen = '';
                    tagToMoveClose = '';
                }
            } else if (adding) {
                array[i][1] = tagToMoveOpen + item[1] + tagToMoveClose;
            }
        }
        return array;
    },

    transformDiffArrayToHtml: function (diff) {
        let diffTxt = '';
        let self = this;
        $.each(diff, function (index) {
            if (this[0] == -1) {
                let rootElem = $(document.createElement('div'));
                let newElem = $.parseHTML('<span class="deleted"/>');
                $(newElem).text(self.htmlDecode(this[1]));
                rootElem.append(newElem);
                diffTxt += $(rootElem).html();
            } else if (this[0] == 1) {
                let rootElem = $(document.createElement('div'));
                let newElem = $.parseHTML('<span class="added"/>');
                $(newElem).text(self.htmlDecode(this[1]));
                rootElem.append(newElem);
                diffTxt += $(rootElem).html();
            } else {
                diffTxt += this[1];
            }
        });
        return this.restorePlaceholders(diffTxt);
    },
    replacePlaceholder: function (string) {
        return string
            .replace(config.lfPlaceholderRegex, 'softReturnMonad')
            .replace(config.crPlaceholderRegex, 'crPlaceholder')
            .replace(config.crlfPlaceholderRegex, 'brMarker')
            .replace(config.tabPlaceholderRegex, 'tabMarkerMonad')
            .replace(config.nbspPlaceholderRegex, 'nbspPlMark');
    },

    restorePlaceholders: function (string) {
        return string
            .replace(/softReturnMonad/g, config.lfPlaceholder)
            .replace(/crPlaceholder/g, config.crPlaceholder)
            .replace(/brMarker/g, config.crlfPlaceholder)
            .replace(/tabMarkerMonad/g, config.tabPlaceholder)
            .replace(/nbspPlMark/g, config.nbspPlaceholder);
    },
    htmlEncode: function (value) {
        if (value) {
            return $('<div />').text(value).html();
        } else {
            return '';
        }
    },
    htmlDecode: function (value) {
        if (value) {
            return $('<div />').html(value).text();
        } else {
            return '';
        }
    },

    escapeRegExp(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
    },
    insertNodeAtCursor(node) {
        try {
            var range, html;
            if (window.getSelection && window.getSelection().getRangeAt) {
                if (window.getSelection().type == 'Caret' || UI.isFirefox) {
                    range = window.getSelection().getRangeAt(0);
                    range.insertNode(node);
                    this.setCursorAfterNode(range, node);
                }
            } else if (document.selection && document.selection.createRange) {
                range = document.selection.createRange();
                html = node.nodeType == 3 ? node.data : node.outerHTML;
                range.pasteHTML(html);
            }
        } catch (e) {
            console.error('Fail to insert node at cursor', e);
        }
    },
    insertTextAtCursor(text) {
        var sel, range, html;
        if (window.getSelection) {
            sel = window.getSelection();
            if (sel.getRangeAt && sel.rangeCount) {
                range = sel.getRangeAt(0);
                range.deleteContents();
                range.insertNode(document.createTextNode(text));
            }
        } else if (document.selection && document.selection.createRange) {
            document.selection.createRange().text = text;
        }
    },

    setCursorAfterNode(range, node) {
        range.setStartAfter(node);
        range.setEndAfter(node);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
    },

    pasteHtmlAtCaret(html, selectPastedContent) {
        var sel, range;
        let __ignoreSelection = (range) => {
            if (range.startContainer == range.endContainer && range.startContainer == document) {
                return true;
            }
        };
        if (window.getSelection) {
            // IE9 and non-IE
            sel = window.getSelection();

            if (sel.getRangeAt && sel.rangeCount) {
                range = sel.getRangeAt(0);

                if (__ignoreSelection(range)) return;

                range.deleteContents();

                // Range.createContextualFragment() would be useful here but is
                // only relatively recently standardized and is not supported in
                // some browsers (IE9, for one)
                var el = document.createElement('div');
                el.innerHTML = html;
                var frag = document.createDocumentFragment(),
                    node,
                    lastNode;
                while ((node = el.firstChild)) {
                    lastNode = frag.appendChild(node);
                }
                var firstNode = frag.firstChild;
                range.insertNode(frag);

                // Preserve the selection
                if (lastNode) {
                    range = range.cloneRange();
                    range.setStartAfter(lastNode);
                    if (selectPastedContent) {
                        range.setStartBefore(firstNode);
                    } else {
                        range.collapse(true);
                    }
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
            }
        } else if ((sel = document.selection) && sel.type != 'Control') {
            // IE < 9
            var originalRange = sel.createRange();
            originalRange.collapse(true);
            sel.createRange().pasteHTML(html);
            if (selectPastedContent) {
                range = sel.createRange();
                range.setEndPoint('StartToStart', originalRange);
                range.select();
            }
        }
    },
    setCursorPosition(el, pos) {
        var isDetatched = $(el).parents('body').length == 0;
        if (isDetatched) return;

        pos = pos || 0;

        var range = document.createRange();

        var sel = window.getSelection();

        if (pos == 'end') {
            range.setStartAfter(el);
        } else {
            console.debug('setCursorPosition setting start at pos', el, pos);
            range.setStart(el, pos);
        }

        range.collapse(true);

        sel.removeAllRanges();

        sel.addRange(range);

        if (typeof el[0] != 'undefined') {
            console.debug('setCursorPosition setting focus');
            el.focus();
        }
    },
    removeSelectedText() {
        if (window.getSelection || document.getSelection) {
            var oSelection = (window.getSelection ? window : document).getSelection();
            if (oSelection.type == 'Caret' && oSelection.extentOffset != oSelection.baseOffset) {
                oSelection.deleteFromDocument();
            } else if (oSelection.type == 'Range') {
                var ss = $(oSelection.baseNode).parent()[0];
                var ssParentTag = $(oSelection.baseNode).closest('.locked.selfClosingTag')[0];
                if ($(ss).hasClass('selected')) {
                    $(ss).remove();
                } else if (ssParentTag) {
                    $(ssParentTag).remove();
                } else {
                    oSelection.deleteFromDocument();
                    oSelection.collapseToStart();
                }
            }
        } else {
            document.selection.clear();
        }
    },

    // test jsfiddle http://jsfiddle.net/YgKDu/
    placehold_xliff_tags(segment) {
        let LTPLACEHOLDER = '##LESSTHAN##';
        let GTPLACEHOLDER = '##GREATERTHAN##';
        segment = segment.replace(/<(g\s*.*?)>/gi, LTPLACEHOLDER + '$1' + GTPLACEHOLDER);
        segment = segment.replace(/<(\/g)>/gi, LTPLACEHOLDER + '$1' + GTPLACEHOLDER);
        segment = segment.replace(/<(x\s*.*?\/)>/gi, LTPLACEHOLDER + '$1' + GTPLACEHOLDER);
        segment = segment.replace(/<(bx\s*.*?\/)>/gi, LTPLACEHOLDER + '$1' + GTPLACEHOLDER);
        segment = segment.replace(/<(ex\s*.*?\/)>/gi, LTPLACEHOLDER + '$1' + GTPLACEHOLDER);
        segment = segment.replace(/<(bpt\s*.*?)>/gi, LTPLACEHOLDER + '$1' + GTPLACEHOLDER);
        segment = segment.replace(/<(\/bpt)>/gi, LTPLACEHOLDER + '$1' + GTPLACEHOLDER);
        segment = segment.replace(/<(ept\s*.*?)>/gi, LTPLACEHOLDER + '$1' + GTPLACEHOLDER);
        segment = segment.replace(/<(\/ept)>/gi, LTPLACEHOLDER + '$1' + GTPLACEHOLDER);
        segment = segment.replace(/<(ph\s*.*?)>/gi, LTPLACEHOLDER + '$1' + GTPLACEHOLDER);
        segment = segment.replace(/<(\/ph)>/gi, LTPLACEHOLDER + '$1' + GTPLACEHOLDER);
        segment = segment.replace(/<(it\s*.*?)>/gi, LTPLACEHOLDER + '$1' + GTPLACEHOLDER);
        segment = segment.replace(/<(\/ph)>/gi, LTPLACEHOLDER + '$1' + GTPLACEHOLDER);
        segment = segment.replace(/<(it\s*.*?)>/gi, LTPLACEHOLDER + '$1' + GTPLACEHOLDER);
        segment = segment.replace(/<(\/it)>/gi, LTPLACEHOLDER + '$1' + GTPLACEHOLDER);
        segment = segment.replace(/<(mrk\s*.*?)>/gi, LTPLACEHOLDER + '$1' + GTPLACEHOLDER);
        segment = segment.replace(/<(\/mrk)>/gi, LTPLACEHOLDER + '$1' + GTPLACEHOLDER);
        return segment;
    },
    view2rawxliff(segment) {
        // return segment+"____";
        // input : <g id="43">bang & olufsen < 3 </g> <x id="33"/>; --> valore della funzione .text() in cat.js su source, target, source suggestion,target suggestion
        // output : <g id="43"> bang &amp; olufsen are &gt; 555 </g> <x/>

        // caso controverso <g id="4" x="&lt; dfsd &gt;">
        //segment=htmlDecode(segment);
        segment = this.placehold_xliff_tags(segment);
        segment = this.htmlEncode(segment);

        segment = this.restore_xliff_tags(segment);

        return segment;
    },

    restore_xliff_tags(segment) {
        let LTPLACEHOLDER = '##LESSTHAN##';
        let GTPLACEHOLDER = '##GREATERTHAN##';
        let re_lt = new RegExp(LTPLACEHOLDER, 'g');
        let re_gt = new RegExp(GTPLACEHOLDER, 'g');
        segment = segment.replace(re_lt, '<');
        segment = segment.replace(re_gt, '>');
        return segment;
    },

    cleanupHTMLCharsForDiff(string) {
        return this.replacePlaceholder(string.replace(/&nbsp;/g, ''));
    },

    trackChangesHTML(source, target) {
        /*
        There are problems when you delete or add a tag next to another, the algorithm that makes the diff fails to recognize the tags,
        they come out of the function broken.
        Before passing them to the function that makes the diff we replace all the tags with placeholders and we keep a map of the tags
        indexed with the id of the tags.
         */
        var phTagsObject = {};
        var diff;
        source = source.replace(/&lt;(g|x|bx|ex|bpt|ept|ph|it|mrk).*?id="(.*?)".*?\/&gt;/gi, function (
            match,
            group1,
            group2
        ) {
            if (_.isUndefined(phTagsObject[group2])) {
                phTagsObject[group2] = match;
            }
            return '<' + Base64.encode(group2) + '> ';
        });

        target = target.replace(/&lt;(g|x|bx|ex|bpt|ept|ph|it|mrk).*?id="(.*?)".*?\/&gt;/gi, function (
            match,
            gruop1,
            group2
        ) {
            if (_.isUndefined(phTagsObject[group2])) {
                phTagsObject[group2] = match;
            }
            return '<' + Base64.encode(group2) + '> ';
        });

        diff = this.diffMatchPatch.diff_main(
            this.cleanupHTMLCharsForDiff(source),
            this.cleanupHTMLCharsForDiff(target)
        );

        this.diffMatchPatch.diff_cleanupSemantic(diff);

        /*
        Before adding spans to identify added or subtracted portions we need to check and fix broken tags
         */
        diff = this.setUnclosedTagsInDiff(diff);
        var diffTxt = '';

        $.each(diff, function (index, text) {
            text[1] = text[1].replace(/<(.*?)>/gi, function (match, text) {
                try {
                    var decodedText = Base64.decode(text);
                    if (!_.isUndefined(phTagsObject[decodedText])) {
                        return phTagsObject[decodedText];
                    }
                    return match;
                } catch (e) {
                    return match;
                }
            });
            var rootElem;
            var newElem;
            if (this[0] === -1) {
                rootElem = $(document.createElement('div'));
                newElem = $.parseHTML('<span class="deleted"/>');
                $(newElem).text(TextUtils.htmlDecode(text[1]));
                rootElem.append(newElem);
                diffTxt += $(rootElem).html();
            } else if (text[0] === 1) {
                rootElem = $(document.createElement('div'));
                newElem = $.parseHTML('<span class="added"/>');
                $(newElem).text(TextUtils.htmlDecode(text[1]));
                rootElem.append(newElem);
                diffTxt += $(rootElem).html();
            } else {
                diffTxt += text[1];
            }
        });

        return this.restorePlaceholders(diffTxt);
    },
    getDiffPatch(source, target) {
        var diff = this.diffMatchPatch.diff_main(
            this.cleanupHTMLCharsForDiff(source),
            this.cleanupHTMLCharsForDiff(target)
        );

        this.diffMatchPatch.diff_cleanupSemantic(diff);
        return diff;
    },

    execDiff: function (mainStr, cfrStr) {
        let _str = cfrStr;
        // let _str = cfrStr.replace( config.lfPlaceholderRegex, "\n" )
        //     .replace( config.crPlaceholderRegex, "\r" )
        //     .replace( config.crlfPlaceholderRegex, "\r\n" )
        //     .replace( config.tabPlaceholderRegex, "\t" )
        //     .replace( config.nbspPlaceholderRegex, String.fromCharCode( parseInt( 0xA0, 10 ) ) );
        let _edit = mainStr.replace(String.fromCharCode(parseInt(0x21e5, 10)), '\t');

        //Prepend Unicode Character 'ZERO WIDTH SPACE' invisible, not printable, no spaced character,
        //used to detect initial and final spaces in html diff
        _str = String.fromCharCode(parseInt(0x200b, 10)) + _str + String.fromCharCode(parseInt(0x200b, 10));
        _edit = String.fromCharCode(parseInt(0x200b, 10)) + _edit + String.fromCharCode(parseInt(0x200b, 10));

        let diff_obj = this.diffMatchPatch.diff_main(_edit, _str);
        this.diffMatchPatch.diff_cleanupEfficiency(diff_obj);
        return diff_obj;
    },

    justSelecting: function (what) {
        if (window.getSelection().isCollapsed) return false;
        var selContainer = $(window.getSelection().getRangeAt(0).startContainer.parentNode);
        if (what == 'editarea') {
            return selContainer.hasClass('editarea') && !selContainer.is(UI.editarea);
        } else if (what == 'readonly') {
            return selContainer.hasClass('area') || selContainer.hasClass('source');
        }
    },
    clenaupTextFromPleaceholders: function (text) {
        text = text
            .replace(config.crPlaceholderRegex, '\r')
            .replace(config.lfPlaceholderRegex, '\n')
            .replace(config.crlfPlaceholderRegex, '\r\n')
            .replace(config.tabPlaceholderRegex, '\t')
            .replace(config.nbspPlaceholderRegex, String.fromCharCode(parseInt(0xa0, 10)));
        return text;
    },
    replaceUrl: function (textToReplace) {
        let regExpUrl = /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[-;:&=\+\$,\w]+@)?[A-Za-z0-9.-]+|(?:www.|[-;:&=\+\$,\w]+@)[A-Za-z0-9.-]+)((?:\/[\+~%\/$.\w-_]*)?\??(?:\S+)#?(?:[\w]*))?)/gim;
        return textToReplace.replace(regExpUrl, function (match, text) {
            let href = text[text.length - 1] === '.' ? text.substring(0, text.length - 1) : text;
            return '<a href="' + href + '" target="_blank">' + text + '</a>';
        });
    },
};
module.exports = TEXT_UTILS;
