/*!
 * Jodit Editor (https://xdsoft.net/jodit/)
 * License GNU General Public License version 2 or later;
 * Copyright 2013-2018 Valeriy Chupurnov https://xdsoft.net
 */

import * as consts from "../constants";
import { INVISIBLE_SPACE, INVISIBLE_SPACE_REG_EXP_END, INVISIBLE_SPACE_REG_EXP_START } from "../constants";
import { Jodit } from "../Jodit";
import { Dictionary } from "../types";
import { Component } from "./Component";
import { Dom } from "./Dom";
import { $$, css, dom, each, isIE, isPlainObject, normalizeNode, normilizeCSSValue, trim } from "./Helpers";

export interface markerInfo {
    startId: string;
    endId?: string;
    collapsed: boolean;
    startMarker: string;
    endMarker?: string;
}

export class Select extends Component {
    /**
     * Remove all selected content
     */
    public remove() {
        const sel: Selection = this.jodit.editorWindow.getSelection(),
            current: false | Node = this.current();

        if (current) {
            for (let i = 0; i < sel.rangeCount; i += 1) {
                sel.getRangeAt(i).deleteContents();
                sel.getRangeAt(i).collapse(true);
            }
        }

    }

    /**
     * Insert the cursor toWYSIWYG any point x, y
     *
     * @method insertAtPoint
     * @param {int} x Coordinate by horizontal
     * @param {int} y Coordinate by vertical
     * @return boolean Something went wrong
     */
    public insertCursorAtPoint(x: number, y: number): boolean {
        let caret: any;
        const doc: Document = this.jodit.editorDocument;

        this.removeMarkers();

        try {
            let rng: Range | null = null;

            if ((doc as any).caretPositionFromPoint) {
                caret = (doc as any).caretPositionFromPoint(x, y);
                rng = doc.createRange();
                rng.setStart(caret.offsetNode, caret.offset);
            } else if (doc.caretRangeFromPoint) {
                caret = doc.caretRangeFromPoint(x, y);
                rng = doc.createRange();
                rng.setStart(caret.startContainer, caret.startOffset);
            }

            if (rng && typeof this.jodit.editorWindow.getSelection != "undefined") {
                rng.collapse(true);
                const sel: Selection = this.jodit.editorWindow.getSelection();
                sel.removeAllRanges();
                sel.addRange(rng);
            } else if (typeof (doc as any).body.createTextRange !== "undefined") {
                const range: any = (doc as any).body.createTextRange();
                range.moveToPoint(x, y);
                const endRange: any = range.duplicate();
                endRange.moveToPoint(x, y);
                range.setEndPoint("EndToEnd", endRange);
                range.select();
            }

            return true;
        } catch {
        }

        return false;
    }

    public isMarker = (elm: Node): boolean => (
        Dom.isNode(elm, this.jodit.editorWindow) && elm.nodeType === Node.ELEMENT_NODE && elm.nodeName === "SPAN" && (elm as Element).hasAttribute("data-" + consts.MARKER_CLASS)
    )

    /**
     * Remove all markers
     */
    public removeMarkers() {
        $$("span[data-" + consts.MARKER_CLASS + "]", this.jodit.editor).forEach((marker: HTMLElement) => {
            if (marker.parentNode) {
                marker.parentNode.removeChild(marker);
            }
        });
    }

    public marker = (atStart = false, range?: Range): HTMLSpanElement => {
        let newRange: Range|null = null;

        if (range) {
            newRange = range.cloneRange();
            newRange.collapse(atStart);
        }

        const marker: HTMLSpanElement = this.jodit.editorDocument.createElement("span");

        marker.id = consts.MARKER_CLASS + "_" + (+new Date()) + "_" + ("" + Math.random()).slice(2);
        marker.style.lineHeight = "0";
        marker.style.display = "none";
        marker.setAttribute("data-" + consts.MARKER_CLASS, (atStart ? "start" : "end"));
        marker.appendChild(this.jodit.editorDocument.createTextNode(consts.INVISIBLE_SPACE));

        if (newRange) {
            if (Dom.isOrContains(this.jodit.editor, atStart ? newRange.startContainer : newRange.endContainer)) {
                newRange.insertNode(marker);
            }
        }

        return marker;
    }

