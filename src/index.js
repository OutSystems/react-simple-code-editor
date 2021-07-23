/* @flow */

import * as React from 'react';

/*extracted from react-prism-editor*/
import selectionRange from './utils/selection';
import { FORBIDDEN_KEYS } from './utils/constant';
import { getIndent, getDeindentLevel } from './utils/getIdent';

type Props = React.ElementConfig<'div'> & {
  // Props for the component
  isSingleLine: boolean,
  value: string,
  onValueChange: (value: string) => mixed,
  highlight: (value: string) => string | React.Node,
  tabSize: number,
  insertSpaces: boolean,
  ignoreTabKey: boolean,
  padding: number | string,
  style?: {},

  // Props for the textarea
  textareaId?: string,
  autoFocus?: boolean,
  disabled?: boolean,
  form?: string,
  maxLength?: number,
  minLength?: number,
  name?: string,
  placeholder?: string,
  readOnly?: boolean,
  required?: boolean,
  onClick?: (e: MouseEvent) => mixed,
  onFocus?: (e: FocusEvent) => mixed,
  onBlur?: (e: FocusEvent) => mixed,
  onKeyUp?: (e: KeyboardEvent) => mixed,
  onKeyDown?: (e: KeyboardEvent) => mixed,
};

type State = {
  capture: boolean,
};

type Record = {
  value: string,
  selectionStart: number,
  selectionEnd: number,
};

type History = {
  stack: Array<Record & { timestamp: number }>,
  offset: number,
};

const KEYCODE_ENTER = 13;
const KEYCODE_TAB = 9;
const KEYCODE_BACKSPACE = 8;
const KEYCODE_Y = 89;
const KEYCODE_Z = 90;
const KEYCODE_M = 77;
const KEYCODE_PARENS = 57;
const KEYCODE_BRACKETS = 219;
const KEYCODE_QUOTE = 222;
const KEYCODE_BACK_QUOTE = 192;

const HISTORY_LIMIT = 100;
const HISTORY_TIME_GAP = 3000;

// const this.props.isSingleLine = true;

const isWindows = 'navigator' in window && /Win/i.test(navigator.platform);
const isMacLike =
  'navigator' in window && /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform);

const className = 'npm__react-simple-code-editor__textarea';

const cssText = /* CSS */ `
/**
 * Reset the text fill color so that placeholder is visible
 */
.${className}:empty {
  -webkit-text-fill-color: inherit !important;
}
/**
 * Hack to apply on some CSS on IE10 and IE11
 */
@media all and (-ms-high-contrast: none), (-ms-high-contrast: active) {
  /**
    * IE doesn't support '-webkit-text-fill-color'
    * So we use 'color: transparent' to make the text transparent on IE
    * Unlike other browsers, it doesn't affect caret color in IE
    */
  .${className} {
    color: transparent !important;
  }
  .${className}::selection {
    background-color: #accef7 !important;
    color: transparent !important;
  }
}
`;

export default class Editor extends React.Component<Props, State> {
  static defaultProps = {
    tabSize: 2,
    insertSpaces: true,
    ignoreTabKey: false,
    padding: 0,
  };

  // cjg: added singleLine
  constructor(props) {
    super(props);
    this.elementRef = React.createRef();
  }

  state = {
    capture: true,
    selection: undefined,
  };

  componentDidMount() {
    this._recordCurrentState();

    // cjg : added singleLine
    if (this.props.isSingleLine) {
      const $pre = this.pre;

      $pre.addEventListener('compositionstart', () => {
        this.composing = true;
      });
      $pre.addEventListener('compositionend', () => {
        // for canceling input.
        this.composing = false;
      });
    }
  }

  // cjg: added singleLine
  componentDidUpdate() {
    if (this.props.isSingleLine && this.selection) {
      selectionRange(this.pre, this.selection);
    }
  }

  _recordCurrentState = () => {
    const input = this._input;

    if (!input) return;

    // Save current state of the input
    const { value, selectionStart, selectionEnd } = input;

    this._recordChange({
      value,
      selectionStart,
      selectionEnd,
    });
  };

  _getLines = (text: string, position: number) =>
    text.substring(0, position).split('\n');

