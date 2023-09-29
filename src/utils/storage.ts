import {init} from 'node-persist';

export const mainStorage = init({dir: 'storage/main'});
export const breezyStorage = init({dir: 'storage/project/breezy'});