    /**
     * Restores user selections using marker invisible elements in the DOM.
     *
     * @param {markerInfo[]|null} selectionInfo
     */
    public restore(selectionInfo: markerInfo[]|null = []) {
        if (Array.isArray(selectionInfo)) {
            const sel: Selection = this.jodit.editorWindow.getSelection();
            sel.removeAllRanges();

            selectionInfo.forEach((selection: markerInfo) => {
                const range: Range = this.jodit.editorDocument.createRange(),
                    end: HTMLElement = this.jodit.editor.querySelector("#" + selection.endId) as HTMLElement,
                    start: HTMLElement = this.jodit.editor.querySelector("#" + selection.startId) as HTMLElement;

                if (!start) {
                    return;
                }

                if (selection.collapsed || !end) {
                    const previousNode: Node|null = start.previousSibling;

                    if (previousNode && previousNode.nodeType === Node.TEXT_NODE) {
                        range.setStart(previousNode, previousNode.nodeValue ? previousNode.nodeValue.length : 0);
                    } else {
                        range.setStartBefore(start);
                    }

                    if (start.parentNode) {
                        start.parentNode.removeChild(start);
                    }

                    range.collapse(true);
                } else {
                    range.setStartAfter(start);
                    if (start.parentNode) {
                        start.parentNode.removeChild(start);
                    }
                    range.setEndBefore(end);
                    if (end.parentNode) {
                        end.parentNode.removeChild(end);
                    }
                }

                sel.addRange(range);
            });
        }
    }

    /**
     * Saves selections using marker invisible elements in the DOM.
     *
     * @return markerInfo[]
     */
    public save(): markerInfo[]  {
        const sel: Selection = this.jodit.editorWindow.getSelection();

        if (!sel.rangeCount) {
            return [];
        }

        let info: markerInfo[] = [],
            length: number = sel.rangeCount,
            i: number,
            start: HTMLSpanElement,
            end: HTMLSpanElement,
            ranges: Range[] = [];

        for (i = 0; i < length; i += 1) {
            ranges[i] = sel.getRangeAt(i);
            if (ranges[i].collapsed) {
                start = this.marker(true, ranges[i]);
                info[i] =  {
                    startId: start.id,
                    collapsed: true,
                    startMarker: start.outerHTML,
                };
            } else {
                start = this.marker(true, ranges[i]);
                end = this.marker(false, ranges[i]);
                info[i] = {
                    startId: start.id,
                    endId: end.id,
                    collapsed: false,
                    startMarker: start.outerHTML,
                    endMarker: end.outerHTML,
                };
            }
        }

        sel.removeAllRanges();
        for (i = length - 1; i >= 0; --i) {
            const start: HTMLElement|null = this.jodit.editorDocument.getElementById(info[i].startId);

            if (start) {
                if (info[i].collapsed) {
                    ranges[i].setStartAfter(start);
                    ranges[i].collapse(true);
                } else {
                    ranges[i].setStartBefore(start);
                    if (info[i].endId) {
                        const end: HTMLElement|null = this.jodit.editorDocument.getElementById(info[i].endId as string);
                        if (end) {
                            ranges[i].setEndAfter(end);
                        }
                    }
                }
            }

            try {
                sel.addRange(ranges[i].cloneRange());
            } catch {
            }
        }

        return info;
    }

    /**
     * Set focus in editor
     */
    public focus = (): boolean => {
        const
            jodit: Jodit = this.jodit;

        if (!this.isFocused()) {
            if (jodit.options.iframe && isIE()) {
                let start: number = 0;
                while (start < 100000 && jodit.editorDocument.readyState !== "complete") {
                    start++;
                }
            }
            if (jodit.iframe) {
                jodit.iframe.focus();
            }

            jodit.editorWindow.focus();
            jodit.editor.focus();

            const
                sel: Selection = jodit.editorWindow.getSelection(),
                range: Range = jodit.editorDocument.createRange();

            if (!sel.rangeCount || !this.current()) {
                range.setStart(jodit.editor, 0);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
            }

            return true;
        }

        return false;
    }