  _recordChange = (record: Record, overwrite?: boolean = false) => {
    const { stack, offset } = this._history;

    if (stack.length && offset > -1) {
      // When something updates, drop the redo operations
      this._history.stack = stack.slice(0, offset + 1);

      // Limit the number of operations to 100
      const count = this._history.stack.length;

      if (count > HISTORY_LIMIT) {
        const extras = count - HISTORY_LIMIT;

        this._history.stack = stack.slice(extras, count);
        this._history.offset = Math.max(this._history.offset - extras, 0);
      }
    }

    const timestamp = Date.now();

    if (overwrite) {
      const last = this._history.stack[this._history.offset];

      if (last && timestamp - last.timestamp < HISTORY_TIME_GAP) {
        // A previous entry exists and was in short interval

        // Match the last word in the line
        const re = /[^a-z0-9]([a-z0-9]+)$/i;

        // Get the previous line
        const previous = this._getLines(last.value, last.selectionStart)
          .pop()
          .match(re);

        // Get the current line
        const current = this._getLines(record.value, record.selectionStart)
          .pop()
          .match(re);

        if (previous && current && current[1].startsWith(previous[1])) {
          // The last word of the previous line and current line match
          // Overwrite previous entry so that undo will remove whole word
          this._history.stack[this._history.offset] = { ...record, timestamp };

          return;
        }
      }
    }

    // Add the new operation to the stack
    this._history.stack.push({ ...record, timestamp });
    this._history.offset++;
  };

  _updateInput = (record: Record) => {
    const input = this._input;

    if (!input) return;

    // Update values and selection state
    input.value = record.value;
    input.selectionStart = record.selectionStart;
    input.selectionEnd = record.selectionEnd;

    this.props.onValueChange(record.value);
  };

  _applyEdits = (record: Record) => {
    // Save last selection state
    const input = this._input;
    const last = this._history.stack[this._history.offset];

    if (last && input) {
      this._history.stack[this._history.offset] = {
        ...last,
        selectionStart: input.selectionStart,
        selectionEnd: input.selectionEnd,
      };
    }

    // Save the changes
    this._recordChange(record);
    this._updateInput(record);
  };

  _undoEdit = () => {
    const { stack, offset } = this._history;

    // Get the previous edit
    const record = stack[offset - 1];

    if (record) {
      // Apply the changes and update the offset
      this._updateInput(record);
      this._history.offset = Math.max(offset - 1, 0);
    }
  };

  _redoEdit = () => {
    const { stack, offset } = this._history;

    // Get the next edit
    const record = stack[offset + 1];

    if (record) {
      // Apply the changes and update the offset
      this._updateInput(record);
      this._history.offset = Math.min(offset + 1, stack.length - 1);
    }
  };

