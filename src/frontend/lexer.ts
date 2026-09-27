import { CompileError } from '../diagnostics.js';
import type { Token,TokenStream } from './token.js';

export function lex(source: string): TokenStream {
  const tokens: TokenStream = [];
  Object.defineProperty(tokens,'source',{value:source});
  let i = 0, lineBreak = false, regexpAllowed = true;
  const parentheses:boolean[]=[];
  const fail = (message: string, start = i): never => { throw new CompileError([{ code: 'E_LEX', message, file: '', span: { start, end: Math.max(start + 1, i) } }]); };
  const newline = (c: string) => /[\n\r\u2028\u2029]/.test(c);
  const identifierStart = (c:string) => /^[$_\p{ID_Start}]$/u.test(c);
  const identifierPart = (c:string) => /^[$\u200c\u200d\p{ID_Continue}]$/u.test(c);
  const codePoint = () => i<source.length?String.fromCodePoint(source.codePointAt(i)!):'';
  // Called immediately after the 'u'; positions remain UTF-16 source offsets.
  const unicodeEscape = (start:number):string => {
    if(source[i]==='{') {
      i++;const begin=i;
      while(i<source.length&&/[0-9a-f]/i.test(source[i]!))i++;
      const digits=source.slice(begin,i),value=parseInt(digits,16);
      if(!digits||source[i]!=='}'||value>0x10ffff)fail('Invalid Unicode code point escape',start);
      i++;return String.fromCodePoint(value);
    }
    const digits=source.slice(i,i+4);
    if(digits.length!==4||!/^[0-9a-f]+$/i.test(digits))fail('Invalid Unicode escape',start);
    i+=4;return String.fromCharCode(parseInt(digits,16));
  };
  const push = (kind: Token['kind'], start: number, value?: string|number|bigint) => {
    const text=source.slice(start,i),previous=tokens.at(-1);
    tokens.push({ kind, text, value, span: { start, end: i }, lineBreakBefore: lineBreak }); lineBreak = false;
    if(kind==='punct'&&text==='(')parentheses.push(previous?.kind==='word'&&['if','while','for','with','switch','catch'].includes(String(previous.value)));
    if(kind==='punct'&&text===')'){regexpAllowed=parentheses.pop()??false;return;}
    if(kind==='word'){regexpAllowed=['return','throw','case','delete','void','typeof','instanceof','in','new','yield','await','else','do'].includes(String(value));return;}
    if(kind==='number'||kind==='string'||kind==='regexp'||kind==='templateTail'||kind==='templateNoSub'){regexpAllowed=false;return;}
    regexpAllowed=kind==='punct'&&!['}',']','++','--'].includes(text);
  };
  const templates:{depth:number}[]=[];
  const templateSegment=(start:number,continued:boolean):void=>{
    let cooked:string|undefined='';
    while(i<source.length){
      const char=source[i++]!;
      if(char==='`'){
        push(continued?'templateTail':'templateNoSub',start,cooked);
        if(continued)templates.pop();return;
      }
      if(char==='$'&&source[i]==='{'){
        i++;push(continued?'templateMiddle':'templateHead',start,cooked);
        if(!continued)templates.push({depth:0});return;
      }
      if(char==='\\'){
        if(i>=source.length)fail('Unterminated template',start);
        const escape=source[i++]!;
        if(newline(escape)){if(escape==='\r'&&source[i]==='\n')i++;continue;}
        if(escape==='u'){
          const braced=source[i]==='{';
          const match=braced?/^\{([0-9a-f]+)\}/i.exec(source.slice(i)):null;
          const valid=braced?!!match&&parseInt(match[1]!,16)<=0x10ffff:/^[0-9a-f]{4}$/i.test(source.slice(i,i+4));
          if(valid){const decoded=unicodeEscape(i-2);if(cooked!==undefined)cooked+=decoded;}
          else cooked=undefined;
          continue;
        }
        if(escape==='x'){
          const digits=source.slice(i,i+2);
          if(!/^[0-9a-f]{2}$/i.test(digits)){cooked=undefined;continue;}
          if(cooked!==undefined)cooked+=String.fromCharCode(parseInt(digits,16));i+=2;continue;
        }
        if(/[1-9]/.test(escape)||escape==='0'&&/[0-9]/.test(source[i]??'')){cooked=undefined;continue;}
        const escapes:Record<string,string>={n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v','0':'\0'};
        if(cooked!==undefined)cooked+=escapes[escape]??escape;continue;
      }
      if(char==='\r'){
        if(source[i]==='\n')i++;
        if(cooked!==undefined)cooked+='\n';continue;
      }
      if(cooked!==undefined)cooked+=char;
    }
    fail('Unterminated template',start);
  };
  while (i < source.length) {
    const c = source[i]!;
    if (/\s/.test(c)) { if (newline(c)) lineBreak = true; i++; continue; }
    if (source.startsWith('//', i)) { i += 2; while (i < source.length && !newline(source[i]!)) i++; continue; }
    if (source.startsWith('/*', i)) {
      const start = i; i += 2;
      while (i < source.length && !source.startsWith('*/', i)) { if (newline(source[i]!)) lineBreak = true; i++; }
      if (i === source.length) fail('Unterminated comment', start); i += 2; continue;
    }
    const start = i;
    if(c==='`'){i++;templateSegment(start,false);continue;}
    if(templates.length&&c==='{'){templates[templates.length-1]!.depth++;i++;push('punct',start);continue;}
    if(templates.length&&c==='}'){
      const current=templates[templates.length-1]!;
      i++;push('punct',start);
      if(current.depth>0)current.depth--;
      else templateSegment(i,true);
      continue;
    }
    if (identifierStart(codePoint())||c==='\\') {
      let value='';
      while(i<source.length) {
        let char=codePoint();const valid=value?identifierPart:identifierStart;
        if(char==='\\') {
          const escapeStart=i;i++;
          if(source[i++]!=='u')fail('Identifier escape must be Unicode',escapeStart);
          char=unicodeEscape(escapeStart);
          if(!valid(char))fail('Invalid escaped identifier character',escapeStart);
        } else {
          if(!valid(char))break;
          i+=char.length;
        }
        value+=char;
      }
      push('word',start,value);continue;
    }
    if (/[0-9]/.test(c) || c === '.' && /[0-9]/.test(source[i + 1] ?? '')) {
      const match = /^(?:0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+|(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?)/.exec(source.slice(i));
      if (!match) fail('Invalid numeric literal');
      const spelling = match![0]; i += spelling.length;
      if (/^0[0-9]/.test(spelling)) fail('Legacy octal and leading-zero literals are unsupported', start);
      if(source[i]==='n'&&(/^[0-9]+$/.test(spelling)||/^0[xXbBoO]/.test(spelling))){i++;if(i<source.length&&(identifierPart(codePoint())||source[i]==='\\'))fail('Invalid BigInt literal',start);push('number',start,BigInt(spelling));continue;}
      if (i < source.length && (identifierPart(codePoint())||source[i]==='\\')) fail('Invalid numeric literal', start);
      push('number', start, Number(spelling)); continue;
    }
    if (c === '"' || c === "'") {
      const quote = c; let value = ''; i++;
      while (i < source.length && source[i] !== quote) {
        const char = source[i++]!;
        if (char==='\r'||char==='\n') fail('Unescaped line terminator in string', start);
        if (char !== '\\') { value += char; continue; }
        if (i >= source.length) fail('Unterminated string', start);
        const escape = source[i++]!;
        if (newline(escape)) { if (escape === '\r' && source[i] === '\n') i++; continue; }
        if(escape==='u'){value+=unicodeEscape(i-2);continue;}
        if (escape === 'x') {
          const count = 2, digits = source.slice(i, i + count);
          if (digits.length !== count || !/^[0-9a-f]+$/i.test(digits)) fail('Invalid hexadecimal escape', i - 2);
          value += String.fromCharCode(parseInt(digits, 16)); i += count; continue;
        }
        if (/[0-9]/.test(escape) && (escape !== '0' || /[0-9]/.test(source[i] ?? ''))) fail('Legacy octal escapes are unsupported', i - 2);
        const escapes: Record<string,string> = { n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v','0':'\0', '\\':'\\', '"':'"', "'":"'" };
        value += escapes[escape]??escape;
      }
      if (i >= source.length) fail('Unterminated string', start);
      i++; push('string', start, value); continue;
    }
    if(c==='/'&&regexpAllowed){
      i++;let inClass=false,closed=false;
      while(i<source.length){
        const char=source[i++]!;
        if(newline(char))fail('Unterminated regular expression literal',start);
        if(char==='\\'){
          if(i>=source.length||newline(source[i]!))fail('Unterminated regular expression literal',start);
          i++;continue;
        }
        if(char==='[')inClass=true;
        else if(char===']')inClass=false;
        else if(char==='/'&&!inClass){closed=true;break;}
      }
      if(!closed)fail('Unterminated regular expression literal',start);
      const pattern=source.slice(start+1,i-1),flagStart=i;
      while(i<source.length&&identifierPart(codePoint()))i+=codePoint().length;
      const flags=source.slice(flagStart,i);
      if(!/^[gimsuy]*$/.test(flags)||new Set(flags).size!==flags.length)fail('Invalid regular expression flags',flagStart);
      try{new RegExp(pattern,flags);}catch{fail('Invalid regular expression pattern',start);}
      push('regexp',start);
      tokens[tokens.length-1]!.pattern=pattern;
      tokens[tokens.length-1]!.flags=flags;
      continue;
    }
    if(source.startsWith('?.',i)&&!/[0-9]/.test(source[i+2]??'')){i+=2;push('punct',start);continue;}
    const op = ['>>>=','===','!==','**=','<<=','>>=','>>>','...','==','!=','<=','>=','&&','||','??','++','--','+=','-=','*=','/=','%=','&=','|=','^=','<<','>>','=>','**'].find(op => source.startsWith(op, i));
    if (op) { i += op.length; push('punct', start); continue; }
    if ('{}()[].;,?:+-*/%<>=!&|^~'.includes(c)) { i++; push('punct', start); continue; }
    fail(`Unsupported character ${JSON.stringify(c)}`);
  }
  tokens.push({ kind:'eof', text:'<eof>', span:{start:i,end:i}, lineBreakBefore:lineBreak });
  return tokens;
}