    /**
     * Checks whether the current selection is something or just set the cursor is
     *
     * @return boolean true Selection does't have content
     */
    public isCollapsed(): boolean {
        let sel = this.jodit.editorWindow.getSelection(), r: number;

        for (r = 0; r < sel.rangeCount; r += 1) {
            if (!sel.getRangeAt(r).collapsed) {
                return false;
            }
        }

        return true;
    }

    /**
     * Checks whether the editor currently in focus
     *
     * @return boolean
     */
    public isFocused(): boolean {
        return (this.jodit.editorDocument.hasFocus && this.jodit.editorDocument.hasFocus()) && this.jodit.editor === this.jodit.editorDocument.activeElement;
    }

    /**
     * Returns the current element under the cursor inside editor
     *
     * @return false|Node The element under the cursor or false if undefined or not in editor
     */
    public current(checkChild: boolean = true): false | Node {
        if (this.jodit.getRealMode() === consts.MODE_WYSIWYG && this.jodit.editorWindow.getSelection !== undefined) {
            const sel: Selection = this.jodit.editorWindow.getSelection();

            if (sel && sel.rangeCount > 0) {
                const range: Range = sel.getRangeAt(0);

                let node: Node | null = range.startContainer,
                    rightMode: boolean = false,
                    child = (node: Node): Node | null => rightMode ? node.lastChild : node.firstChild;

                if (node.nodeType !== Node.TEXT_NODE) {
                    node = range.startContainer.childNodes[range.startOffset];

                    if (!node) {
                        node = range.startContainer.childNodes[range.startOffset - 1];
                        rightMode = true;
                    }

                    if (node && sel.isCollapsed && node.nodeType !== Node.TEXT_NODE) {
                        // test Current method - Cursor in the left of some SPAN
                        if (!rightMode && node.previousSibling && node.previousSibling.nodeType === Node.TEXT_NODE) {
                            node = node.previousSibling;
                        } else if (checkChild) {
                            let current: Node | null = child(node);
                            while (current) {
                                if (current && current.nodeType === Node.TEXT_NODE) {
                                    node = current;
                                    break;
                                }
                                current = child(current);
                            }
                        }
                    }

                    if (node && !sel.isCollapsed && node.nodeType !== Node.TEXT_NODE) {
                        let leftChild: Node | null = node, rightChild: Node | null = node;

                        do {
                            leftChild = leftChild.firstChild;
                            rightChild = rightChild.lastChild;
                        } while (leftChild && rightChild && leftChild.nodeType !== Node.TEXT_NODE);

                        if (leftChild === rightChild && leftChild && leftChild.nodeType === Node.TEXT_NODE) {
                            node = leftChild;
                        }
                    }
                }

                // check - cursor inside editor
                if (node && Dom.isOrContains(this.jodit.editor, node)) {
                    return node;
                }
            }
        }

        return false;
    }

    /**
     * Insert element in editor
     *
     * @param {Node} node
     * @param {Boolean} [insertCursorAfter=true] After insert, cursor will move after element
     * @param {Boolean} [fireChange=true] After insert, editor fire change event. You can prevent this behavior
     */
    public insertNode(node: Node, insertCursorAfter = true, fireChange: boolean = true) {
        if (!(node instanceof (this.jodit.editorWindow as any).Node)) {
            throw new Error("Parameter node most be instance of Node");
        }

        this.focus();

        if (this.jodit.editorWindow.getSelection) {
            const sel: Selection = this.jodit.editorWindow.getSelection();

            if (!this.isCollapsed()) {
                this.jodit.execCommand("Delete");
            }

            if (sel.rangeCount) {
                const range: Range = sel.getRangeAt(0);
                if (Dom.isOrContains(this.jodit.editor, range.commonAncestorContainer)) {
                    range.deleteContents();
                    range.insertNode(node);
                } else {
                    this.jodit.editor.appendChild(node);
                }
            } else {
                this.jodit.editor.appendChild(node);
            }

            if (insertCursorAfter) {
                this.setCursorAfter(node);
            }
        } else {
            throw new Error("Jodit does'n support this browser");
        }

        if (fireChange && this.jodit.events) {
            this.jodit.events.fire("synchro");
        }

        if (this.jodit.events) {
            this.jodit.events.fire("afterInsertNode", node);
        }
    }

