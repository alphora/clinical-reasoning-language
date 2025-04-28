"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConceptReferenceContext = exports.ConceptIdentifierContext = exports.ActivityReferenceContext = exports.ActivityIdentifierContext = exports.TerminologyReferenceContext = exports.TerminologyIdentifierContext = exports.DecisionReferenceContext = exports.DecisionIdentifierContext = exports.IdentifierContext = exports.GroupExpressionContext = exports.ConceptAtomContext = exports.AtomContext = exports.InformalNotContext = exports.InformalAndContext = exports.InformalOrContext = exports.InferredFromExpressionContext = exports.InferredFromDescriptiveLogicContext = exports.PatternStatementContext = exports.InferredFromConceptReferenceContext = exports.DefinitionLogicContext = exports.DefinitionConceptContext = exports.InferredBodyContext = exports.InferredFromLineContext = exports.CodedFromLineContext = exports.EvidenceLineContext = exports.ValueTypeLineContext = exports.TypeLineContext = exports.ConceptBodyContext = exports.ConceptStatementContext = exports.ActivityStatementContext = exports.TerminologySystemCodeContext = exports.TerminologyValuesetContext = exports.TerminologyStatementContext = exports.UseStatementContext = exports.DoStatementContext = exports.ActionStatementContext = exports.BlockActionContext = exports.NestedWhenBlockContext = exports.BlockStatementContext = exports.SingleActionStatementContext = exports.BlockBodyContext = exports.AnyOrAllClauseContext = exports.WhenSingleActionContext = exports.WhenWithBodyContext = exports.WhenBlockContext = exports.DecisionBodyContext = exports.DecisionStatementContext = exports.StatementContext = exports.CpglContext = exports.CPGLParser = void 0;
exports.RationaleContext = exports.ActivityTypeValueContext = exports.PatternNameContext = exports.BacktickStringContext = void 0;
const ATN_1 = require("antlr4ts/atn/ATN");
const ATNDeserializer_1 = require("antlr4ts/atn/ATNDeserializer");
const FailedPredicateException_1 = require("antlr4ts/FailedPredicateException");
const NoViableAltException_1 = require("antlr4ts/NoViableAltException");
const Parser_1 = require("antlr4ts/Parser");
const ParserRuleContext_1 = require("antlr4ts/ParserRuleContext");
const ParserATNSimulator_1 = require("antlr4ts/atn/ParserATNSimulator");
const RecognitionException_1 = require("antlr4ts/RecognitionException");
const Token_1 = require("antlr4ts/Token");
const VocabularyImpl_1 = require("antlr4ts/VocabularyImpl");
const Utils = __importStar(require("antlr4ts/misc/Utils"));
class CPGLParser extends Parser_1.Parser {
    get vocabulary() {
        return CPGLParser.VOCABULARY;
    }
    get grammarFileName() { return "CPGLParser.g4"; }
    get ruleNames() { return CPGLParser.ruleNames; }
    get serializedATN() { return CPGLParser._serializedATN; }
    createFailedPredicateException(predicate, message) {
        return new FailedPredicateException_1.FailedPredicateException(this, predicate, message);
    }
    constructor(input) {
        super(input);
        this._interp = new ParserATNSimulator_1.ParserATNSimulator(CPGLParser._ATN, this);
    }
    cpgl() {
        let _localctx = new CpglContext(this._ctx, this.state);
        this.enterRule(_localctx, 0, CPGLParser.RULE_cpgl);
        try {
            let _alt;
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 93;
                this._errHandler.sync(this);
                _alt = this.interpreter.adaptivePredict(this._input, 0, this._ctx);
                while (_alt !== 2 && _alt !== ATN_1.ATN.INVALID_ALT_NUMBER) {
                    if (_alt === 1) {
                        {
                            {
                                this.state = 90;
                                this.statement();
                            }
                        }
                    }
                    this.state = 95;
                    this._errHandler.sync(this);
                    _alt = this.interpreter.adaptivePredict(this._input, 0, this._ctx);
                }
                this.state = 96;
                this.match(CPGLParser.EOF);
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    statement() {
        let _localctx = new StatementContext(this._ctx, this.state);
        this.enterRule(_localctx, 2, CPGLParser.RULE_statement);
        try {
            this.state = 102;
            this._errHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this._input, 1, this._ctx)) {
                case 1:
                    this.enterOuterAlt(_localctx, 1);
                    {
                        this.state = 98;
                        this.decisionStatement();
                    }
                    break;
                case 2:
                    this.enterOuterAlt(_localctx, 2);
                    {
                        this.state = 99;
                        this.terminologyStatement();
                    }
                    break;
                case 3:
                    this.enterOuterAlt(_localctx, 3);
                    {
                        this.state = 100;
                        this.activityStatement();
                    }
                    break;
                case 4:
                    this.enterOuterAlt(_localctx, 4);
                    {
                        this.state = 101;
                        this.conceptStatement();
                    }
                    break;
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    decisionStatement() {
        let _localctx = new DecisionStatementContext(this._ctx, this.state);
        this.enterRule(_localctx, 4, CPGLParser.RULE_decisionStatement);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 104;
                this.match(CPGLParser.DECISION);
                this.state = 105;
                this.decisionIdentifier();
                this.state = 106;
                this.match(CPGLParser.COLON);
                this.state = 107;
                this.decisionBody();
                this.state = 108;
                this.match(CPGLParser.DONE);
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    decisionBody() {
        let _localctx = new DecisionBodyContext(this._ctx, this.state);
        this.enterRule(_localctx, 6, CPGLParser.RULE_decisionBody);
        try {
            let _alt;
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 111;
                this._errHandler.sync(this);
                _alt = 1;
                do {
                    switch (_alt) {
                        case 1:
                            {
                                {
                                    this.state = 110;
                                    this.whenBlock();
                                }
                            }
                            break;
                        default:
                            throw new NoViableAltException_1.NoViableAltException(this);
                    }
                    this.state = 113;
                    this._errHandler.sync(this);
                    _alt = this.interpreter.adaptivePredict(this._input, 2, this._ctx);
                } while (_alt !== 2 && _alt !== ATN_1.ATN.INVALID_ALT_NUMBER);
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    whenBlock() {
        let _localctx = new WhenBlockContext(this._ctx, this.state);
        this.enterRule(_localctx, 8, CPGLParser.RULE_whenBlock);
        try {
            this.state = 125;
            this._errHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this._input, 3, this._ctx)) {
                case 1:
                    _localctx = new WhenWithBodyContext(_localctx);
                    this.enterOuterAlt(_localctx, 1);
                    {
                        this.state = 115;
                        this.match(CPGLParser.WHEN);
                        this.state = 116;
                        this.conceptReference();
                        this.state = 117;
                        this.match(CPGLParser.THEN);
                        this.state = 118;
                        this.blockBody();
                    }
                    break;
                case 2:
                    _localctx = new WhenSingleActionContext(_localctx);
                    this.enterOuterAlt(_localctx, 2);
                    {
                        this.state = 120;
                        this.match(CPGLParser.WHEN);
                        this.state = 121;
                        this.conceptReference();
                        this.state = 122;
                        this.match(CPGLParser.THEN);
                        this.state = 123;
                        this.singleActionStatement();
                    }
                    break;
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    anyOrAllClause() {
        let _localctx = new AnyOrAllClauseContext(this._ctx, this.state);
        this.enterRule(_localctx, 10, CPGLParser.RULE_anyOrAllClause);
        let _la;
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 127;
                _la = this._input.LA(1);
                if (!(_la === CPGLParser.ALL || _la === CPGLParser.ANY)) {
                    this._errHandler.recoverInline(this);
                }
                else {
                    if (this._input.LA(1) === Token_1.Token.EOF) {
                        this.matchedEOF = true;
                    }
                    this._errHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 128;
                this.match(CPGLParser.COLON);
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    blockBody() {
        let _localctx = new BlockBodyContext(this._ctx, this.state);
        this.enterRule(_localctx, 12, CPGLParser.RULE_blockBody);
        try {
            let _alt;
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 130;
                this.match(CPGLParser.COLON);
                {
                    this.state = 132;
                    this._errHandler.sync(this);
                    switch (this.interpreter.adaptivePredict(this._input, 4, this._ctx)) {
                        case 1:
                            {
                                this.state = 131;
                                this.anyOrAllClause();
                            }
                            break;
                    }
                    this.state = 135;
                    this._errHandler.sync(this);
                    _alt = 1;
                    do {
                        switch (_alt) {
                            case 1:
                                {
                                    {
                                        this.state = 134;
                                        this.blockStatement();
                                    }
                                }
                                break;
                            default:
                                throw new NoViableAltException_1.NoViableAltException(this);
                        }
                        this.state = 137;
                        this._errHandler.sync(this);
                        _alt = this.interpreter.adaptivePredict(this._input, 5, this._ctx);
                    } while (_alt !== 2 && _alt !== ATN_1.ATN.INVALID_ALT_NUMBER);
                }
                this.state = 139;
                this.match(CPGLParser.DONE);
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    singleActionStatement() {
        let _localctx = new SingleActionStatementContext(this._ctx, this.state);
        this.enterRule(_localctx, 14, CPGLParser.RULE_singleActionStatement);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 143;
                this._errHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this._input, 6, this._ctx)) {
                    case 1:
                        {
                            this.state = 141;
                            this.doStatement();
                        }
                        break;
                    case 2:
                        {
                            this.state = 142;
                            this.useStatement();
                        }
                        break;
                }
                this.state = 145;
                this.match(CPGLParser.DOT);
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    blockStatement() {
        let _localctx = new BlockStatementContext(this._ctx, this.state);
        this.enterRule(_localctx, 16, CPGLParser.RULE_blockStatement);
        try {
            this.state = 149;
            this._errHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this._input, 7, this._ctx)) {
                case 1:
                    _localctx = new NestedWhenBlockContext(_localctx);
                    this.enterOuterAlt(_localctx, 1);
                    {
                        this.state = 147;
                        this.whenBlock();
                    }
                    break;
                case 2:
                    _localctx = new BlockActionContext(_localctx);
                    this.enterOuterAlt(_localctx, 2);
                    {
                        this.state = 148;
                        this.actionStatement();
                    }
                    break;
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    actionStatement() {
        let _localctx = new ActionStatementContext(this._ctx, this.state);
        this.enterRule(_localctx, 18, CPGLParser.RULE_actionStatement);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 153;
                this._errHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this._input, 8, this._ctx)) {
                    case 1:
                        {
                            this.state = 151;
                            this.doStatement();
                        }
                        break;
                    case 2:
                        {
                            this.state = 152;
                            this.useStatement();
                        }
                        break;
                }
                this.state = 155;
                this.match(CPGLParser.DOT);
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    doStatement() {
        let _localctx = new DoStatementContext(this._ctx, this.state);
        this.enterRule(_localctx, 20, CPGLParser.RULE_doStatement);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 157;
                this.match(CPGLParser.DO);
                this.state = 158;
                this.activityReference();
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    useStatement() {
        let _localctx = new UseStatementContext(this._ctx, this.state);
        this.enterRule(_localctx, 22, CPGLParser.RULE_useStatement);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 160;
                this.match(CPGLParser.USE);
                this.state = 161;
                this.decisionReference();
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    terminologyStatement() {
        let _localctx = new TerminologyStatementContext(this._ctx, this.state);
        this.enterRule(_localctx, 24, CPGLParser.RULE_terminologyStatement);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 163;
                this.match(CPGLParser.TERMINOLOGY);
                this.state = 164;
                this.terminologyIdentifier();
                this.state = 168;
                this._errHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this._input, 9, this._ctx)) {
                    case 1:
                        {
                            this.state = 165;
                            this.terminologyValueset();
                        }
                        break;
                    case 2:
                        {
                            this.state = 166;
                            this.backtickString();
                        }
                        break;
                    case 3:
                        {
                            this.state = 167;
                            this.terminologySystemCode();
                        }
                        break;
                }
                this.state = 170;
                this.match(CPGLParser.DOT);
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    terminologyValueset() {
        let _localctx = new TerminologyValuesetContext(this._ctx, this.state);
        this.enterRule(_localctx, 26, CPGLParser.RULE_terminologyValueset);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 172;
                this.match(CPGLParser.VALUESET);
                this.state = 173;
                this.identifier();
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    terminologySystemCode() {
        let _localctx = new TerminologySystemCodeContext(this._ctx, this.state);
        this.enterRule(_localctx, 28, CPGLParser.RULE_terminologySystemCode);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 175;
                this.match(CPGLParser.SYSTEM);
                this.state = 176;
                this.backtickString();
                this.state = 177;
                this.match(CPGLParser.CODE);
                this.state = 178;
                this.backtickString();
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    activityStatement() {
        let _localctx = new ActivityStatementContext(this._ctx, this.state);
        this.enterRule(_localctx, 30, CPGLParser.RULE_activityStatement);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 180;
                this.match(CPGLParser.ACTIVITY);
                this.state = 181;
                this.activityIdentifier();
                this.state = 182;
                this.match(CPGLParser.PERFORM);
                this.state = 183;
                this.match(CPGLParser.ACTIVITY_TYPE);
                this.state = 189;
                this._errHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this._input, 11, this._ctx)) {
                    case 1:
                        {
                            this.state = 184;
                            this.match(CPGLParser.WITH);
                            this.state = 187;
                            this._errHandler.sync(this);
                            switch (this.interpreter.adaptivePredict(this._input, 10, this._ctx)) {
                                case 1:
                                    {
                                        this.state = 185;
                                        this.terminologyReference();
                                    }
                                    break;
                                case 2:
                                    {
                                        this.state = 186;
                                        this.activityTypeValue();
                                    }
                                    break;
                            }
                        }
                        break;
                }
                this.state = 193;
                this._errHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this._input, 12, this._ctx)) {
                    case 1:
                        {
                            this.state = 191;
                            this.match(CPGLParser.BECAUSE);
                            this.state = 192;
                            this.rationale();
                        }
                        break;
                }
                this.state = 195;
                this.match(CPGLParser.DOT);
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    conceptStatement() {
        let _localctx = new ConceptStatementContext(this._ctx, this.state);
        this.enterRule(_localctx, 32, CPGLParser.RULE_conceptStatement);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 197;
                this.match(CPGLParser.CONCEPT);
                this.state = 198;
                this.conceptIdentifier();
                this.state = 199;
                this.match(CPGLParser.COLON);
                this.state = 200;
                this.conceptBody();
                this.state = 201;
                this.match(CPGLParser.DONE);
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    conceptBody() {
        let _localctx = new ConceptBodyContext(this._ctx, this.state);
        this.enterRule(_localctx, 34, CPGLParser.RULE_conceptBody);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 203;
                this.typeLine();
                this.state = 204;
                this.valueTypeLine();
                this.state = 206;
                this._errHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this._input, 13, this._ctx)) {
                    case 1:
                        {
                            this.state = 205;
                            this.evidenceLine();
                        }
                        break;
                }
                this.state = 210;
                this._errHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this._input, 14, this._ctx)) {
                    case 1:
                        {
                            this.state = 208;
                            this.codedFromLine();
                        }
                        break;
                    case 2:
                        {
                            this.state = 209;
                            this.inferredFromLine();
                        }
                        break;
                }
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    typeLine() {
        let _localctx = new TypeLineContext(this._ctx, this.state);
        this.enterRule(_localctx, 36, CPGLParser.RULE_typeLine);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 212;
                this.match(CPGLParser.TYPE);
                this.state = 213;
                this.match(CPGLParser.IS);
                this.state = 214;
                this.match(CPGLParser.CONCEPT_TYPE);
                this.state = 215;
                this.match(CPGLParser.DOT);
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    valueTypeLine() {
        let _localctx = new ValueTypeLineContext(this._ctx, this.state);
        this.enterRule(_localctx, 38, CPGLParser.RULE_valueTypeLine);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 217;
                this.match(CPGLParser.VALUETYPE);
                this.state = 218;
                this.match(CPGLParser.IS);
                this.state = 219;
                this.match(CPGLParser.CONCEPT_VALUE_TYPE);
                this.state = 220;
                this.match(CPGLParser.DOT);
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    evidenceLine() {
        let _localctx = new EvidenceLineContext(this._ctx, this.state);
        this.enterRule(_localctx, 40, CPGLParser.RULE_evidenceLine);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 222;
                this.match(CPGLParser.EVIDENCE);
                this.state = 223;
                this.match(CPGLParser.IS);
                this.state = 224;
                this.backtickString();
                this.state = 225;
                this.match(CPGLParser.DOT);
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    codedFromLine() {
        let _localctx = new CodedFromLineContext(this._ctx, this.state);
        this.enterRule(_localctx, 42, CPGLParser.RULE_codedFromLine);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 227;
                this.match(CPGLParser.CODED);
                this.state = 228;
                this.match(CPGLParser.FROM);
                this.state = 229;
                this.terminologyReference();
                this.state = 230;
                this.match(CPGLParser.DOT);
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    inferredFromLine() {
        let _localctx = new InferredFromLineContext(this._ctx, this.state);
        this.enterRule(_localctx, 44, CPGLParser.RULE_inferredFromLine);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 232;
                this.match(CPGLParser.INFERRED);
                this.state = 233;
                this.match(CPGLParser.FROM);
                this.state = 234;
                this.inferredBody();
                this.state = 235;
                this.match(CPGLParser.DOT);
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    inferredBody() {
        let _localctx = new InferredBodyContext(this._ctx, this.state);
        this.enterRule(_localctx, 46, CPGLParser.RULE_inferredBody);
        try {
            this.state = 239;
            this._errHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this._input, 15, this._ctx)) {
                case 1:
                    _localctx = new DefinitionConceptContext(_localctx);
                    this.enterOuterAlt(_localctx, 1);
                    {
                        this.state = 237;
                        this.inferredFromConceptReference();
                    }
                    break;
                case 2:
                    _localctx = new DefinitionLogicContext(_localctx);
                    this.enterOuterAlt(_localctx, 2);
                    {
                        this.state = 238;
                        this.inferredFromDescriptiveLogic();
                    }
                    break;
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    inferredFromConceptReference() {
        let _localctx = new InferredFromConceptReferenceContext(this._ctx, this.state);
        this.enterRule(_localctx, 48, CPGLParser.RULE_inferredFromConceptReference);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 241;
                this.conceptReference();
                this.state = 243;
                this._errHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this._input, 16, this._ctx)) {
                    case 1:
                        {
                            this.state = 242;
                            this.patternStatement();
                        }
                        break;
                }
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    patternStatement() {
        let _localctx = new PatternStatementContext(this._ctx, this.state);
        this.enterRule(_localctx, 50, CPGLParser.RULE_patternStatement);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 245;
                this.match(CPGLParser.APPLY);
                this.state = 246;
                this.match(CPGLParser.PATTERN);
                this.state = 247;
                this.patternName();
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    inferredFromDescriptiveLogic() {
        let _localctx = new InferredFromDescriptiveLogicContext(this._ctx, this.state);
        this.enterRule(_localctx, 52, CPGLParser.RULE_inferredFromDescriptiveLogic);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 249;
                this.match(CPGLParser.LPAREN);
                this.state = 250;
                this.inferredFromExpression();
                this.state = 251;
                this.match(CPGLParser.RPAREN);
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    inferredFromExpression() {
        let _localctx = new InferredFromExpressionContext(this._ctx, this.state);
        this.enterRule(_localctx, 54, CPGLParser.RULE_inferredFromExpression);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 253;
                this.informalOr();
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    informalOr() {
        let _localctx = new InformalOrContext(this._ctx, this.state);
        this.enterRule(_localctx, 56, CPGLParser.RULE_informalOr);
        try {
            let _alt;
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 255;
                this.informalAnd();
                this.state = 260;
                this._errHandler.sync(this);
                _alt = this.interpreter.adaptivePredict(this._input, 17, this._ctx);
                while (_alt !== 2 && _alt !== ATN_1.ATN.INVALID_ALT_NUMBER) {
                    if (_alt === 1) {
                        {
                            {
                                this.state = 256;
                                this.match(CPGLParser.OR);
                                this.state = 257;
                                this.informalAnd();
                            }
                        }
                    }
                    this.state = 262;
                    this._errHandler.sync(this);
                    _alt = this.interpreter.adaptivePredict(this._input, 17, this._ctx);
                }
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    informalAnd() {
        let _localctx = new InformalAndContext(this._ctx, this.state);
        this.enterRule(_localctx, 58, CPGLParser.RULE_informalAnd);
        try {
            let _alt;
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 263;
                this.informalNot();
                this.state = 268;
                this._errHandler.sync(this);
                _alt = this.interpreter.adaptivePredict(this._input, 18, this._ctx);
                while (_alt !== 2 && _alt !== ATN_1.ATN.INVALID_ALT_NUMBER) {
                    if (_alt === 1) {
                        {
                            {
                                this.state = 264;
                                this.match(CPGLParser.AND);
                                this.state = 265;
                                this.informalNot();
                            }
                        }
                    }
                    this.state = 270;
                    this._errHandler.sync(this);
                    _alt = this.interpreter.adaptivePredict(this._input, 18, this._ctx);
                }
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    informalNot() {
        let _localctx = new InformalNotContext(this._ctx, this.state);
        this.enterRule(_localctx, 60, CPGLParser.RULE_informalNot);
        try {
            this.state = 274;
            this._errHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this._input, 19, this._ctx)) {
                case 1:
                    this.enterOuterAlt(_localctx, 1);
                    {
                        this.state = 271;
                        this.match(CPGLParser.NOT);
                        this.state = 272;
                        this.informalNot();
                    }
                    break;
                case 2:
                    this.enterOuterAlt(_localctx, 2);
                    {
                        this.state = 273;
                        this.atom();
                    }
                    break;
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    atom() {
        let _localctx = new AtomContext(this._ctx, this.state);
        this.enterRule(_localctx, 62, CPGLParser.RULE_atom);
        try {
            this.state = 281;
            this._errHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this._input, 20, this._ctx)) {
                case 1:
                    _localctx = new ConceptAtomContext(_localctx);
                    this.enterOuterAlt(_localctx, 1);
                    {
                        this.state = 276;
                        this.conceptReference();
                    }
                    break;
                case 2:
                    _localctx = new GroupExpressionContext(_localctx);
                    this.enterOuterAlt(_localctx, 2);
                    {
                        this.state = 277;
                        this.match(CPGLParser.LPAREN);
                        this.state = 278;
                        this.inferredFromExpression();
                        this.state = 279;
                        this.match(CPGLParser.RPAREN);
                    }
                    break;
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    identifier() {
        let _localctx = new IdentifierContext(this._ctx, this.state);
        this.enterRule(_localctx, 64, CPGLParser.RULE_identifier);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 283;
                this.match(CPGLParser.QUOTED_STRING);
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    decisionIdentifier() {
        let _localctx = new DecisionIdentifierContext(this._ctx, this.state);
        this.enterRule(_localctx, 66, CPGLParser.RULE_decisionIdentifier);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 285;
                this.identifier();
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    decisionReference() {
        let _localctx = new DecisionReferenceContext(this._ctx, this.state);
        this.enterRule(_localctx, 68, CPGLParser.RULE_decisionReference);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 287;
                this.decisionIdentifier();
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    terminologyIdentifier() {
        let _localctx = new TerminologyIdentifierContext(this._ctx, this.state);
        this.enterRule(_localctx, 70, CPGLParser.RULE_terminologyIdentifier);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 289;
                this.identifier();
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    terminologyReference() {
        let _localctx = new TerminologyReferenceContext(this._ctx, this.state);
        this.enterRule(_localctx, 72, CPGLParser.RULE_terminologyReference);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 291;
                this.identifier();
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    activityIdentifier() {
        let _localctx = new ActivityIdentifierContext(this._ctx, this.state);
        this.enterRule(_localctx, 74, CPGLParser.RULE_activityIdentifier);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 293;
                this.identifier();
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    activityReference() {
        let _localctx = new ActivityReferenceContext(this._ctx, this.state);
        this.enterRule(_localctx, 76, CPGLParser.RULE_activityReference);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 295;
                this.activityIdentifier();
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    conceptIdentifier() {
        let _localctx = new ConceptIdentifierContext(this._ctx, this.state);
        this.enterRule(_localctx, 78, CPGLParser.RULE_conceptIdentifier);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 297;
                this.identifier();
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    conceptReference() {
        let _localctx = new ConceptReferenceContext(this._ctx, this.state);
        this.enterRule(_localctx, 80, CPGLParser.RULE_conceptReference);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 299;
                this.conceptIdentifier();
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    backtickString() {
        let _localctx = new BacktickStringContext(this._ctx, this.state);
        this.enterRule(_localctx, 82, CPGLParser.RULE_backtickString);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 301;
                this.match(CPGLParser.BACKTICK_STRING);
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    patternName() {
        let _localctx = new PatternNameContext(this._ctx, this.state);
        this.enterRule(_localctx, 84, CPGLParser.RULE_patternName);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 303;
                this.backtickString();
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    activityTypeValue() {
        let _localctx = new ActivityTypeValueContext(this._ctx, this.state);
        this.enterRule(_localctx, 86, CPGLParser.RULE_activityTypeValue);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 305;
                this.backtickString();
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    rationale() {
        let _localctx = new RationaleContext(this._ctx, this.state);
        this.enterRule(_localctx, 88, CPGLParser.RULE_rationale);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 307;
                this.backtickString();
            }
        }
        catch (re) {
            if (re instanceof RecognitionException_1.RecognitionException) {
                _localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            }
            else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return _localctx;
    }
    static get _ATN() {
        if (!CPGLParser.__ATN) {
            CPGLParser.__ATN = new ATNDeserializer_1.ATNDeserializer().deserialize(Utils.toCharArray(CPGLParser._serializedATN));
        }
        return CPGLParser.__ATN;
    }
}
exports.CPGLParser = CPGLParser;
CPGLParser.ACTIVITY = 1;
CPGLParser.ALL = 2;
CPGLParser.AND = 3;
CPGLParser.ANY = 4;
CPGLParser.APPLY = 5;
CPGLParser.BECAUSE = 6;
CPGLParser.CODE = 7;
CPGLParser.CODED = 8;
CPGLParser.CONCEPT = 9;
CPGLParser.DECISION = 10;
CPGLParser.DONE = 11;
CPGLParser.DO = 12;
CPGLParser.EVIDENCE = 13;
CPGLParser.FROM = 14;
CPGLParser.INFERRED = 15;
CPGLParser.IS = 16;
CPGLParser.NOT = 17;
CPGLParser.OR = 18;
CPGLParser.PATTERN = 19;
CPGLParser.PERFORM = 20;
CPGLParser.SYSTEM = 21;
CPGLParser.TERMINOLOGY = 22;
CPGLParser.THEN = 23;
CPGLParser.TYPE = 24;
CPGLParser.USE = 25;
CPGLParser.VALUETYPE = 26;
CPGLParser.VALUESET = 27;
CPGLParser.WHEN = 28;
CPGLParser.WITH = 29;
CPGLParser.ERROR = 30;
CPGLParser.COLON = 31;
CPGLParser.DOT = 32;
CPGLParser.LPAREN = 33;
CPGLParser.RPAREN = 34;
CPGLParser.QUOTED_STRING = 35;
CPGLParser.BACKTICK_STRING = 36;
CPGLParser.WS = 37;
CPGLParser.COMMENT = 38;
CPGLParser.COMMENT_BLOCK = 39;
CPGLParser.ACTIVITY_TYPE = 40;
CPGLParser.ACTIVITY_WS = 41;
CPGLParser.ACTIVITY_COMMENT_BLOCK = 42;
CPGLParser.ACTIVITY_ErrorChar = 43;
CPGLParser.CONCEPT_TYPE = 44;
CPGLParser.CONCEPT_WS = 45;
CPGLParser.CONCEPT_COMMENT_BLOCK = 46;
CPGLParser.CONCEPT_ErrorChar = 47;
CPGLParser.CONCEPT_VALUE_TYPE = 48;
CPGLParser.VALUE_TYPE_WS = 49;
CPGLParser.VALUE_TYPE_COMMENT_BLOCK = 50;
CPGLParser.VALUE_TYPE_ErrorChar = 51;
CPGLParser.RULE_cpgl = 0;
CPGLParser.RULE_statement = 1;
CPGLParser.RULE_decisionStatement = 2;
CPGLParser.RULE_decisionBody = 3;
CPGLParser.RULE_whenBlock = 4;
CPGLParser.RULE_anyOrAllClause = 5;
CPGLParser.RULE_blockBody = 6;
CPGLParser.RULE_singleActionStatement = 7;
CPGLParser.RULE_blockStatement = 8;
CPGLParser.RULE_actionStatement = 9;
CPGLParser.RULE_doStatement = 10;
CPGLParser.RULE_useStatement = 11;
CPGLParser.RULE_terminologyStatement = 12;
CPGLParser.RULE_terminologyValueset = 13;
CPGLParser.RULE_terminologySystemCode = 14;
CPGLParser.RULE_activityStatement = 15;
CPGLParser.RULE_conceptStatement = 16;
CPGLParser.RULE_conceptBody = 17;
CPGLParser.RULE_typeLine = 18;
CPGLParser.RULE_valueTypeLine = 19;
CPGLParser.RULE_evidenceLine = 20;
CPGLParser.RULE_codedFromLine = 21;
CPGLParser.RULE_inferredFromLine = 22;
CPGLParser.RULE_inferredBody = 23;
CPGLParser.RULE_inferredFromConceptReference = 24;
CPGLParser.RULE_patternStatement = 25;
CPGLParser.RULE_inferredFromDescriptiveLogic = 26;
CPGLParser.RULE_inferredFromExpression = 27;
CPGLParser.RULE_informalOr = 28;
CPGLParser.RULE_informalAnd = 29;
CPGLParser.RULE_informalNot = 30;
CPGLParser.RULE_atom = 31;
CPGLParser.RULE_identifier = 32;
CPGLParser.RULE_decisionIdentifier = 33;
CPGLParser.RULE_decisionReference = 34;
CPGLParser.RULE_terminologyIdentifier = 35;
CPGLParser.RULE_terminologyReference = 36;
CPGLParser.RULE_activityIdentifier = 37;
CPGLParser.RULE_activityReference = 38;
CPGLParser.RULE_conceptIdentifier = 39;
CPGLParser.RULE_conceptReference = 40;
CPGLParser.RULE_backtickString = 41;
CPGLParser.RULE_patternName = 42;
CPGLParser.RULE_activityTypeValue = 43;
CPGLParser.RULE_rationale = 44;
CPGLParser.ruleNames = [
    "cpgl", "statement", "decisionStatement", "decisionBody", "whenBlock",
    "anyOrAllClause", "blockBody", "singleActionStatement", "blockStatement",
    "actionStatement", "doStatement", "useStatement", "terminologyStatement",
    "terminologyValueset", "terminologySystemCode", "activityStatement", "conceptStatement",
    "conceptBody", "typeLine", "valueTypeLine", "evidenceLine", "codedFromLine",
    "inferredFromLine", "inferredBody", "inferredFromConceptReference", "patternStatement",
    "inferredFromDescriptiveLogic", "inferredFromExpression", "informalOr",
    "informalAnd", "informalNot", "atom", "identifier", "decisionIdentifier",
    "decisionReference", "terminologyIdentifier", "terminologyReference",
    "activityIdentifier", "activityReference", "conceptIdentifier", "conceptReference",
    "backtickString", "patternName", "activityTypeValue", "rationale",
];
CPGLParser._LITERAL_NAMES = [
    undefined, "'activity'", "'all'", "'and'", "'any'", "'apply'", "'because'",
    "'code'", "'coded'", "'concept'", "'decision'", "'done'", "'do'", "'evidence'",
    "'from'", "'inferred'", undefined, "'not'", "'or'", "'pattern'", "'perform'",
    "'system'", "'terminology'", "'then'", "'type'", "'use'", "'valuetype'",
    "'valueset'", "'when'", "'with'", "'error'", "':'", "'.'", "'('", "')'",
];
CPGLParser._SYMBOLIC_NAMES = [
    undefined, "ACTIVITY", "ALL", "AND", "ANY", "APPLY", "BECAUSE", "CODE",
    "CODED", "CONCEPT", "DECISION", "DONE", "DO", "EVIDENCE", "FROM", "INFERRED",
    "IS", "NOT", "OR", "PATTERN", "PERFORM", "SYSTEM", "TERMINOLOGY", "THEN",
    "TYPE", "USE", "VALUETYPE", "VALUESET", "WHEN", "WITH", "ERROR", "COLON",
    "DOT", "LPAREN", "RPAREN", "QUOTED_STRING", "BACKTICK_STRING", "WS", "COMMENT",
    "COMMENT_BLOCK", "ACTIVITY_TYPE", "ACTIVITY_WS", "ACTIVITY_COMMENT_BLOCK",
    "ACTIVITY_ErrorChar", "CONCEPT_TYPE", "CONCEPT_WS", "CONCEPT_COMMENT_BLOCK",
    "CONCEPT_ErrorChar", "CONCEPT_VALUE_TYPE", "VALUE_TYPE_WS", "VALUE_TYPE_COMMENT_BLOCK",
    "VALUE_TYPE_ErrorChar",
];
CPGLParser.VOCABULARY = new VocabularyImpl_1.VocabularyImpl(CPGLParser._LITERAL_NAMES, CPGLParser._SYMBOLIC_NAMES, []);
CPGLParser._serializedATN = "\x03\uC91D\uCABA\u058D\uAFBA\u4F53\u0607\uEA8B\uC241\x035\u0138\x04\x02" +
    "\t\x02\x04\x03\t\x03\x04\x04\t\x04\x04\x05\t\x05\x04\x06\t\x06\x04\x07" +
    "\t\x07\x04\b\t\b\x04\t\t\t\x04\n\t\n\x04\v\t\v\x04\f\t\f\x04\r\t\r\x04" +
    "\x0E\t\x0E\x04\x0F\t\x0F\x04\x10\t\x10\x04\x11\t\x11\x04\x12\t\x12\x04" +
    "\x13\t\x13\x04\x14\t\x14\x04\x15\t\x15\x04\x16\t\x16\x04\x17\t\x17\x04" +
    "\x18\t\x18\x04\x19\t\x19\x04\x1A\t\x1A\x04\x1B\t\x1B\x04\x1C\t\x1C\x04" +
    "\x1D\t\x1D\x04\x1E\t\x1E\x04\x1F\t\x1F\x04 \t \x04!\t!\x04\"\t\"\x04#" +
    "\t#\x04$\t$\x04%\t%\x04&\t&\x04\'\t\'\x04(\t(\x04)\t)\x04*\t*\x04+\t+" +
    "\x04,\t,\x04-\t-\x04.\t.\x03\x02\x07\x02^\n\x02\f\x02\x0E\x02a\v\x02\x03" +
    "\x02\x03\x02\x03\x03\x03\x03\x03\x03\x03\x03\x05\x03i\n\x03\x03\x04\x03" +
    "\x04\x03\x04\x03\x04\x03\x04\x03\x04\x03\x05\x06\x05r\n\x05\r\x05\x0E" +
    "\x05s\x03\x06\x03\x06\x03\x06\x03\x06\x03\x06\x03\x06\x03\x06\x03\x06" +
    "\x03\x06\x03\x06\x05\x06\x80\n\x06\x03\x07\x03\x07\x03\x07\x03\b\x03\b" +
    "\x05\b\x87\n\b\x03\b\x06\b\x8A\n\b\r\b\x0E\b\x8B\x03\b\x03\b\x03\t\x03" +
    "\t\x05\t\x92\n\t\x03\t\x03\t\x03\n\x03\n\x05\n\x98\n\n\x03\v\x03\v\x05" +
    "\v\x9C\n\v\x03\v\x03\v\x03\f\x03\f\x03\f\x03\r\x03\r\x03\r\x03\x0E\x03" +
    "\x0E\x03\x0E\x03\x0E\x03\x0E\x05\x0E\xAB\n\x0E\x03\x0E\x03\x0E\x03\x0F" +
    "\x03\x0F\x03\x0F\x03\x10\x03\x10\x03\x10\x03\x10\x03\x10\x03\x11\x03\x11" +
    "\x03\x11\x03\x11\x03\x11\x03\x11\x03\x11\x05\x11\xBE\n\x11\x05\x11\xC0" +
    "\n\x11\x03\x11\x03\x11\x05\x11\xC4\n\x11\x03\x11\x03\x11\x03\x12\x03\x12" +
    "\x03\x12\x03\x12\x03\x12\x03\x12\x03\x13\x03\x13\x03\x13\x05\x13\xD1\n" +
    "\x13\x03\x13\x03\x13\x05\x13\xD5\n\x13\x03\x14\x03\x14\x03\x14\x03\x14" +
    "\x03\x14\x03\x15\x03\x15\x03\x15\x03\x15\x03\x15\x03\x16\x03\x16\x03\x16" +
    "\x03\x16\x03\x16\x03\x17\x03\x17\x03\x17\x03\x17\x03\x17\x03\x18\x03\x18" +
    "\x03\x18\x03\x18\x03\x18\x03\x19\x03\x19\x05\x19\xF2\n\x19\x03\x1A\x03" +
    "\x1A\x05\x1A\xF6\n\x1A\x03\x1B\x03\x1B\x03\x1B\x03\x1B\x03\x1C\x03\x1C" +
    "\x03\x1C\x03\x1C\x03\x1D\x03\x1D\x03\x1E\x03\x1E\x03\x1E\x07\x1E\u0105" +
    "\n\x1E\f\x1E\x0E\x1E\u0108\v\x1E\x03\x1F\x03\x1F\x03\x1F\x07\x1F\u010D" +
    "\n\x1F\f\x1F\x0E\x1F\u0110\v\x1F\x03 \x03 \x03 \x05 \u0115\n \x03!\x03" +
    "!\x03!\x03!\x03!\x05!\u011C\n!\x03\"\x03\"\x03#\x03#\x03$\x03$\x03%\x03" +
    "%\x03&\x03&\x03\'\x03\'\x03(\x03(\x03)\x03)\x03*\x03*\x03+\x03+\x03,\x03" +
    ",\x03-\x03-\x03.\x03.\x03.\x02\x02\x02/\x02\x02\x04\x02\x06\x02\b\x02" +
    "\n\x02\f\x02\x0E\x02\x10\x02\x12\x02\x14\x02\x16\x02\x18\x02\x1A\x02\x1C" +
    "\x02\x1E\x02 \x02\"\x02$\x02&\x02(\x02*\x02,\x02.\x020\x022\x024\x026" +
    "\x028\x02:\x02<\x02>\x02@\x02B\x02D\x02F\x02H\x02J\x02L\x02N\x02P\x02" +
    "R\x02T\x02V\x02X\x02Z\x02\x02\x03\x04\x02\x04\x04\x06\x06\x02\u0122\x02" +
    "_\x03\x02\x02\x02\x04h\x03\x02\x02\x02\x06j\x03\x02\x02\x02\bq\x03\x02" +
    "\x02\x02\n\x7F\x03\x02\x02\x02\f\x81\x03\x02\x02\x02\x0E\x84\x03\x02\x02" +
    "\x02\x10\x91\x03\x02\x02\x02\x12\x97\x03\x02\x02\x02\x14\x9B\x03\x02\x02" +
    "\x02\x16\x9F\x03\x02\x02\x02\x18\xA2\x03\x02\x02\x02\x1A\xA5\x03\x02\x02" +
    "\x02\x1C\xAE\x03\x02\x02\x02\x1E\xB1\x03\x02\x02\x02 \xB6\x03\x02\x02" +
    "\x02\"\xC7\x03\x02\x02\x02$\xCD\x03\x02\x02\x02&\xD6\x03\x02\x02\x02(" +
    "\xDB\x03\x02\x02\x02*\xE0\x03\x02\x02\x02,\xE5\x03\x02\x02\x02.\xEA\x03" +
    "\x02\x02\x020\xF1\x03\x02\x02\x022\xF3\x03\x02\x02\x024\xF7\x03\x02\x02" +
    "\x026\xFB\x03\x02\x02\x028\xFF\x03\x02\x02\x02:\u0101\x03\x02\x02\x02" +
    "<\u0109\x03\x02\x02\x02>\u0114\x03\x02\x02\x02@\u011B\x03\x02\x02\x02" +
    "B\u011D\x03\x02\x02\x02D\u011F\x03\x02\x02\x02F\u0121\x03\x02\x02\x02" +
    "H\u0123\x03\x02\x02\x02J\u0125\x03\x02\x02\x02L\u0127\x03\x02\x02\x02" +
    "N\u0129\x03\x02\x02\x02P\u012B\x03\x02\x02\x02R\u012D\x03\x02\x02\x02" +
    "T\u012F\x03\x02\x02\x02V\u0131\x03\x02\x02\x02X\u0133\x03\x02\x02\x02" +
    "Z\u0135\x03\x02\x02\x02\\^\x05\x04\x03\x02]\\\x03\x02\x02\x02^a\x03\x02" +
    "\x02\x02_]\x03\x02\x02\x02_`\x03\x02\x02\x02`b\x03\x02\x02\x02a_\x03\x02" +
    "\x02\x02bc\x07\x02\x02\x03c\x03\x03\x02\x02\x02di\x05\x06\x04\x02ei\x05" +
    "\x1A\x0E\x02fi\x05 \x11\x02gi\x05\"\x12\x02hd\x03\x02\x02\x02he\x03\x02" +
    "\x02\x02hf\x03\x02\x02\x02hg\x03\x02\x02\x02i\x05\x03\x02\x02\x02jk\x07" +
    "\f\x02\x02kl\x05D#\x02lm\x07!\x02\x02mn\x05\b\x05\x02no\x07\r\x02\x02" +
    "o\x07\x03\x02\x02\x02pr\x05\n\x06\x02qp\x03\x02\x02\x02rs\x03\x02\x02" +
    "\x02sq\x03\x02\x02\x02st\x03\x02\x02\x02t\t\x03\x02\x02\x02uv\x07\x1E" +
    "\x02\x02vw\x05R*\x02wx\x07\x19\x02\x02xy\x05\x0E\b\x02y\x80\x03\x02\x02" +
    "\x02z{\x07\x1E\x02\x02{|\x05R*\x02|}\x07\x19\x02\x02}~\x05\x10\t\x02~" +
    "\x80\x03\x02\x02\x02\x7Fu\x03\x02\x02\x02\x7Fz\x03\x02\x02\x02\x80\v\x03" +
    "\x02\x02\x02\x81\x82\t\x02\x02\x02\x82\x83\x07!\x02\x02\x83\r\x03\x02" +
    "\x02\x02\x84\x86\x07!\x02\x02\x85\x87\x05\f\x07\x02\x86\x85\x03\x02\x02" +
    "\x02\x86\x87\x03\x02\x02\x02\x87\x89\x03\x02\x02\x02\x88\x8A\x05\x12\n" +
    "\x02\x89\x88\x03\x02\x02\x02\x8A\x8B\x03\x02\x02\x02\x8B\x89\x03\x02\x02" +
    "\x02\x8B\x8C\x03\x02\x02\x02\x8C\x8D\x03\x02\x02\x02\x8D\x8E\x07\r\x02" +
    "\x02\x8E\x0F\x03\x02\x02\x02\x8F\x92\x05\x16\f\x02\x90\x92\x05\x18\r\x02" +
    "\x91\x8F\x03\x02\x02\x02\x91\x90\x03\x02\x02\x02\x92\x93\x03\x02\x02\x02" +
    "\x93\x94\x07\"\x02\x02\x94\x11\x03\x02\x02\x02\x95\x98\x05\n\x06\x02\x96" +
    "\x98\x05\x14\v\x02\x97\x95\x03\x02\x02\x02\x97\x96\x03\x02\x02\x02\x98" +
    "\x13\x03\x02\x02\x02\x99\x9C\x05\x16\f\x02\x9A\x9C\x05\x18\r\x02\x9B\x99" +
    "\x03\x02\x02\x02\x9B\x9A\x03\x02\x02\x02\x9C\x9D\x03\x02\x02\x02\x9D\x9E" +
    "\x07\"\x02\x02\x9E\x15\x03\x02\x02\x02\x9F\xA0\x07\x0E\x02\x02\xA0\xA1" +
    "\x05N(\x02\xA1\x17\x03\x02\x02\x02\xA2\xA3\x07\x1B\x02\x02\xA3\xA4\x05" +
    "F$\x02\xA4\x19\x03\x02\x02\x02\xA5\xA6\x07\x18\x02\x02\xA6\xAA\x05H%\x02" +
    "\xA7\xAB\x05\x1C\x0F\x02\xA8\xAB\x05T+\x02\xA9\xAB\x05\x1E\x10\x02\xAA" +
    "\xA7\x03\x02\x02\x02\xAA\xA8\x03\x02\x02\x02\xAA\xA9\x03\x02\x02\x02\xAB" +
    "\xAC\x03\x02\x02\x02\xAC\xAD\x07\"\x02\x02\xAD\x1B\x03\x02\x02\x02\xAE" +
    "\xAF\x07\x1D\x02\x02\xAF\xB0\x05B\"\x02\xB0\x1D\x03\x02\x02\x02\xB1\xB2" +
    "\x07\x17\x02\x02\xB2\xB3\x05T+\x02\xB3\xB4\x07\t\x02\x02\xB4\xB5\x05T" +
    "+\x02\xB5\x1F\x03\x02\x02\x02\xB6\xB7\x07\x03\x02\x02\xB7\xB8\x05L\'\x02" +
    "\xB8\xB9\x07\x16\x02\x02\xB9\xBF\x07*\x02\x02\xBA\xBD\x07\x1F\x02\x02" +
    "\xBB\xBE\x05J&\x02\xBC\xBE\x05X-\x02\xBD\xBB\x03\x02\x02\x02\xBD\xBC\x03" +
    "\x02\x02\x02\xBE\xC0\x03\x02\x02\x02\xBF\xBA\x03\x02\x02\x02\xBF\xC0\x03" +
    "\x02\x02\x02\xC0\xC3\x03\x02\x02\x02\xC1\xC2\x07\b\x02\x02\xC2\xC4\x05" +
    "Z.\x02\xC3\xC1\x03\x02\x02\x02\xC3\xC4\x03\x02\x02\x02\xC4\xC5\x03\x02" +
    "\x02\x02\xC5\xC6\x07\"\x02\x02\xC6!\x03\x02\x02\x02\xC7\xC8\x07\v\x02" +
    "\x02\xC8\xC9\x05P)\x02\xC9\xCA\x07!\x02\x02\xCA\xCB\x05$\x13\x02\xCB\xCC" +
    "\x07\r\x02\x02\xCC#\x03\x02\x02\x02\xCD\xCE\x05&\x14\x02\xCE\xD0\x05(" +
    "\x15\x02\xCF\xD1\x05*\x16\x02\xD0\xCF\x03\x02\x02\x02\xD0\xD1\x03\x02" +
    "\x02\x02\xD1\xD4\x03\x02\x02\x02\xD2\xD5\x05,\x17\x02\xD3\xD5\x05.\x18" +
    "\x02\xD4\xD2\x03\x02\x02\x02\xD4\xD3\x03\x02\x02\x02\xD5%\x03\x02\x02" +
    "\x02\xD6\xD7\x07\x1A\x02\x02\xD7\xD8\x07\x12\x02\x02\xD8\xD9\x07.\x02" +
    "\x02\xD9\xDA\x07\"\x02\x02\xDA\'\x03\x02\x02\x02\xDB\xDC\x07\x1C\x02\x02" +
    "\xDC\xDD\x07\x12\x02\x02\xDD\xDE\x072\x02\x02\xDE\xDF\x07\"\x02\x02\xDF" +
    ")\x03\x02\x02\x02\xE0\xE1\x07\x0F\x02\x02\xE1\xE2\x07\x12\x02\x02\xE2" +
    "\xE3\x05T+\x02\xE3\xE4\x07\"\x02\x02\xE4+\x03\x02\x02\x02\xE5\xE6\x07" +
    "\n\x02\x02\xE6\xE7\x07\x10\x02\x02\xE7\xE8\x05J&\x02\xE8\xE9\x07\"\x02" +
    "\x02\xE9-\x03\x02\x02\x02\xEA\xEB\x07\x11\x02\x02\xEB\xEC\x07\x10\x02" +
    "\x02\xEC\xED\x050\x19\x02\xED\xEE\x07\"\x02\x02\xEE/\x03\x02\x02\x02\xEF" +
    "\xF2\x052\x1A\x02\xF0\xF2\x056\x1C\x02\xF1\xEF\x03\x02\x02\x02\xF1\xF0" +
    "\x03\x02\x02\x02\xF21\x03\x02\x02\x02\xF3\xF5\x05R*\x02\xF4\xF6\x054\x1B" +
    "\x02\xF5\xF4\x03\x02\x02\x02\xF5\xF6\x03\x02\x02\x02\xF63\x03\x02\x02" +
    "\x02\xF7\xF8\x07\x07\x02\x02\xF8\xF9\x07\x15\x02\x02\xF9\xFA\x05V,\x02" +
    "\xFA5\x03\x02\x02\x02\xFB\xFC\x07#\x02\x02\xFC\xFD\x058\x1D\x02\xFD\xFE" +
    "\x07$\x02\x02\xFE7\x03\x02\x02\x02\xFF\u0100\x05:\x1E\x02\u01009\x03\x02" +
    "\x02\x02\u0101\u0106\x05<\x1F\x02\u0102\u0103\x07\x14\x02\x02\u0103\u0105" +
    "\x05<\x1F\x02\u0104\u0102\x03\x02\x02\x02\u0105\u0108\x03\x02\x02\x02" +
    "\u0106\u0104\x03\x02\x02\x02\u0106\u0107\x03\x02\x02\x02\u0107;\x03\x02" +
    "\x02\x02\u0108\u0106\x03\x02\x02\x02\u0109\u010E\x05> \x02\u010A\u010B" +
    "\x07\x05\x02\x02\u010B\u010D\x05> \x02\u010C\u010A\x03\x02\x02\x02\u010D" +
    "\u0110\x03\x02\x02\x02\u010E\u010C\x03\x02\x02\x02\u010E\u010F\x03\x02" +
    "\x02\x02\u010F=\x03\x02\x02\x02\u0110\u010E\x03\x02\x02\x02\u0111\u0112" +
    "\x07\x13\x02\x02\u0112\u0115\x05> \x02\u0113\u0115\x05@!\x02\u0114\u0111" +
    "\x03\x02\x02\x02\u0114\u0113\x03\x02\x02\x02\u0115?\x03\x02\x02\x02\u0116" +
    "\u011C\x05R*\x02\u0117\u0118\x07#\x02\x02\u0118\u0119\x058\x1D\x02\u0119" +
    "\u011A\x07$\x02\x02\u011A\u011C\x03\x02\x02\x02\u011B\u0116\x03\x02\x02" +
    "\x02\u011B\u0117\x03\x02\x02\x02\u011CA\x03\x02\x02\x02\u011D\u011E\x07" +
    "%\x02\x02\u011EC\x03\x02\x02\x02\u011F\u0120\x05B\"\x02\u0120E\x03\x02" +
    "\x02\x02\u0121\u0122\x05D#\x02\u0122G\x03\x02\x02\x02\u0123\u0124\x05" +
    "B\"\x02\u0124I\x03\x02\x02\x02\u0125\u0126\x05B\"\x02\u0126K\x03\x02\x02" +
    "\x02\u0127\u0128\x05B\"\x02\u0128M\x03\x02\x02\x02\u0129\u012A\x05L\'" +
    "\x02\u012AO\x03\x02\x02\x02\u012B\u012C\x05B\"\x02\u012CQ\x03\x02\x02" +
    "\x02\u012D\u012E\x05P)\x02\u012ES\x03\x02\x02\x02\u012F\u0130\x07&\x02" +
    "\x02\u0130U\x03\x02\x02\x02\u0131\u0132\x05T+\x02\u0132W\x03\x02\x02\x02" +
    "\u0133\u0134\x05T+\x02\u0134Y\x03\x02\x02\x02\u0135\u0136\x05T+\x02\u0136" +
    "[\x03\x02\x02\x02\x17_hs\x7F\x86\x8B\x91\x97\x9B\xAA\xBD\xBF\xC3\xD0\xD4" +
    "\xF1\xF5\u0106\u010E\u0114\u011B";
class CpglContext extends ParserRuleContext_1.ParserRuleContext {
    EOF() { return this.getToken(CPGLParser.EOF, 0); }
    statement(i) {
        if (i === undefined) {
            return this.getRuleContexts(StatementContext);
        }
        else {
            return this.getRuleContext(i, StatementContext);
        }
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_cpgl; }
    enterRule(listener) {
        if (listener.enterCpgl) {
            listener.enterCpgl(this);
        }
    }
    exitRule(listener) {
        if (listener.exitCpgl) {
            listener.exitCpgl(this);
        }
    }
    accept(visitor) {
        if (visitor.visitCpgl) {
            return visitor.visitCpgl(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.CpglContext = CpglContext;
class StatementContext extends ParserRuleContext_1.ParserRuleContext {
    decisionStatement() {
        return this.tryGetRuleContext(0, DecisionStatementContext);
    }
    terminologyStatement() {
        return this.tryGetRuleContext(0, TerminologyStatementContext);
    }
    activityStatement() {
        return this.tryGetRuleContext(0, ActivityStatementContext);
    }
    conceptStatement() {
        return this.tryGetRuleContext(0, ConceptStatementContext);
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_statement; }
    enterRule(listener) {
        if (listener.enterStatement) {
            listener.enterStatement(this);
        }
    }
    exitRule(listener) {
        if (listener.exitStatement) {
            listener.exitStatement(this);
        }
    }
    accept(visitor) {
        if (visitor.visitStatement) {
            return visitor.visitStatement(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.StatementContext = StatementContext;
class DecisionStatementContext extends ParserRuleContext_1.ParserRuleContext {
    DECISION() { return this.getToken(CPGLParser.DECISION, 0); }
    decisionIdentifier() {
        return this.getRuleContext(0, DecisionIdentifierContext);
    }
    COLON() { return this.getToken(CPGLParser.COLON, 0); }
    decisionBody() {
        return this.getRuleContext(0, DecisionBodyContext);
    }
    DONE() { return this.getToken(CPGLParser.DONE, 0); }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_decisionStatement; }
    enterRule(listener) {
        if (listener.enterDecisionStatement) {
            listener.enterDecisionStatement(this);
        }
    }
    exitRule(listener) {
        if (listener.exitDecisionStatement) {
            listener.exitDecisionStatement(this);
        }
    }
    accept(visitor) {
        if (visitor.visitDecisionStatement) {
            return visitor.visitDecisionStatement(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.DecisionStatementContext = DecisionStatementContext;
class DecisionBodyContext extends ParserRuleContext_1.ParserRuleContext {
    whenBlock(i) {
        if (i === undefined) {
            return this.getRuleContexts(WhenBlockContext);
        }
        else {
            return this.getRuleContext(i, WhenBlockContext);
        }
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_decisionBody; }
    enterRule(listener) {
        if (listener.enterDecisionBody) {
            listener.enterDecisionBody(this);
        }
    }
    exitRule(listener) {
        if (listener.exitDecisionBody) {
            listener.exitDecisionBody(this);
        }
    }
    accept(visitor) {
        if (visitor.visitDecisionBody) {
            return visitor.visitDecisionBody(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.DecisionBodyContext = DecisionBodyContext;
class WhenBlockContext extends ParserRuleContext_1.ParserRuleContext {
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_whenBlock; }
    copyFrom(ctx) {
        super.copyFrom(ctx);
    }
}
exports.WhenBlockContext = WhenBlockContext;
class WhenWithBodyContext extends WhenBlockContext {
    WHEN() { return this.getToken(CPGLParser.WHEN, 0); }
    conceptReference() {
        return this.getRuleContext(0, ConceptReferenceContext);
    }
    THEN() { return this.getToken(CPGLParser.THEN, 0); }
    blockBody() {
        return this.getRuleContext(0, BlockBodyContext);
    }
    constructor(ctx) {
        super(ctx.parent, ctx.invokingState);
        this.copyFrom(ctx);
    }
    enterRule(listener) {
        if (listener.enterWhenWithBody) {
            listener.enterWhenWithBody(this);
        }
    }
    exitRule(listener) {
        if (listener.exitWhenWithBody) {
            listener.exitWhenWithBody(this);
        }
    }
    accept(visitor) {
        if (visitor.visitWhenWithBody) {
            return visitor.visitWhenWithBody(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.WhenWithBodyContext = WhenWithBodyContext;
class WhenSingleActionContext extends WhenBlockContext {
    WHEN() { return this.getToken(CPGLParser.WHEN, 0); }
    conceptReference() {
        return this.getRuleContext(0, ConceptReferenceContext);
    }
    THEN() { return this.getToken(CPGLParser.THEN, 0); }
    singleActionStatement() {
        return this.getRuleContext(0, SingleActionStatementContext);
    }
    constructor(ctx) {
        super(ctx.parent, ctx.invokingState);
        this.copyFrom(ctx);
    }
    enterRule(listener) {
        if (listener.enterWhenSingleAction) {
            listener.enterWhenSingleAction(this);
        }
    }
    exitRule(listener) {
        if (listener.exitWhenSingleAction) {
            listener.exitWhenSingleAction(this);
        }
    }
    accept(visitor) {
        if (visitor.visitWhenSingleAction) {
            return visitor.visitWhenSingleAction(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.WhenSingleActionContext = WhenSingleActionContext;
class AnyOrAllClauseContext extends ParserRuleContext_1.ParserRuleContext {
    COLON() { return this.getToken(CPGLParser.COLON, 0); }
    ANY() { return this.tryGetToken(CPGLParser.ANY, 0); }
    ALL() { return this.tryGetToken(CPGLParser.ALL, 0); }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_anyOrAllClause; }
    enterRule(listener) {
        if (listener.enterAnyOrAllClause) {
            listener.enterAnyOrAllClause(this);
        }
    }
    exitRule(listener) {
        if (listener.exitAnyOrAllClause) {
            listener.exitAnyOrAllClause(this);
        }
    }
    accept(visitor) {
        if (visitor.visitAnyOrAllClause) {
            return visitor.visitAnyOrAllClause(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.AnyOrAllClauseContext = AnyOrAllClauseContext;
class BlockBodyContext extends ParserRuleContext_1.ParserRuleContext {
    COLON() { return this.getToken(CPGLParser.COLON, 0); }
    DONE() { return this.getToken(CPGLParser.DONE, 0); }
    anyOrAllClause() {
        return this.tryGetRuleContext(0, AnyOrAllClauseContext);
    }
    blockStatement(i) {
        if (i === undefined) {
            return this.getRuleContexts(BlockStatementContext);
        }
        else {
            return this.getRuleContext(i, BlockStatementContext);
        }
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_blockBody; }
    enterRule(listener) {
        if (listener.enterBlockBody) {
            listener.enterBlockBody(this);
        }
    }
    exitRule(listener) {
        if (listener.exitBlockBody) {
            listener.exitBlockBody(this);
        }
    }
    accept(visitor) {
        if (visitor.visitBlockBody) {
            return visitor.visitBlockBody(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.BlockBodyContext = BlockBodyContext;
class SingleActionStatementContext extends ParserRuleContext_1.ParserRuleContext {
    DOT() { return this.getToken(CPGLParser.DOT, 0); }
    doStatement() {
        return this.tryGetRuleContext(0, DoStatementContext);
    }
    useStatement() {
        return this.tryGetRuleContext(0, UseStatementContext);
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_singleActionStatement; }
    enterRule(listener) {
        if (listener.enterSingleActionStatement) {
            listener.enterSingleActionStatement(this);
        }
    }
    exitRule(listener) {
        if (listener.exitSingleActionStatement) {
            listener.exitSingleActionStatement(this);
        }
    }
    accept(visitor) {
        if (visitor.visitSingleActionStatement) {
            return visitor.visitSingleActionStatement(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.SingleActionStatementContext = SingleActionStatementContext;
class BlockStatementContext extends ParserRuleContext_1.ParserRuleContext {
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_blockStatement; }
    copyFrom(ctx) {
        super.copyFrom(ctx);
    }
}
exports.BlockStatementContext = BlockStatementContext;
class NestedWhenBlockContext extends BlockStatementContext {
    whenBlock() {
        return this.getRuleContext(0, WhenBlockContext);
    }
    constructor(ctx) {
        super(ctx.parent, ctx.invokingState);
        this.copyFrom(ctx);
    }
    enterRule(listener) {
        if (listener.enterNestedWhenBlock) {
            listener.enterNestedWhenBlock(this);
        }
    }
    exitRule(listener) {
        if (listener.exitNestedWhenBlock) {
            listener.exitNestedWhenBlock(this);
        }
    }
    accept(visitor) {
        if (visitor.visitNestedWhenBlock) {
            return visitor.visitNestedWhenBlock(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.NestedWhenBlockContext = NestedWhenBlockContext;
class BlockActionContext extends BlockStatementContext {
    actionStatement() {
        return this.getRuleContext(0, ActionStatementContext);
    }
    constructor(ctx) {
        super(ctx.parent, ctx.invokingState);
        this.copyFrom(ctx);
    }
    enterRule(listener) {
        if (listener.enterBlockAction) {
            listener.enterBlockAction(this);
        }
    }
    exitRule(listener) {
        if (listener.exitBlockAction) {
            listener.exitBlockAction(this);
        }
    }
    accept(visitor) {
        if (visitor.visitBlockAction) {
            return visitor.visitBlockAction(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.BlockActionContext = BlockActionContext;
class ActionStatementContext extends ParserRuleContext_1.ParserRuleContext {
    DOT() { return this.getToken(CPGLParser.DOT, 0); }
    doStatement() {
        return this.tryGetRuleContext(0, DoStatementContext);
    }
    useStatement() {
        return this.tryGetRuleContext(0, UseStatementContext);
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_actionStatement; }
    enterRule(listener) {
        if (listener.enterActionStatement) {
            listener.enterActionStatement(this);
        }
    }
    exitRule(listener) {
        if (listener.exitActionStatement) {
            listener.exitActionStatement(this);
        }
    }
    accept(visitor) {
        if (visitor.visitActionStatement) {
            return visitor.visitActionStatement(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.ActionStatementContext = ActionStatementContext;
class DoStatementContext extends ParserRuleContext_1.ParserRuleContext {
    DO() { return this.getToken(CPGLParser.DO, 0); }
    activityReference() {
        return this.getRuleContext(0, ActivityReferenceContext);
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_doStatement; }
    enterRule(listener) {
        if (listener.enterDoStatement) {
            listener.enterDoStatement(this);
        }
    }
    exitRule(listener) {
        if (listener.exitDoStatement) {
            listener.exitDoStatement(this);
        }
    }
    accept(visitor) {
        if (visitor.visitDoStatement) {
            return visitor.visitDoStatement(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.DoStatementContext = DoStatementContext;
class UseStatementContext extends ParserRuleContext_1.ParserRuleContext {
    USE() { return this.getToken(CPGLParser.USE, 0); }
    decisionReference() {
        return this.getRuleContext(0, DecisionReferenceContext);
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_useStatement; }
    enterRule(listener) {
        if (listener.enterUseStatement) {
            listener.enterUseStatement(this);
        }
    }
    exitRule(listener) {
        if (listener.exitUseStatement) {
            listener.exitUseStatement(this);
        }
    }
    accept(visitor) {
        if (visitor.visitUseStatement) {
            return visitor.visitUseStatement(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.UseStatementContext = UseStatementContext;
class TerminologyStatementContext extends ParserRuleContext_1.ParserRuleContext {
    TERMINOLOGY() { return this.getToken(CPGLParser.TERMINOLOGY, 0); }
    terminologyIdentifier() {
        return this.getRuleContext(0, TerminologyIdentifierContext);
    }
    DOT() { return this.getToken(CPGLParser.DOT, 0); }
    terminologyValueset() {
        return this.tryGetRuleContext(0, TerminologyValuesetContext);
    }
    backtickString() {
        return this.tryGetRuleContext(0, BacktickStringContext);
    }
    terminologySystemCode() {
        return this.tryGetRuleContext(0, TerminologySystemCodeContext);
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_terminologyStatement; }
    enterRule(listener) {
        if (listener.enterTerminologyStatement) {
            listener.enterTerminologyStatement(this);
        }
    }
    exitRule(listener) {
        if (listener.exitTerminologyStatement) {
            listener.exitTerminologyStatement(this);
        }
    }
    accept(visitor) {
        if (visitor.visitTerminologyStatement) {
            return visitor.visitTerminologyStatement(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.TerminologyStatementContext = TerminologyStatementContext;
class TerminologyValuesetContext extends ParserRuleContext_1.ParserRuleContext {
    VALUESET() { return this.getToken(CPGLParser.VALUESET, 0); }
    identifier() {
        return this.getRuleContext(0, IdentifierContext);
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_terminologyValueset; }
    enterRule(listener) {
        if (listener.enterTerminologyValueset) {
            listener.enterTerminologyValueset(this);
        }
    }
    exitRule(listener) {
        if (listener.exitTerminologyValueset) {
            listener.exitTerminologyValueset(this);
        }
    }
    accept(visitor) {
        if (visitor.visitTerminologyValueset) {
            return visitor.visitTerminologyValueset(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.TerminologyValuesetContext = TerminologyValuesetContext;
class TerminologySystemCodeContext extends ParserRuleContext_1.ParserRuleContext {
    SYSTEM() { return this.getToken(CPGLParser.SYSTEM, 0); }
    backtickString(i) {
        if (i === undefined) {
            return this.getRuleContexts(BacktickStringContext);
        }
        else {
            return this.getRuleContext(i, BacktickStringContext);
        }
    }
    CODE() { return this.getToken(CPGLParser.CODE, 0); }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_terminologySystemCode; }
    enterRule(listener) {
        if (listener.enterTerminologySystemCode) {
            listener.enterTerminologySystemCode(this);
        }
    }
    exitRule(listener) {
        if (listener.exitTerminologySystemCode) {
            listener.exitTerminologySystemCode(this);
        }
    }
    accept(visitor) {
        if (visitor.visitTerminologySystemCode) {
            return visitor.visitTerminologySystemCode(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.TerminologySystemCodeContext = TerminologySystemCodeContext;
class ActivityStatementContext extends ParserRuleContext_1.ParserRuleContext {
    ACTIVITY() { return this.getToken(CPGLParser.ACTIVITY, 0); }
    activityIdentifier() {
        return this.getRuleContext(0, ActivityIdentifierContext);
    }
    PERFORM() { return this.getToken(CPGLParser.PERFORM, 0); }
    ACTIVITY_TYPE() { return this.getToken(CPGLParser.ACTIVITY_TYPE, 0); }
    DOT() { return this.getToken(CPGLParser.DOT, 0); }
    WITH() { return this.tryGetToken(CPGLParser.WITH, 0); }
    BECAUSE() { return this.tryGetToken(CPGLParser.BECAUSE, 0); }
    rationale() {
        return this.tryGetRuleContext(0, RationaleContext);
    }
    terminologyReference() {
        return this.tryGetRuleContext(0, TerminologyReferenceContext);
    }
    activityTypeValue() {
        return this.tryGetRuleContext(0, ActivityTypeValueContext);
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_activityStatement; }
    enterRule(listener) {
        if (listener.enterActivityStatement) {
            listener.enterActivityStatement(this);
        }
    }
    exitRule(listener) {
        if (listener.exitActivityStatement) {
            listener.exitActivityStatement(this);
        }
    }
    accept(visitor) {
        if (visitor.visitActivityStatement) {
            return visitor.visitActivityStatement(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.ActivityStatementContext = ActivityStatementContext;
class ConceptStatementContext extends ParserRuleContext_1.ParserRuleContext {
    CONCEPT() { return this.getToken(CPGLParser.CONCEPT, 0); }
    conceptIdentifier() {
        return this.getRuleContext(0, ConceptIdentifierContext);
    }
    COLON() { return this.getToken(CPGLParser.COLON, 0); }
    conceptBody() {
        return this.getRuleContext(0, ConceptBodyContext);
    }
    DONE() { return this.getToken(CPGLParser.DONE, 0); }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_conceptStatement; }
    enterRule(listener) {
        if (listener.enterConceptStatement) {
            listener.enterConceptStatement(this);
        }
    }
    exitRule(listener) {
        if (listener.exitConceptStatement) {
            listener.exitConceptStatement(this);
        }
    }
    accept(visitor) {
        if (visitor.visitConceptStatement) {
            return visitor.visitConceptStatement(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.ConceptStatementContext = ConceptStatementContext;
class ConceptBodyContext extends ParserRuleContext_1.ParserRuleContext {
    typeLine() {
        return this.getRuleContext(0, TypeLineContext);
    }
    valueTypeLine() {
        return this.getRuleContext(0, ValueTypeLineContext);
    }
    codedFromLine() {
        return this.tryGetRuleContext(0, CodedFromLineContext);
    }
    inferredFromLine() {
        return this.tryGetRuleContext(0, InferredFromLineContext);
    }
    evidenceLine() {
        return this.tryGetRuleContext(0, EvidenceLineContext);
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_conceptBody; }
    enterRule(listener) {
        if (listener.enterConceptBody) {
            listener.enterConceptBody(this);
        }
    }
    exitRule(listener) {
        if (listener.exitConceptBody) {
            listener.exitConceptBody(this);
        }
    }
    accept(visitor) {
        if (visitor.visitConceptBody) {
            return visitor.visitConceptBody(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.ConceptBodyContext = ConceptBodyContext;
class TypeLineContext extends ParserRuleContext_1.ParserRuleContext {
    TYPE() { return this.getToken(CPGLParser.TYPE, 0); }
    IS() { return this.getToken(CPGLParser.IS, 0); }
    CONCEPT_TYPE() { return this.getToken(CPGLParser.CONCEPT_TYPE, 0); }
    DOT() { return this.getToken(CPGLParser.DOT, 0); }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_typeLine; }
    enterRule(listener) {
        if (listener.enterTypeLine) {
            listener.enterTypeLine(this);
        }
    }
    exitRule(listener) {
        if (listener.exitTypeLine) {
            listener.exitTypeLine(this);
        }
    }
    accept(visitor) {
        if (visitor.visitTypeLine) {
            return visitor.visitTypeLine(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.TypeLineContext = TypeLineContext;
class ValueTypeLineContext extends ParserRuleContext_1.ParserRuleContext {
    VALUETYPE() { return this.getToken(CPGLParser.VALUETYPE, 0); }
    IS() { return this.getToken(CPGLParser.IS, 0); }
    CONCEPT_VALUE_TYPE() { return this.getToken(CPGLParser.CONCEPT_VALUE_TYPE, 0); }
    DOT() { return this.getToken(CPGLParser.DOT, 0); }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_valueTypeLine; }
    enterRule(listener) {
        if (listener.enterValueTypeLine) {
            listener.enterValueTypeLine(this);
        }
    }
    exitRule(listener) {
        if (listener.exitValueTypeLine) {
            listener.exitValueTypeLine(this);
        }
    }
    accept(visitor) {
        if (visitor.visitValueTypeLine) {
            return visitor.visitValueTypeLine(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.ValueTypeLineContext = ValueTypeLineContext;
class EvidenceLineContext extends ParserRuleContext_1.ParserRuleContext {
    EVIDENCE() { return this.getToken(CPGLParser.EVIDENCE, 0); }
    IS() { return this.getToken(CPGLParser.IS, 0); }
    backtickString() {
        return this.getRuleContext(0, BacktickStringContext);
    }
    DOT() { return this.getToken(CPGLParser.DOT, 0); }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_evidenceLine; }
    enterRule(listener) {
        if (listener.enterEvidenceLine) {
            listener.enterEvidenceLine(this);
        }
    }
    exitRule(listener) {
        if (listener.exitEvidenceLine) {
            listener.exitEvidenceLine(this);
        }
    }
    accept(visitor) {
        if (visitor.visitEvidenceLine) {
            return visitor.visitEvidenceLine(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.EvidenceLineContext = EvidenceLineContext;
class CodedFromLineContext extends ParserRuleContext_1.ParserRuleContext {
    CODED() { return this.getToken(CPGLParser.CODED, 0); }
    FROM() { return this.getToken(CPGLParser.FROM, 0); }
    terminologyReference() {
        return this.getRuleContext(0, TerminologyReferenceContext);
    }
    DOT() { return this.getToken(CPGLParser.DOT, 0); }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_codedFromLine; }
    enterRule(listener) {
        if (listener.enterCodedFromLine) {
            listener.enterCodedFromLine(this);
        }
    }
    exitRule(listener) {
        if (listener.exitCodedFromLine) {
            listener.exitCodedFromLine(this);
        }
    }
    accept(visitor) {
        if (visitor.visitCodedFromLine) {
            return visitor.visitCodedFromLine(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.CodedFromLineContext = CodedFromLineContext;
class InferredFromLineContext extends ParserRuleContext_1.ParserRuleContext {
    INFERRED() { return this.getToken(CPGLParser.INFERRED, 0); }
    FROM() { return this.getToken(CPGLParser.FROM, 0); }
    inferredBody() {
        return this.getRuleContext(0, InferredBodyContext);
    }
    DOT() { return this.getToken(CPGLParser.DOT, 0); }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_inferredFromLine; }
    enterRule(listener) {
        if (listener.enterInferredFromLine) {
            listener.enterInferredFromLine(this);
        }
    }
    exitRule(listener) {
        if (listener.exitInferredFromLine) {
            listener.exitInferredFromLine(this);
        }
    }
    accept(visitor) {
        if (visitor.visitInferredFromLine) {
            return visitor.visitInferredFromLine(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.InferredFromLineContext = InferredFromLineContext;
class InferredBodyContext extends ParserRuleContext_1.ParserRuleContext {
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_inferredBody; }
    copyFrom(ctx) {
        super.copyFrom(ctx);
    }
}
exports.InferredBodyContext = InferredBodyContext;
class DefinitionConceptContext extends InferredBodyContext {
    inferredFromConceptReference() {
        return this.getRuleContext(0, InferredFromConceptReferenceContext);
    }
    constructor(ctx) {
        super(ctx.parent, ctx.invokingState);
        this.copyFrom(ctx);
    }
    enterRule(listener) {
        if (listener.enterDefinitionConcept) {
            listener.enterDefinitionConcept(this);
        }
    }
    exitRule(listener) {
        if (listener.exitDefinitionConcept) {
            listener.exitDefinitionConcept(this);
        }
    }
    accept(visitor) {
        if (visitor.visitDefinitionConcept) {
            return visitor.visitDefinitionConcept(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.DefinitionConceptContext = DefinitionConceptContext;
class DefinitionLogicContext extends InferredBodyContext {
    inferredFromDescriptiveLogic() {
        return this.getRuleContext(0, InferredFromDescriptiveLogicContext);
    }
    constructor(ctx) {
        super(ctx.parent, ctx.invokingState);
        this.copyFrom(ctx);
    }
    enterRule(listener) {
        if (listener.enterDefinitionLogic) {
            listener.enterDefinitionLogic(this);
        }
    }
    exitRule(listener) {
        if (listener.exitDefinitionLogic) {
            listener.exitDefinitionLogic(this);
        }
    }
    accept(visitor) {
        if (visitor.visitDefinitionLogic) {
            return visitor.visitDefinitionLogic(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.DefinitionLogicContext = DefinitionLogicContext;
class InferredFromConceptReferenceContext extends ParserRuleContext_1.ParserRuleContext {
    conceptReference() {
        return this.getRuleContext(0, ConceptReferenceContext);
    }
    patternStatement() {
        return this.tryGetRuleContext(0, PatternStatementContext);
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_inferredFromConceptReference; }
    enterRule(listener) {
        if (listener.enterInferredFromConceptReference) {
            listener.enterInferredFromConceptReference(this);
        }
    }
    exitRule(listener) {
        if (listener.exitInferredFromConceptReference) {
            listener.exitInferredFromConceptReference(this);
        }
    }
    accept(visitor) {
        if (visitor.visitInferredFromConceptReference) {
            return visitor.visitInferredFromConceptReference(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.InferredFromConceptReferenceContext = InferredFromConceptReferenceContext;
class PatternStatementContext extends ParserRuleContext_1.ParserRuleContext {
    APPLY() { return this.getToken(CPGLParser.APPLY, 0); }
    PATTERN() { return this.getToken(CPGLParser.PATTERN, 0); }
    patternName() {
        return this.getRuleContext(0, PatternNameContext);
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_patternStatement; }
    enterRule(listener) {
        if (listener.enterPatternStatement) {
            listener.enterPatternStatement(this);
        }
    }
    exitRule(listener) {
        if (listener.exitPatternStatement) {
            listener.exitPatternStatement(this);
        }
    }
    accept(visitor) {
        if (visitor.visitPatternStatement) {
            return visitor.visitPatternStatement(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.PatternStatementContext = PatternStatementContext;
class InferredFromDescriptiveLogicContext extends ParserRuleContext_1.ParserRuleContext {
    LPAREN() { return this.getToken(CPGLParser.LPAREN, 0); }
    inferredFromExpression() {
        return this.getRuleContext(0, InferredFromExpressionContext);
    }
    RPAREN() { return this.getToken(CPGLParser.RPAREN, 0); }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_inferredFromDescriptiveLogic; }
    enterRule(listener) {
        if (listener.enterInferredFromDescriptiveLogic) {
            listener.enterInferredFromDescriptiveLogic(this);
        }
    }
    exitRule(listener) {
        if (listener.exitInferredFromDescriptiveLogic) {
            listener.exitInferredFromDescriptiveLogic(this);
        }
    }
    accept(visitor) {
        if (visitor.visitInferredFromDescriptiveLogic) {
            return visitor.visitInferredFromDescriptiveLogic(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.InferredFromDescriptiveLogicContext = InferredFromDescriptiveLogicContext;
class InferredFromExpressionContext extends ParserRuleContext_1.ParserRuleContext {
    informalOr() {
        return this.getRuleContext(0, InformalOrContext);
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_inferredFromExpression; }
    enterRule(listener) {
        if (listener.enterInferredFromExpression) {
            listener.enterInferredFromExpression(this);
        }
    }
    exitRule(listener) {
        if (listener.exitInferredFromExpression) {
            listener.exitInferredFromExpression(this);
        }
    }
    accept(visitor) {
        if (visitor.visitInferredFromExpression) {
            return visitor.visitInferredFromExpression(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.InferredFromExpressionContext = InferredFromExpressionContext;
class InformalOrContext extends ParserRuleContext_1.ParserRuleContext {
    informalAnd(i) {
        if (i === undefined) {
            return this.getRuleContexts(InformalAndContext);
        }
        else {
            return this.getRuleContext(i, InformalAndContext);
        }
    }
    OR(i) {
        if (i === undefined) {
            return this.getTokens(CPGLParser.OR);
        }
        else {
            return this.getToken(CPGLParser.OR, i);
        }
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_informalOr; }
    enterRule(listener) {
        if (listener.enterInformalOr) {
            listener.enterInformalOr(this);
        }
    }
    exitRule(listener) {
        if (listener.exitInformalOr) {
            listener.exitInformalOr(this);
        }
    }
    accept(visitor) {
        if (visitor.visitInformalOr) {
            return visitor.visitInformalOr(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.InformalOrContext = InformalOrContext;
class InformalAndContext extends ParserRuleContext_1.ParserRuleContext {
    informalNot(i) {
        if (i === undefined) {
            return this.getRuleContexts(InformalNotContext);
        }
        else {
            return this.getRuleContext(i, InformalNotContext);
        }
    }
    AND(i) {
        if (i === undefined) {
            return this.getTokens(CPGLParser.AND);
        }
        else {
            return this.getToken(CPGLParser.AND, i);
        }
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_informalAnd; }
    enterRule(listener) {
        if (listener.enterInformalAnd) {
            listener.enterInformalAnd(this);
        }
    }
    exitRule(listener) {
        if (listener.exitInformalAnd) {
            listener.exitInformalAnd(this);
        }
    }
    accept(visitor) {
        if (visitor.visitInformalAnd) {
            return visitor.visitInformalAnd(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.InformalAndContext = InformalAndContext;
class InformalNotContext extends ParserRuleContext_1.ParserRuleContext {
    NOT() { return this.tryGetToken(CPGLParser.NOT, 0); }
    informalNot() {
        return this.tryGetRuleContext(0, InformalNotContext);
    }
    atom() {
        return this.tryGetRuleContext(0, AtomContext);
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_informalNot; }
    enterRule(listener) {
        if (listener.enterInformalNot) {
            listener.enterInformalNot(this);
        }
    }
    exitRule(listener) {
        if (listener.exitInformalNot) {
            listener.exitInformalNot(this);
        }
    }
    accept(visitor) {
        if (visitor.visitInformalNot) {
            return visitor.visitInformalNot(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.InformalNotContext = InformalNotContext;
class AtomContext extends ParserRuleContext_1.ParserRuleContext {
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_atom; }
    copyFrom(ctx) {
        super.copyFrom(ctx);
    }
}
exports.AtomContext = AtomContext;
class ConceptAtomContext extends AtomContext {
    conceptReference() {
        return this.getRuleContext(0, ConceptReferenceContext);
    }
    constructor(ctx) {
        super(ctx.parent, ctx.invokingState);
        this.copyFrom(ctx);
    }
    enterRule(listener) {
        if (listener.enterConceptAtom) {
            listener.enterConceptAtom(this);
        }
    }
    exitRule(listener) {
        if (listener.exitConceptAtom) {
            listener.exitConceptAtom(this);
        }
    }
    accept(visitor) {
        if (visitor.visitConceptAtom) {
            return visitor.visitConceptAtom(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.ConceptAtomContext = ConceptAtomContext;
class GroupExpressionContext extends AtomContext {
    LPAREN() { return this.getToken(CPGLParser.LPAREN, 0); }
    inferredFromExpression() {
        return this.getRuleContext(0, InferredFromExpressionContext);
    }
    RPAREN() { return this.getToken(CPGLParser.RPAREN, 0); }
    constructor(ctx) {
        super(ctx.parent, ctx.invokingState);
        this.copyFrom(ctx);
    }
    enterRule(listener) {
        if (listener.enterGroupExpression) {
            listener.enterGroupExpression(this);
        }
    }
    exitRule(listener) {
        if (listener.exitGroupExpression) {
            listener.exitGroupExpression(this);
        }
    }
    accept(visitor) {
        if (visitor.visitGroupExpression) {
            return visitor.visitGroupExpression(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.GroupExpressionContext = GroupExpressionContext;
class IdentifierContext extends ParserRuleContext_1.ParserRuleContext {
    QUOTED_STRING() { return this.getToken(CPGLParser.QUOTED_STRING, 0); }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_identifier; }
    enterRule(listener) {
        if (listener.enterIdentifier) {
            listener.enterIdentifier(this);
        }
    }
    exitRule(listener) {
        if (listener.exitIdentifier) {
            listener.exitIdentifier(this);
        }
    }
    accept(visitor) {
        if (visitor.visitIdentifier) {
            return visitor.visitIdentifier(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.IdentifierContext = IdentifierContext;
class DecisionIdentifierContext extends ParserRuleContext_1.ParserRuleContext {
    identifier() {
        return this.getRuleContext(0, IdentifierContext);
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_decisionIdentifier; }
    enterRule(listener) {
        if (listener.enterDecisionIdentifier) {
            listener.enterDecisionIdentifier(this);
        }
    }
    exitRule(listener) {
        if (listener.exitDecisionIdentifier) {
            listener.exitDecisionIdentifier(this);
        }
    }
    accept(visitor) {
        if (visitor.visitDecisionIdentifier) {
            return visitor.visitDecisionIdentifier(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.DecisionIdentifierContext = DecisionIdentifierContext;
class DecisionReferenceContext extends ParserRuleContext_1.ParserRuleContext {
    decisionIdentifier() {
        return this.getRuleContext(0, DecisionIdentifierContext);
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_decisionReference; }
    enterRule(listener) {
        if (listener.enterDecisionReference) {
            listener.enterDecisionReference(this);
        }
    }
    exitRule(listener) {
        if (listener.exitDecisionReference) {
            listener.exitDecisionReference(this);
        }
    }
    accept(visitor) {
        if (visitor.visitDecisionReference) {
            return visitor.visitDecisionReference(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.DecisionReferenceContext = DecisionReferenceContext;
class TerminologyIdentifierContext extends ParserRuleContext_1.ParserRuleContext {
    identifier() {
        return this.getRuleContext(0, IdentifierContext);
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_terminologyIdentifier; }
    enterRule(listener) {
        if (listener.enterTerminologyIdentifier) {
            listener.enterTerminologyIdentifier(this);
        }
    }
    exitRule(listener) {
        if (listener.exitTerminologyIdentifier) {
            listener.exitTerminologyIdentifier(this);
        }
    }
    accept(visitor) {
        if (visitor.visitTerminologyIdentifier) {
            return visitor.visitTerminologyIdentifier(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.TerminologyIdentifierContext = TerminologyIdentifierContext;
class TerminologyReferenceContext extends ParserRuleContext_1.ParserRuleContext {
    identifier() {
        return this.getRuleContext(0, IdentifierContext);
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_terminologyReference; }
    enterRule(listener) {
        if (listener.enterTerminologyReference) {
            listener.enterTerminologyReference(this);
        }
    }
    exitRule(listener) {
        if (listener.exitTerminologyReference) {
            listener.exitTerminologyReference(this);
        }
    }
    accept(visitor) {
        if (visitor.visitTerminologyReference) {
            return visitor.visitTerminologyReference(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.TerminologyReferenceContext = TerminologyReferenceContext;
class ActivityIdentifierContext extends ParserRuleContext_1.ParserRuleContext {
    identifier() {
        return this.getRuleContext(0, IdentifierContext);
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_activityIdentifier; }
    enterRule(listener) {
        if (listener.enterActivityIdentifier) {
            listener.enterActivityIdentifier(this);
        }
    }
    exitRule(listener) {
        if (listener.exitActivityIdentifier) {
            listener.exitActivityIdentifier(this);
        }
    }
    accept(visitor) {
        if (visitor.visitActivityIdentifier) {
            return visitor.visitActivityIdentifier(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.ActivityIdentifierContext = ActivityIdentifierContext;
class ActivityReferenceContext extends ParserRuleContext_1.ParserRuleContext {
    activityIdentifier() {
        return this.getRuleContext(0, ActivityIdentifierContext);
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_activityReference; }
    enterRule(listener) {
        if (listener.enterActivityReference) {
            listener.enterActivityReference(this);
        }
    }
    exitRule(listener) {
        if (listener.exitActivityReference) {
            listener.exitActivityReference(this);
        }
    }
    accept(visitor) {
        if (visitor.visitActivityReference) {
            return visitor.visitActivityReference(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.ActivityReferenceContext = ActivityReferenceContext;
class ConceptIdentifierContext extends ParserRuleContext_1.ParserRuleContext {
    identifier() {
        return this.getRuleContext(0, IdentifierContext);
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_conceptIdentifier; }
    enterRule(listener) {
        if (listener.enterConceptIdentifier) {
            listener.enterConceptIdentifier(this);
        }
    }
    exitRule(listener) {
        if (listener.exitConceptIdentifier) {
            listener.exitConceptIdentifier(this);
        }
    }
    accept(visitor) {
        if (visitor.visitConceptIdentifier) {
            return visitor.visitConceptIdentifier(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.ConceptIdentifierContext = ConceptIdentifierContext;
class ConceptReferenceContext extends ParserRuleContext_1.ParserRuleContext {
    conceptIdentifier() {
        return this.getRuleContext(0, ConceptIdentifierContext);
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_conceptReference; }
    enterRule(listener) {
        if (listener.enterConceptReference) {
            listener.enterConceptReference(this);
        }
    }
    exitRule(listener) {
        if (listener.exitConceptReference) {
            listener.exitConceptReference(this);
        }
    }
    accept(visitor) {
        if (visitor.visitConceptReference) {
            return visitor.visitConceptReference(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.ConceptReferenceContext = ConceptReferenceContext;
class BacktickStringContext extends ParserRuleContext_1.ParserRuleContext {
    BACKTICK_STRING() { return this.getToken(CPGLParser.BACKTICK_STRING, 0); }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_backtickString; }
    enterRule(listener) {
        if (listener.enterBacktickString) {
            listener.enterBacktickString(this);
        }
    }
    exitRule(listener) {
        if (listener.exitBacktickString) {
            listener.exitBacktickString(this);
        }
    }
    accept(visitor) {
        if (visitor.visitBacktickString) {
            return visitor.visitBacktickString(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.BacktickStringContext = BacktickStringContext;
class PatternNameContext extends ParserRuleContext_1.ParserRuleContext {
    backtickString() {
        return this.getRuleContext(0, BacktickStringContext);
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_patternName; }
    enterRule(listener) {
        if (listener.enterPatternName) {
            listener.enterPatternName(this);
        }
    }
    exitRule(listener) {
        if (listener.exitPatternName) {
            listener.exitPatternName(this);
        }
    }
    accept(visitor) {
        if (visitor.visitPatternName) {
            return visitor.visitPatternName(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.PatternNameContext = PatternNameContext;
class ActivityTypeValueContext extends ParserRuleContext_1.ParserRuleContext {
    backtickString() {
        return this.getRuleContext(0, BacktickStringContext);
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_activityTypeValue; }
    enterRule(listener) {
        if (listener.enterActivityTypeValue) {
            listener.enterActivityTypeValue(this);
        }
    }
    exitRule(listener) {
        if (listener.exitActivityTypeValue) {
            listener.exitActivityTypeValue(this);
        }
    }
    accept(visitor) {
        if (visitor.visitActivityTypeValue) {
            return visitor.visitActivityTypeValue(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.ActivityTypeValueContext = ActivityTypeValueContext;
class RationaleContext extends ParserRuleContext_1.ParserRuleContext {
    backtickString() {
        return this.getRuleContext(0, BacktickStringContext);
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_rationale; }
    enterRule(listener) {
        if (listener.enterRationale) {
            listener.enterRationale(this);
        }
    }
    exitRule(listener) {
        if (listener.exitRationale) {
            listener.exitRationale(this);
        }
    }
    accept(visitor) {
        if (visitor.visitRationale) {
            return visitor.visitRationale(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.RationaleContext = RationaleContext;
//# sourceMappingURL=CPGLParser.js.map