  _handleKeyDown = (e: *) => {
    const { tabSize, insertSpaces, ignoreTabKey, onKeyDown } = this.props;

    // cjg: added singlelineVersopm
    if (this.props.isSingleLine) {
      this._singleLineHandleKeyDown(e);
      this.props.onKeyDown(e);
      return;
    }

    if (onKeyDown) {
      onKeyDown(e);

      if (e.defaultPrevented) {
        return;
      }
    }

    const { value, selectionStart, selectionEnd } = e.target;

    const tabCharacter = (insertSpaces ? ' ' : '\t').repeat(tabSize);

    if (e.keyCode === KEYCODE_TAB && !ignoreTabKey && this.state.capture) {
      // Prevent focus change
      e.preventDefault();

      if (e.shiftKey) {
        // Unindent selected lines
        const linesBeforeCaret = this._getLines(value, selectionStart);
        const startLine = linesBeforeCaret.length - 1;
        const endLine = this._getLines(value, selectionEnd).length - 1;
        const nextValue = value
          .split('\n')
          .map((line, i) => {
            if (
              i >= startLine &&
              i <= endLine &&
              line.startsWith(tabCharacter)
            ) {
              return line.substring(tabCharacter.length);
            }

            return line;
          })
          .join('\n');

        if (value !== nextValue) {
          const startLineText = linesBeforeCaret[startLine];

          this._applyEdits({
            value: nextValue,
            // Move the start cursor if first line in selection was modified
            // It was modified only if it started with a tab
            selectionStart: startLineText.startsWith(tabCharacter)
              ? selectionStart - tabCharacter.length
              : selectionStart,
            // Move the end cursor by total number of characters removed
            selectionEnd: selectionEnd - (value.length - nextValue.length),
          });
        }
      } else if (selectionStart !== selectionEnd) {
        // Indent selected lines
        const linesBeforeCaret = this._getLines(value, selectionStart);
        const startLine = linesBeforeCaret.length - 1;
        const endLine = this._getLines(value, selectionEnd).length - 1;
        const startLineText = linesBeforeCaret[startLine];

        this._applyEdits({
          value: value
            .split('\n')
            .map((line, i) => {
              if (i >= startLine && i <= endLine) {
                return tabCharacter + line;
              }

              return line;
            })
            .join('\n'),
          // Move the start cursor by number of characters added in first line of selection
          // Don't move it if it there was no text before cursor
          selectionStart: /\S/.test(startLineText)
            ? selectionStart + tabCharacter.length
            : selectionStart,
          // Move the end cursor by total number of characters added
          selectionEnd:
            selectionEnd + tabCharacter.length * (endLine - startLine + 1),
        });
      } else {
        const updatedSelection = selectionStart + tabCharacter.length;

        this._applyEdits({
          // Insert tab character at caret
          value:
            value.substring(0, selectionStart) +
            tabCharacter +
            value.substring(selectionEnd),
          // Update caret position
          selectionStart: updatedSelection,
          selectionEnd: updatedSelection,
        });
      }
    } else if (e.keyCode === KEYCODE_BACKSPACE) {
      const hasSelection = selectionStart !== selectionEnd;
      const textBeforeCaret = value.substring(0, selectionStart);

      if (textBeforeCaret.endsWith(tabCharacter) && !hasSelection) {
        // Prevent default delete behaviour
        e.preventDefault();

        const updatedSelection = selectionStart - tabCharacter.length;

        this._applyEdits({
          // Remove tab character at caret
          value:
            value.substring(0, selectionStart - tabCharacter.length) +
            value.substring(selectionEnd),
          // Update caret position
          selectionStart: updatedSelection,
          selectionEnd: updatedSelection,
        });
      }
    } else if (e.keyCode === KEYCODE_ENTER) {
      // Ignore selections
      if (selectionStart === selectionEnd) {
        // Get the current line
        const line = this._getLines(value, selectionStart).pop();
        const matches = line.match(/^\s+/);

        if (matches && matches[0]) {
          e.preventDefault();

          // Preserve indentation on inserting a new line
          const indent = '\n' + matches[0];
          const updatedSelection = selectionStart + indent.length;

          this._applyEdits({
            // Insert indentation character at caret
            value:
              value.substring(0, selectionStart) +
              indent +
              value.substring(selectionEnd),
            // Update caret position
            selectionStart: updatedSelection,
            selectionEnd: updatedSelection,
          });
        }
      }
    } else if (
      e.keyCode === KEYCODE_PARENS ||
      e.keyCode === KEYCODE_BRACKETS ||
      e.keyCode === KEYCODE_QUOTE ||
      e.keyCode === KEYCODE_BACK_QUOTE
    ) {
      let chars;

      if (e.keyCode === KEYCODE_PARENS && e.shiftKey) {
        chars = ['(', ')'];
      } else if (e.keyCode === KEYCODE_BRACKETS) {
        if (e.shiftKey) {
          chars = ['{', '}'];
        } else {
          chars = ['[', ']'];
        }
      } else if (e.keyCode === KEYCODE_QUOTE) {
        if (e.shiftKey) {
          chars = ['"', '"'];
        } else {
          chars = ["'", "'"];
        }
      } else if (e.keyCode === KEYCODE_BACK_QUOTE && !e.shiftKey) {
        chars = ['`', '`'];
      }

      // If text is selected, wrap them in the characters
      if (selectionStart !== selectionEnd && chars) {
        e.preventDefault();

        this._applyEdits({
          value:
            value.substring(0, selectionStart) +
            chars[0] +
            value.substring(selectionStart, selectionEnd) +
            chars[1] +
            value.substring(selectionEnd),
          // Update caret position
          selectionStart,
          selectionEnd: selectionEnd + 2,
        });
      }
    } else if (
      (isMacLike
        ? // Trigger undo with ⌘+Z on Mac
          e.metaKey && e.keyCode === KEYCODE_Z
        : // Trigger undo with Ctrl+Z on other platforms
          e.ctrlKey && e.keyCode === KEYCODE_Z) &&
      !e.shiftKey &&
      !e.altKey
    ) {
      e.preventDefault();

      this._undoEdit();
    } else if (
      (isMacLike
        ? // Trigger redo with ⌘+Shift+Z on Mac
          e.metaKey && e.keyCode === KEYCODE_Z && e.shiftKey
        : isWindows
        ? // Trigger redo with Ctrl+Y on Windows
          e.ctrlKey && e.keyCode === KEYCODE_Y
        : // Trigger redo with Ctrl+Shift+Z on other platforms
          e.ctrlKey && e.keyCode === KEYCODE_Z && e.shiftKey) &&
      !e.altKey
    ) {
      e.preventDefault();

      this._redoEdit();
    } else if (
      e.keyCode === KEYCODE_M &&
      e.ctrlKey &&
      (isMacLike ? e.shiftKey : true)
    ) {
      e.preventDefault();

      // Toggle capturing tab key so users can focus away
      this.setState(state => ({
        capture: !state.capture,
      }));
    }
  };