    /**
     * Inserts in the current cursor position some HTML snippet
     *
     * @param  {string} html HTML The text toWYSIWYG be inserted into the document
     * @example
     * ```javascript
     * parent.selection.insertHTML('<img src="image.png"/>');
     * ```
     */
    public insertHTML(html: number | string | Node) {
        if (html === "") {
            return;
        }

        const node: HTMLDivElement = this.jodit.editorDocument.createElement("div"),
            fragment: DocumentFragment = this.jodit.editorDocument.createDocumentFragment();

        let
            lastChild: Node|null,
            lastEditorElement: Node|null;

        if (!this.isFocused() && this.jodit.isEditorMode()) {
            this.focus();
        }

        if (!(html instanceof (this.jodit.editorWindow as any).Node)) {
            node.innerHTML = html.toString();
        } else if (Dom.isNode(html, this.jodit.editorWindow)) {
            node.appendChild(html as Node);
        }

        if (!this.jodit.isEditorMode() && this.jodit.events.fire("insertHTML", node.innerHTML) === false) {
            return;
        }

        lastChild = node.lastChild;

        while (node.firstChild) {
            lastChild = node.firstChild;
            fragment.appendChild(node.firstChild);
        }

        this.insertNode(fragment, false);

        if (lastChild) {
            this.setCursorAfter(lastChild);
        } else {
            this.setCursorIn(fragment);
        }

        lastEditorElement = this.jodit.editor.lastChild;
        while (lastEditorElement && lastEditorElement.nodeType === Node.TEXT_NODE && lastEditorElement.previousSibling && lastEditorElement.nodeValue && (/^\s*$/).test(lastEditorElement.nodeValue)) {
            lastEditorElement = lastEditorElement.previousSibling;
        }

        if (lastChild) {
            if (lastEditorElement && lastChild === lastEditorElement && lastChild.nodeType === Node.ELEMENT_NODE) {
                this.jodit.editor.appendChild(this.jodit.editorDocument.createElement("br"));
            }
            this.setCursorAfter(lastChild);
        }
    }

    /**
     * Insert image in editor
     *
     * @param  {string|HTMLImageElement} url URL for image, or HTMLImageElement
     * @param  {string} [styles] If specified, it will be applied <code>$(image).css(styles)</code>
     *
     * @fired afterInsertImage
     */
    public insertImage(url: string | HTMLImageElement, styles: Dictionary<string> = {}) {

        const image: HTMLImageElement = typeof url === "string" ? dom('<img src=""/>', this.jodit.editorDocument) as HTMLImageElement : dom(url, this.jodit.editorDocument) as HTMLImageElement;

        if (typeof url === "string") {
            image.setAttribute("src", url);
        }

        let dw: string = this.jodit.options.imageDefaultWidth.toString();
        if (dw && "auto" !== dw && (String(dw)).indexOf("px") < 0 && (String(dw)).indexOf("%") < 0) {
            dw += "px";
        }

        styles.width = dw;

        if (styles && typeof styles === "object") {
            each(styles, (value: string, key: string) => {
                (image.style as any)[key] = value;
            });
        }

        const onload = () => {
            if (image.naturalHeight < image.offsetHeight || image.naturalWidth < image.offsetWidth) {
                image.style.width = "";
                image.style.height = "";
            }
            image.removeEventListener("load", onload);
        };

        image.addEventListener("load", onload);

        if (image.complete) {
            onload();
        }

        this.insertNode(image);

        /**
         * Triggered after image was inserted {@link Selection~insertImage|insertImage}. This method can executed from {@link FileBrowser|FileBrowser} or {@link Uploader|Uploader}
         * @event afterInsertImage
         * @param {HTMLImageElement} image
         * @example
         * ```javascript
         * var editor = new Jodit("#redactor");
         * editor.events.on('afterInsertImage', function (image) {
         *     image.className = 'bloghead4';
         * });
         * ```
         */
        this.jodit.events.fire("afterInsertImage", image);
    }

