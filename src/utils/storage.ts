import {init} from 'node-persist';

const breezyStorage = init({dir: 'storage/project/breezy'});

export {breezyStorage};