  // cjg: added singleLine
  _handleKeyUp = (e: *) => {
    if (this.props.isSingleLine) {
      this._singleLineHandleKeyUp(e);
    }
    this.props.onKeyUp(e);
  };

  /* extracted from react-prism-editor */
  _handleClick(e: *) {
    if (this.props.isSingleLine) {
      this.selection = selectionRange(this.pre);
    }
    this.props.onClick(e);
  }

  /* extracted from react-prism-editor */
  _singleLineHandleKeyUp(evt) {
    const keyupCode = evt.which;
    if (this.composing) {
      if (keyupCode === 13) {
        // finish inputting via IM.
        this.composing = false;
      } else {
        // now inputting words using IM.
        // must not update view.
        return;
      }
    }

    if (!this.code) {
      this.codeData = evt.target.innerText;
    }

    if (
      evt.keyCode === 91 || // left cmd
      evt.keyCode === 93 || // right cmd
      evt.ctrlKey ||
      evt.metaKey
    ) {
      return;
    }

    // Enter key
    if (evt.keyCode === 13) {
      this.undoTimestamp = 0;
    }

    this.selection = selectionRange(this.pre);

    if (!Object.values(FORBIDDEN_KEYS).includes(evt.keyCode)) {
      var text = evt.target.innerText;
      this.props.onValueChange(text);
    } else {
      this.undoTimestamp = 0;
    }
  }

  /* extracted from react-prism-editor */
  _singleLineHandleKeyDown(evt) {
    if (evt.keyCode === 9 && !this.ignoreTabKey) {
      document.execCommand('insertHTML', false, '  ');
      evt.preventDefault();
    } else if (evt.keyCode === 8) {
      // Backspace Key
      const { start: cursorPos, end: cursorEndPos } = selectionRange(this.pre);
      if (cursorPos !== cursorEndPos) {
        return; // Bail on selections
      }

      const deindent = getDeindentLevel(this.pre.innerText, cursorPos);
      if (deindent <= 0) {
        return; // Bail when deindent level defaults to 0
      }

      // Delete chars `deindent` times
      for (let i = 0; i < deindent; i++) {
        document.execCommand('delete', false);
      }

      evt.preventDefault();
    } else if (evt.keyCode === 13) {
      // Enter Key
      const { start: cursorPos } = selectionRange(this.pre);
      const indentation = getIndent(this.pre.innerText, cursorPos);

      // https://stackoverflow.com/questions/35585421
      // add a space and remove it. it works :/
      document.execCommand('insertHTML', false, '\n ' + indentation);
      document.execCommand('delete', false);

      evt.preventDefault();
    }
    // else if (
    //   // Undo / Redo
    //   evt.keyCode === 90 &&
    //   evt.metaKey !== evt.ctrlKey &&
    //   !evt.altKey
    // ) {
    //   // if (evt.shiftKey) {
    //   //   //this.redo();
    //   // } else {
    //   //   //  this.undo();
    //   // }
    //   //evt.preventDefault();
    // }
  }

  _handleChange = (e: *) => {
    const { value, selectionStart, selectionEnd } = e.target;

    this._recordChange(
      {
        value,
        selectionStart,
        selectionEnd,
      },
      true
    );

    this.props.onValueChange(value);
  };