    public eachSelection = (callback: (current: Node)  => void) => {
        const sel: Selection = this.jodit.editorWindow.getSelection();
        if (sel.rangeCount) {
            const range: Range = sel.getRangeAt(0);
            const nodes: Node[] = [],
                startOffset: number = range.startOffset,
                length: number = this.jodit.editor.childNodes.length,
                start: Node = range.startContainer === this.jodit.editor ? this.jodit.editor.childNodes[startOffset < length ?  startOffset : length - 1] : range.startContainer,
                end: Node = range.endContainer === this.jodit.editor ? this.jodit.editor.childNodes[range.endOffset - 1] : range.endContainer;

            Dom.find(start, (node: Node | null) => {
                if (node && node !== this.jodit.editor && !Dom.isEmptyTextNode(node) && !this.isMarker(node as HTMLElement)) {
                    nodes.push(node);
                }

                return node === end;
            }, this.jodit.editor, true, "nextSibling", false);

            const forEvery = (current: Node) => {
                if (current.nodeName.match(/^(UL|OL)$/)) {
                    return [].slice.call(current.childNodes).forEach(forEvery);
                }

                if (current.nodeName === "LI") {
                    if (current.firstChild) {
                        current = current.firstChild;
                    } else {
                        const currentB: Node = this.jodit.editorDocument.createTextNode(INVISIBLE_SPACE);
                        current.appendChild(currentB);
                        current = currentB;
                    }
                }

                callback(current);
            };

            if (nodes.length === 0 && Dom.isEmptyTextNode(start)) {
                nodes.push(start);
            }

            nodes.forEach(forEvery);
        }
    }

    /**
     * Set cursor after the node
     *
     * @param {Node} node
     * @return {Node} fake invisible textnode. After insert it can be removed
     */
    public setCursorAfter(node: Node | HTMLElement | HTMLTableElement | HTMLTableCellElement): Text | false {
        if (!(node instanceof (this.jodit.editorWindow as any).Node)) {
            throw new Error("Parameter node most be instance of Node");
        }

        if (!Dom.up(node, (elm: Node | null) => (elm === this.jodit.editor || (elm && elm.parentNode === this.jodit.editor)), this.jodit.editor)) {
            throw new Error("Node element must be in editor");
        }

        const range: Range = this.jodit.editorDocument.createRange();
        let fakeNode: Text | false = false;

        if (node.nodeType !== Node.TEXT_NODE) {
            fakeNode = this.jodit.editorDocument.createTextNode(consts.INVISIBLE_SPACE);
            range.setStartAfter(node);
            range.insertNode(fakeNode);
            range.selectNode(fakeNode);
        } else {
            range.setEnd(node, node.nodeValue !== null ? node.nodeValue.length : 0);
        }

        range.collapse(false);

        this.selectRange(range);

        return fakeNode;
    }

    /**
     * Checks if the cursor is at the end(start) block
     *
     * @param  {boolean} start=false true - check whether the cursor is at the start block
     * @param {HTMLElement} parentBlock - Find in this
     *
     * @return {boolean | null} true - the cursor is at the end(start) block, null - cursor somewhere outside
     */
    public cursorInTheEdge(start: boolean, parentBlock: HTMLElement): boolean | null {
        const sel: Selection = this.jodit.editorWindow.getSelection();
        const range: Range | null = sel.rangeCount ? sel.getRangeAt(0) : null;

        if (!range) {
            return null;
        }

        const container = start ? range.startContainer : range.endContainer,
            sibling = (node: Node): Node | false => {
                return start ? Dom.prev(node, (elm) => !!elm, parentBlock) : Dom.next(node, (elm) => !!elm, parentBlock);
            },
            checkSiblings = (next: Node | false): false | void => {
                while (next) {
                    next = sibling(next);
                    if (next && !Dom.isEmptyTextNode(next) && next.nodeName !== "BR") {
                        return false;
                    }
                }
            };

        if (container.nodeType === Node.TEXT_NODE) {
            const value: string = container.nodeValue || "";
            if (start && range.startOffset > value.length - value.replace(INVISIBLE_SPACE_REG_EXP_START, "").length) {
                return false;
            }
            if (!start  && range.startOffset < value.replace(INVISIBLE_SPACE_REG_EXP_END, "").length) {
                return false;
            }

            if (checkSiblings(container) === false) {
                return false;
            }
        }

        const current: Node | false = this.current(false);
        if (!current || !Dom.isOrContains(parentBlock, current, true)) {
            return null;
        }

        if (!start && range.startContainer.childNodes[range.startOffset]) {
            if (current && !Dom.isEmptyTextNode(current)) {
                return false;
            }
        }

        return checkSiblings(current) !== false;
    }

