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
exports.ConceptReferenceContext = exports.ConceptIdentifierContext = exports.ActivityReferenceContext = exports.ActivityIdentifierContext = exports.TerminologyReferenceContext = exports.TerminologyIdentifierContext = exports.DecisionReferenceContext = exports.DecisionIdentifierContext = exports.IdentifierContext = exports.GroupExpressionContext = exports.ConceptAtomContext = exports.AtomContext = exports.InformalNotContext = exports.InformalAndContext = exports.InformalOrContext = exports.InferredByExpressionContext = exports.InferredByDescriptiveLogicContext = exports.InferredByConceptReferenceContext = exports.DefinitionLogicContext = exports.DefinitionConceptContext = exports.InferredBodyContext = exports.InferredByLineContext = exports.CodedByLineContext = exports.ProvenanceLineContext = exports.HasValueTypeLineContext = exports.HasTypeLineContext = exports.ConceptBodyContext = exports.ConceptStatementContext = exports.ActivityStatementContext = exports.TerminologySystemCodeContext = exports.TerminologyUnknownContext = exports.TerminologyValuesetContext = exports.TerminologyStatementContext = exports.UseStatementContext = exports.DoStatementContext = exports.ActionStatementContext = exports.BlockActionContext = exports.NestedWhenBlockContext = exports.BlockStatementContext = exports.SingleActionStatementContext = exports.BlockBodyContext = exports.AnyOrAllClauseContext = exports.WhenSingleActionContext = exports.WhenWithBodyContext = exports.WhenBlockContext = exports.DecisionBodyContext = exports.DecisionStatementContext = exports.StatementContext = exports.CpglContext = exports.CPGLParser = void 0;
exports.StringLiteralContext = exports.PatternReferenceContext = exports.PatternIdentifierContext = void 0;
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
                this.state = 91;
                this._errHandler.sync(this);
                _alt = this.interpreter.adaptivePredict(this._input, 0, this._ctx);
                while (_alt !== 2 && _alt !== ATN_1.ATN.INVALID_ALT_NUMBER) {
                    if (_alt === 1) {
                        {
                            {
                                this.state = 88;
                                this.statement();
                            }
                        }
                    }
                    this.state = 93;
                    this._errHandler.sync(this);
                    _alt = this.interpreter.adaptivePredict(this._input, 0, this._ctx);
                }
                this.state = 94;
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
            this.state = 100;
            this._errHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this._input, 1, this._ctx)) {
                case 1:
                    this.enterOuterAlt(_localctx, 1);
                    {
                        this.state = 96;
                        this.decisionStatement();
                    }
                    break;
                case 2:
                    this.enterOuterAlt(_localctx, 2);
                    {
                        this.state = 97;
                        this.terminologyStatement();
                    }
                    break;
                case 3:
                    this.enterOuterAlt(_localctx, 3);
                    {
                        this.state = 98;
                        this.activityStatement();
                    }
                    break;
                case 4:
                    this.enterOuterAlt(_localctx, 4);
                    {
                        this.state = 99;
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
                this.state = 102;
                this.match(CPGLParser.DECISION);
                this.state = 103;
                this.decisionIdentifier();
                this.state = 104;
                this.match(CPGLParser.COLON);
                this.state = 105;
                this.decisionBody();
                this.state = 106;
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
                this.state = 109;
                this._errHandler.sync(this);
                _alt = 1;
                do {
                    switch (_alt) {
                        case 1:
                            {
                                {
                                    this.state = 108;
                                    this.whenBlock();
                                }
                            }
                            break;
                        default:
                            throw new NoViableAltException_1.NoViableAltException(this);
                    }
                    this.state = 111;
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
            this.state = 123;
            this._errHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this._input, 3, this._ctx)) {
                case 1:
                    _localctx = new WhenWithBodyContext(_localctx);
                    this.enterOuterAlt(_localctx, 1);
                    {
                        this.state = 113;
                        this.match(CPGLParser.WHEN);
                        this.state = 114;
                        this.conceptReference();
                        this.state = 115;
                        this.match(CPGLParser.THEN);
                        this.state = 116;
                        this.blockBody();
                    }
                    break;
                case 2:
                    _localctx = new WhenSingleActionContext(_localctx);
                    this.enterOuterAlt(_localctx, 2);
                    {
                        this.state = 118;
                        this.match(CPGLParser.WHEN);
                        this.state = 119;
                        this.conceptReference();
                        this.state = 120;
                        this.match(CPGLParser.THEN);
                        this.state = 121;
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
                this.state = 125;
                _la = this._input.LA(1);
                if (!(_la === CPGLParser.ANY || _la === CPGLParser.ALL)) {
                    this._errHandler.recoverInline(this);
                }
                else {
                    if (this._input.LA(1) === Token_1.Token.EOF) {
                        this.matchedEOF = true;
                    }
                    this._errHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 126;
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
                this.state = 128;
                this.match(CPGLParser.COLON);
                {
                    this.state = 130;
                    this._errHandler.sync(this);
                    switch (this.interpreter.adaptivePredict(this._input, 4, this._ctx)) {
                        case 1:
                            {
                                this.state = 129;
                                this.anyOrAllClause();
                            }
                            break;
                    }
                    this.state = 133;
                    this._errHandler.sync(this);
                    _alt = 1;
                    do {
                        switch (_alt) {
                            case 1:
                                {
                                    {
                                        this.state = 132;
                                        this.blockStatement();
                                    }
                                }
                                break;
                            default:
                                throw new NoViableAltException_1.NoViableAltException(this);
                        }
                        this.state = 135;
                        this._errHandler.sync(this);
                        _alt = this.interpreter.adaptivePredict(this._input, 5, this._ctx);
                    } while (_alt !== 2 && _alt !== ATN_1.ATN.INVALID_ALT_NUMBER);
                }
                this.state = 137;
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
                this.state = 141;
                this._errHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this._input, 6, this._ctx)) {
                    case 1:
                        {
                            this.state = 139;
                            this.doStatement();
                        }
                        break;
                    case 2:
                        {
                            this.state = 140;
                            this.useStatement();
                        }
                        break;
                }
                this.state = 143;
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
            this.state = 147;
            this._errHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this._input, 7, this._ctx)) {
                case 1:
                    _localctx = new NestedWhenBlockContext(_localctx);
                    this.enterOuterAlt(_localctx, 1);
                    {
                        this.state = 145;
                        this.whenBlock();
                    }
                    break;
                case 2:
                    _localctx = new BlockActionContext(_localctx);
                    this.enterOuterAlt(_localctx, 2);
                    {
                        this.state = 146;
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
                this.state = 151;
                this._errHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this._input, 8, this._ctx)) {
                    case 1:
                        {
                            this.state = 149;
                            this.doStatement();
                        }
                        break;
                    case 2:
                        {
                            this.state = 150;
                            this.useStatement();
                        }
                        break;
                }
                this.state = 153;
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
                this.state = 155;
                this.match(CPGLParser.DO);
                this.state = 156;
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
                this.state = 158;
                this.match(CPGLParser.USE);
                this.state = 159;
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
                this.state = 161;
                this.match(CPGLParser.TERMINOLOGY);
                this.state = 162;
                this.terminologyIdentifier();
                this.state = 166;
                this._errHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this._input, 9, this._ctx)) {
                    case 1:
                        {
                            this.state = 163;
                            this.terminologyValueset();
                        }
                        break;
                    case 2:
                        {
                            this.state = 164;
                            this.terminologyUnknown();
                        }
                        break;
                    case 3:
                        {
                            this.state = 165;
                            this.terminologySystemCode();
                        }
                        break;
                }
                this.state = 168;
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
                this.state = 170;
                this.match(CPGLParser.VALUESET);
                this.state = 171;
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
    terminologyUnknown() {
        let _localctx = new TerminologyUnknownContext(this._ctx, this.state);
        this.enterRule(_localctx, 28, CPGLParser.RULE_terminologyUnknown);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 173;
                this.match(CPGLParser.UNKNOWN);
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
        this.enterRule(_localctx, 30, CPGLParser.RULE_terminologySystemCode);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 175;
                this.match(CPGLParser.SYSTEM);
                this.state = 176;
                this.identifier();
                this.state = 177;
                this.match(CPGLParser.CODE);
                this.state = 178;
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
    activityStatement() {
        let _localctx = new ActivityStatementContext(this._ctx, this.state);
        this.enterRule(_localctx, 32, CPGLParser.RULE_activityStatement);
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
                this.state = 186;
                this._errHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this._input, 10, this._ctx)) {
                    case 1:
                        {
                            this.state = 184;
                            this.match(CPGLParser.OF);
                            this.state = 185;
                            this.terminologyReference();
                        }
                        break;
                }
                this.state = 188;
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
        this.enterRule(_localctx, 34, CPGLParser.RULE_conceptStatement);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 190;
                this.match(CPGLParser.CONCEPT);
                this.state = 191;
                this.conceptIdentifier();
                this.state = 192;
                this.match(CPGLParser.COLON);
                this.state = 193;
                this.conceptBody();
                this.state = 194;
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
        this.enterRule(_localctx, 36, CPGLParser.RULE_conceptBody);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 196;
                this.hasTypeLine();
                this.state = 197;
                this.hasValueTypeLine();
                this.state = 199;
                this._errHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this._input, 11, this._ctx)) {
                    case 1:
                        {
                            this.state = 198;
                            this.provenanceLine();
                        }
                        break;
                }
                this.state = 203;
                this._errHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this._input, 12, this._ctx)) {
                    case 1:
                        {
                            this.state = 201;
                            this.codedByLine();
                        }
                        break;
                    case 2:
                        {
                            this.state = 202;
                            this.inferredByLine();
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
    hasTypeLine() {
        let _localctx = new HasTypeLineContext(this._ctx, this.state);
        this.enterRule(_localctx, 38, CPGLParser.RULE_hasTypeLine);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 205;
                this.match(CPGLParser.HAS);
                this.state = 206;
                this.match(CPGLParser.TYPE);
                this.state = 207;
                this.match(CPGLParser.CONCEPT_TYPE);
                this.state = 208;
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
    hasValueTypeLine() {
        let _localctx = new HasValueTypeLineContext(this._ctx, this.state);
        this.enterRule(_localctx, 40, CPGLParser.RULE_hasValueTypeLine);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 210;
                this.match(CPGLParser.HAS);
                this.state = 211;
                this.match(CPGLParser.VALUETYPE);
                this.state = 212;
                this.match(CPGLParser.CONCEPT_VALUE_TYPE);
                this.state = 213;
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
    provenanceLine() {
        let _localctx = new ProvenanceLineContext(this._ctx, this.state);
        this.enterRule(_localctx, 42, CPGLParser.RULE_provenanceLine);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 215;
                this.match(CPGLParser.HAS);
                this.state = 216;
                this.match(CPGLParser.PROVENANCE);
                this.state = 217;
                this.stringLiteral();
                this.state = 218;
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
    codedByLine() {
        let _localctx = new CodedByLineContext(this._ctx, this.state);
        this.enterRule(_localctx, 44, CPGLParser.RULE_codedByLine);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 220;
                this.match(CPGLParser.CODED);
                this.state = 221;
                this.match(CPGLParser.BY);
                this.state = 222;
                this.terminologyReference();
                this.state = 223;
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
    inferredByLine() {
        let _localctx = new InferredByLineContext(this._ctx, this.state);
        this.enterRule(_localctx, 46, CPGLParser.RULE_inferredByLine);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 225;
                this.match(CPGLParser.INFERRED);
                this.state = 226;
                this.match(CPGLParser.BY);
                this.state = 227;
                this.inferredBody();
                this.state = 228;
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
        this.enterRule(_localctx, 48, CPGLParser.RULE_inferredBody);
        try {
            this.state = 232;
            this._errHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this._input, 13, this._ctx)) {
                case 1:
                    _localctx = new DefinitionConceptContext(_localctx);
                    this.enterOuterAlt(_localctx, 1);
                    {
                        this.state = 230;
                        this.inferredByConceptReference();
                    }
                    break;
                case 2:
                    _localctx = new DefinitionLogicContext(_localctx);
                    this.enterOuterAlt(_localctx, 2);
                    {
                        this.state = 231;
                        this.inferredByDescriptiveLogic();
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
    inferredByConceptReference() {
        let _localctx = new InferredByConceptReferenceContext(this._ctx, this.state);
        this.enterRule(_localctx, 50, CPGLParser.RULE_inferredByConceptReference);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 235;
                this._errHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this._input, 14, this._ctx)) {
                    case 1:
                        {
                            this.state = 234;
                            this.patternReference();
                        }
                        break;
                }
                this.state = 237;
                this.conceptReference();
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
    inferredByDescriptiveLogic() {
        let _localctx = new InferredByDescriptiveLogicContext(this._ctx, this.state);
        this.enterRule(_localctx, 52, CPGLParser.RULE_inferredByDescriptiveLogic);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 239;
                this.match(CPGLParser.LPAREN);
                this.state = 240;
                this.inferredByExpression();
                this.state = 241;
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
    inferredByExpression() {
        let _localctx = new InferredByExpressionContext(this._ctx, this.state);
        this.enterRule(_localctx, 54, CPGLParser.RULE_inferredByExpression);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 243;
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
                this.state = 245;
                this.informalAnd();
                this.state = 250;
                this._errHandler.sync(this);
                _alt = this.interpreter.adaptivePredict(this._input, 15, this._ctx);
                while (_alt !== 2 && _alt !== ATN_1.ATN.INVALID_ALT_NUMBER) {
                    if (_alt === 1) {
                        {
                            {
                                this.state = 246;
                                this.match(CPGLParser.OR);
                                this.state = 247;
                                this.informalAnd();
                            }
                        }
                    }
                    this.state = 252;
                    this._errHandler.sync(this);
                    _alt = this.interpreter.adaptivePredict(this._input, 15, this._ctx);
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
                this.state = 253;
                this.informalNot();
                this.state = 258;
                this._errHandler.sync(this);
                _alt = this.interpreter.adaptivePredict(this._input, 16, this._ctx);
                while (_alt !== 2 && _alt !== ATN_1.ATN.INVALID_ALT_NUMBER) {
                    if (_alt === 1) {
                        {
                            {
                                this.state = 254;
                                this.match(CPGLParser.AND);
                                this.state = 255;
                                this.informalNot();
                            }
                        }
                    }
                    this.state = 260;
                    this._errHandler.sync(this);
                    _alt = this.interpreter.adaptivePredict(this._input, 16, this._ctx);
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
            this.state = 264;
            this._errHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this._input, 17, this._ctx)) {
                case 1:
                    this.enterOuterAlt(_localctx, 1);
                    {
                        this.state = 261;
                        this.match(CPGLParser.NOT);
                        this.state = 262;
                        this.informalNot();
                    }
                    break;
                case 2:
                    this.enterOuterAlt(_localctx, 2);
                    {
                        this.state = 263;
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
            this.state = 271;
            this._errHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this._input, 18, this._ctx)) {
                case 1:
                    _localctx = new ConceptAtomContext(_localctx);
                    this.enterOuterAlt(_localctx, 1);
                    {
                        this.state = 266;
                        this.conceptReference();
                    }
                    break;
                case 2:
                    _localctx = new GroupExpressionContext(_localctx);
                    this.enterOuterAlt(_localctx, 2);
                    {
                        this.state = 267;
                        this.match(CPGLParser.LPAREN);
                        this.state = 268;
                        this.inferredByExpression();
                        this.state = 269;
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
                this.state = 273;
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
                this.state = 275;
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
                this.state = 277;
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
                this.state = 279;
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
                this.state = 281;
                this.terminologyIdentifier();
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
                this.state = 283;
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
                this.state = 285;
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
                this.state = 287;
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
                this.state = 289;
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
    patternIdentifier() {
        let _localctx = new PatternIdentifierContext(this._ctx, this.state);
        this.enterRule(_localctx, 82, CPGLParser.RULE_patternIdentifier);
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
    patternReference() {
        let _localctx = new PatternReferenceContext(this._ctx, this.state);
        this.enterRule(_localctx, 84, CPGLParser.RULE_patternReference);
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 293;
                this.patternIdentifier();
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
    stringLiteral() {
        let _localctx = new StringLiteralContext(this._ctx, this.state);
        this.enterRule(_localctx, 86, CPGLParser.RULE_stringLiteral);
        let _la;
        try {
            this.enterOuterAlt(_localctx, 1);
            {
                this.state = 295;
                _la = this._input.LA(1);
                if (!(_la === CPGLParser.QUOTED_STRING || _la === CPGLParser.STRING)) {
                    this._errHandler.recoverInline(this);
                }
                else {
                    if (this._input.LA(1) === Token_1.Token.EOF) {
                        this.matchedEOF = true;
                    }
                    this._errHandler.reportMatch(this);
                    this.consume();
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
    static get _ATN() {
        if (!CPGLParser.__ATN) {
            CPGLParser.__ATN = new ATNDeserializer_1.ATNDeserializer().deserialize(Utils.toCharArray(CPGLParser._serializedATN));
        }
        return CPGLParser.__ATN;
    }
}
exports.CPGLParser = CPGLParser;
CPGLParser.CONCEPT = 1;
CPGLParser.TYPE = 2;
CPGLParser.VALUETYPE = 3;
CPGLParser.TERMINOLOGY = 4;
CPGLParser.PROVENANCE = 5;
CPGLParser.INFERRED = 6;
CPGLParser.AND = 7;
CPGLParser.OR = 8;
CPGLParser.NOT = 9;
CPGLParser.DONE = 10;
CPGLParser.HAS = 11;
CPGLParser.BY = 12;
CPGLParser.CODED = 13;
CPGLParser.VALUESET = 14;
CPGLParser.PERFORM = 15;
CPGLParser.ACTIVITY = 16;
CPGLParser.OF = 17;
CPGLParser.SYSTEM = 18;
CPGLParser.CODE = 19;
CPGLParser.UNKNOWN = 20;
CPGLParser.DO = 21;
CPGLParser.USE = 22;
CPGLParser.WHEN = 23;
CPGLParser.THEN = 24;
CPGLParser.ANY = 25;
CPGLParser.ALL = 26;
CPGLParser.DECISION = 27;
CPGLParser.ERROR = 28;
CPGLParser.COLON = 29;
CPGLParser.DOT = 30;
CPGLParser.LPAREN = 31;
CPGLParser.RPAREN = 32;
CPGLParser.QUOTED_STRING = 33;
CPGLParser.STRING = 34;
CPGLParser.WS = 35;
CPGLParser.COMMENT = 36;
CPGLParser.COMMENT_BLOCK = 37;
CPGLParser.ACTIVITY_TYPE = 38;
CPGLParser.ACTIVITY_WS = 39;
CPGLParser.ACTIVITY_COMMENT_BLOCK = 40;
CPGLParser.ACTIVITY_ErrorChar = 41;
CPGLParser.CONCEPT_TYPE = 42;
CPGLParser.CONCEPT_WS = 43;
CPGLParser.CONCEPT_COMMENT_BLOCK = 44;
CPGLParser.CONCEPT_ErrorChar = 45;
CPGLParser.CONCEPT_VALUE_TYPE = 46;
CPGLParser.VALUE_TYPE_WS = 47;
CPGLParser.VALUE_TYPE_COMMENT_BLOCK = 48;
CPGLParser.VALUE_TYPE_ErrorChar = 49;
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
CPGLParser.RULE_terminologyUnknown = 14;
CPGLParser.RULE_terminologySystemCode = 15;
CPGLParser.RULE_activityStatement = 16;
CPGLParser.RULE_conceptStatement = 17;
CPGLParser.RULE_conceptBody = 18;
CPGLParser.RULE_hasTypeLine = 19;
CPGLParser.RULE_hasValueTypeLine = 20;
CPGLParser.RULE_provenanceLine = 21;
CPGLParser.RULE_codedByLine = 22;
CPGLParser.RULE_inferredByLine = 23;
CPGLParser.RULE_inferredBody = 24;
CPGLParser.RULE_inferredByConceptReference = 25;
CPGLParser.RULE_inferredByDescriptiveLogic = 26;
CPGLParser.RULE_inferredByExpression = 27;
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
CPGLParser.RULE_patternIdentifier = 41;
CPGLParser.RULE_patternReference = 42;
CPGLParser.RULE_stringLiteral = 43;
CPGLParser.ruleNames = [
    "cpgl", "statement", "decisionStatement", "decisionBody", "whenBlock",
    "anyOrAllClause", "blockBody", "singleActionStatement", "blockStatement",
    "actionStatement", "doStatement", "useStatement", "terminologyStatement",
    "terminologyValueset", "terminologyUnknown", "terminologySystemCode",
    "activityStatement", "conceptStatement", "conceptBody", "hasTypeLine",
    "hasValueTypeLine", "provenanceLine", "codedByLine", "inferredByLine",
    "inferredBody", "inferredByConceptReference", "inferredByDescriptiveLogic",
    "inferredByExpression", "informalOr", "informalAnd", "informalNot", "atom",
    "identifier", "decisionIdentifier", "decisionReference", "terminologyIdentifier",
    "terminologyReference", "activityIdentifier", "activityReference", "conceptIdentifier",
    "conceptReference", "patternIdentifier", "patternReference", "stringLiteral",
];
CPGLParser._LITERAL_NAMES = [
    undefined, "'concept'", "'type'", "'valuetype'", "'terminology'", "'provenance'",
    "'inferred'", "'and'", "'or'", "'not'", "'done'", "'has'", "'by'", "'coded'",
    "'valueset'", "'perform'", "'activity'", "'of'", "'system'", "'code'",
    "'unknown'", "'do'", "'use'", "'when'", "'then'", "'any'", "'all'", "'decision'",
    "'error'", "':'", "'.'", "'('", "')'",
];
CPGLParser._SYMBOLIC_NAMES = [
    undefined, "CONCEPT", "TYPE", "VALUETYPE", "TERMINOLOGY", "PROVENANCE",
    "INFERRED", "AND", "OR", "NOT", "DONE", "HAS", "BY", "CODED", "VALUESET",
    "PERFORM", "ACTIVITY", "OF", "SYSTEM", "CODE", "UNKNOWN", "DO", "USE",
    "WHEN", "THEN", "ANY", "ALL", "DECISION", "ERROR", "COLON", "DOT", "LPAREN",
    "RPAREN", "QUOTED_STRING", "STRING", "WS", "COMMENT", "COMMENT_BLOCK",
    "ACTIVITY_TYPE", "ACTIVITY_WS", "ACTIVITY_COMMENT_BLOCK", "ACTIVITY_ErrorChar",
    "CONCEPT_TYPE", "CONCEPT_WS", "CONCEPT_COMMENT_BLOCK", "CONCEPT_ErrorChar",
    "CONCEPT_VALUE_TYPE", "VALUE_TYPE_WS", "VALUE_TYPE_COMMENT_BLOCK", "VALUE_TYPE_ErrorChar",
];
CPGLParser.VOCABULARY = new VocabularyImpl_1.VocabularyImpl(CPGLParser._LITERAL_NAMES, CPGLParser._SYMBOLIC_NAMES, []);
CPGLParser._serializedATN = "\x03\uC91D\uCABA\u058D\uAFBA\u4F53\u0607\uEA8B\uC241\x033\u012C\x04\x02" +
    "\t\x02\x04\x03\t\x03\x04\x04\t\x04\x04\x05\t\x05\x04\x06\t\x06\x04\x07" +
    "\t\x07\x04\b\t\b\x04\t\t\t\x04\n\t\n\x04\v\t\v\x04\f\t\f\x04\r\t\r\x04" +
    "\x0E\t\x0E\x04\x0F\t\x0F\x04\x10\t\x10\x04\x11\t\x11\x04\x12\t\x12\x04" +
    "\x13\t\x13\x04\x14\t\x14\x04\x15\t\x15\x04\x16\t\x16\x04\x17\t\x17\x04" +
    "\x18\t\x18\x04\x19\t\x19\x04\x1A\t\x1A\x04\x1B\t\x1B\x04\x1C\t\x1C\x04" +
    "\x1D\t\x1D\x04\x1E\t\x1E\x04\x1F\t\x1F\x04 \t \x04!\t!\x04\"\t\"\x04#" +
    "\t#\x04$\t$\x04%\t%\x04&\t&\x04\'\t\'\x04(\t(\x04)\t)\x04*\t*\x04+\t+" +
    "\x04,\t,\x04-\t-\x03\x02\x07\x02\\\n\x02\f\x02\x0E\x02_\v\x02\x03\x02" +
    "\x03\x02\x03\x03\x03\x03\x03\x03\x03\x03\x05\x03g\n\x03\x03\x04\x03\x04" +
    "\x03\x04\x03\x04\x03\x04\x03\x04\x03\x05\x06\x05p\n\x05\r\x05\x0E\x05" +
    "q\x03\x06\x03\x06\x03\x06\x03\x06\x03\x06\x03\x06\x03\x06\x03\x06\x03" +
    "\x06\x03\x06\x05\x06~\n\x06\x03\x07\x03\x07\x03\x07\x03\b\x03\b\x05\b" +
    "\x85\n\b\x03\b\x06\b\x88\n\b\r\b\x0E\b\x89\x03\b\x03\b\x03\t\x03\t\x05" +
    "\t\x90\n\t\x03\t\x03\t\x03\n\x03\n\x05\n\x96\n\n\x03\v\x03\v\x05\v\x9A" +
    "\n\v\x03\v\x03\v\x03\f\x03\f\x03\f\x03\r\x03\r\x03\r\x03\x0E\x03\x0E\x03" +
    "\x0E\x03\x0E\x03\x0E\x05\x0E\xA9\n\x0E\x03\x0E\x03\x0E\x03\x0F\x03\x0F" +
    "\x03\x0F\x03\x10\x03\x10\x03\x11\x03\x11\x03\x11\x03\x11\x03\x11\x03\x12" +
    "\x03\x12\x03\x12\x03\x12\x03\x12\x03\x12\x05\x12\xBD\n\x12\x03\x12\x03" +
    "\x12\x03\x13\x03\x13\x03\x13\x03\x13\x03\x13\x03\x13\x03\x14\x03\x14\x03" +
    "\x14\x05\x14\xCA\n\x14\x03\x14\x03\x14\x05\x14\xCE\n\x14\x03\x15\x03\x15" +
    "\x03\x15\x03\x15\x03\x15\x03\x16\x03\x16\x03\x16\x03\x16\x03\x16\x03\x17" +
    "\x03\x17\x03\x17\x03\x17\x03\x17\x03\x18\x03\x18\x03\x18\x03\x18\x03\x18" +
    "\x03\x19\x03\x19\x03\x19\x03\x19\x03\x19\x03\x1A\x03\x1A\x05\x1A\xEB\n" +
    "\x1A\x03\x1B\x05\x1B\xEE\n\x1B\x03\x1B\x03\x1B\x03\x1C\x03\x1C\x03\x1C" +
    "\x03\x1C\x03\x1D\x03\x1D\x03\x1E\x03\x1E\x03\x1E\x07\x1E\xFB\n\x1E\f\x1E" +
    "\x0E\x1E\xFE\v\x1E\x03\x1F\x03\x1F\x03\x1F\x07\x1F\u0103\n\x1F\f\x1F\x0E" +
    "\x1F\u0106\v\x1F\x03 \x03 \x03 \x05 \u010B\n \x03!\x03!\x03!\x03!\x03" +
    "!\x05!\u0112\n!\x03\"\x03\"\x03#\x03#\x03$\x03$\x03%\x03%\x03&\x03&\x03" +
    "\'\x03\'\x03(\x03(\x03)\x03)\x03*\x03*\x03+\x03+\x03,\x03,\x03-\x03-\x03" +
    "-\x02\x02\x02.\x02\x02\x04\x02\x06\x02\b\x02\n\x02\f\x02\x0E\x02\x10\x02" +
    "\x12\x02\x14\x02\x16\x02\x18\x02\x1A\x02\x1C\x02\x1E\x02 \x02\"\x02$\x02" +
    "&\x02(\x02*\x02,\x02.\x020\x022\x024\x026\x028\x02:\x02<\x02>\x02@\x02" +
    "B\x02D\x02F\x02H\x02J\x02L\x02N\x02P\x02R\x02T\x02V\x02X\x02\x02\x04\x03" +
    "\x02\x1B\x1C\x03\x02#$\x02\u0115\x02]\x03\x02\x02\x02\x04f\x03\x02\x02" +
    "\x02\x06h\x03\x02\x02\x02\bo\x03\x02\x02\x02\n}\x03\x02\x02\x02\f\x7F" +
    "\x03\x02\x02\x02\x0E\x82\x03\x02\x02\x02\x10\x8F\x03\x02\x02\x02\x12\x95" +
    "\x03\x02\x02\x02\x14\x99\x03\x02\x02\x02\x16\x9D\x03\x02\x02\x02\x18\xA0" +
    "\x03\x02\x02\x02\x1A\xA3\x03\x02\x02\x02\x1C\xAC\x03\x02\x02\x02\x1E\xAF" +
    "\x03\x02\x02\x02 \xB1\x03\x02\x02\x02\"\xB6\x03\x02\x02\x02$\xC0\x03\x02" +
    "\x02\x02&\xC6\x03\x02\x02\x02(\xCF\x03\x02\x02\x02*\xD4\x03\x02\x02\x02" +
    ",\xD9\x03\x02\x02\x02.\xDE\x03\x02\x02\x020\xE3\x03\x02\x02\x022\xEA\x03" +
    "\x02\x02\x024\xED\x03\x02\x02\x026\xF1\x03\x02\x02\x028\xF5\x03\x02\x02" +
    "\x02:\xF7\x03\x02\x02\x02<\xFF\x03\x02\x02\x02>\u010A\x03\x02\x02\x02" +
    "@\u0111\x03\x02\x02\x02B\u0113\x03\x02\x02\x02D\u0115\x03\x02\x02\x02" +
    "F\u0117\x03\x02\x02\x02H\u0119\x03\x02\x02\x02J\u011B\x03\x02\x02\x02" +
    "L\u011D\x03\x02\x02\x02N\u011F\x03\x02\x02\x02P\u0121\x03\x02\x02\x02" +
    "R\u0123\x03\x02\x02\x02T\u0125\x03\x02\x02\x02V\u0127\x03\x02\x02\x02" +
    "X\u0129\x03\x02\x02\x02Z\\\x05\x04\x03\x02[Z\x03\x02\x02\x02\\_\x03\x02" +
    "\x02\x02][\x03\x02\x02\x02]^\x03\x02\x02\x02^`\x03\x02\x02\x02_]\x03\x02" +
    "\x02\x02`a\x07\x02\x02\x03a\x03\x03\x02\x02\x02bg\x05\x06\x04\x02cg\x05" +
    "\x1A\x0E\x02dg\x05\"\x12\x02eg\x05$\x13\x02fb\x03\x02\x02\x02fc\x03\x02" +
    "\x02\x02fd\x03\x02\x02\x02fe\x03\x02\x02\x02g\x05\x03\x02\x02\x02hi\x07" +
    "\x1D\x02\x02ij\x05D#\x02jk\x07\x1F\x02\x02kl\x05\b\x05\x02lm\x07\f\x02" +
    "\x02m\x07\x03\x02\x02\x02np\x05\n\x06\x02on\x03\x02\x02\x02pq\x03\x02" +
    "\x02\x02qo\x03\x02\x02\x02qr\x03\x02\x02\x02r\t\x03\x02\x02\x02st\x07" +
    "\x19\x02\x02tu\x05R*\x02uv\x07\x1A\x02\x02vw\x05\x0E\b\x02w~\x03\x02\x02" +
    "\x02xy\x07\x19\x02\x02yz\x05R*\x02z{\x07\x1A\x02\x02{|\x05\x10\t\x02|" +
    "~\x03\x02\x02\x02}s\x03\x02\x02\x02}x\x03\x02\x02\x02~\v\x03\x02\x02\x02" +
    "\x7F\x80\t\x02\x02\x02\x80\x81\x07\x1F\x02\x02\x81\r\x03\x02\x02\x02\x82" +
    "\x84\x07\x1F\x02\x02\x83\x85\x05\f\x07\x02\x84\x83\x03\x02\x02\x02\x84" +
    "\x85\x03\x02\x02\x02\x85\x87\x03\x02\x02\x02\x86\x88\x05\x12\n\x02\x87" +
    "\x86\x03\x02\x02\x02\x88\x89\x03\x02\x02\x02\x89\x87\x03\x02\x02\x02\x89" +
    "\x8A\x03\x02\x02\x02\x8A\x8B\x03\x02\x02\x02\x8B\x8C\x07\f\x02\x02\x8C" +
    "\x0F\x03\x02\x02\x02\x8D\x90\x05\x16\f\x02\x8E\x90\x05\x18\r\x02\x8F\x8D" +
    "\x03\x02\x02\x02\x8F\x8E\x03\x02\x02\x02\x90\x91\x03\x02\x02\x02\x91\x92" +
    "\x07 \x02\x02\x92\x11\x03\x02\x02\x02\x93\x96\x05\n\x06\x02\x94\x96\x05" +
    "\x14\v\x02\x95\x93\x03\x02\x02\x02\x95\x94\x03\x02\x02\x02\x96\x13\x03" +
    "\x02\x02\x02\x97\x9A\x05\x16\f\x02\x98\x9A\x05\x18\r\x02\x99\x97\x03\x02" +
    "\x02\x02\x99\x98\x03\x02\x02\x02\x9A\x9B\x03\x02\x02\x02\x9B\x9C\x07 " +
    "\x02\x02\x9C\x15\x03\x02\x02\x02\x9D\x9E\x07\x17\x02\x02\x9E\x9F\x05N" +
    "(\x02\x9F\x17\x03\x02\x02\x02\xA0\xA1\x07\x18\x02\x02\xA1\xA2\x05F$\x02" +
    "\xA2\x19\x03\x02\x02\x02\xA3\xA4\x07\x06\x02\x02\xA4\xA8\x05H%\x02\xA5" +
    "\xA9\x05\x1C\x0F\x02\xA6\xA9\x05\x1E\x10\x02\xA7\xA9\x05 \x11\x02\xA8" +
    "\xA5\x03\x02\x02\x02\xA8\xA6\x03\x02\x02\x02\xA8\xA7\x03\x02\x02\x02\xA9" +
    "\xAA\x03\x02\x02\x02\xAA\xAB\x07 \x02\x02\xAB\x1B\x03\x02\x02\x02\xAC" +
    "\xAD\x07\x10\x02\x02\xAD\xAE\x05B\"\x02\xAE\x1D\x03\x02\x02\x02\xAF\xB0" +
    "\x07\x16\x02\x02\xB0\x1F\x03\x02\x02\x02\xB1\xB2\x07\x14\x02\x02\xB2\xB3" +
    "\x05B\"\x02\xB3\xB4\x07\x15\x02\x02\xB4\xB5\x05B\"\x02\xB5!\x03\x02\x02" +
    "\x02\xB6\xB7\x07\x12\x02\x02\xB7\xB8\x05L\'\x02\xB8\xB9\x07\x11\x02\x02" +
    "\xB9\xBC\x07(\x02\x02\xBA\xBB\x07\x13\x02\x02\xBB\xBD\x05J&\x02\xBC\xBA" +
    "\x03\x02\x02\x02\xBC\xBD\x03\x02\x02\x02\xBD\xBE\x03\x02\x02\x02\xBE\xBF" +
    "\x07 \x02\x02\xBF#\x03\x02\x02\x02\xC0\xC1\x07\x03\x02\x02\xC1\xC2\x05" +
    "P)\x02\xC2\xC3\x07\x1F\x02\x02\xC3\xC4\x05&\x14\x02\xC4\xC5\x07\f\x02" +
    "\x02\xC5%\x03\x02\x02\x02\xC6\xC7\x05(\x15\x02\xC7\xC9\x05*\x16\x02\xC8" +
    "\xCA\x05,\x17\x02\xC9\xC8\x03\x02\x02\x02\xC9\xCA\x03\x02\x02\x02\xCA" +
    "\xCD\x03\x02\x02\x02\xCB\xCE\x05.\x18\x02\xCC\xCE\x050\x19\x02\xCD\xCB" +
    "\x03\x02\x02\x02\xCD\xCC\x03\x02\x02\x02\xCE\'\x03\x02\x02\x02\xCF\xD0" +
    "\x07\r\x02\x02\xD0\xD1\x07\x04\x02\x02\xD1\xD2\x07,\x02\x02\xD2\xD3\x07" +
    " \x02\x02\xD3)\x03\x02\x02\x02\xD4\xD5\x07\r\x02\x02\xD5\xD6\x07\x05\x02" +
    "\x02\xD6\xD7\x070\x02\x02\xD7\xD8\x07 \x02\x02\xD8+\x03\x02\x02\x02\xD9" +
    "\xDA\x07\r\x02\x02\xDA\xDB\x07\x07\x02\x02\xDB\xDC\x05X-\x02\xDC\xDD\x07" +
    " \x02\x02\xDD-\x03\x02\x02\x02\xDE\xDF\x07\x0F\x02\x02\xDF\xE0\x07\x0E" +
    "\x02\x02\xE0\xE1\x05J&\x02\xE1\xE2\x07 \x02\x02\xE2/\x03\x02\x02\x02\xE3" +
    "\xE4\x07\b\x02\x02\xE4\xE5\x07\x0E\x02\x02\xE5\xE6\x052\x1A\x02\xE6\xE7" +
    "\x07 \x02\x02\xE71\x03\x02\x02\x02\xE8\xEB\x054\x1B\x02\xE9\xEB\x056\x1C" +
    "\x02\xEA\xE8\x03\x02\x02\x02\xEA\xE9\x03\x02\x02\x02\xEB3\x03\x02\x02" +
    "\x02\xEC\xEE\x05V,\x02\xED\xEC\x03\x02\x02\x02\xED\xEE\x03\x02\x02\x02" +
    "\xEE\xEF\x03\x02\x02\x02\xEF\xF0\x05R*\x02\xF05\x03\x02\x02\x02\xF1\xF2" +
    "\x07!\x02\x02\xF2\xF3\x058\x1D\x02\xF3\xF4\x07\"\x02\x02\xF47\x03\x02" +
    "\x02\x02\xF5\xF6\x05:\x1E\x02\xF69\x03\x02\x02\x02\xF7\xFC\x05<\x1F\x02" +
    "\xF8\xF9\x07\n\x02\x02\xF9\xFB\x05<\x1F\x02\xFA\xF8\x03\x02\x02\x02\xFB" +
    "\xFE\x03\x02\x02\x02\xFC\xFA\x03\x02\x02\x02\xFC\xFD\x03\x02\x02\x02\xFD" +
    ";\x03\x02\x02\x02\xFE\xFC\x03\x02\x02\x02\xFF\u0104\x05> \x02\u0100\u0101" +
    "\x07\t\x02\x02\u0101\u0103\x05> \x02\u0102\u0100\x03\x02\x02\x02\u0103" +
    "\u0106\x03\x02\x02\x02\u0104\u0102\x03\x02\x02\x02\u0104\u0105\x03\x02" +
    "\x02\x02\u0105=\x03\x02\x02\x02\u0106\u0104\x03\x02\x02\x02\u0107\u0108" +
    "\x07\v\x02\x02\u0108\u010B\x05> \x02\u0109\u010B\x05@!\x02\u010A\u0107" +
    "\x03\x02\x02\x02\u010A\u0109\x03\x02\x02\x02\u010B?\x03\x02\x02\x02\u010C" +
    "\u0112\x05R*\x02\u010D\u010E\x07!\x02\x02\u010E\u010F\x058\x1D\x02\u010F" +
    "\u0110\x07\"\x02\x02\u0110\u0112\x03\x02\x02\x02\u0111\u010C\x03\x02\x02" +
    "\x02\u0111\u010D\x03\x02\x02\x02\u0112A\x03\x02\x02\x02\u0113\u0114\x07" +
    "#\x02\x02\u0114C\x03\x02\x02\x02\u0115\u0116\x05B\"\x02\u0116E\x03\x02" +
    "\x02\x02\u0117\u0118\x05D#\x02\u0118G\x03\x02\x02\x02\u0119\u011A\x05" +
    "B\"\x02\u011AI\x03\x02\x02\x02\u011B\u011C\x05H%\x02\u011CK\x03\x02\x02" +
    "\x02\u011D\u011E\x05B\"\x02\u011EM\x03\x02\x02\x02\u011F\u0120\x05L\'" +
    "\x02\u0120O\x03\x02\x02\x02\u0121\u0122\x05B\"\x02\u0122Q\x03\x02\x02" +
    "\x02\u0123\u0124\x05P)\x02\u0124S\x03\x02\x02\x02\u0125\u0126\x05B\"\x02" +
    "\u0126U\x03\x02\x02\x02\u0127\u0128\x05T+\x02\u0128W\x03\x02\x02\x02\u0129" +
    "\u012A\t\x03\x02\x02\u012AY\x03\x02\x02\x02\x15]fq}\x84\x89\x8F\x95\x99" +
    "\xA8\xBC\xC9\xCD\xEA\xED\xFC\u0104\u010A\u0111";
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
    terminologyUnknown() {
        return this.tryGetRuleContext(0, TerminologyUnknownContext);
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
class TerminologyUnknownContext extends ParserRuleContext_1.ParserRuleContext {
    UNKNOWN() { return this.getToken(CPGLParser.UNKNOWN, 0); }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_terminologyUnknown; }
    enterRule(listener) {
        if (listener.enterTerminologyUnknown) {
            listener.enterTerminologyUnknown(this);
        }
    }
    exitRule(listener) {
        if (listener.exitTerminologyUnknown) {
            listener.exitTerminologyUnknown(this);
        }
    }
    accept(visitor) {
        if (visitor.visitTerminologyUnknown) {
            return visitor.visitTerminologyUnknown(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.TerminologyUnknownContext = TerminologyUnknownContext;
class TerminologySystemCodeContext extends ParserRuleContext_1.ParserRuleContext {
    SYSTEM() { return this.getToken(CPGLParser.SYSTEM, 0); }
    identifier(i) {
        if (i === undefined) {
            return this.getRuleContexts(IdentifierContext);
        }
        else {
            return this.getRuleContext(i, IdentifierContext);
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
    OF() { return this.tryGetToken(CPGLParser.OF, 0); }
    terminologyReference() {
        return this.tryGetRuleContext(0, TerminologyReferenceContext);
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
    hasTypeLine() {
        return this.getRuleContext(0, HasTypeLineContext);
    }
    hasValueTypeLine() {
        return this.getRuleContext(0, HasValueTypeLineContext);
    }
    codedByLine() {
        return this.tryGetRuleContext(0, CodedByLineContext);
    }
    inferredByLine() {
        return this.tryGetRuleContext(0, InferredByLineContext);
    }
    provenanceLine() {
        return this.tryGetRuleContext(0, ProvenanceLineContext);
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
class HasTypeLineContext extends ParserRuleContext_1.ParserRuleContext {
    HAS() { return this.getToken(CPGLParser.HAS, 0); }
    TYPE() { return this.getToken(CPGLParser.TYPE, 0); }
    CONCEPT_TYPE() { return this.getToken(CPGLParser.CONCEPT_TYPE, 0); }
    DOT() { return this.getToken(CPGLParser.DOT, 0); }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_hasTypeLine; }
    enterRule(listener) {
        if (listener.enterHasTypeLine) {
            listener.enterHasTypeLine(this);
        }
    }
    exitRule(listener) {
        if (listener.exitHasTypeLine) {
            listener.exitHasTypeLine(this);
        }
    }
    accept(visitor) {
        if (visitor.visitHasTypeLine) {
            return visitor.visitHasTypeLine(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.HasTypeLineContext = HasTypeLineContext;
class HasValueTypeLineContext extends ParserRuleContext_1.ParserRuleContext {
    HAS() { return this.getToken(CPGLParser.HAS, 0); }
    VALUETYPE() { return this.getToken(CPGLParser.VALUETYPE, 0); }
    CONCEPT_VALUE_TYPE() { return this.getToken(CPGLParser.CONCEPT_VALUE_TYPE, 0); }
    DOT() { return this.getToken(CPGLParser.DOT, 0); }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_hasValueTypeLine; }
    enterRule(listener) {
        if (listener.enterHasValueTypeLine) {
            listener.enterHasValueTypeLine(this);
        }
    }
    exitRule(listener) {
        if (listener.exitHasValueTypeLine) {
            listener.exitHasValueTypeLine(this);
        }
    }
    accept(visitor) {
        if (visitor.visitHasValueTypeLine) {
            return visitor.visitHasValueTypeLine(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.HasValueTypeLineContext = HasValueTypeLineContext;
class ProvenanceLineContext extends ParserRuleContext_1.ParserRuleContext {
    HAS() { return this.getToken(CPGLParser.HAS, 0); }
    PROVENANCE() { return this.getToken(CPGLParser.PROVENANCE, 0); }
    stringLiteral() {
        return this.getRuleContext(0, StringLiteralContext);
    }
    DOT() { return this.getToken(CPGLParser.DOT, 0); }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_provenanceLine; }
    enterRule(listener) {
        if (listener.enterProvenanceLine) {
            listener.enterProvenanceLine(this);
        }
    }
    exitRule(listener) {
        if (listener.exitProvenanceLine) {
            listener.exitProvenanceLine(this);
        }
    }
    accept(visitor) {
        if (visitor.visitProvenanceLine) {
            return visitor.visitProvenanceLine(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.ProvenanceLineContext = ProvenanceLineContext;
class CodedByLineContext extends ParserRuleContext_1.ParserRuleContext {
    CODED() { return this.getToken(CPGLParser.CODED, 0); }
    BY() { return this.getToken(CPGLParser.BY, 0); }
    terminologyReference() {
        return this.getRuleContext(0, TerminologyReferenceContext);
    }
    DOT() { return this.getToken(CPGLParser.DOT, 0); }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_codedByLine; }
    enterRule(listener) {
        if (listener.enterCodedByLine) {
            listener.enterCodedByLine(this);
        }
    }
    exitRule(listener) {
        if (listener.exitCodedByLine) {
            listener.exitCodedByLine(this);
        }
    }
    accept(visitor) {
        if (visitor.visitCodedByLine) {
            return visitor.visitCodedByLine(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.CodedByLineContext = CodedByLineContext;
class InferredByLineContext extends ParserRuleContext_1.ParserRuleContext {
    INFERRED() { return this.getToken(CPGLParser.INFERRED, 0); }
    BY() { return this.getToken(CPGLParser.BY, 0); }
    inferredBody() {
        return this.getRuleContext(0, InferredBodyContext);
    }
    DOT() { return this.getToken(CPGLParser.DOT, 0); }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_inferredByLine; }
    enterRule(listener) {
        if (listener.enterInferredByLine) {
            listener.enterInferredByLine(this);
        }
    }
    exitRule(listener) {
        if (listener.exitInferredByLine) {
            listener.exitInferredByLine(this);
        }
    }
    accept(visitor) {
        if (visitor.visitInferredByLine) {
            return visitor.visitInferredByLine(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.InferredByLineContext = InferredByLineContext;
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
    inferredByConceptReference() {
        return this.getRuleContext(0, InferredByConceptReferenceContext);
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
    inferredByDescriptiveLogic() {
        return this.getRuleContext(0, InferredByDescriptiveLogicContext);
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
class InferredByConceptReferenceContext extends ParserRuleContext_1.ParserRuleContext {
    conceptReference() {
        return this.getRuleContext(0, ConceptReferenceContext);
    }
    patternReference() {
        return this.tryGetRuleContext(0, PatternReferenceContext);
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_inferredByConceptReference; }
    enterRule(listener) {
        if (listener.enterInferredByConceptReference) {
            listener.enterInferredByConceptReference(this);
        }
    }
    exitRule(listener) {
        if (listener.exitInferredByConceptReference) {
            listener.exitInferredByConceptReference(this);
        }
    }
    accept(visitor) {
        if (visitor.visitInferredByConceptReference) {
            return visitor.visitInferredByConceptReference(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.InferredByConceptReferenceContext = InferredByConceptReferenceContext;
class InferredByDescriptiveLogicContext extends ParserRuleContext_1.ParserRuleContext {
    LPAREN() { return this.getToken(CPGLParser.LPAREN, 0); }
    inferredByExpression() {
        return this.getRuleContext(0, InferredByExpressionContext);
    }
    RPAREN() { return this.getToken(CPGLParser.RPAREN, 0); }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_inferredByDescriptiveLogic; }
    enterRule(listener) {
        if (listener.enterInferredByDescriptiveLogic) {
            listener.enterInferredByDescriptiveLogic(this);
        }
    }
    exitRule(listener) {
        if (listener.exitInferredByDescriptiveLogic) {
            listener.exitInferredByDescriptiveLogic(this);
        }
    }
    accept(visitor) {
        if (visitor.visitInferredByDescriptiveLogic) {
            return visitor.visitInferredByDescriptiveLogic(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.InferredByDescriptiveLogicContext = InferredByDescriptiveLogicContext;
class InferredByExpressionContext extends ParserRuleContext_1.ParserRuleContext {
    informalOr() {
        return this.getRuleContext(0, InformalOrContext);
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_inferredByExpression; }
    enterRule(listener) {
        if (listener.enterInferredByExpression) {
            listener.enterInferredByExpression(this);
        }
    }
    exitRule(listener) {
        if (listener.exitInferredByExpression) {
            listener.exitInferredByExpression(this);
        }
    }
    accept(visitor) {
        if (visitor.visitInferredByExpression) {
            return visitor.visitInferredByExpression(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.InferredByExpressionContext = InferredByExpressionContext;
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
    inferredByExpression() {
        return this.getRuleContext(0, InferredByExpressionContext);
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
    terminologyIdentifier() {
        return this.getRuleContext(0, TerminologyIdentifierContext);
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
class PatternIdentifierContext extends ParserRuleContext_1.ParserRuleContext {
    identifier() {
        return this.getRuleContext(0, IdentifierContext);
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_patternIdentifier; }
    enterRule(listener) {
        if (listener.enterPatternIdentifier) {
            listener.enterPatternIdentifier(this);
        }
    }
    exitRule(listener) {
        if (listener.exitPatternIdentifier) {
            listener.exitPatternIdentifier(this);
        }
    }
    accept(visitor) {
        if (visitor.visitPatternIdentifier) {
            return visitor.visitPatternIdentifier(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.PatternIdentifierContext = PatternIdentifierContext;
class PatternReferenceContext extends ParserRuleContext_1.ParserRuleContext {
    patternIdentifier() {
        return this.getRuleContext(0, PatternIdentifierContext);
    }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_patternReference; }
    enterRule(listener) {
        if (listener.enterPatternReference) {
            listener.enterPatternReference(this);
        }
    }
    exitRule(listener) {
        if (listener.exitPatternReference) {
            listener.exitPatternReference(this);
        }
    }
    accept(visitor) {
        if (visitor.visitPatternReference) {
            return visitor.visitPatternReference(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.PatternReferenceContext = PatternReferenceContext;
class StringLiteralContext extends ParserRuleContext_1.ParserRuleContext {
    STRING() { return this.tryGetToken(CPGLParser.STRING, 0); }
    QUOTED_STRING() { return this.tryGetToken(CPGLParser.QUOTED_STRING, 0); }
    constructor(parent, invokingState) {
        super(parent, invokingState);
    }
    get ruleIndex() { return CPGLParser.RULE_stringLiteral; }
    enterRule(listener) {
        if (listener.enterStringLiteral) {
            listener.enterStringLiteral(this);
        }
    }
    exitRule(listener) {
        if (listener.exitStringLiteral) {
            listener.exitStringLiteral(this);
        }
    }
    accept(visitor) {
        if (visitor.visitStringLiteral) {
            return visitor.visitStringLiteral(this);
        }
        else {
            return visitor.visitChildren(this);
        }
    }
}
exports.StringLiteralContext = StringLiteralContext;
//# sourceMappingURL=CPGLParser.js.map