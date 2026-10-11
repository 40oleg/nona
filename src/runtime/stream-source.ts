import type {Target} from '../target.js';
import {streamWritableSource} from './stream-writable-source.js';
import {streamReadableSource} from './stream-readable-source.js';
import {streamPipeSource} from './stream-pipe-source.js';
import {streamDuplexSource} from './stream-duplex-source.js';
import {streamIteratorsSource} from './stream-iterators-source.js';
import {streamHelpersSource} from './stream-helpers-source.js';
import {streamOperatorsSource} from './stream-operators-source.js';
import {streamWebSource} from './stream-web-source.js';
import {streamConsumersSource} from './stream-consumers-source.js';
import {streamComposeSource} from './stream-compose-source.js';
import {runtimeStream} from '../lib/sources.generated.js';

/** Shared original stream constructors; module providers expose this exact object. */
export const streamPreludeSource=String.raw(runtimeStream,streamWritableSource,streamReadableSource,streamPipeSource,streamDuplexSource,streamIteratorsSource,streamHelpersSource,streamOperatorsSource,streamWebSource,streamConsumersSource,streamComposeSource);

export function streamPreludeForTarget(target:Target='win32-x64'):string {
 return streamPreludeSource.replace('__NONA_STREAM_BYTE_HIGH_WATER_MARK__',target.startsWith('win32-')?'16384':'65536');
}