    /**
     * Set cursor before the node
     *
     * @param {Node} node
     * @return {Text} fake invisible textnode. After insert it can be removed
     */
    public setCursorBefore(node: Node | HTMLElement | HTMLTableElement | HTMLTableCellElement): Text | false {
        if (!(node instanceof (this.jodit.editorWindow as any).Node)) {
            throw new Error("Parameter node most be instance of Node");
        }

        if (!Dom.up(node, (elm: Node | null) => (elm === this.jodit.editor || (elm && elm.parentNode === this.jodit.editor)), this.jodit.editor)) {
            throw new Error("Node element must be in editor");
        }

        const range: Range = this.jodit.editorDocument.createRange();
        let fakeNode: Text | false = false;

        if (node.nodeType !== Node.TEXT_NODE) {
            fakeNode = this.jodit.editorDocument.createTextNode(consts.INVISIBLE_SPACE);
            range.setStartBefore(node);
            range.collapse(true);
            range.insertNode(fakeNode);
            range.selectNode(fakeNode);
        } else {
            range.setStart(node, node.nodeValue !== null ? node.nodeValue.length : 0);
        }

        range.collapse(true);
        this.selectRange(range);

        return fakeNode;
    }

    /**
     * Set cursor in the node
     *
     * @param {Node} node
     * @param {boolean} [inStart=false] set cursor in start of element
     */
    public setCursorIn(node: Node, inStart: boolean = false) {
        if (!(node instanceof (this.jodit.editorWindow as any).Node)) {
            throw new Error("Parameter node most be instance of Node");
        }
        if (!Dom.up(node, (elm: Node | null) => (elm === this.jodit.editor || (elm && elm.parentNode === this.jodit.editor)), this.jodit.editor)) {
            throw new Error("Node element must be in editor");
        }

        const range: Range = this.jodit.editorDocument.createRange();

        let start: Node | null = node,
            last: Node = node;

        do {
            if (start.nodeType === Node.TEXT_NODE) {
                break;
            }
            last = start;
            start = inStart ? start.firstChild : start.lastChild;
        } while (start);

        if (!start) {
            const fakeNode: Text = this.jodit.editorDocument.createTextNode(consts.INVISIBLE_SPACE);
            if (!/^(img|br|input)$/i.test(last.nodeName)) {
                last.appendChild(fakeNode);
                last = fakeNode;
            } else {
                start = last;
            }
        }

        range.selectNodeContents(start || last);
        range.collapse(inStart);

        this.selectRange(range);

        return last;
    }

    /**
     * Set range selection
     *
     * @param range
     * @fires changeSelection
     */
    public selectRange(range: Range) {
        const sel: Selection = this.jodit.editorWindow.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        /**
         * Fired after change selection
         *
         * @event changeSelection
         */
        this.jodit.events.fire("changeSelection");
    }

    /**
     * Select node
     *
     * @param {Node} node
     * @param {boolean} [inward=false] select all inside
     */
    public select(node: Node | HTMLElement | HTMLTableElement | HTMLTableCellElement, inward = false) {
        if (!(node instanceof (this.jodit.editorWindow as any).Node)) {
            throw new Error("Parameter node most be instance of Node");
        }
        if (!Dom.up(node, (elm: Node | null) => (elm === this.jodit.editor || (elm && elm.parentNode === this.jodit.editor)), this.jodit.editor)) {
            throw new Error("Node element must be in editor");
        }

        const range: Range = this.jodit.editorDocument.createRange();

        range[inward ? "selectNodeContents" : "selectNode"](node);

        this.selectRange(range);
    }