  _inputRef = (el: *) => {
    this._input = el;
    if (typeof this.props.inputRef === 'function') {
      this.props.inputRef(el);
    }
  };

  _history: History = {
    stack: [],
    offset: -1,
  };

  _input: ?HTMLTextAreaElement;

  get session() {
    return {
      history: this._history,
    };
  }

  set session(session: { history: History }) {
    this._history = session.history;
  }

  render() {
    const {
      value,
      style,
      padding,
      highlight,
      textareaId,
      autoFocus,
      disabled,
      form,
      maxLength,
      minLength,
      name,
      placeholder,
      readOnly,
      required,
      onClick,
      onFocus,
      onBlur,
      /* eslint-disable no-unused-vars */
      onKeyUp,
      onKeyDown,
      onValueChange,
      tabSize,
      insertSpaces,
      ignoreTabKey,
      /* eslint-enable no-unused-vars */
      ...rest
    } = this.props;

    const contentStyle = {
      paddingTop: padding,
      paddingRight: padding,
      paddingBottom: padding,
      paddingLeft: padding,
    };

    const highlighted = highlight(value);

    const commonProps = {
      className: className,
      id: textareaId,
      value: value,
      onKeyDown: this._handleKeyDown,
      onKeyUp: this._handleKeyUp,
      onClick: this._handleClick,
      onFocus: onFocus,
      onBlur: onBlur,
      disabled: disabled,
      form: form,
      maxLength: maxLength,
      minLength: minLength,
      name: name,
      placeholder: placeholder,
      readOnly: readOnly,
      required: required,
      autoFocus: autoFocus,
      autoCapitalize: 'off',
      autoComplete: 'off',
      autoCorrect: 'off',
      spellCheck: false,
      'data-gramm': false,
    };

    const editorComponent = !this.props.isSingleLine ? (
      <div>
        <textarea
          ref={this._inputRef}
          style={{
            ...styles.common,
            ...styles.editor,
            ...styles.textarea,
            ...contentStyle,
          }}
          {...commonProps}
          onChange={this._handleChange}
        />
        <pre
          aria-hidden="true"
          style={{
            ...styles.common,
            ...styles.editor,
            ...styles.highlight,
            ...contentStyle,
          }}
          {...(typeof highlighted === 'string'
            ? { dangerouslySetInnerHTML: { __html: highlighted + '<br />' } }
            : { children: highlighted })}
        />
      </div>
    ) : (
      <pre
        ref={ref => (this.pre = ref)}
        {...commonProps}
        contentEditable="true"
        aria-hidden="true"
        style={{ ...styles.singleLine, ...styles.common }}
        {...(typeof highlighted === 'string'
          ? { dangerouslySetInnerHTML: { __html: highlighted /*+ '<br />'*/ } }
          : { children: highlighted })}
      />
    );

    return (
      <div {...rest} style={{ ...styles.container, ...style }}>
        {editorComponent}
        {/* eslint-disable-next-line react/no-danger */}
        <style type="text/css" dangerouslySetInnerHTML={{ __html: cssText }} />
      </div>
    );
  }
}

const styles = {
  container: {
    position: 'relative',
    textAlign: 'left',
    boxSizing: 'border-box',
    padding: 0,
    overflow: 'hidden',
  },
  textarea: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    width: '100%',
    resize: 'none',
    color: 'inherit',
    overflow: 'hidden',
    MozOsxFontSmoothing: 'grayscale',
    WebkitFontSmoothing: 'antialiased',
    WebkitTextFillColor: 'transparent',
  },
  highlight: {
    position: 'relative',
    pointerEvents: 'none',
  },
  editor: {
    whiteSpace: 'pre-wrap',
  },
  singleLine: {
    whiteSpace: 'pre',
    outline: 'none',
  },
  common: {
    wordBreak: 'break-all',
    overflowWrap: 'anywhere',
    overflow: 'hidden',
    margin: 0,
    border: 0,
    background: 'none',
    boxSizing: 'inherit',
    display: 'inherit',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    fontStyle: 'inherit',
    fontVariantLigatures: 'inherit',
    fontWeight: 'inherit',
    letterSpacing: 'inherit',
    lineHeight: 'inherit',
    tabSize: 'inherit',
    textIndent: 'inherit',
    textRendering: 'inherit',
    textTransform: 'inherit',
  },
};
