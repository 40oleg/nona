import {ar} from './ar';
import {bn} from './bn';
import {en} from './en';
import {es} from './es';
import {fr} from './fr';
import {hi} from './hi';
import {pt} from './pt';
import {ru} from './ru';
import {zh} from './zh';

export type {Dictionary} from './types';

/** Site languages in the order of the language switcher; English is the root locale. */
export const dictionaries = [en, zh, hi, es, fr, ar, bn, pt, ru];
