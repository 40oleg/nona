// This source is compiled by Nona itself for the native RegExp fallback.
// It deliberately uses only language features implemented by the frontend.
import {regexpUnicodeData} from './data/regexp-unicode-data.js';
import {fullRuntimeHint} from '../link.js';
import {runtimeRegexpVm,runtimeRegexpVmPrelude} from '../lib/sources.generated.js';

const regexpVmTemplate=runtimeRegexpVm;

/** Which optional parts of the RegExp engine an executable contains (see RuntimeLink). */
export interface RegExpLink {regexp:boolean;unicodeProperties:boolean}
const fullRegExpLink:RegExpLink={regexp:true,unicodeProperties:true};
const rebuild=fullRuntimeHint;
const missingEngine='Nona: this program was compiled without the RegExp engine because its source contains no RegExp literal and does not mention RegExp, match, matchAll or search. '+rebuild;
const missingProperties='Nona: this program was compiled without the Unicode property tables for \\p{...} because its source does not mention them. '+rebuild;

function vmCore(link:RegExpLink):string {
  if(!link.regexp)return '(function(){throw new Error('+JSON.stringify(missingEngine)+')})()';
  const data=link.unicodeProperties?regexpUnicodeData:JSON.stringify({names:null,values:[],folds:(JSON.parse(regexpUnicodeData) as {folds:string}).folds});
  return regexpVmTemplate.replace('@@UNICODE_DATA@@',()=>data).replace('@@NO_PROPERTIES@@',()=>JSON.stringify(missingProperties));
}

/** The complete engine: validates RegExp literals in the compiler and backs every executable that may use RegExp. */
export const regexpVmSource=vmCore(fullRegExpLink);

/**
 * The RegExp prelude. Its helpers (Symbol.match, String.prototype.match and
 * the intrinsics other preludes use) are always present; the engine itself
 * (__nonaRegexpVm.core, created on the first match) only when linked.
 */
export function regexpVmPrelude(link:RegExpLink):string {
  return regexpVmPreludeTemplate.replace('@@CORE@@',()=>vmCore(link));
}

const regexpVmPreludeTemplate='var __nonaRegexpVm=function(re,input,start,sticky,pattern,flags){"use strict";if(__nonaRegexpVm.core===undefined)__nonaRegexpVm.core=@@CORE@@'+runtimeRegexpVmPrelude;
