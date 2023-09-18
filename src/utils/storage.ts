import {init} from 'node-persist';

const storage = init({dir: 'storage'});

export default storage;
