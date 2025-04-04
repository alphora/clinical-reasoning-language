import { CharStream } from 'antlr4ts/CharStream';
import { Lexer } from 'antlr4ts/Lexer';
import { Token } from 'antlr4ts/Token';
import { CPGLTokenType } from './CPGLTokenType';

/**
 * Custom token implementation for the Clinical Practice Guideline Language (CPGL)
 */
export class CPGLToken implements Token {
    readonly _type: number;
    readonly _text: string;
    readonly _line: number;
    readonly _charPositionInLine: number;
    readonly _channel: number;
    readonly _tokenIndex: number;
    readonly _startIndex: number;
    readonly _stopIndex: number;
    readonly _source: [CharStream, Lexer];

    constructor({
        type,
        text,
        line,
        charPositionInLine,
        channel,
        tokenIndex,
        startIndex,
        stopIndex,
        source
    }: {
        type: number;
        text: string;
        line: number;
        charPositionInLine: number;
        channel: number;
        tokenIndex: number;
        startIndex: number;
        stopIndex: number;
        source: [CharStream, Lexer];
    }) {
        this._type = type;
        this._text = text;
        this._source = source;
        this._channel = channel;
        this._startIndex = startIndex;
        this._stopIndex = stopIndex;
        this._tokenIndex = tokenIndex;
        this._line = line;
        this._charPositionInLine = charPositionInLine;
    }

    get type(): number {
        return this._type;
    }

    get channel(): number {
        return this._channel;
    }

    get start(): number {
        return this._startIndex;
    }

    get stop(): number {
        return this._stopIndex;
    }

    get startIndex(): number {
        return this._startIndex;
    }

    get stopIndex(): number {
        return this._stopIndex;
    }

    get tokenIndex(): number {
        return this._tokenIndex;
    }

    get line(): number {
        return this._line;
    }

    get charPositionInLine(): number {
        return this._charPositionInLine;
    }

    get text(): string {
        return this._text;
    }

    get source(): [CharStream, Lexer] {
        return this._source;
    }

    get inputStream(): CharStream {
        return this._source[0];
    }

    get tokenSource(): Lexer {
        return this._source[1];
    }

    /**
     * Get the name of the token type
     */
    public get typeName(): string {
        return CPGLTokenType[this._type];
    }

    /**
     * Alias for charPositionInLine to match some conventions
     */
    public get column(): number {
        return this._charPositionInLine;
    }

    public toString(): string {
        let channelStr = '';
        if (this._channel > 0) {
            channelStr = `,channel=${this._channel}`;
        }

        let txt = this._text;
        if (txt) {
            txt = txt.replace(/\n/g, '\\n');
            txt = txt.replace(/\r/g, '\\r');
            txt = txt.replace(/\t/g, '\\t');
        } else {
            txt = '<no text>';
        }

        return `[@${this._tokenIndex},${this._startIndex}:${this._stopIndex}='${txt}',<${this._type}>${channelStr},${this._line}:${this._charPositionInLine}]`;
    }
} 