    public getHTML(): string {
        const selection: Selection = this.jodit.editorWindow.getSelection();

        if (selection.rangeCount > 0) {
            const range: Range = selection.getRangeAt(0);
            const clonedSelection: DocumentFragment = range.cloneContents();
            const div: HTMLElement = this.jodit.editorDocument.createElement("div");
            div.appendChild(clonedSelection);
            return div.innerHTML;
        }

        return "";
    }

    /**
     * Apply some css rules for all selections. It method wraps selections in nodeName tag.
     *
     * @param {object} cssRules
     * @param {string} nodeName
     * @param {object} options
     */
    public applyCSS = (cssRules ?: {[key: string]: string | number | undefined}, nodeName: string = "span", options?: Function | Dictionary<string | string[]> | Dictionary<(editor: Jodit, elm: HTMLElement) => boolean>) => {
        const WRAP: number  = 1;
        const UNWRAP: number  = 0;

        let mode: number;

        const defaultTag: string = "SPAN";
        const FONT: string = "FONT";

        const findNextCondition = (elm: Node | null): boolean => (elm !== null && !Dom.isEmptyTextNode(elm) && !this.isMarker(elm as HTMLElement));

        const checkCssRulesFor = (elm: HTMLElement): boolean => {
            return elm.nodeName !== FONT &&
                elm.nodeType === Node.ELEMENT_NODE &&
                (
                    (
                        isPlainObject(options) &&
                        each(options as object, (cssPropertyKey: string, cssPropertyValues: string[]) => {
                                    const value = css(elm, cssPropertyKey, void(0), true);
                                    return  value !== null && value !== "" && cssPropertyValues.indexOf(value.toString().toLowerCase()) !== -1;
                        }) !== false
                    ) ||
                    (
                        typeof options === "function" && options(this.jodit, elm)
                    )
                );
        };

        const isSuitElement = (elm: HTMLElement): boolean => {
            const reg: RegExp = new RegExp("^" + elm.nodeName + "$", "i");
            return (reg.test(nodeName) || !!(options && checkCssRulesFor(elm))) && findNextCondition(elm);
        };

        const toggleStyles =  (elm: HTMLElement) => {
            if (isSuitElement(elm)) {
                // toggle CSS rules
                if (elm.nodeName === defaultTag && cssRules) {
                    Object.keys(cssRules).forEach((rule: string) => {
                        if (mode === UNWRAP || css(elm, rule) == normilizeCSSValue(rule, cssRules[rule] as string)) {
                            css(elm, rule, "");
                            if (mode === undefined) {
                                mode = UNWRAP;
                            }
                        } else {
                            css(elm, rule, cssRules[rule]);
                            if (mode === undefined) {
                                mode = WRAP;
                            }
                        }
                    });
                }

                if (!Dom.isBlock(elm) && (!elm.getAttribute("style") || elm.nodeName !== defaultTag)) {
                    Dom.unwrap(elm); // toggle `<strong>test</strong>` toWYSIWYG `test`, and `<span style="">test</span>` toWYSIWYG `test`
                    if (mode === undefined) {
                        mode = UNWRAP;
                    }
                }
            }
        };

        if (!this.isCollapsed()) {
            const selInfo: markerInfo[] = this.save();
            normalizeNode(this.jodit.editor.firstChild); // FF fix for test "commandsTest - Exec command "bold" for some text that contains a few STRONG elements, should unwrap all of these"

            // fix issue https://github.com/xdan/jodit/issues/65
            $$("*[style*=font-size]", this.jodit.editor).forEach((elm: HTMLElement) => {
                elm.style && elm.style.fontSize && elm.setAttribute("data-font-size", elm.style.fontSize.toString());
            });

            this.jodit.editorDocument.execCommand("fontsize", false, "7");

            $$("*[data-font-size]", this.jodit.editor).forEach((elm: HTMLElement) => {
                if (elm.style && elm.getAttribute("data-font-size")) {
                    elm.style.fontSize = elm.getAttribute("data-font-size");
                    elm.removeAttribute("data-font-size");
                }
            });

            $$('font[size="7"]', this.jodit.editor).forEach((font: HTMLElement) => {
                if (!Dom.next(font, findNextCondition, font.parentNode as HTMLElement) && !Dom.prev(font, findNextCondition, font.parentNode as HTMLElement) && isSuitElement(font.parentNode as HTMLElement) && font.parentNode !== this.jodit.editor && (!Dom.isBlock(font.parentNode) || consts.IS_BLOCK.test(nodeName))) {
                    toggleStyles(font.parentNode as HTMLElement);
                } else if (font.firstChild && !Dom.next(font.firstChild, findNextCondition, font as HTMLElement) && !Dom.prev(font.firstChild, findNextCondition, font as HTMLElement) && isSuitElement(font.firstChild as HTMLElement)) {
                    toggleStyles(font.firstChild as HTMLElement);
                } else if (Dom.closest(font, isSuitElement, this.jodit.editor)) {
                    const leftRange: Range = this.jodit.editorDocument.createRange(),
                        wrapper: HTMLElement = Dom.closest(font, isSuitElement, this.jodit.editor) as HTMLElement;

                    leftRange.setStartBefore(wrapper);
                    leftRange.setEndBefore(font);

                    const leftFragment: DocumentFragment = leftRange.extractContents();

                    if ((!leftFragment.textContent || !trim(leftFragment.textContent).length) && leftFragment.firstChild) {
                        Dom.unwrap(leftFragment.firstChild);
                    }

                    if (wrapper.parentNode) {
                        wrapper.parentNode.insertBefore(leftFragment, wrapper);
                    }

                    leftRange.setStartAfter(font);
                    leftRange.setEndAfter(wrapper);
                    const rightFragment = leftRange.extractContents();

                    // case then marker can be inside fragnment
                    if ((!rightFragment.textContent || !trim(rightFragment.textContent).length) && rightFragment.firstChild) {
                        Dom.unwrap(rightFragment.firstChild);
                    }

                    Dom.after(wrapper, rightFragment);

                    toggleStyles(wrapper);

                } else {

                    // unwrap all suit elements inside
                    const needUnwrap: Node[] = [];
                    let firstElementSuit: boolean|undefined;

                    if (font.firstChild) {
                        Dom.find(font.firstChild, (elm: Node | null) => {
                            if (elm && isSuitElement(elm as HTMLElement)) {
                                if (firstElementSuit === undefined) {
                                    firstElementSuit = true;
                                }
                                needUnwrap.push(elm);
                            } else {
                                if (firstElementSuit === undefined) {
                                    firstElementSuit = false;
                                }
                            }
                            return false;
                        }, font, true);
                    }

                    needUnwrap.forEach(Dom.unwrap);

                    if (!firstElementSuit) {
                        if (mode === undefined) {
                            mode = WRAP;
                        }
                        if (mode === WRAP) {
                            css(Dom.replace(font, nodeName, false, false, this.jodit.editorDocument), (cssRules && nodeName.toUpperCase() === defaultTag) ? cssRules : {});
                        }
                    }
                }

                if (font.parentNode) {
                    Dom.unwrap(font);
                }
            });

            this.restore(selInfo);
        } else {

            let clearStyle: boolean = false;
            if (this.current() && Dom.closest(this.current() as Node, nodeName, this.jodit.editor)) {
                clearStyle = true;
                const closest: Node = Dom.closest(this.current() as Node, nodeName, this.jodit.editor) as Node;
                if (closest) {
                    this.setCursorAfter(closest);
                }
            }

            if (nodeName.toUpperCase() === defaultTag || !clearStyle) {
                const node: Node = this.jodit.editorDocument.createElement(nodeName);
                node.appendChild(this.jodit.editorDocument.createTextNode(consts.INVISIBLE_SPACE));

                this.insertNode(node, false, false);
                if (nodeName.toUpperCase() === defaultTag && cssRules) {
                    css(node as HTMLElement, cssRules);
                }

                this.setCursorIn(node);
            }
        }
    }
}
